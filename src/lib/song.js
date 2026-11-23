import { sortSongs } from './settings.js';

/**
 * Convert Kytario's compact section/token format into the line model used by
 * the print renderer.
 *
 * Kytario token types:
 *   0 text, 1 chord, 2 section reference, 3 horizontal spacer,
 *   4 repetition start, 5 repetition end, 6 line break, 7 bar
 *
 * There are two section shapes, mirroring Kytario's own desktop/print layout:
 *
 *   named sections      chords sit above the lyric line (aligning with the
 *                       word they belong to);
 *   unnamed sections    only chords, bars and references are rendered, inline
 *                       on one line and separated by dashes.
 */

const TOKEN = {
  TEXT: 0,
  CHORD: 1,
  REFERENCE: 2,
  SPACER: 3,
  REPEAT_START: 4,
  REPEAT_END: 5,
  LINE_BREAK: 6,
  BAR: 7,
};

/** Kytario's fixed-space widths, in em, for {-}, {--}, {---}. */
const SPACER_EM = [0.25, 0.8, 1.2];

function toType(token) {
  return Number(token?.type);
}

function toContent(token) {
  const value = token?.content;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (toType(token) === TOKEN.TEXT) return ' ';
  return '';
}

function toCount(value, fallback = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(2, Math.round(n)) : fallback;
}

function spacerWidth(value) {
  const n = Math.max(1, Math.min(SPACER_EM.length, Math.round(Number(value)) || 1));
  return SPACER_EM[n - 1];
}

function repetitionStartText(count) {
  return count > 2 ? ` |∶ ${count}× ` : ' |∶ ';
}

function repetitionEndText(count) {
  return count > 2 ? ` ∶| ${count}× ` : ' ∶| ';
}

/**
 * Named sections: chords over lyrics. Segments are inline blocks; each segment
 * keeps its chord above the text it belongs to, exactly like Kytario's
 * chord-placer technique but without a per-line measuring pass.
 */
function buildNamedLines(tokens) {
  const lines = [];
  let segments = [];
  let buffer = '';
  let chords = [];

  const flush = () => {
    if (buffer.length > 0 || chords.length > 0) {
      segments.push({
        text: buffer,
        chords: chords.length ? chords.slice() : [],
      });
      buffer = '';
      chords = [];
    }
  };

  const endLine = () => {
    flush();
    if (segments.length > 0) {
      lines.push({
        kind: 'chorded',
        segments,
        hasChordRow: segments.some((segment) => segment.bar || segment.chords.length > 0),
      });
    }
    segments = [];
    buffer = '';
    chords = [];
  };

  for (const token of tokens) {
    const type = toType(token);
    if (type === TOKEN.TEXT) {
      buffer += toContent(token);
    } else if (type === TOKEN.CHORD) {
      if (buffer.length > 0) flush();
      chords.push(toContent(token) || 'X');
    } else if (type === TOKEN.LINE_BREAK) {
      endLine();
    } else if (type === TOKEN.REPEAT_START) {
      buffer += repetitionStartText(toCount(token.content));
    } else if (type === TOKEN.REPEAT_END) {
      buffer += repetitionEndText(toCount(token.content));
    } else if (type === TOKEN.SPACER) {
      flush();
      segments.push({ text: '', chords: [], spaceEm: spacerWidth(token.content) });
    } else if (type === TOKEN.REFERENCE) {
      buffer += toContent(token);
    } else if (type === TOKEN.BAR) {
      flush();
      segments.push({ bar: true, text: '', chords: [] });
    }
  }

  endLine();
  return lines;
}

/**
 * Unnamed sections (intros, solos, …): all tokens become one inline chord
 * line. Kytario separates the individual items with a dash; this replicates
 * that rule token by token.
 */
function buildInlineLines(tokens) {
  const lines = [];
  let items = [];
  let previous = null;

  const endLine = () => {
    if (items.length > 0) lines.push({ kind: 'inline', items });
    items = [];
  };

  for (const token of tokens) {
    const type = toType(token);
    if (type === TOKEN.LINE_BREAK) {
      endLine();
      previous = null;
      continue;
    }
    const previousType = previous ? toType(previous) : null;
    const barAfterReference = type === TOKEN.BAR && previousType === TOKEN.REFERENCE;

    if (
      previous
      && type !== TOKEN.REPEAT_END
      && (type !== TOKEN.BAR || barAfterReference)
      && previousType !== TOKEN.REPEAT_START
      && previousType !== TOKEN.BAR
    ) {
      items.push({ t: 'dash' });
    }

    if (type === TOKEN.CHORD) {
      items.push({ t: 'chord', v: toContent(token) || 'X' });
    } else if (type === TOKEN.BAR) {
      items.push({ t: 'bar' });
    } else if (type === TOKEN.REFERENCE) {
      items.push({ t: 'ref', v: toContent(token) });
    } else if (type === TOKEN.TEXT) {
      const text = toContent(token);
      if (text.trim()) items.push({ t: 'text', v: text });
    } else if (type === TOKEN.SPACER) {
      items.push({ t: 'space', em: spacerWidth(token.content) });
    } else if (type === TOKEN.REPEAT_START) {
      items.push({ t: 'repeatStart', count: toCount(token.content) });
    } else if (type === TOKEN.REPEAT_END) {
      items.push({ t: 'repeatEnd', count: toCount(token.content) });
    }

    previous = token;
  }

  endLine();
  return lines;
}

function buildSection(rawSection) {
  const title = typeof rawSection?.title === 'string' ? rawSection.title.trim() : '';
  const tokens = Array.isArray(rawSection?.tokens) ? rawSection.tokens : [];
  const unnamed = title.length === 0;
  const lines = unnamed ? buildInlineLines(tokens) : buildNamedLines(tokens);
  const hasChords = tokens.some((token) => toType(token) === TOKEN.CHORD);

  return {
    title,
    unnamed,
    expandable: Boolean(rawSection?.expandable),
    hasChords,
    lines,
    chordCount: tokens.filter((token) => toType(token) === TOKEN.CHORD).length,
  };
}

export function buildSongModel(song) {
  const sections = [];
  let totalLines = 0;
  let totalChords = 0;

  for (const rawSection of song.sections ?? []) {
    const section = buildSection(rawSection);
    if (section.lines.length === 0) continue;
    sections.push(section);
    totalLines += section.lines.length;
    totalChords += section.chordCount;
  }

  return {
    ...song,
    sections,
    totalLines,
    totalChords,
  };
}

export function displayAuthor(song) {
  return song.author || song.interpreter || null;
}

export function songMetaParts(song) {
  const parts = [];
  if (displayAuthor(song)) parts.push(displayAuthor(song));
  if (song.tonalKey) parts.push(song.tonalKey);
  if (song.capo > 0) parts.push(`capo ${song.capo}`);
  if (song.tempo) parts.push(song.tempo);
  return parts;
}

export function buildBookModel(songbook, order = 'title') {
  const songs = (songbook.songs ?? []).map((song, index) => ({
    ...song,
    bookNumber: index + 1,
  }));
  return { ...songbook, songs: sortSongs(songs, order).map(buildSongModel) };
}

/** Exported for unit tests. */
export const __test = { buildSection, buildNamedLines, buildInlineLines, SPACER_EM };
