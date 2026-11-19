import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSongModel } from '../src/lib/song.js';
import { __test } from '../src/lib/paginate.js';
import { getColumnCount, getGeometry, getTypeScale } from '../src/lib/settings.js';

const { fitBlock, packColumns } = __test;

function songWith(tokens, title = '1.') {
  return {
    name: 'Test',
    sections: [{ title, expandable: false, tokens }],
  };
}

test('named sections keep chords above the text they belong to', () => {
  const model = buildSongModel(songWith([
    { type: 1, content: 'Am' },
    { type: 0, content: 'Hello ' },
    { type: 0, content: 'world' },
    { type: 1, content: 'G' },
    { type: 0, content: 'again' },
    { type: 6 },
  ]));

  const line = model.sections[0].lines[0];
  assert.equal(line.kind, 'chorded');
  assert.deepEqual(
    line.segments.map((segment) => [segment.chords, segment.text]),
    [[['Am'], 'Hello world'], [['G'], 'again']],
  );
});

test('unnamed sections are rendered as one inline chord line with dashes', () => {
  const model = buildSongModel(songWith([
    { type: 4, content: 2 },
    { type: 1, content: 'Am' },
    { type: 1, content: 'Em' },
    { type: 5, content: 2 },
    { type: 6 },
  ], ''));

  const section = model.sections[0];
  assert.equal(section.unnamed, true);
  assert.deepEqual(
    section.lines[0].items.map((item) => item.t),
    ['repeatStart', 'chord', 'dash', 'chord', 'repeatEnd'],
  );
});

test('bars and references stay inline without stray dashes', () => {
  const model = buildSongModel(songWith([
    { type: 7 },
    { type: 1, content: 'A' },
    { type: 7 },
    { type: 1, content: 'F#m' },
    { type: 2, content: 'Ref.' },
  ], ''));

  const items = model.sections[0].lines[0].items;
  assert.deepEqual(
    items.map((item) => item.t),
    ['bar', 'chord', 'bar', 'chord', 'dash', 'ref'],
  );
});

test('horizontal spacers become inline gaps, not blank lines', () => {
  const model = buildSongModel(songWith([
    { type: 0, content: 'a' },
    { type: 3, content: 2 },
    { type: 0, content: 'b' },
    { type: 6 },
  ]));

  const line = model.sections[0].lines[0];
  assert.equal(line.kind, 'chorded');
  assert.equal(line.segments.length, 3);
  assert.equal(line.segments[1].spaceEm, 0.8);
  assert.equal(model.sections[0].lines.length, 1);
});

test('plus sections stay marked as expandable', () => {
  const song = {
    name: 'Test',
    sections: [{
      title: 'Ref.',
      expandable: true,
      tokens: [{ type: 1, content: 'C' }, { type: 0, content: 'la' }, { type: 6 }],
    }],
  };
  const model = buildSongModel(song);
  assert.equal(model.sections[0].expandable, true);
  assert.equal(model.sections[0].hasChords, true);
});

test('column count follows orientation unless overridden', () => {
  const landscape = getGeometry({ paper: 'A4', orientation: 'landscape', margins: { top: 7, right: 7, bottom: 7, left: 7 } });
  const portrait = getGeometry({ paper: 'A4', orientation: 'portrait', margins: { top: 7, right: 7, bottom: 7, left: 7 } });
  assert.equal(getColumnCount({ columns: 'auto' }, landscape), 2);
  assert.equal(getColumnCount({ columns: 'auto' }, portrait), 1);
  assert.equal(getColumnCount({ columns: 'one' }, landscape), 1);
  assert.equal(getColumnCount({ columns: 'two' }, portrait), 2);
  assert.ok(getTypeScale(landscape, 2) > 1);
});

test('packing follows the browser column wrap and counts overflow columns', () => {
  assert.equal(packColumns([100, 100, 100], 150).columns, 3);
  assert.equal(packColumns([100, 40, 40], 150).columns, 2);
  assert.equal(packColumns([200], 150).tooTall, true);
});

test('long songs are shrunk to fit a single page', () => {
  const fit = fitBlock(
    { headerHeight: 25, sections: [{ height: 380 }, { height: 380 }, { height: 380 }] },
    { autoFit: false, autoFitStrength: 45, autoFitFill: 92 },
    500,
    2,
  );
  assert.ok(fit.scale < 1);
  assert.equal(fit.shrunk, true);
  assert.equal(fit.overflow, false);
});

test('impossible songs are flagged instead of pretending to fit', () => {
  const fit = fitBlock(
    { headerHeight: 25, sections: [{ height: 9000 }] },
    { autoFit: true, autoFitStrength: 45, autoFitFill: 92 },
    500,
    2,
  );
  assert.equal(fit.overflow, true);
});

test('short songs grow when auto-fit is on', () => {
  const base = { headerHeight: 25, sections: [{ height: 100 }, { height: 100 }] };
  const off = fitBlock(base, { autoFit: false, autoFitStrength: 45, autoFitFill: 92 }, 500, 2);
  const on = fitBlock(base, { autoFit: true, autoFitStrength: 45, autoFitFill: 92 }, 500, 2);
  assert.ok(on.scale > off.scale);
  assert.equal(on.autoFitted, true);
});
