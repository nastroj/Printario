import { getGeometry } from './settings.js';

const SAFETY_PX = 2;

export function applySongScale(element, scale) {
  const safeScale = Math.max(0.8, Math.min(2.2, Number(scale) || 1));
  element.style.setProperty('--song-scale', String(safeScale));
  // Auto-fit doesn't just enlarge letters; it also gives the page more air.
  element.style.setProperty('--song-air', String(1 + Math.max(0, safeScale - 1) * 0.9));
}

function px(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function measureSection(sectionEl, { detail = false } = {}) {
  const rect = sectionEl.getBoundingClientRect();
  const style = getComputedStyle(sectionEl);
  const heading = sectionEl.querySelector('[data-section-heading]');
  let titleHeight = px(style.paddingTop);
  if (heading) {
    const hStyle = getComputedStyle(heading);
    titleHeight += heading.getBoundingClientRect().height + px(hStyle.marginBottom);
  }

  const lineEls = detail ? [...sectionEl.querySelectorAll('[data-line]')] : [];
  const lineHeights = lineEls.map((el) => el.getBoundingClientRect().height);

  return {
    height: rect.height,
    titleHeight,
    lineHeights,
    lineCount: lineEls.length,
  };
}

function measureSong(songEl, { detail = false } = {}) {
  const headerEl = songEl.querySelector('[data-song-header]');
  const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 0;
  const sections = [...songEl.querySelectorAll('[data-section]')].map((sectionEl) =>
    measureSection(sectionEl, { detail }),
  );
  return {
    headerHeight,
    sections,
    totalHeight: headerHeight + sections.reduce((sum, section) => sum + section.height, 0),
  };
}

/**
 * Iteratively find a comfortable scale for one song. Short songs are enlarged
 * until they comfortably fill the page; long songs keep the user's base size.
 */
function fitSong(songEl, contentHeightPx, settings) {
  applySongScale(songEl, 1);
  const base = measureSong(songEl);

  if (!settings.autoFit || base.totalHeight > contentHeightPx - SAFETY_PX) {
    const detailed = measureSong(songEl, { detail: true });
    return {
      scale: 1,
      autoFitted: false,
      baseHeight: base.totalHeight,
      ...detailed,
    };
  }

  const target = contentHeightPx * (Math.min(98, Math.max(60, settings.autoFitFill)) / 100);
  const maxScale = 1 + Math.min(90, Math.max(0, settings.autoFitStrength)) / 100;

  let candidate = Math.min(maxScale, Math.max(1, (target / Math.max(1, base.totalHeight)) ** 0.86));
  if (candidate < 1.012) candidate = 1;

  applySongScale(songEl, candidate);
  let measured = measureSong(songEl);

  // Font growth can change line wrapping, so verify and correct once.
  if (measured.totalHeight > target * 1.025 && measured.totalHeight > 0) {
    candidate = Math.max(1, candidate * (target / measured.totalHeight) ** 0.82);
    applySongScale(songEl, candidate);
    measured = measureSong(songEl);
  }

  if (measured.totalHeight > contentHeightPx * 0.995) {
    candidate = 1;
    applySongScale(songEl, 1);
    measured = measureSong(songEl);
  }

  const detailed = measureSong(songEl, { detail: true });
  return {
    scale: candidate,
    autoFitted: candidate > 1.012,
    baseHeight: base.totalHeight,
    ...detailed,
  };
}

function newPage() {
  return { sections: [], used: 0 };
}

function packSongPages(measurement, contentHeightPx) {
  const pages = [];
  let page = newPage();
  page.used = measurement.headerHeight;

  const commit = () => {
    if (page.sections.length > 0) {
      pages.push(page);
    }
    page = newPage();
  };

  const addPart = (sectionIndex, lineStart, lineEnd) => {
    page.sections.push({
      index: sectionIndex,
      lineStart,
      lineEnd,
      continued: lineStart > 0,
    });
  };

  // Fill the current page with as many lines from a section as will fit.
  // Returns the next line index.
  const fillSection = (sectionIndex, section) => {
    let position = 0;
    while (position < section.lineCount) {
      let available = contentHeightPx - page.used - section.titleHeight - SAFETY_PX;
      if (available <= 0 && page.sections.length > 0) {
        commit();
        available = contentHeightPx - section.titleHeight - SAFETY_PX;
      }

      const start = position;
      while (position < section.lineCount) {
        const lineHeight = section.lineHeights[position] ?? 12;
        if (available - lineHeight < 0 && position > start) break;
        available -= lineHeight;
        position += 1;
      }
      if (position === start) {
        // A single line is taller than a whole page. Place it so we cannot loop.
        position += 1;
      }

      const linesHeight = section.lineHeights
        .slice(start, position)
        .reduce((sum, value) => sum + value, 0);
      addPart(sectionIndex, start, position);
      page.used += section.titleHeight + linesHeight;

      if (position < section.lineCount) commit();
    }
  };

  for (let sectionIndex = 0; sectionIndex < measurement.sections.length; sectionIndex += 1) {
    const section = measurement.sections[sectionIndex];
    const fitsWhole = section.height <= contentHeightPx - SAFETY_PX;
    const fitsHere = section.height <= contentHeightPx - page.used - SAFETY_PX;

    if (fitsWhole && fitsHere) {
      addPart(sectionIndex, 0, section.lineCount);
      page.used += section.height;
      continue;
    }

    if (fitsWhole) {
      // If only the song header is on this page, use the space rather than
      // leaving a header orphaned above a blank area.
      if (page.sections.length === 0 && page.used > measurement.headerHeight) {
        fillSection(sectionIndex, section);
        continue;
      }
      commit();
      addPart(sectionIndex, 0, section.lineCount);
      page.used = section.height;
      continue;
    }

    // A section taller than a page is split at line boundaries.
    commit();
    fillSection(sectionIndex, section);
  }

  if (page.sections.length > 0) pages.push(page);
  if (pages.length === 0) pages.push({ sections: [], used: 0 });
  return pages;
}

/**
 * Measure every song and turn it into a flat list of pages, including cover and
 * contents pages. Called from a layout effect after the hidden measuring deck
 * has rendered.
 */
export function measureAndPaginate(root, book, settings) {
  const geometry = getGeometry(settings);
  const contentHeightPx = geometry.contentHeightPx;
  const songEls = [...root.querySelectorAll('[data-measure-song]')];
  const fits = [];
  const songPageSets = [];
  const firstPages = [];

  songEls.forEach((songEl, songIndex) => {
    const fit = fitSong(songEl, contentHeightPx, settings);
    fits.push(fit);
    songPageSets.push(packSongPages(fit, contentHeightPx));
  });

  const coverCount = settings.cover ? 1 : 0;
  const tocRows = Math.max(
    6,
    Math.min(34, Math.floor((contentHeightPx - 104) / 31)),
  );
  const tocPerPage = tocRows * 2;
  const contentPageCount = settings.contents
    ? Math.ceil(book.songs.length / tocPerPage)
    : 0;

  let cursor = coverCount + contentPageCount + 1;
  songPageSets.forEach((pages) => {
    firstPages.push(cursor);
    cursor += pages.length;
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
  songPageSets.forEach((songPages, songIndex) => {
    songPages.forEach((songPage, pageInSong) => {
      pages.push({
        type: 'song',
        number,
        songIndex,
        song: book.songs[songIndex],
        pageInSong,
        pageCount: songPages.length,
        sections: songPage.sections,
        fit: fits[songIndex],
      });
      number += 1;
    });
  });

  return {
    pages,
    fits,
    firstPages,
    geometry,
    pageCount: pages.length,
    contentPageCount,
    songbook: book,
    settings: { ...settings, margins: { ...settings.margins } },
  };
}

export function firstPageOfSong(result, songIndex) {
  return result?.firstPages?.[songIndex] ?? 0;
}
