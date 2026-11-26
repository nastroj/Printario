import { getColumnCount, getGeometry, getTypeScale, sortSongs } from './settings.js';

function estimateTitleLines(text, fontPx, availPx) {
  const clean = String(text || '').trim();
  if (!clean || availPx <= 0) return 1;
  // Conservative average glyph width for bold Inter headings (~0.56em)
  const avgCharW = fontPx * 0.56;
  const words = clean.split(/\s+/);
  let lines = 1;
  let lineW = 0;
  const spaceW = fontPx * 0.26;
  for (const word of words) {
    const wordW = word.length * avgCharW;
    if (lineW === 0) {
      lineW = wordW;
    } else if (lineW + spaceW + wordW <= availPx) {
      lineW += spaceW + wordW;
    } else {
      lines += 1;
      lineW = wordW;
    }
  }
  return lines;
}

export function estimateSongOverflow(song, settings, geometry, columns, typeScale, pageNumber = 1) {
  const lyricPx = settings.lyricsSize * typeScale;
  const chordPx = settings.chordsSize * typeScale;
  const headingPx = settings.headingSize * typeScale;
  const chordRowH = chordPx;
  const lyricRowH = lyricPx * settings.lineHeight;

  const cw = geometry.contentWidthPx;
  const ch = geometry.contentHeightPx;
  const sheetH = Math.max(20, ch - 5);
  const colW = columns === 2 ? cw / 2 : cw;

  const badgeRight = Boolean(settings.bookMode) && pageNumber % 2 === 1;
  const badgeSize = lyricPx * 1.7;
  const author = song.author || song.interpreter || null;
  const mainTitle = author ? `${song.name} - ${author}` : song.name;
  const keyText = settings.showMetadata && song.tonalKey ? `(${song.tonalKey})` : null;
  const fullTitle = keyText ? `${mainTitle} ${keyText}` : mainTitle;
  const titleAvailW = badgeRight && columns === 2 ? colW : Math.max(24, colW - badgeSize);
  const titleLines = estimateTitleLines(fullTitle, headingPx, titleAvailW);
  const headerH = Math.max(badgeSize, titleLines * headingPx * 1.6);

  const borderT = 0.1 * lyricPx;
  const borderB = 0.1 * lyricPx;

  let col = 0;
  let curY = headerH + 0.2 * lyricPx;
  let maxBottom = curY;

  const sections = song.sections || [];
  for (let sIdx = 0; sIdx < sections.length; sIdx += 1) {
    const section = sections[sIdx];
    const hideChords = section.expandable && columns === 2;
    const showChords = !hideChords;
    const marginTop = sIdx === 0 ? 0.3 * lyricPx : 1.2 * lyricPx;

    let innerH = 0;
    for (const line of section.lines || []) {
      innerH += line.kind === 'inline'
        ? lyricPx * 1.2
        : (showChords ? chordRowH : 0) + lyricRowH;
    }
    const sectionBoxH = borderT + innerH + borderB;
    const needed = marginTop + sectionBoxH;

    if (columns === 2 && col === 0 && curY > 0 && curY + needed > sheetH + 1) {
      col = 1;
      curY = 0;
    }

    curY += needed;
    if (curY > maxBottom) maxBottom = curY;
  }

  const overflowPx = Math.max(0, maxBottom - sheetH);
  const overflows = overflowPx > 2;
  const avgLineH = Math.max(8, chordRowH * 0.7 + lyricRowH);
  const overflowLines = overflows ? Math.max(1, Math.ceil(overflowPx / avgLineH)) : 0;

  return {
    overflows,
    overflowPx,
    overflowLines,
    sheetHeightPx: sheetH,
  };
}

/**
 * Add optional front matter and assign one fixed-size page to each song.
 */
export function paginateBook(book, settings) {
  const geometry = getGeometry(settings);
  const columns = getColumnCount(settings, geometry);
  const typeScale = getTypeScale(geometry, columns);
  const coverCount = settings.cover ? 1 : 0;
  const tocListHeight = Math.min(672, geometry.heightPx - 63);
  const tocRows = Math.max(1, Math.floor(tocListHeight / 14));
  const tocPerPage = tocRows * 3;
  const contentPageCount = settings.contents
    ? Math.ceil(book.songs.length / tocPerPage)
    : 0;

  let cursor = coverCount + contentPageCount + 1;
  const firstPages = book.songs.map(() => {
    const page = cursor;
    cursor += 1;
    return page;
  });

  const overflowBySongIndex = book.songs.map((song, index) => (
    estimateSongOverflow(song, settings, geometry, columns, typeScale, firstPages[index])
  ));
  const overflowCount = overflowBySongIndex.filter((item) => item.overflows).length;

  const tocEntries = sortSongs(
    book.songs.map((song, index) => ({
      songIndex: index,
      number: song.bookNumber ?? index + 1,
      name: song.name,
      author: song.author || song.interpreter || null,
      interpreter: song.interpreter || null,
      tonalKey: song.tonalKey ?? null,
      id: song.id ?? null,
    })),
    settings.songOrder,
  ).map(({
    songIndex, number, name, author, tonalKey, id,
  }) => ({
    songIndex,
    number,
    name,
    author,
    tonalKey,
    id,
  }));

  const pages = [];
  let number = 1;
  if (settings.cover) {
    pages.push({ type: 'cover', number, songbook: book });
    number += 1;
  }
  for (let index = 0; index < contentPageCount; index += 1) {
    pages.push({
      type: 'contents',
      entries: tocEntries.slice(index * tocPerPage, (index + 1) * tocPerPage),
      tocPage: index,
      tocPageCount: contentPageCount,
      rows: tocRows,
      number,
    });
    number += 1;
  }
  book.songs.forEach((song, songIndex) => {
    pages.push({
      type: 'song',
      number,
      songIndex,
      song,
      overflow: overflowBySongIndex[songIndex],
    });
    number += 1;
  });

  return {
    pages,
    firstPages,
    tocEntries,
    overflowBySongIndex,
    overflowCount,
    geometry,
    columns,
    pageCount: pages.length,
    contentPageCount,
    songbook: book,
    settings: { ...settings, margins: { ...settings.margins } },
  };
}

export function firstPageOfSong(result, songIndex) {
  return result?.firstPages?.[songIndex] ?? 0;
}
