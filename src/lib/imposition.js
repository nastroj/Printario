export const PRESS_SHEET_SIZES = {
  A3: { label: 'A3', width: 297, height: 420, hint: '297 × 420 mm' },
  SRA3: { label: 'SRA3', width: 320, height: 450, hint: '320 × 450 mm' },
  A3Plus: { label: 'A3+', width: 329, height: 483, hint: '329 × 483 mm' },
  A4: { label: 'A4', width: 210, height: 297, hint: '210 × 297 mm' },
  SRA4: { label: 'SRA4', width: 225, height: 320, hint: '225 × 320 mm' },
  Tabloid: { label: 'Tabloid', width: 279.4, height: 431.8, hint: '11 × 17 in' },
  Letter: { label: 'Letter', width: 215.9, height: 279.4, hint: '8.5 × 11 in' },
  Custom: { label: 'Custom', width: 320, height: 450, hint: 'Custom mm' },
};

export const CROP_MARK_STYLES = {
  standard: { label: 'Standard lines', hint: 'Classic offset solid corner hairlines' },
  cross: { label: 'Hairline crosses', hint: 'Intersecting crosshairs centered at each trim corner' },
  double: { label: 'Double (JIS)', hint: 'Dual-line trim & bleed corner brackets' },
  dashed: { label: 'Dashed lines', hint: 'Dashed exterior corner trim hairlines' },
};

export const DEFAULT_PDF_EXPORT = {
  mode: 'standard',
  sheetSize: 'A3',
  sheetOrientation: 'auto',
  customWidthMm: 320,
  customHeightMm: 450,
  pagesPerSheet: 2,
  imposition: 'sequential',
  fitMode: 'fit-marks',
  gapMm: 0,
  bleedMm: 0,
  cropMarks: true,
  cropMarkStyle: 'standard',
  centerMarks: true,
  registrationMarks: true,
  slugInfo: true,
};

function clampNum(value, min, max, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
}

export function normalizePdfExportOptions(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const mode = src.mode === 'pro' ? 'pro' : 'standard';
  const sheetSize = PRESS_SHEET_SIZES[src.sheetSize] ? src.sheetSize : DEFAULT_PDF_EXPORT.sheetSize;
  const sheetOrientation = ['auto', 'portrait', 'landscape'].includes(src.sheetOrientation)
    ? src.sheetOrientation
    : DEFAULT_PDF_EXPORT.sheetOrientation;
  const customWidthMm = clampNum(src.customWidthMm, 100, 1200, DEFAULT_PDF_EXPORT.customWidthMm);
  const customHeightMm = clampNum(src.customHeightMm, 100, 1200, DEFAULT_PDF_EXPORT.customHeightMm);
  const pagesPerSheet = [1, 2, 4].includes(Number(src.pagesPerSheet))
    ? Number(src.pagesPerSheet)
    : DEFAULT_PDF_EXPORT.pagesPerSheet;
  let imposition = ['sequential', 'booklet', 'copies'].includes(src.imposition)
    ? src.imposition
    : DEFAULT_PDF_EXPORT.imposition;
  if (pagesPerSheet === 1) {
    imposition = 'sequential';
  }
  const effectivePagesPerSheet = imposition === 'booklet' ? 2 : pagesPerSheet;
  const fitMode = ['actual', 'fit-marks'].includes(src.fitMode)
    ? src.fitMode
    : DEFAULT_PDF_EXPORT.fitMode;
  const gapMm = effectivePagesPerSheet === 1
    ? 0
    : clampNum(src.gapMm, 0, 30, DEFAULT_PDF_EXPORT.gapMm);
  const bleedMm = clampNum(src.bleedMm, 0, 10, DEFAULT_PDF_EXPORT.bleedMm);

  const cropMarkStyle = CROP_MARK_STYLES[src.cropMarkStyle]
    ? src.cropMarkStyle
    : DEFAULT_PDF_EXPORT.cropMarkStyle;

  return {
    mode,
    sheetSize,
    sheetOrientation,
    customWidthMm,
    customHeightMm,
    pagesPerSheet: effectivePagesPerSheet,
    imposition,
    fitMode,
    gapMm,
    bleedMm,
    cropMarks: src.cropMarks !== false,
    cropMarkStyle,
    centerMarks: src.centerMarks !== false,
    registrationMarks: src.registrationMarks !== false,
    slugInfo: src.slugInfo !== false,
  };
}

/**
 * Builds the sequence of sheet slot assignments for a document with `pageCount` pages.
 * Each slot contains `{ pageIndex: number | null, displayNumber: number | null }`.
 */
export function buildSheetSequence(pageCount, rawOptions) {
  const opts = normalizePdfExportOptions(rawOptions);
  if (!pageCount || pageCount <= 0) return [];

  if (opts.mode !== 'pro' || opts.pagesPerSheet === 1) {
    return Array.from({ length: pageCount }, (_, idx) => [
      { pageIndex: idx, displayNumber: idx + 1 },
    ]);
  }

  if (opts.imposition === 'copies') {
    return Array.from({ length: pageCount }, (_, idx) => (
      Array.from({ length: opts.pagesPerSheet }, () => ({
        pageIndex: idx,
        displayNumber: idx + 1,
      }))
    ));
  }

  if (opts.imposition === 'booklet') {
    const totalSlots = Math.max(4, Math.ceil(pageCount / 4) * 4);
    const sheets = [];
    const physicalSheets = totalSlots / 4;
    for (let s = 0; s < physicalSheets; s += 1) {
      const frontLeft = totalSlots - 1 - 2 * s;
      const frontRight = 2 * s;
      const backLeft = 2 * s + 1;
      const backRight = totalSlots - 2 - 2 * s;

      sheets.push(
        [frontLeft, frontRight].map((idx) => (
          idx < pageCount
            ? { pageIndex: idx, displayNumber: idx + 1 }
            : { pageIndex: null, displayNumber: null }
        )),
      );
      sheets.push(
        [backLeft, backRight].map((idx) => (
          idx < pageCount
            ? { pageIndex: idx, displayNumber: idx + 1 }
            : { pageIndex: null, displayNumber: null }
        )),
      );
    }
    return sheets;
  }

  // Sequential N-up
  const sheets = [];
  for (let i = 0; i < pageCount; i += opts.pagesPerSheet) {
    const row = [];
    for (let k = 0; k < opts.pagesPerSheet; k += 1) {
      const idx = i + k;
      row.push(
        idx < pageCount
          ? { pageIndex: idx, displayNumber: idx + 1 }
          : { pageIndex: null, displayNumber: null },
      );
    }
    sheets.push(row);
  }
  return sheets;
}

function getGridCandidates(pagesPerSheet) {
  if (pagesPerSheet === 1) return [[1, 1]];
  if (pagesPerSheet === 2) return [[2, 1], [1, 2]];
  if (pagesPerSheet === 4) return [[2, 2], [4, 1], [1, 4]];
  return [[1, 1]];
}

function getSheetDimensions(opts) {
  if (opts.sheetSize === 'Custom') {
    return {
      shortSide: Math.min(opts.customWidthMm, opts.customHeightMm),
      longSide: Math.max(opts.customWidthMm, opts.customHeightMm),
      rawWidth: opts.customWidthMm,
      rawHeight: opts.customHeightMm,
    };
  }
  const spec = PRESS_SHEET_SIZES[opts.sheetSize] ?? PRESS_SHEET_SIZES.A3;
  return {
    shortSide: Math.min(spec.width, spec.height),
    longSide: Math.max(spec.width, spec.height),
    rawWidth: spec.width,
    rawHeight: spec.height,
  };
}

/**
 * Computes the optimal press sheet layout, slot coordinates, scale, and margin metrics.
 */
export function computeSheetLayout(pageWidthMm, pageHeightMm, rawOptions) {
  const opts = normalizePdfExportOptions(rawOptions);
  const dims = getSheetDimensions(opts);

  const orientations = [];
  if (opts.sheetSize === 'Custom' && opts.sheetOrientation === 'auto') {
    orientations.push([dims.shortSide, dims.longSide], [dims.longSide, dims.shortSide]);
  } else if (opts.sheetOrientation === 'portrait') {
    orientations.push([dims.shortSide, dims.longSide]);
  } else if (opts.sheetOrientation === 'landscape') {
    orientations.push([dims.longSide, dims.shortSide]);
  } else {
    orientations.push([dims.shortSide, dims.longSide], [dims.longSide, dims.shortSide]);
  }

  const hasMarks = opts.cropMarks || opts.centerMarks || opts.registrationMarks || opts.slugInfo;
  const requestedMargin = opts.fitMode === 'fit-marks'
    ? Math.max(
      opts.bleedMm > 0 ? opts.bleedMm + 4 : 0,
      opts.registrationMarks || opts.slugInfo ? 10 : hasMarks ? 7 : 0,
    )
    : 0;

  const gridCandidates = getGridCandidates(opts.pagesPerSheet);
  const rotationCandidates = [false, true];

  let best = null;

  for (const [sheetW, sheetH] of orientations) {
    const reserveX = Math.min(requestedMargin, sheetW * 0.18);
    const reserveY = Math.min(requestedMargin, sheetH * 0.18);

    for (const [cols, rows] of gridCandidates) {
      // In booklet mode, prefer side-by-side 2x1 or stacked 1x2 cleanly
      const totalGapX = Math.max(0, cols - 1) * opts.gapMm;
      const totalGapY = Math.max(0, rows - 1) * opts.gapMm;

      for (const rotated of rotationCandidates) {
        const slotRawW = rotated ? pageHeightMm : pageWidthMm;
        const slotRawH = rotated ? pageWidthMm : pageHeightMm;
        const rawPagesW = cols * slotRawW;
        const rawPagesH = rows * slotRawH;

        const maxScaleActual = Math.min(
          (sheetW - totalGapX) / rawPagesW,
          (sheetH - totalGapY) / rawPagesH,
        );
        const fitsAtActual = rawPagesW + totalGapX <= sheetW + 0.05
          && rawPagesH + totalGapY <= sheetH + 0.05;

        let scale = 1;
        if (opts.fitMode === 'fit-marks') {
          const availW = Math.max(20, sheetW - 2 * reserveX - totalGapX);
          const availH = Math.max(20, sheetH - 2 * reserveY - totalGapY);
          scale = Math.min(1, availW / rawPagesW, availH / rawPagesH);
        } else if (!fitsAtActual) {
          // Even in actual mode, keep track of fit quality for ranking
          scale = 1;
        }

        const slotW = slotRawW * scale;
        const slotH = slotRawH * scale;
        const blockW = cols * slotW + totalGapX;
        const blockH = rows * slotH + totalGapY;
        const marginX = (sheetW - blockW) / 2;
        const marginY = (sheetH - blockH) / 2;
        const minOuterMargin = Math.min(marginX, marginY);

        // Score candidates: prioritize fitting on sheet, highest scale, upright orientation, and balanced margins
        const fitsSheet = marginX >= -0.05 && marginY >= -0.05;
        const fitScore = fitsSheet ? 1 : maxScaleActual;
        const uprightBonus = rotated ? 0 : 0.002;
        const bookletSideBonus = opts.imposition === 'booklet' && cols === 2 && rows === 1 ? 0.0005 : 0;
        const customRawBonus = opts.sheetSize === 'Custom'
          && Math.abs(sheetW - dims.rawWidth) < 0.1
          && Math.abs(sheetH - dims.rawHeight) < 0.1
          ? 0.0002
          : 0;
        const balancedMarginBonus = fitsSheet ? Math.min(minOuterMargin, 20) * 0.00001 : 0;

        const score = (fitsSheet ? 10 : 0)
          + (opts.fitMode === 'fit-marks' ? scale * 5 : (fitsAtActual ? 5 : fitScore * 4))
          + uprightBonus
          + bookletSideBonus
          + customRawBonus
          + balancedMarginBonus;

        if (!best || score > best.score) {
          const slots = [];
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              slots.push({
                index: r * cols + c,
                col: c,
                row: r,
                xMm: marginX + c * (slotW + opts.gapMm),
                yMm: marginY + r * (slotH + opts.gapMm),
                widthMm: slotW,
                heightMm: slotH,
                trimW: slotRawW,
                trimH: slotRawH,
              });
            }
          }

          best = {
            score,
            sheetWidthMm: sheetW,
            sheetHeightMm: sheetH,
            orientation: sheetW > sheetH ? 'landscape' : 'portrait',
            cols,
            rows,
            rotated,
            scale,
            gapMm: opts.gapMm,
            bleedMm: opts.bleedMm,
            pageWidthMm,
            pageHeightMm,
            blockWidthMm: blockW,
            blockHeightMm: blockH,
            marginXMm: marginX,
            marginYMm: marginY,
            minOuterMarginMm: minOuterMargin,
            fitsAtActual,
            overflowsSheet: marginX < -0.05 || marginY < -0.05,
            tightOuterMarks: minOuterMargin < 4,
            slots,
          };
        }
      }
    }
  }

  return best;
}
