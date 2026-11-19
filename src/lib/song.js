/**
 * Convert Kytario's compact section/token format into printable lines.
 *
 * Kytario token types:
 *   0 text, 1 chord, 2 section reference, 3 spacer,
 *   4 repetition start, 5 repetition end, 6 line break, 7 bar
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

function makeSegments(text, chordEntries) {
  if (!chordEntries.length) {
    return text ? [{ chord: null, text }] : [];
  }

  const grouped = [];
  for (const entry of chordEntries.sort((a, b) => a.pos - b.pos)) {
    const pos = Math.max(0, Math.min(text.length, entry.pos));
    const last = grouped[grouped.length - 1];
    if (last && last.pos === pos) {
      last.chords.push(entry.chord);
    } else {
      grouped.push({ pos, chords: [entry.chord] });
    }
  }

  const segments = [];
  if (grouped[0].pos > 0) {
    segments.push({ chord: null, text: text.slice(0, grouped[0].pos) });
  }
  grouped.forEach((group, index) => {
    const end = index + 1 < grouped.length ? grouped[index + 1].pos : text.length;
    const piece = text.slice(group.pos, end);
    segments.push({
      chord: group.chords.join(' '),
      text: piece,
      chordOnly: piece.length === 0,
    });
  });
  return segments;
}

export function buildSongModel(song) {
  const sections = [];
  let totalLines = 0;
  let totalChords = 0;

  for (const rawSection of song.sections ?? []) {
    const lines = [];
    let lyric = '';
    let chords = [];
    let prefix = '';
    let suffix = '';
    let pendingSpacer = 0;

    const flushLine = ({ force = false } = {}) => {
      const text = lyric.replace(/[ \t]+$/g, '');
      const hasContent = text.trim().length > 0 || chords.length > 0 || prefix || suffix;
      if (!hasContent && !force) {
        lyric = '';
        chords = [];
        prefix = '';
        suffix = '';
        return;
      }

      if (text.trim().length === 0 && chords.length === 0 && !prefix && !suffix) {
        for (let i = 0; i < Math.max(1, pendingSpacer); i += 1) {
          lines.push({ kind: 'gap' });
        }
        pendingSpacer = 0;
        lyric = '';
        return;
      }

      const segments = makeSegments(text, chords);
      const isBlank = segments.every((segment) => !segment.text.trim()) && !prefix && !suffix;
      if (!isBlank || force) {
        lines.push({
          kind: segments.some((segment) => segment.text.trim()) ? 'lyric' : 'chords',
          segments,
          prefix,
          suffix,
        });
        totalLines += 1;
        totalChords += chords.length;
      }

      lyric = '';
      chords = [];
      prefix = '';
      suffix = '';
    };

    for (const token of rawSection.tokens ?? []) {
      const type = Number(token.type);
      const content = token.content;

      if (type === TOKEN.TEXT) {
        if (pendingSpacer) {
          flushLine();
          for (let i = 0; i < pendingSpacer; i += 1) lines.push({ kind: 'gap' });
          pendingSpacer = 0;
        }
        lyric += typeof content === 'string' ? content : '';
      } else if (type === TOKEN.CHORD) {
        if (pendingSpacer) {
          flushLine();
          for (let i = 0; i < pendingSpacer; i += 1) lines.push({ kind: 'gap' });
          pendingSpacer = 0;
        }
        chords.push({ pos: lyric.length, chord: typeof content === 'string' ? content : 'X' });
      } else if (type === TOKEN.LINE_BREAK) {
        flushLine();
      } else if (type === TOKEN.REPEAT_START) {
        if (lyric.trim() || chords.length) flushLine();
        prefix = content && Number(content) > 2 ? `|: ${content}×` : '|:';
        pendingSpacer = 0;
      } else if (type === TOKEN.REPEAT_END) {
        suffix = content && Number(content) > 2 ? `×${content} :|` : ':|';
        flushLine();
      } else if (type === TOKEN.REFERENCE) {
        flushLine();
        lines.push({ kind: 'reference', label: typeof content === 'string' ? content : 'Ref.' });
        totalLines += 1;
      } else if (type === TOKEN.SPACER) {
        if (lyric.trim() || chords.length) flushLine();
        pendingSpacer = Math.max(1, Number(content) || 1);
      } else if (type === TOKEN.BAR) {
        if (lyric.length === 0) prefix = `${prefix} |`;
        else suffix = `${suffix} |`;
      }
    }

    if (lyric.trim() || chords.length || prefix || suffix) flushLine({ force: true });
    if (pendingSpacer) {
      for (let i = 0; i < pendingSpacer; i += 1) lines.push({ kind: 'gap' });
    }

    if (lines.length > 0) {
      sections.push({
        title: (rawSection.title ?? '').trim(),
        expandable: Boolean(rawSection.expandable),
        lines,
      });
    }
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

export function buildBookModel(songbook, order = 'original') {
  const songs = [...(songbook.songs ?? [])];
  if (order === 'title') {
    songs.sort((a, b) => a.name.localeCompare(b.name, 'cs', { sensitivity: 'base' }));
  } else if (order === 'author') {
    songs.sort((a, b) => {
      const aa = displayAuthor(a) || 'zzz';
      const bb = displayAuthor(b) || 'zzz';
      return aa.localeCompare(bb, 'cs', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'cs');
    });
  }
  return { ...songbook, songs: songs.map(buildSongModel) };
}
