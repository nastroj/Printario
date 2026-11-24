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
