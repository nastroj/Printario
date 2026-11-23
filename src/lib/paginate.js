import { getColumnCount, getGeometry } from './settings.js';

/**
 * Add optional front matter and assign one fixed-size page to each song.
 */
export function paginateBook(book, settings) {
  const geometry = getGeometry(settings);
  const columns = getColumnCount(settings, geometry);
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

  const tocEntries = book.songs.map((song, index) => ({
    songIndex: index,
    number: song.bookNumber ?? index + 1,
    name: song.name,
    author: song.author || song.interpreter || null,
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
    pages.push({ type: 'song', number, songIndex, song });
    number += 1;
  });

  return {
    pages,
    firstPages,
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
