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

    assert.equal(filename, 'Pisnicky_na_cesty.pdf');
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
    const bookResult = paginateBook(book, { ...DEFAULT_SETTINGS, bookMode: true });
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
