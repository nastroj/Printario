/**
 * A tiny, original demo songbook. These lyrics are written for Printario so
 * the print preview and auto-fit can be explored without importing a book.
 */

const CHORD_RE = /\{([^}]+)\}/g;

function lineTokens(line) {
  const tokens = [];
  let last = 0;
  let match;
  CHORD_RE.lastIndex = 0;
  while ((match = CHORD_RE.exec(line))) {
    if (match.index > last) {
      const text = line.slice(last, match.index);
      if (text) tokens.push({ type: 0, content: text });
    }
    tokens.push({ type: 1, content: match[1], occupySpace: false });
    last = match.index + match[0].length;
  }
  if (last < line.length) tokens.push({ type: 0, content: line.slice(last) });
  tokens.push({ type: 6 });
  return tokens;
}

function section(title, lines) {
  return {
    title,
    expandable: false,
    tokens: lines.flatMap((line) => lineTokens(line)),
  };
}

function song(id, name, author, tonalKey, capo, sections) {
  return {
    id,
    name,
    author,
    interpreter: null,
    capo,
    tonalKey,
    originalKey: null,
    language: 'en',
    tempo: 'medium',
    genre: null,
    notation: 'english',
    urlToken: `printario-demo-${id}`,
    sections,
  };
}

const songs = [
  song(1, 'Paper Boat', 'Printario Studio', 'C', 0, [
    section('1.', [
      '{C}Fold the morning {G}into a paper {Am}boat',
      '{F}Set it on the {G}river and {C}watch it float',
      '{C}Every little {G}crease is a {Am}place we have been',
      '{F}Every little {G}wave says {C}begin, begin',
    ]),
    section('Ref.', [
      '{F}Row, row, {C}row till the {G}bank is out of {Am}sight',
      '{F}Hold on to the {C}light, {G}hold on to the {C}light',
      '{F}Row, row, {C}row till the {G}morning turns to {Am}gold',
      '{F}This is the {G}story that the {C}river told',
    ]),
    section('2.', [
      '{C}Take the old {G}map with the {Am}corners worn',
      '{F}Leave it in the {G}kitchen till the {C}day is born',
      '{C}We will find the {G}shore by the {Am}sound of the rain',
      '{F}We will know the {G}way by the {C}song in the lane',
    ]),
  ]),
  song(2, 'Lantern Song', 'Printario Studio', 'G', 2, [
    section('1.', [
      '{G}There is a lantern {D}under my {Em}coat',
      '{C}Small as a promise, {D}bright as a {G}note',
      '{G}I keep it burning {D}low and {Em}slow',
      '{C}For all the places {D}we might {G}go',
      '{Em}When the road gets {Bm}long and the {C}night gets {D}cold',
      '{Em}I hold the little {Bm}flame and I {C}feel less {D}old',
    ]),
    section('Ref.', [
      '{C}Carry the {G}lantern, {D}carry it {Em}high',
      '{C}Let it paint a {G}window on the {D}sky',
      '{C}Carry the {G}lantern, {D}carry it {Em}low',
      '{C}Everywhere you {D}go, let it {G}glow',
    ]),
    section('2.', [
      '{G}The city is a {D}shadow, the {Em}field is a sea',
      '{C}The lantern is the {D}only thing {G}looking for me',
      '{G}So I follow the {D}thread of its {Em}warm little thread',
      '{C}Past the sleeping {D}houses, past the {G}things left unsaid',
      '{Em}And if you are {Bm}lost in the {C}darkness to{D}night',
      '{Em}Look for the {Bm}lantern and {C}walk to the {D}light',
    ]),
    section('Brid.', [
      '{Am}Oh, the miles are {Em}many, the {C}miles are {G}few',
      '{Am}But the lantern keeps a {Em}place for {D}you',
    ]),
  ]),
  song(3, 'The Long Way Home', 'Printario Studio', 'D', 0, [
    section('1.', [
      '{D}I took the long way {A}home through the {Bm}fields of {G}wheat',
      '{D}I followed the {A}fence line and the {G}drums of my {D}feet',
      '{D}The sun was a {A}coin in the {Bm}pocket of the {G}west',
      '{D}And every small {A}shadow was a {G}guest, a {D}guest',
    ]),
    section('2.', [
      '{G}The old bridge was {D}singing a {A}rusty old {Bm}tune',
      '{G}The river was {D}carving a {A}silver {D}moon',
      '{D}I stopped for a {A}minute to {Bm}let the day {G}pass',
      '{D}I wrote my {A}name in the {G}grass, the {D}grass',
    ]),
    section('Ref.', [
      '{G}Take the long way {D}home, take the {A}long way {Bm}round',
      '{G}There is no {D}shortcut to {A}holy {D}ground',
      '{G}Take the long way {D}home, let the {A}evening {Bm}come',
      '{G}Every road is {A}a road back {D}home',
    ]),
    section('3.', [
      '{D}The porch light was {A}waiting like a {Bm}word on a {G}page',
      '{D}The kettle was {A}whistling its {G}quiet old {D}rage',
      '{D}I hung up my {A}hat and I {Bm}set down my {G}load',
      '{D}And the long way {A}home was the {G}only {D}road',
    ]),
    section('4.', [
      '{D}Now the map is a {A}memory and the {Bm}map is a {G}song',
      '{D}And the miles are a {A}place where the {G}heart be{D}longs',
      '{D}So I will keep {A}walking till the {Bm}stars are all {G}gone',
      '{D}And I will keep {A}singing the {G}long way {D}home',
    ]),
    section('Ref.', [
      '{G}Take the long way {D}home, take the {A}long way {Bm}round',
      '{G}There is no {D}shortcut to {A}holy {D}ground',
      '{G}Take the long way {D}home, let the {A}evening {Bm}come',
      '{G}Every road is {A}a road back {D}home',
    ]),
  ]),
];

export const demoSongbook = {
  token: 'printario-demo',
  name: 'Songs for the Slow Road',
  description: 'An original three-song demo. Short, long, and somewhere in between — made to show off auto-fit and page flow.',
  projectName: 'Printario Studio',
  projectToken: null,
  sourceUrl: 'https://kytario.com/songbook',
  importedAt: new Date().toISOString(),
  demo: true,
  songCount: songs.length,
  songs,
};
