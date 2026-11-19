import { getColumnCount, getGeometry } from './settings.js';

const SAFETY_PX = 2;
const MIN_SCALE = 0.42;
const FIT_TOLERANCE = 1.5;

export function applySongScale(element, scale) {
  const safeScale = Math.max(MIN_SCALE, Math.min(2.4, Number(scale) || 1));
  element.style.setProperty('--song-scale', String(safeScale));
}

function px(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Measure the natural height of one song at scale 1. Kytario's print layout is
 * a flex column that wraps into columns; every item (header and sections) has
 * a fixed width, so the only thing that changes when we scale the type is the
 * height of each item.
 */
function measureBlock(sheetEl) {
  sheetEl.style.setProperty('--song-scale', '1');
  const header = sheetEl.querySelector('[data-song-header]');
  let headerHeight = 0;
  if (header) {
    headerHeight += header.getBoundingClientRect().height;
    headerHeight += px(getComputedStyle(header).marginBottom);
  }
  const interpreter = sheetEl.querySelector('[data-song-interpreter]');
  if (interpreter) {
    headerHeight += interpreter.getBoundingClientRect().height;
    headerHeight += px(getComputedStyle(interpreter).marginTop);
    headerHeight += px(getComputedStyle(interpreter).marginBottom);
  }

  const sections = [...sheetEl.querySelectorAll('[data-section]')].map((sectionEl) => {
    const style = getComputedStyle(sectionEl);
    return {
      height: sectionEl.getBoundingClientRect().height + px(style.marginTop),
      hasChords: sectionEl.getAttribute('data-has-chords') === 'true',
    };
  });

  return { headerHeight, sections };
}

/**
 * Greedily place items top-to-bottom, wrapping to a new column in the same
 * order the browser uses for the flex container. Sections cannot be split, so
 * a section that does not fit in the remaining space starts the next column.
 */
function packColumns(heights, available) {
  let columns = 1;
  let used = 0;
  let tooTall = false;
  const perColumn = [];

  for (const height of heights) {
    if (height > available + FIT_TOLERANCE) tooTall = true;
    if (used > 0 && used + height > available + FIT_TOLERANCE) {
      perColumn.push(used);
      used = 0;
      columns += 1;
    }
    used += height;
  }
  perColumn.push(used);

  return {
    columns,
    tooTall,
    perColumn,
    total: perColumn.reduce((sum, value) => sum + value, 0),
    tallest: Math.max(...perColumn),
  };
}

function heightsAt(base, scale) {
  return [base.headerHeight, ...base.sections.map((section) => section.height)]
    .map((height) => height * scale);
}

function fitsAt(base, available, maxColumns, scale) {
  const packed = packColumns(heightsAt(base, scale), available);
  return !packed.tooTall && packed.columns <= maxColumns;
}

function findMaxScale(base, available, maxColumns, ceiling) {
  if (fitsAt(base, available, maxColumns, ceiling)) return ceiling;
  // Even the smallest acceptable size may be too big for an extremely long
  // song. In that case we keep the minimum and report the overflow so the
  // studio can warn instead of silently losing lines.
  if (!fitsAt(base, available, maxColumns, MIN_SCALE)) return MIN_SCALE;

  let lo = MIN_SCALE;
  let hi = ceiling;
  for (let i = 0; i < 20; i += 1) {
    const mid = (lo + hi) / 2;
    if (fitsAt(base, available, maxColumns, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function fitBlock(base, settings, available, maxColumns) {
  const ceiling = 1 + Math.max(0, Math.min(120, Number(settings.autoFitStrength) || 0)) / 100;
  const maxScale = findMaxScale(base, available, maxColumns, ceiling);
  const totalAtOne = base.headerHeight
    + base.sections.reduce((sum, section) => sum + section.height, 0);
  const fitsAtOne = fitsAt(base, available, maxColumns, 1);

  let scale;
  if (!fitsAtOne) {
    // A song must fit on its page. Long songs are shrunk until they do.
    scale = maxScale;
  } else if (settings.autoFit) {
    const fill = Math.max(0.5, Math.min(0.99, (Number(settings.autoFitFill) || 92) / 100));
    const capacity = maxColumns * available;
    const wanted = (fill * capacity) / Math.max(1, totalAtOne);
    scale = Math.min(maxScale, Math.max(1, wanted));
  } else {
    scale = 1;
  }

  scale = Math.max(MIN_SCALE, Math.min(ceiling, scale));
  // Sub-pixel rounding in real fonts should never push a page over the edge.
  const safeScale = Math.min(scale, maxScale) * 0.998;
  const finalScale = Math.max(MIN_SCALE, safeScale);
  const overflow = !fitsAt(base, available, maxColumns, finalScale);

  return {
    scale: finalScale,
    autoFitted: finalScale > 1.012,
    shrunk: finalScale < 0.995,
    overflow,
    columns: maxColumns,
    baseHeight: totalAtOne,
  };
}

/**
 * Measure every song and turn it into pages: one page per song, exactly like a
 * Kytario songbook. Cover and table-of-contents pages are added around them.
 */
export function measureAndPaginate(root, book, settings) {
  const geometry = getGeometry(settings);
  const columns = getColumnCount(settings, geometry);
  // Keep a hair of room for sub-pixel rounding so the browser's flex wrapping
  // agrees with our packing.
  const available = Math.max(40, geometry.contentHeightPx - SAFETY_PX);
  const songEls = [...root.querySelectorAll('[data-measure-song]')];

  const fits = songEls.map((songEl) => {
    const base = measureBlock(songEl);
    return fitBlock(base, settings, available, columns);
  });

  const coverCount = settings.cover ? 1 : 0;
  const tocRows = Math.max(6, Math.min(34, Math.floor((geometry.contentHeightPx - 104) / 31)));
  const tocPerPage = tocRows * 2;
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
    number: index + 1,
    name: song.name,
    author: song.author || song.interpreter || null,
    page: firstPages[index],
  }));

  const tocPages = [];
  if (settings.contents) {
    for (let i = 0; i < contentPageCount; i += 1) {
      tocPages.push({
        type: 'contents',
        entries: tocEntries.slice(i * tocPerPage, (i + 1) * tocPerPage),
        tocPage: i,
        tocPageCount: contentPageCount,
        rows: tocRows,
      });
    }
  }

  const pages = [];
  let number = 1;
  if (settings.cover) {
    pages.push({ type: 'cover', number, songbook: book });
    number += 1;
  }
  tocPages.forEach((toc) => {
    pages.push({ ...toc, number });
    number += 1;
  });
  book.songs.forEach((song, songIndex) => {
    pages.push({
      type: 'song',
      number,
      songIndex,
      song,
      sections: [],
      fit: fits[songIndex],
      pageInSong: 0,
      pageCount: 1,
    });
    number += 1;
  });

  return {
    pages,
    fits,
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

export const __test = { packColumns, fitsAt, findMaxScale, fitBlock };
