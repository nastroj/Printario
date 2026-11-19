import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKytarioUrl,
  normaliseSong,
  ImportError,
  __test,
} from './kytario.js';
import { demoSongbook } from './demo.js';

test('parses direct songbook URLs and locale prefixes', () => {
  assert.deepEqual(parseKytarioUrl('https://kytario.com/songbook'), {
    kind: 'songbook',
    token: 'songbook',
    sourceUrl: 'https://kytario.com/songbook',
  });
  assert.equal(parseKytarioUrl('https://www.kytario.com/en/poruba').token, 'poruba');
  assert.equal(parseKytarioUrl('kytario.com/pisnicky/2').token, 'pisnicky');
  assert.equal(parseKytarioUrl('songbook').token, 'songbook');
});

test('parses songbook edit/print URLs and project songbook links', () => {
  assert.equal(parseKytarioUrl('https://kytario.com/songbooks/pisnicky/print').token, 'pisnicky');
  assert.equal(
    parseKytarioUrl('https://kytario.com/songbooks?project=jeste-jednu').kind,
    'project',
  );
  assert.equal(
    parseKytarioUrl('https://kytario.com/songs?project=jeste-jednu').token,
    'jeste-jednu',
  );
  assert.equal(parseKytarioUrl('https://kytario.com/projects/jeste-jednu').kind, 'project');
});

test('parses individual songs', () => {
  const result = parseKytarioUrl('https://kytario.com/song/lasko-boze-lasko-14023');
  assert.equal(result.kind, 'song');
  assert.equal(result.token, 'lasko-boze-lasko-14023');
});

test('rejects non-Kytario and non-songbook links with useful errors', () => {
  assert.throws(
    () => parseKytarioUrl('https://example.com/songbook'),
    (error) => error instanceof ImportError && error.code === 'UNSUPPORTED_HOST',
  );
  assert.throws(
    () => parseKytarioUrl('https://kytario.com/songbooks'),
    (error) => error instanceof ImportError && error.code === 'NOT_A_SONGBOOK',
  );
  assert.throws(
    () => parseKytarioUrl('https://kytario.com/songs'),
    (error) => error instanceof ImportError && error.code === 'NOT_A_SONGBOOK',
  );
  assert.throws(() => parseKytarioUrl(''), (error) => error.code === 'URL_REQUIRED');
});

test('extracts a nested JSON object without being confused by brackets', () => {
  const text = 'prefix {"song":{"id":1,"sections":[{"tokens":[{"type":0}]}],"x":[1,2]}} suffix';
  const index = text.indexOf('{"song"');
  const parsed = __test.findBalancedJson(text, index);
  assert.equal(parsed.song.id, 1);
  assert.equal(parsed.song.sections.length, 1);
});

test('normalises Kytario songs and sections safely', () => {
  const song = normaliseSong({
    id: 7,
    name: '  Test song  ',
    author: 'Tester',
    capo: 99,
    tonalKey: 'C',
    urlToken: 'test-song',
    sections: [
      {
        title: ' 1. ',
        tokens: [
          { type: 1, content: 'C' },
          { type: 0, content: 'Hello' },
          { type: 6 },
          { type: 999, content: 'ignored' },
        ],
      },
      { title: 'Empty', tokens: [] },
    ],
  });
  assert.equal(song.name, 'Test song');
  assert.equal(song.capo, 12);
  assert.equal(song.sections.length, 1);
  assert.equal(song.sections[0].title, '1.');
  assert.equal(song.sections[0].tokens.length, 3);
});

test('demo songbook has three printable songs', () => {
  assert.equal(demoSongbook.songs.length, 3);
  for (const song of demoSongbook.songs) {
    assert.ok(song.sections.length >= 3);
    assert.ok(song.sections.every((section) => section.tokens.length > 0));
  }
});
