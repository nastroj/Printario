import { jsPDF } from 'jspdf';
import {
  KYTARIO_PALETTE, getColumnCount, getTypeScale,
} from './settings.js';

const PX_TO_MM = 25.4 / 96;
const PX_TO_PT = 0.75;
const CHORUS_TITLE_RE = /ref|cho/i;
const NBSP = '\u00a0';

const PDF_FONT_FAMILIES = {
  inter: {
    name: 'LiberationSans',
    fallback: 'helvetica',
    files: {
      normal: '/fonts/LiberationSans-Regular.ttf',
      bold: '/fonts/LiberationSans-Bold.ttf',
      bolditalic: '/fonts/LiberationSans-BoldItalic.ttf',
    },
  },
  lora: {
    name: 'LiberationSerif',
    fallback: 'times',
    files: {
      normal: '/fonts/LiberationSerif-Regular.ttf',
      bold: '/fonts/LiberationSerif-Bold.ttf',
      bolditalic: '/fonts/LiberationSerif-BoldItalic.ttf',
    },
  },
  mono: {
    name: 'LiberationMono',
    fallback: 'courier',
    files: {
      normal: '/fonts/LiberationMono-Regular.ttf',
      bold: '/fonts/LiberationMono-Bold.ttf',
      bolditalic: '/fonts/LiberationMono-BoldItalic.ttf',
    },
  },
};

const fontBase64Cache = new Map();

/**
 * Generates a clean, filesystem-safe filename for the exported PDF.
 */
export function getPdfFilename(songbook) {
  const raw = typeof songbook === 'string' ? songbook : songbook?.name;
  const cleaned = (raw || 'kytario-songbook')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${cleaned || 'kytario-songbook'}.pdf`;
}

/**
 * Creates and initializes a jsPDF document for the given geometry.
 */
export function createPdfDocument({ geometry }) {
  const orientation = geometry.widthMm > geometry.heightMm ? 'landscape' : 'portrait';
  return new jsPDF({
    orientation,
    unit: 'mm',
    format: [geometry.widthMm, geometry.heightMm],
    compress: true,
  });
}

function arrayBufferToBase64(buffer) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchFontBase64(url, signal) {
  const cached = fontBase64Cache.get(url);
  if (cached) return cached;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch font ${url} (${response.status})`);
  }
  const b64 = arrayBufferToBase64(await response.arrayBuffer());
  fontBase64Cache.set(url, b64);
  return b64;
}

async function setupPdfFonts(doc, fontFamily, signal) {
  const spec = PDF_FONT_FAMILIES[fontFamily] ?? PDF_FONT_FAMILIES.inter;
  try {
    const entries = await Promise.all(
      Object.entries(spec.files).map(async ([style, url]) => {
        const b64 = await fetchFontBase64(url, signal);
        return [style, url.split('/').pop(), b64];
      }),
    );

    for (const [style, vfsName, b64] of entries) {
      doc.addFileToVFS(vfsName, b64);
      doc.addFont(vfsName, spec.name, style);
    }

    doc.setFont(spec.name, 'normal');
    const fontObj = doc.getFont(spec.name, 'normal');
    const cmap = fontObj?.metadata?.cmap?.unicode?.codeMap ?? null;
    return { fontName: spec.name, cmap };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { fontName: spec.fallback, cmap: null };
  }
}

function sanitizeText(text, cmap) {
  const str = String(text ?? '').replace(/\u2236/g, ':');
  if (!cmap) return str;
  let out = '';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === 10 || cp === 13 || cp === 9 || cmap[cp] !== undefined) {
      out += ch;
    } else if (ch === '×') {
      out += 'x';
    } else if (ch === '…') {
      out += '...';
    } else if (ch === '–' || ch === '—') {
      out += '-';
    } else {
      out += ' ';
    }
  }
  return out;
}

function parseHexRgb(hex, fallback = [31, 41, 55]) {
  if (typeof hex !== 'string') return fallback;
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = Number.parseInt(clean[0] + clean[0], 16);
    const g = Number.parseInt(clean[1] + clean[1], 16);
    const b = Number.parseInt(clean[2] + clean[2], 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
  } else if (clean.length === 6) {
    const r = Number.parseInt(clean.slice(0, 2), 16);
    const g = Number.parseInt(clean.slice(2, 4), 16);
    const b = Number.parseInt(clean.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
  }
  return fallback;
}

function isPureWhite(hex) {
  const [r, g, b] = parseHexRgb(hex, [255, 255, 255]);
  return r === 255 && g === 255 && b === 255;
}

function createTextHelper(doc, fontName, cmap) {
  const widthCache = new Map();
  let curStyle = '';
  let curPt = 0;

  const set = (style, pt) => {
    if (curStyle !== style) {
      doc.setFont(fontName, style);
      curStyle = style;
    }
    if (curPt !== pt) {
      doc.setFontSize(pt);
      curPt = pt;
    }
  };

  const measure = (style, pt, rawText) => {
    const text = sanitizeText(rawText, cmap);
    if (!text) return 0;
    const key = `${style}\0${pt}\0${text}`;
    const hit = widthCache.get(key);
    if (hit !== undefined) return hit;

    set(style, pt);
    const w = doc.getTextWidth(text);
    if (widthCache.size > 12000) widthCache.clear();
    widthCache.set(key, w);
    return w;
  };

  const draw = (style, pt, rgb, rawText, xMm, yMm, opts = {}) => {
    const text = sanitizeText(rawText, cmap);
    if (!text) return;
    set(style, pt);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(text, xMm, yMm, { baseline: 'middle', ...opts });
  };

  return { measure, draw };
}

function wrapText(measure, style, pt, text, maxWidthMm) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  if (measure(style, pt, clean) <= maxWidthMm) return [clean];

  const words = clean.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(style, pt, candidate) <= maxWidthMm) {
      current = candidate;
    } else if (!current) {
      lines.push(word);
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateText(measure, style, pt, text, maxWidthMm) {
  if (!text || maxWidthMm <= 0) return '';
  if (measure(style, pt, text) <= maxWidthMm) return text;
  const ellipsis = '…';
  const ellW = measure(style, pt, ellipsis);
  if (ellW >= maxWidthMm) return '';

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(style, pt, text.slice(0, mid)) + ellW <= maxWidthMm) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + ellipsis;
}

function fillPageTint(doc, widthMm, heightMm, paperTint) {
  if (!paperTint || isPureWhite(paperTint)) return;
  const [r, g, b] = parseHexRgb(paperTint, [255, 255, 255]);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, widthMm, heightMm, 'F');
}

function drawFileTextVectorIcon(doc, xMm, yMm, sizeMm, rgb) {
  const s = sizeMm / 24;
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(2 * s);
  doc.setLineCap('round');
  doc.setLineJoin('round');
  doc.lines(
    [
      [11, 0],
      [4, 4],
      [0, 16],
      [-15, 0],
      [0, -20],
    ],
    xMm + 4 * s,
    yMm + 2 * s,
    [s, s],
    'S',
    true,
  );
  doc.line(xMm + 14 * s, yMm + 2 * s, xMm + 14 * s, yMm + 7 * s);
  doc.line(xMm + 14 * s, yMm + 7 * s, xMm + 19 * s, yMm + 7 * s);
  doc.line(xMm + 8 * s, yMm + 9 * s, xMm + 10 * s, yMm + 9 * s);
  doc.line(xMm + 8 * s, yMm + 13 * s, xMm + 16 * s, yMm + 13 * s);
  doc.line(xMm + 8 * s, yMm + 17 * s, xMm + 16 * s, yMm + 17 * s);
}

function renderCoverPage(doc, {
  book, settings, geometry, textHelper, qrDataUrl,
}) {
  const { widthMm, heightMm, widthPx } = geometry;
  const columns = getColumnCount(settings, geometry);
  fillPageTint(doc, widthMm, heightMm, settings.paperTint);

  const songCount = book.songs?.length ?? 0;
  const countText = `${songCount} ${songCount === 1 ? 'song' : 'songs'}`;
  const sourceUrl = typeof book.sourceUrl === 'string' ? book.sourceUrl : '';
  const sourceLabel = sourceUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const notation = book.songs?.[0]?.notation;
  const notationText = notation === 'english'
    ? 'This songbook uses English notation - tones C-C#-D-Eb-E-F-F#-G-G#-A-Bb-B.'
    : notation === 'german'
      ? 'This songbook uses German notation.'
      : null;

  const centerX = widthMm / 2;
  const padMm = 20 * PX_TO_MM;
  const innerW = Math.max(25, widthMm - padMm * 2);
  const darkInk = [39, 39, 42];
  const mutedInk = [113, 113, 122];

  if (columns === 1) {
    const titlePx = Math.max(24, Math.min(48, widthPx * 0.05));
    const titlePt = titlePx * PX_TO_PT;
    const titleLineH = titlePx * 1.2 * PX_TO_MM;
    const countPt = 14 * PX_TO_PT;
    const countH = 14 * PX_TO_MM;
    const sourcePt = 14 * PX_TO_PT;
    const sourceLineH = 16.8 * PX_TO_MM;

    const titleLines = textHelper ? wrapText(textHelper.measure, 'bold', titlePt, book.name, innerW) : [book.name];
    const hasQr = Boolean(qrDataUrl && sourceUrl);
    const qrSize = 140 * PX_TO_MM;
    const sourceLines = hasQr ? wrapText(textHelper.measure, 'bold', sourcePt, sourceLabel, innerW - 10) : [];
    const sourceH = hasQr ? Math.max(17 * PX_TO_MM, sourceLines.length * sourceLineH) : 0;
    const qrBlockH = hasQr ? qrSize + 28 * PX_TO_MM + sourceH : 0;

    const headingH = titleLines.length * titleLineH + 20 * PX_TO_MM + countH;
    const totalH = headingH + (hasQr ? 40 * PX_TO_MM + qrBlockH : 0);
    let y = Math.max(padMm, (heightMm - totalH) / 2);

    for (const line of titleLines) {
      textHelper.draw('bold', titlePt, darkInk, line, centerX, y + titleLineH / 2, { align: 'center' });
      y += titleLineH;
    }

    y += 20 * PX_TO_MM;
    textHelper.draw('normal', countPt, mutedInk, countText, centerX, y + countH / 2, { align: 'center' });
    y += countH;

    if (hasQr) {
      y += 40 * PX_TO_MM;
      doc.addImage(qrDataUrl, 'PNG', centerX - qrSize / 2, y, qrSize, qrSize);
      y += qrSize + 28 * PX_TO_MM;

      const iconSize = 17 * PX_TO_MM;
      const gap = 12 * PX_TO_MM;
      const maxLineW = sourceLines.reduce((m, l) => Math.max(m, textHelper.measure('bold', sourcePt, l)), 0);
      const rowW = iconSize + gap + maxLineW;
      const rowX = centerX - rowW / 2;
      drawFileTextVectorIcon(doc, rowX, y + (sourceH - iconSize) / 2, iconSize, [43, 43, 43]);

      for (let i = 0; i < sourceLines.length; i += 1) {
        textHelper.draw(
          'bold',
          sourcePt,
          darkInk,
          sourceLines[i],
          rowX + iconSize + gap,
          y + i * sourceLineH + sourceLineH / 2,
          { align: 'left' },
        );
      }
    }
    return;
  }

  // Two-column / landscape cover
  const titlePt = 48 * PX_TO_PT;
  const titleLineH = 48 * PX_TO_MM;
  const countPt = 14 * PX_TO_PT;
  const countH = 14 * PX_TO_MM;
  const detailsPt = 14 * PX_TO_PT;
  const detailsLineH = 14 * PX_TO_MM;
  const sourcePt = 14 * PX_TO_PT;
  const sourceLineH = 16.8 * PX_TO_MM;

  const titleLines = wrapText(textHelper.measure, 'bold', titlePt, book.name, innerW);
  let topY = (20 + 32) * PX_TO_MM;

  for (const line of titleLines) {
    textHelper.draw('bold', titlePt, darkInk, line, centerX, topY + titleLineH / 2, { align: 'center' });
    topY += titleLineH;
  }

  topY += 20 * PX_TO_MM;
  textHelper.draw('normal', countPt, mutedInk, countText, centerX, topY + countH / 2, { align: 'center' });
  const mainTopEnd = topY + countH;

  const attrLine1 = 'Prepared with Printario for print-ready Kytario songbooks.';
  const attrLine2 = 'Share your book and sing or play together.';
  const detailsW = Math.min(786 * PX_TO_MM, innerW);
  let bottomY = heightMm - 15 * PX_TO_MM;

  bottomY -= detailsLineH;
  textHelper.draw('normal', detailsPt, mutedInk, attrLine2, centerX, bottomY + detailsLineH / 2, { align: 'center' });
  bottomY -= detailsLineH;
  textHelper.draw('normal', detailsPt, mutedInk, attrLine1, centerX, bottomY + detailsLineH / 2, { align: 'center' });

  bottomY -= 16 * PX_TO_MM;
  doc.setDrawColor(212, 212, 216);
  doc.setLineWidth(PX_TO_MM);
  doc.line(centerX - detailsW / 2, bottomY, centerX + detailsW / 2, bottomY);
  bottomY -= 16 * PX_TO_MM;

  if (notationText) {
    const notationLines = wrapText(textHelper.measure, 'normal', detailsPt, notationText, detailsW);
    for (let i = notationLines.length - 1; i >= 0; i -= 1) {
      bottomY -= detailsLineH;
      textHelper.draw(
        'normal',
        detailsPt,
        mutedInk,
        notationLines[i],
        centerX,
        bottomY + detailsLineH / 2,
        { align: 'center' },
      );
    }
  }

  if (qrDataUrl && sourceUrl) {
    const qrSize = 144 * PX_TO_MM;
    const gap = 32 * PX_TO_MM;
    const iconSize = 17 * PX_TO_MM;
    const iconGap = 12 * PX_TO_MM;
    const maxSourceW = Math.max(35, innerW - qrSize - gap - iconSize - iconGap - 5);
    const sourceLines = wrapText(textHelper.measure, 'bold', sourcePt, sourceLabel, maxSourceW);
    const textW = sourceLines.reduce((m, l) => Math.max(m, textHelper.measure('bold', sourcePt, l)), 0);
    const rowW = qrSize + gap + iconSize + iconGap + textW;
    const midY = mainTopEnd + (bottomY - mainTopEnd) / 2;
    const qrX = centerX - rowW / 2;
    const qrY = midY - qrSize / 2;

    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);

    const sourceBlockH = sourceLines.length * sourceLineH;
    const linkX = qrX + qrSize + gap;
    const linkY = midY - sourceBlockH / 2;
    drawFileTextVectorIcon(doc, linkX, midY - iconSize / 2, iconSize, [43, 43, 43]);

    for (let i = 0; i < sourceLines.length; i += 1) {
      textHelper.draw(
        'bold',
        sourcePt,
        darkInk,
        sourceLines[i],
        linkX + iconSize + iconGap,
        linkY + i * sourceLineH + sourceLineH / 2,
        { align: 'left' },
      );
    }
  }
}

function renderContentsPage(doc, {
  page, book, settings, geometry, textHelper,
}) {
  const { widthMm, heightMm, heightPx } = geometry;
  fillPageTint(doc, widthMm, heightMm, settings.paperTint);

  const darkInk = [39, 39, 42];
  const titlePt = 15.4 * PX_TO_PT;
  const entryPt = 14 * PX_TO_PT;
  const padMm = 20 * PX_TO_MM;
  const titleH = 21 * PX_TO_MM;
  const rowH = 14 * PX_TO_MM;

  const titleText = truncateText(textHelper.measure, 'bold', titlePt, book.name, widthMm - padMm * 2);
  textHelper.draw('bold', titlePt, darkInk, titleText, widthMm / 2, padMm + titleH / 2, { align: 'center' });

  const listW = Math.min(1010 * PX_TO_MM, widthMm - padMm * 2);
  const listX = (widthMm - listW) / 2;
  const listY = padMm + titleH;
  const colW = listW / 3;
  const rows = page.rows || Math.max(1, Math.floor(Math.min(672, heightPx - 63) / 14));
  const numW = 28 * PX_TO_MM;

  for (let idx = 0; idx < page.entries.length; idx += 1) {
    const entry = page.entries[idx];
    const col = Math.floor(idx / rows);
    const row = idx % rows;
    const x = listX + col * colW;
    const y = listY + row * rowH + rowH / 2;

    textHelper.draw('normal', entryPt, darkInk, String(entry.number), x + numW, y, { align: 'right' });

    const restRaw = ` - ${entry.name}${entry.author ? ` - ${entry.author}` : ''}`;
    const rest = truncateText(textHelper.measure, 'normal', entryPt, restRaw, colW - numW - 1.2);
    textHelper.draw('normal', entryPt, darkInk, rest, x + numW, y, { align: 'left' });
  }
}

function renderSongPage(doc, {
  page, settings, geometry, textHelper,
}) {
  const {
    widthMm, heightMm, marginTop, marginLeft, contentWidthMm, contentHeightMm,
  } = geometry;
  fillPageTint(doc, widthMm, heightMm, settings.paperTint);

  const columns = getColumnCount(settings, geometry);
  const typeScale = getTypeScale(geometry, columns);
  const song = page.song;

  const lyricPx = settings.lyricsSize * typeScale;
  const chordPx = settings.chordsSize * typeScale;
  const headingPx = settings.headingSize * typeScale;
  const labelPx = lyricPx * 0.7;

  const lyricMm = lyricPx * PX_TO_MM;
  const chordMm = chordPx * PX_TO_MM;
  const headingMm = headingPx * PX_TO_MM;
  const labelMm = labelPx * PX_TO_MM;

  const lyricPt = lyricPx * PX_TO_PT;
  const chordPt = chordPx * PX_TO_PT;
  const chordBarPt = 0.7 * chordPx * PX_TO_PT;
  const headingPt = headingPx * PX_TO_PT;
  const keyPt = 0.8 * headingPx * PX_TO_PT;
  const labelPt = labelPx * PX_TO_PT;
  const badgePt = 0.75 * lyricPx * PX_TO_PT;
  const inlineBarPt = 0.7 * lyricPx * PX_TO_PT;

  const chordRowH = chordMm;
  const lyricRowH = lyricMm * settings.lineHeight;

  const headingRgb = parseHexRgb(settings.headingColor, parseHexRgb(KYTARIO_PALETTE.heading));
  const lyricsRgb = parseHexRgb(settings.lyricsColor, parseHexRgb(KYTARIO_PALETTE.lyrics));
  const chordsRgb = parseHexRgb(settings.chordsColor, parseHexRgb(KYTARIO_PALETTE.chords));
  const ruleRgb = parseHexRgb(settings.ruleColor ?? KYTARIO_PALETTE.rule);
  const chorusRgb = parseHexRgb(settings.chorusColor ?? KYTARIO_PALETTE.chorus);
  const badgeRgb = parseHexRgb(settings.badgeColor ?? KYTARIO_PALETTE.badge);

  const cx = marginLeft;
  const cy = marginTop;
  const cw = contentWidthMm;
  const ch = contentHeightMm;
  const sheetH = Math.max(4, ch - 5 * PX_TO_MM);
  const colW = columns === 2 ? cw / 2 : cw;

  doc.saveGraphicsState();
  doc.rect(cx, cy, cw, ch, null);
  doc.clip();
  doc.discardPath();

  // --- Song Header ---
  const badgeSize = lyricMm * 1.7;
  const author = song.author || song.interpreter || null;
  const mainTitle = author ? `${song.name} - ${author}` : song.name;
  const keyText = settings.showMetadata && song.tonalKey ? `(${song.tonalKey})` : null;
  const titleAvailW = Math.max(6, colW - badgeSize);

  const titleLines = wrapText(textHelper.measure, 'bold', headingPt, mainTitle, titleAvailW);
  if (titleLines.length === 0) titleLines.push('');

  let keyOnLastLine = false;
  if (keyText) {
    const lastIdx = titleLines.length - 1;
    const keyGap = 0.2 * headingMm;
    const combinedW = textHelper.measure('bold', headingPt, titleLines[lastIdx])
      + keyGap
      + textHelper.measure('normal', keyPt, keyText);
    if (combinedW <= titleAvailW) {
      keyOnLastLine = true;
    } else {
      titleLines.push(keyText);
    }
  }

  const titleLineH = headingMm * 1.6;
  const headerH = Math.max(badgeSize, titleLines.length * titleLineH);

  // Badge
  const badgeY = cy + (headerH - badgeSize) / 2;
  const badgeRadius = 2 * PX_TO_MM;
  doc.setFillColor(badgeRgb[0], badgeRgb[1], badgeRgb[2]);
  doc.roundedRect(cx, badgeY, badgeSize, badgeSize, badgeRadius, badgeRadius, 'F');

  textHelper.draw(
    'bold',
    badgePt,
    [255, 255, 255],
    String(song.bookNumber ?? page.songIndex + 1),
    cx + badgeSize / 2,
    badgeY + badgeSize / 2,
    { align: 'center' },
  );

  // Title lines
  const titleBlockTop = cy + (headerH - titleLines.length * titleLineH) / 2;
  const titleCenterX = cx + badgeSize + titleAvailW / 2;
  for (let i = 0; i < titleLines.length; i += 1) {
    const lineY = titleBlockTop + i * titleLineH + titleLineH / 2;
    const isKeyOnlyLine = keyText && !keyOnLastLine && i === titleLines.length - 1;
    const isLastWithKey = keyText && keyOnLastLine && i === titleLines.length - 1;

    if (isLastWithKey) {
      const keyGap = 0.2 * headingMm;
      const mainW = textHelper.measure('bold', headingPt, titleLines[i]);
      const keyW = textHelper.measure('normal', keyPt, keyText);
      const startX = titleCenterX - (mainW + keyGap + keyW) / 2;
      textHelper.draw('bold', headingPt, headingRgb, titleLines[i], startX, lineY, { align: 'left' });
      textHelper.draw('normal', keyPt, headingRgb, keyText, startX + mainW + keyGap, lineY, { align: 'left' });
    } else {
      textHelper.draw(
        isKeyOnlyLine ? 'normal' : 'bold',
        isKeyOnlyLine ? keyPt : headingPt,
        headingRgb,
        titleLines[i],
        titleCenterX,
        lineY,
        { align: 'center' },
      );
    }
  }

  // --- Sections ---
  const borderL = 0.2 * lyricMm;
  const borderT = 0.1 * lyricMm;
  const borderB = 0.1 * lyricMm;
  const borderR = 0.1 * lyricMm;
  const padL = 0.2 * lyricMm;
  const labelW = settings.showSectionLabels ? 2.4 * labelMm : 0;
  const labelPadR = 0.25 * labelMm;
  const linesPadR = 0.6 * lyricMm;
  const lineAvailW = Math.max(6, colW - borderL - borderR - padL - labelW - linesPadR);
  const scaleThreshold = 0.75 * PX_TO_MM;

  let col = 0;
  let curY = headerH + 0.2 * lyricMm;

  for (let sIdx = 0; sIdx < song.sections.length; sIdx += 1) {
    const section = song.sections[sIdx];
    const hideChords = section.expandable && columns === 2;
    const showChords = !hideChords;
    const showLabel = settings.showSectionLabels && Boolean(section.title);
    const isChorus = CHORUS_TITLE_RE.test(section.title);
    const marginTop = sIdx === 0 ? 0.3 * lyricMm : 1.2 * lyricMm;

    let sectionInnerH = 0;
    for (const line of section.lines) {
      sectionInnerH += line.kind === 'inline'
        ? lyricMm * 1.2
        : (showChords ? chordRowH : 0) + lyricRowH;
    }
    const sectionBoxH = borderT + sectionInnerH + borderB;

    if (columns === 2 && col === 0 && curY > 0 && curY + marginTop + sectionBoxH > sheetH) {
      col = 1;
      curY = 0;
    }

    const secX = cx + col * colW;
    const secY = cy + curY + marginTop;

    const barRgb = isChorus ? chorusRgb : ruleRgb;
    doc.setFillColor(barRgb[0], barRgb[1], barRgb[2]);
    doc.rect(secX, secY, borderL, sectionBoxH, 'F');

    if (showLabel) {
      const labelX = secX + borderL + padL + labelW - labelPadR;
      const labelY = secY + borderT + (showChords ? chordRowH : 0) + lyricRowH / 2;
      textHelper.draw('normal', labelPt, lyricsRgb, section.title, labelX, labelY, { align: 'right' });
    }

    const linesX = secX + borderL + padL + labelW;
    let lineY = secY + borderT;

    for (const line of section.lines) {
      if (line.kind === 'inline') {
        const lineH = lyricMm * 1.2;
        const measuredItems = [];
        let totalW = 0;

        for (const item of line.items) {
          if (item.t === 'space') {
            const w = item.em * lyricMm;
            measuredItems.push({ kind: 'space', w });
            totalW += w;
          } else if (item.t === 'bar') {
            const pad = 0.3 * lyricMm;
            const w = textHelper.measure('normal', inlineBarPt, '|') + pad * 2;
            measuredItems.push({
              kind: 'text', text: '|', style: 'normal', pt: inlineBarPt, xOffset: pad, yOffset: -0.05 * lyricMm, w,
            });
            totalW += w;
          } else if (item.t === 'dash') {
            const pad = 0.2 * lyricMm;
            const w = textHelper.measure('normal', lyricPt, '-') + pad * 2;
            measuredItems.push({
              kind: 'text', text: '-', style: 'normal', pt: lyricPt, xOffset: pad, yOffset: 0, w,
            });
            totalW += w;
          } else if (item.t === 'repeatStart') {
            const text = item.count > 2 ? ` |∶ ${item.count}× ` : ' |∶ ';
            const w = textHelper.measure('bold', lyricPt, text);
            measuredItems.push({
              kind: 'text', text, style: 'bold', pt: lyricPt, xOffset: 0, yOffset: 0, w,
            });
            totalW += w;
          } else if (item.t === 'repeatEnd') {
            const text = item.count > 2 ? ` ∶| ${item.count}× ` : ' ∶| ';
            const w = textHelper.measure('bold', lyricPt, text);
            measuredItems.push({
              kind: 'text', text, style: 'bold', pt: lyricPt, xOffset: 0, yOffset: 0, w,
            });
            totalW += w;
          } else if (item.t === 'chord' || item.t === 'ref' || item.t === 'text') {
            const text = item.v;
            const w = textHelper.measure('bold', lyricPt, text);
            measuredItems.push({
              kind: 'text', text, style: 'bold', pt: lyricPt, xOffset: 0, yOffset: 0, w,
            });
            totalW += w;
          }
        }

        const lineScale = totalW > lineAvailW + scaleThreshold ? lineAvailW / totalW : 1;
        let curX = 0;
        for (const mi of measuredItems) {
          if (mi.kind === 'text') {
            textHelper.draw(
              mi.style,
              mi.pt * lineScale,
              chordsRgb,
              mi.text,
              linesX + (curX + mi.xOffset) * lineScale,
              lineY + lineH / 2 + mi.yOffset * lineScale,
              { align: 'left' },
            );
          }
          curX += mi.w;
        }
        lineY += lineH;
      } else {
        const lineH = (showChords ? chordRowH : 0) + lyricRowH;
        const measuredSegs = [];
        let totalW = 0;

        for (const segment of line.segments) {
          if (!showChords && segment.bar) continue;
          if (!showChords && !segment.spaceEm && !segment.text) continue;

          const hasChord = segment.chords.length > 0 || segment.bar;
          let chordText = '';
          let chordW = 0;
          let chordStyle = 'bolditalic';
          let chordFontPt = chordPt;
          let chordPadX = 0;

          if (showChords) {
            if (segment.bar) {
              chordText = '|';
              chordStyle = 'normal';
              chordFontPt = chordBarPt;
              chordPadX = 0.2 * chordMm;
              chordW = textHelper.measure('normal', chordBarPt, '|') + chordPadX * 2;
            } else if (segment.chords.length > 0) {
              chordText = segment.chords.join(' ');
              chordPadX = 0.1 * chordMm;
              chordW = textHelper.measure('bolditalic', chordPt, chordText) + chordPadX * 2;
            }
          }

          let lyricText = '';
          let lyricW = 0;
          if (segment.spaceEm) {
            lyricW = segment.spaceEm * lyricMm;
          } else {
            lyricText = segment.text || (hasChord ? NBSP : '');
            lyricW = lyricText ? textHelper.measure('normal', lyricPt, lyricText) : 0;
          }

          const segW = Math.max(chordW, lyricW);
          measuredSegs.push({
            segW,
            chordText,
            chordStyle,
            chordFontPt,
            chordPadX,
            isBar: Boolean(segment.bar),
            lyricText,
          });
          totalW += segW;
        }

        const lineScale = totalW > lineAvailW + scaleThreshold ? lineAvailW / totalW : 1;
        const lineMidY = lineY + lineH / 2;
        const chordRelY = chordRowH / 2 - lineH / 2;
        const lyricRelY = (showChords ? chordRowH : 0) + lyricRowH / 2 - lineH / 2;
        let curX = 0;

        for (const seg of measuredSegs) {
          if (seg.chordText) {
            textHelper.draw(
              seg.chordStyle,
              seg.chordFontPt * lineScale,
              chordsRgb,
              seg.chordText,
              linesX + (curX + seg.chordPadX) * lineScale,
              lineMidY + (chordRelY - (seg.isBar ? 0.05 * chordMm : 0)) * lineScale,
              { align: 'left' },
            );
          }
          if (seg.lyricText) {
            textHelper.draw(
              'normal',
              lyricPt * lineScale,
              lyricsRgb,
              seg.lyricText,
              linesX + curX * lineScale,
              lineMidY + lyricRelY * lineScale,
              { align: 'left' },
            );
          }
          curX += seg.segW;
        }
        lineY += lineH;
      }
    }

    curY += marginTop + sectionBoxH;
  }

  doc.restoreGraphicsState();
}

async function loadQrDataUrl(book, signal) {
  if (book.singleSong || !book.token || !book.sourceUrl) return null;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const qrUrl = `/api/qr/${encodeURIComponent(book.token)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(qrUrl, { signal: controller.signal });
      if (!response.ok) return null;
      const svgText = await response.text();
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);

      try {
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = blobUrl;
        });
        const size = 288;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, size, size);
        return canvas.toDataURL('image/png');
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }
  } catch {
    return null;
  }
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Export cancelled');
    error.name = 'AbortError';
    throw error;
  }
}

/**
 * Exports all pages in the songbook as a compact, vector PDF file
 * with exact page dimensions and zero DOM rendering.
 */
export async function exportSongbookPdf({ result, onProgress, signal }) {
  if (!result || !result.pages || result.pages.length === 0) {
    throw new Error('No pages to export');
  }

  throwIfAborted(signal);

  const { pages, geometry, songbook, settings } = result;
  const orientation = geometry.widthMm > geometry.heightMm ? 'landscape' : 'portrait';
  const { widthMm, heightMm } = geometry;

  const doc = createPdfDocument({ geometry });

  const [{ fontName, cmap }, qrDataUrl] = await Promise.all([
    setupPdfFonts(doc, settings.fontFamily, signal),
    settings.cover ? loadQrDataUrl(songbook, signal) : Promise.resolve(null),
  ]);

  throwIfAborted(signal);

  const textHelper = createTextHelper(doc, fontName, cmap);

  let lastProgressAt = 0;
  let lastYieldAt = performance.now();

  for (let i = 0; i < pages.length; i += 1) {
    throwIfAborted(signal);

    const page = pages[i];
    const pageName = page.type === 'cover'
      ? 'Cover'
      : page.type === 'contents'
        ? 'Table of Contents'
        : page.song?.name || `Page ${page.number}`;

    const now = performance.now();
    if (i === 0 || i === pages.length - 1 || now - lastProgressAt >= 45) {
      lastProgressAt = now;
      onProgress?.({
        current: i + 1,
        total: pages.length,
        pageName,
      });
    }

    if (i > 0) {
      doc.addPage([widthMm, heightMm], orientation);
    }

    if (page.type === 'cover') {
      renderCoverPage(doc, {
        book: songbook, settings, geometry, textHelper, qrDataUrl,
      });
    } else if (page.type === 'contents') {
      renderContentsPage(doc, {
        page, book: songbook, settings, geometry, textHelper,
      });
    } else {
      renderSongPage(doc, {
        page, settings, geometry, textHelper,
      });
    }

    if (performance.now() - lastYieldAt >= 16) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldAt = performance.now();
    }
  }

  throwIfAborted(signal);

  const filename = getPdfFilename(songbook);
  doc.save(filename);
  return filename;
}
