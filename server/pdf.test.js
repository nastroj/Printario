import test from 'node:test';
import assert from 'node:assert/strict';
import { createPdfDocument, getPdfFilename } from '../src/lib/pdf.js';

test('getPdfFilename sanitizes songbook names into clean filesystem-friendly filenames', () => {
  assert.equal(getPdfFilename({ name: 'PRO RADOST' }), 'PRO_RADOST.pdf');
  assert.equal(getPdfFilename('Písničky na cesty'), 'Pisnicky_na_cesty.pdf');
  assert.equal(getPdfFilename({ name: 'Rock & Roll / 2026!' }), 'Rock_Roll_2026.pdf');
  assert.equal(getPdfFilename({ name: '   Campfire Songs   ' }), 'Campfire_Songs.pdf');
  assert.equal(getPdfFilename(null), 'kytario-songbook.pdf');
  assert.equal(getPdfFilename(''), 'kytario-songbook.pdf');
  assert.equal(getPdfFilename({}), 'kytario-songbook.pdf');
});

test('createPdfDocument creates a jsPDF instance with matching page geometry and orientation', () => {
  const landscapeDoc = createPdfDocument({
    geometry: { widthMm: 297, heightMm: 210 },
  });
  assert.equal(landscapeDoc.getNumberOfPages(), 1);

  const portraitDoc = createPdfDocument({
    geometry: { widthMm: 210, heightMm: 297 },
  });
  assert.equal(portraitDoc.getNumberOfPages(), 1);
});

test('exportSongbookPdf generates compact vector PDF with exact page dimensions and supports cancellation', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { exportSongbookPdf } = await import('../src/lib/pdf.js');
  const { buildBookModel } = await import('../src/lib/song.js');
  const { paginateBook } = await import('../src/lib/paginate.js');
  const { DEFAULT_SETTINGS } = await import('../src/lib/settings.js');

  const songs = Array.from({ length: 120 }, (_, idx) => ({
    id: idx + 1,
    name: `Písnička č. ${idx + 1}`,
    author: 'Test Author',
    tonalKey: 'D',
    notation: 'english',
    sections: [
      {
        title: '1.',
        expandable: false,
        tokens: [
          { type: 1, content: 'D' },
          { type: 0, content: 'Příliš žluťoučký kůň úpěl ' },
          { type: 1, content: 'A' },
          { type: 0, content: 'ďábelské ódy' },
          { type: 6 },
        ],
      },
      {
        title: '',
        expandable: false,
        tokens: [
          { type: 1, content: 'D' },
          { type: 1, content: 'A' },
          { type: 7 },
          { type: 1, content: 'G' },
          { type: 4, content: 3 },
          { type: 1, content: 'C' },
          { type: 5, content: 3 },
          { type: 6 },
        ],
      },
    ],
  }));

  const book = buildBookModel({
    token: 'test-book',
    name: 'Písničky na cesty',
    sourceUrl: 'https://kytario.com/test-book',
    songs,
  });

  const result = paginateBook(book, DEFAULT_SETTINGS);
  assert.equal(result.pageCount, 122); // cover + 1 contents + 120 songs

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const clean = String(url);
    if (clean.startsWith('/fonts/')) {
      const filePath = path.resolve('public', clean.slice(1));
      const buf = fs.readFileSync(filePath);
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const outPath = path.resolve('Pisnicky_na_cesty.pdf');

  try {
    const progressEvents = [];
    const started = performance.now();
    const filename = await exportSongbookPdf({
      result,
      onProgress: (p) => progressEvents.push(p),
    });
    const elapsedMs = performance.now() - started;

    assert.equal(filename.filename, 'Pisnicky_na_cesty.pdf');
    assert.ok(fs.existsSync(outPath), 'Expected PDF output file to be written');
    const stat = fs.statSync(outPath);
    assert.ok(stat.size < 2 * 1024 * 1024, `Expected compact PDF (< 2MB for 122 pages), got ${stat.size} bytes`);
    assert.ok(elapsedMs < 5000, `Expected fast PDF generation, took ${elapsedMs.toFixed(0)}ms`);

    const pdfContent = fs.readFileSync(outPath, 'latin1');
    assert.ok(pdfContent.startsWith('%PDF-'));
    const mediaBoxes = pdfContent.match(/\/MediaBox \[[^\]]+\]/g) || [];
    assert.equal(mediaBoxes.length, 122);
    for (const box of mediaBoxes) {
      const [wPt, hPt] = box.match(/[\d.]+/g).slice(2).map(Number);
      const wMm = (wPt * 25.4) / 72;
      const hMm = (hPt * 25.4) / 72;
      assert.ok(Math.abs(wMm - 297) < 0.05, `Expected width 297mm, got ${wMm}`);
      assert.ok(Math.abs(hMm - 210) < 0.05, `Expected height 210mm, got ${hMm}`);
    }

    assert.ok(progressEvents.length >= 2);
    assert.equal(progressEvents[progressEvents.length - 1].current, 122);

    // Verify book mode exports cleanly with exact A4 landscape dimensions
    const bookResult = paginateBook(book, {
      ...DEFAULT_SETTINGS,
      bookMode: true,
      showSectionLines: false,
      sectionLabelPosition: 'before',
    });
    await exportSongbookPdf({ result: bookResult });
    assert.ok(fs.existsSync(outPath), 'Expected book mode PDF output file to be written');

    // Verify immediate abort throws AbortError
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      () => exportSongbookPdf({ result, signal: controller.signal }),
      (err) => err?.name === 'AbortError',
    );
  } finally {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    globalThis.fetch = prevFetch;
  }
});

test('imposition layout and pro PDF export support 2-up A4 on A3, SRA3, and booklet spreads with crop marks', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { exportSongbookPdf } = await import('../src/lib/pdf.js');
  const { buildBookModel } = await import('../src/lib/song.js');
  const { paginateBook } = await import('../src/lib/paginate.js');
  const { DEFAULT_SETTINGS } = await import('../src/lib/settings.js');
  const {
    buildSheetSequence, computeSheetLayout, normalizePdfExportOptions,
  } = await import('../src/lib/imposition.js');

  assert.equal(normalizePdfExportOptions({ cropMarkStyle: 'cross' }).cropMarkStyle, 'cross');
  assert.equal(normalizePdfExportOptions({ cropMarkStyle: 'double' }).cropMarkStyle, 'double');
  assert.equal(normalizePdfExportOptions({ cropMarkStyle: 'dashed' }).cropMarkStyle, 'dashed');
  assert.equal(normalizePdfExportOptions({ cropMarkStyle: 'unknown' }).cropMarkStyle, 'standard');

  assert.equal(
    getPdfFilename({ name: 'Písničky na cesty' }, { mode: 'pro', sheetSize: 'A3', pagesPerSheet: 2, imposition: 'sequential' }),
    'Pisnicky_na_cesty_A3_2up.pdf',
  );
  assert.equal(
    getPdfFilename({ name: 'Písničky na cesty' }, { mode: 'pro', sheetSize: 'SRA3', pagesPerSheet: 2, imposition: 'booklet' }),
    'Pisnicky_na_cesty_SRA3_booklet.pdf',
  );

  // Booklet saddle-stitch sequence for 5 pages -> padded to 8 (4 sheet sides)
  const bookletSheets = buildSheetSequence(5, {
    mode: 'pro',
    pagesPerSheet: 2,
    imposition: 'booklet',
  });
  assert.equal(bookletSheets.length, 4);
  assert.deepEqual(bookletSheets.map((s) => s.map((x) => x.displayNumber)), [
    [null, 1],
    [2, null],
    [null, 3],
    [4, 5],
  ]);

  // Two A4 landscape (297 x 210) pages on A3 portrait (297 x 420)
  const a3Actual = computeSheetLayout(297, 210, {
    mode: 'pro',
    sheetSize: 'A3',
    pagesPerSheet: 2,
    fitMode: 'actual',
  });
  assert.equal(a3Actual.sheetWidthMm, 297);
  assert.equal(a3Actual.sheetHeightMm, 420);
  assert.equal(a3Actual.cols, 1);
  assert.equal(a3Actual.rows, 2);
  assert.equal(a3Actual.scale, 1);
  assert.equal(a3Actual.rotated, false);

  const a3FitMarks = computeSheetLayout(297, 210, {
    mode: 'pro',
    sheetSize: 'A3',
    pagesPerSheet: 2,
    fitMode: 'fit-marks',
  });
  assert.equal(a3FitMarks.sheetWidthMm, 297);
  assert.equal(a3FitMarks.sheetHeightMm, 420);
  assert.ok(a3FitMarks.scale < 1 && a3FitMarks.scale > 0.9, `Expected gentle scale for marks, got ${a3FitMarks.scale}`);
  assert.ok(a3FitMarks.minOuterMarginMm >= 9.5);

  // Two A4 landscape on SRA3 (320 x 450) at 100% actual size with room for marks
  const sra3Actual = computeSheetLayout(297, 210, {
    mode: 'pro',
    sheetSize: 'SRA3',
    pagesPerSheet: 2,
    fitMode: 'actual',
    bleedMm: 3,
  });
  assert.equal(sra3Actual.sheetWidthMm, 320);
  assert.equal(sra3Actual.sheetHeightMm, 450);
  assert.equal(sra3Actual.scale, 1);
  assert.equal(sra3Actual.tightOuterMarks, false);

  const songs = Array.from({ length: 4 }, (_, idx) => ({
    id: idx + 1,
    name: `Song ${idx + 1}`,
    author: 'Printario',
    tonalKey: 'C',
    notation: 'english',
    sections: [
      {
        title: '1.',
        expandable: false,
        tokens: [
          { type: 1, content: 'C' },
          { type: 0, content: 'Line one of song ' },
          { type: 1, content: 'G' },
          { type: 0, content: 'lyrics' },
          { type: 6 },
        ],
      },
    ],
  }));

  const book = buildBookModel({
    token: 'pro-book',
    name: 'Pro Press Book',
    sourceUrl: 'https://kytario.com/pro-book',
    songs,
  });
  const result = paginateBook(book, {
    ...DEFAULT_SETTINGS,
    paperTint: '#fbf7ee',
    bookMode: true,
  });
  assert.equal(result.pageCount, 6); // cover + contents + 4 songs

  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const clean = String(url);
    if (clean.startsWith('/fonts/')) {
      const filePath = path.resolve('public', clean.slice(1));
      const buf = fs.readFileSync(filePath);
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        },
      };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const a3Path = path.resolve('Pro_Press_Book_A3_2up.pdf');
  const sra3BookletPath = path.resolve('Pro_Press_Book_SRA3_booklet.pdf');

  try {
    for (const cropMarkStyle of ['standard', 'cross', 'double', 'dashed']) {
      const f1 = await exportSongbookPdf({
        result,
        pdfOptions: {
          mode: 'pro',
          sheetSize: 'A3',
          pagesPerSheet: 2,
          imposition: 'sequential',
          fitMode: 'fit-marks',
          gapMm: 6,
          bleedMm: 3,
          cropMarks: true,
          cropMarkStyle,
          centerMarks: true,
          registrationMarks: true,
          slugInfo: true,
        },
      });
      assert.equal(f1.filename, 'Pro_Press_Book_A3_2up.pdf');
      assert.ok(fs.existsSync(a3Path));
    }
    const a3Content = fs.readFileSync(a3Path, 'latin1');
    const a3Boxes = a3Content.match(/\/MediaBox \[[^\]]+\]/g) || [];
    assert.equal(a3Boxes.length, 3); // 6 pages / 2 per sheet = 3 A3 sheets
    for (const box of a3Boxes) {
      const [wPt, hPt] = box.match(/[\d.]+/g).slice(2).map(Number);
      const wMm = (wPt * 25.4) / 72;
      const hMm = (hPt * 25.4) / 72;
      assert.ok(Math.abs(wMm - 297) < 0.05, `Expected A3 width 297mm, got ${wMm}`);
      assert.ok(Math.abs(hMm - 420) < 0.05, `Expected A3 height 420mm, got ${hMm}`);
    }

    const f2 = await exportSongbookPdf({
      result,
      pdfOptions: {
        mode: 'pro',
        sheetSize: 'SRA3',
        pagesPerSheet: 2,
        imposition: 'booklet',
        fitMode: 'actual',
        gapMm: 0,
        bleedMm: 3,
        cropMarks: true,
        cropMarkStyle: 'double',
        centerMarks: true,
        registrationMarks: true,
        slugInfo: true,
      },
    });
    assert.equal(f2.filename, 'Pro_Press_Book_SRA3_booklet.pdf');
    assert.ok(fs.existsSync(sra3BookletPath));
    const sra3Content = fs.readFileSync(sra3BookletPath, 'latin1');
    const sra3Boxes = sra3Content.match(/\/MediaBox \[[^\]]+\]/g) || [];
    assert.equal(sra3Boxes.length, 4); // 6 pages padded to 8 -> 4 SRA3 booklet sides
    for (const box of sra3Boxes) {
      const [wPt, hPt] = box.match(/[\d.]+/g).slice(2).map(Number);
      const wMm = (wPt * 25.4) / 72;
      const hMm = (hPt * 25.4) / 72;
      assert.ok(Math.abs(wMm - 320) < 0.05, `Expected SRA3 width 320mm, got ${wMm}`);
      assert.ok(Math.abs(hMm - 450) < 0.05, `Expected SRA3 height 450mm, got ${hMm}`);
    }
  } finally {
    if (fs.existsSync(a3Path)) fs.unlinkSync(a3Path);
    if (fs.existsSync(sra3BookletPath)) fs.unlinkSync(sra3BookletPath);
    globalThis.fetch = prevFetch;
  }
});
