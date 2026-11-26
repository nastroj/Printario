import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookModel, buildSongModel } from '../src/lib/song.js';
import { paginateBook } from '../src/lib/paginate.js';
import {
  DEFAULT_MARGINS, DEFAULT_SETTINGS, getColumnCount, getGeometry, getPageMargins, getTypeScale,
  loadSettings,
} from '../src/lib/settings.js';

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

test('preserves lyric spacing at chord boundaries, including cached empty text tokens', () => {
  const model = buildSongModel(songWith([
    { type: 0, content: 'Podívejte' },
    { type: 0, content: ' ' },
    { type: 1, content: 'A7' },
    { type: 0, content: 'se na ně' },
    { type: 0 },
    { type: 1, content: 'G' },
    { type: 6 },
  ]));

  assert.deepEqual(
    model.sections[0].lines[0].segments.map(({ text, chords }) => [text, chords]),
    [['Podívejte ', []], ['se na ně ', ['A7']], ['', ['G']]],
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

test('books keep original songbook order while ToC defaults to title A-Z with original numbers', () => {
  const book = buildBookModel({
    name: 'Test',
    songs: [
      { id: 1, name: 'Zebra', author: 'Charlie', sections: [] },
      { id: 2, name: 'Álpha', author: 'Bob', sections: [] },
      { id: 3, name: 'Beta', author: 'Alice', sections: [] },
    ],
  });

  assert.deepEqual(
    book.songs.map(({ name, bookNumber }) => [name, bookNumber]),
    [['Zebra', 1], ['Álpha', 2], ['Beta', 3]],
  );

  const defaultResult = paginateBook(book, DEFAULT_SETTINGS);
  const toc = defaultResult.pages.find((page) => page.type === 'contents');
  assert.deepEqual(
    toc.entries.map(({ name, number, songIndex }) => [name, number, songIndex]),
    [['Álpha', 2, 1], ['Beta', 3, 2], ['Zebra', 1, 0]],
  );
  assert.deepEqual(
    defaultResult.pages.filter((page) => page.type === 'song').map((page) => page.song.name),
    ['Zebra', 'Álpha', 'Beta'],
  );

  const manualToc = paginateBook(book, { ...DEFAULT_SETTINGS, songOrder: 'manual' })
    .pages.find((page) => page.type === 'contents');
  assert.deepEqual(
    manualToc.entries.map(({ name, number }) => [name, number]),
    [['Zebra', 1], ['Álpha', 2], ['Beta', 3]],
  );

  const authorToc = paginateBook(book, { ...DEFAULT_SETTINGS, songOrder: 'author' })
    .pages.find((page) => page.type === 'contents');
  assert.deepEqual(
    authorToc.entries.map(({ name, number }) => [name, number]),
    [['Beta', 3], ['Álpha', 2], ['Zebra', 1]],
  );
});

test('contents paginate 48 rows per column on the default page size', () => {
  const book = {
    songs: Array.from({ length: 145 }, (_, index) => ({
      name: `Song ${index + 1}`,
      bookNumber: index + 1,
    })),
  };
  const result = paginateBook(book, DEFAULT_SETTINGS);
  const contents = result.pages.filter((page) => page.type === 'contents');

  assert.equal(contents.length, 2);
  assert.equal(contents[0].rows, 48);
  assert.equal(contents[0].entries.length, 144);
  assert.equal(contents[1].entries.length, 1);
});

test('pagination assigns one fixed page to each song with correct front-matter numbering', () => {
  const book = {
    name: 'Test book',
    songs: [
      { id: 1, name: 'First song' },
      { id: 2, name: 'Second song' },
    ],
  };
  const result = paginateBook(book, DEFAULT_SETTINGS);

  assert.deepEqual(result.pages.map((page) => page.type), ['cover', 'contents', 'song', 'song']);
  assert.deepEqual(result.firstPages, [3, 4]);
  assert.equal(result.pages[2].fit, undefined);
  assert.equal(result.pages[3].fit, undefined);
});

test('default A4 landscape margins produce 280 x 198 mm printed content and mirror in book mode', () => {
  assert.deepEqual(DEFAULT_MARGINS, { top: 6, right: 5, bottom: 6, left: 12 });
  assert.equal(DEFAULT_SETTINGS.bookMode, false);

  const normalGeo = getGeometry(DEFAULT_SETTINGS);
  assert.equal(normalGeo.widthMm, 297);
  assert.equal(normalGeo.heightMm, 210);
  assert.equal(normalGeo.contentWidthMm, 280);
  assert.equal(normalGeo.contentHeightMm, 198);

  assert.deepEqual(getPageMargins(DEFAULT_SETTINGS, 1), { top: 6, right: 5, bottom: 6, left: 12 });
  assert.deepEqual(getPageMargins(DEFAULT_SETTINGS, 2), { top: 6, right: 5, bottom: 6, left: 12 });

  const bookSettings = { ...DEFAULT_SETTINGS, bookMode: true };
  assert.deepEqual(getPageMargins(bookSettings, 1), { top: 6, right: 5, bottom: 6, left: 12 });
  assert.deepEqual(getPageMargins(bookSettings, 2), { top: 6, right: 12, bottom: 6, left: 5 });
  assert.deepEqual(getPageMargins(bookSettings, 3), { top: 6, right: 5, bottom: 6, left: 12 });

  const evenGeo = getGeometry(bookSettings, 2);
  assert.equal(evenGeo.contentWidthMm, 280);
  assert.equal(evenGeo.contentHeightMm, 198);
});

test('loadSettings migrates legacy v2 7mm default margins to 6/5/6/12mm', () => {
  const prevStorage = globalThis.localStorage;
  const store = new Map([
    ['printario.settings.v2', JSON.stringify({
      paper: 'A4',
      margins: { top: 7, right: 7, bottom: 7, left: 7 },
      fontFamily: 'lora',
    })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };

  try {
    const migrated = loadSettings();
    assert.deepEqual(migrated.margins, { top: 6, right: 5, bottom: 6, left: 12 });
    assert.equal(migrated.fontFamily, 'inter');
    assert.equal(migrated.bookMode, false);
    assert.equal(migrated.showSectionLines, true);
    assert.equal(migrated.sectionLabelPosition, 'after');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('section line and label position settings normalize cleanly', () => {
  assert.equal(DEFAULT_SETTINGS.showSectionLines, true);
  assert.equal(DEFAULT_SETTINGS.sectionLabelPosition, 'after');

  const prevStorage = globalThis.localStorage;
  const store = new Map([
    ['printario.settings.v3', JSON.stringify({
      showSectionLines: false,
      sectionLabelPosition: 'before',
    })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };

  try {
    const loaded = loadSettings();
    assert.equal(loaded.showSectionLines, false);
    assert.equal(loaded.sectionLabelPosition, 'before');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('paginateBook flags songs that overflow past the bottom margin and clears when font sizes drop', () => {
  const shortSections = [
    {
      title: '1.',
      expandable: false,
      tokens: [
        { type: 1, content: 'C' },
        { type: 0, content: 'Short line one' },
        { type: 6 },
      ],
    },
  ];
  const longSections = Array.from({ length: 14 }, (_, idx) => ({
    title: `${idx + 1}.`,
    expandable: false,
    tokens: [
      { type: 1, content: 'Am' },
      { type: 0, content: `Verse ${idx + 1} line one with chords` },
      { type: 6 },
      { type: 1, content: 'G' },
      { type: 0, content: `Verse ${idx + 1} line two continuing` },
      { type: 6 },
      { type: 1, content: 'F' },
      { type: 0, content: `Verse ${idx + 1} line three near end` },
      { type: 6 },
      { type: 1, content: 'E' },
      { type: 0, content: `Verse ${idx + 1} final cadence` },
      { type: 6 },
    ],
  }));

  const book = buildBookModel({
    token: 'overflow-test',
    name: 'Overflow Book',
    songs: [
      { id: 1, name: 'Short Song', sections: shortSections },
      { id: 2, name: 'Endless Ballad', sections: longSections },
    ],
  });

  const defaultResult = paginateBook(book, DEFAULT_SETTINGS);
  assert.equal(defaultResult.overflowCount, 1);
  assert.equal(defaultResult.overflowBySongIndex[0].overflows, false);
  assert.equal(defaultResult.overflowBySongIndex[1].overflows, true);
  assert.ok(defaultResult.overflowBySongIndex[1].overflowLines >= 1);

  const endlessPage = defaultResult.pages.find((page) => page.type === 'song' && page.songIndex === 1);
  assert.equal(endlessPage?.overflow?.overflows, true);

  const smallerResult = paginateBook(book, {
    ...DEFAULT_SETTINGS,
    lyricsSize: 6.5,
    chordsSize: 6.5,
    margins: { top: 2, right: 3, bottom: 2, left: 6 },
  });
  assert.equal(smallerResult.overflowCount, 0);
  assert.equal(smallerResult.overflowBySongIndex[1].overflows, false);
});

test('custom paper size resolves dimensions directly and clamps in loadSettings', () => {
  const customPortrait = getGeometry({
    ...DEFAULT_SETTINGS,
    paper: 'Custom',
    customPaperWidth: 160,
    customPaperHeight: 240,
    orientation: 'portrait',
    margins: { top: 6, right: 5, bottom: 6, left: 12 },
  });
  assert.equal(customPortrait.widthMm, 160);
  assert.equal(customPortrait.heightMm, 240);
  assert.equal(customPortrait.landscape, false);
  assert.equal(customPortrait.contentWidthMm, 143);
  assert.equal(customPortrait.contentHeightMm, 228);

  const customLandscape = getGeometry({
    ...DEFAULT_SETTINGS,
    paper: 'Custom',
    customPaperWidth: 260,
    customPaperHeight: 180,
    orientation: 'landscape',
  });
  assert.equal(customLandscape.widthMm, 260);
  assert.equal(customLandscape.heightMm, 180);
  assert.equal(customLandscape.landscape, true);

  const prevStorage = globalThis.localStorage;
  const store = new Map([
    ['printario.settings.v3', JSON.stringify({
      paper: 'Custom',
      customPaperWidth: 40,
      customPaperHeight: 2000,
    })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  try {
    const loaded = loadSettings();
    assert.equal(loaded.paper, 'Custom');
    assert.equal(loaded.customPaperWidth, 80);
    assert.equal(loaded.customPaperHeight, 1000);
  } finally {
    globalThis.localStorage = prevStorage;
  }
});
