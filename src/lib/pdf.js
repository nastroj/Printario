import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import React from 'react';
import { createRoot } from 'react-dom/client';

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

function waitForImages(element) {
  const images = Array.from(element.querySelectorAll('img'));
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => {
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        // Fallback timer so missing/broken images never hang PDF generation
        setTimeout(done, 1500);
      });
    }),
  );
}

/**
 * Exports all pages in the songbook into a downloadable PDF file.
 * Renders pages one by one into an offscreen container to keep memory usage
 * low on mobile devices, capturing crisp 2x resolution canvas images.
 */
export async function exportSongbookPdf({ result, onProgress, signal }) {
  if (!result || !result.pages || result.pages.length === 0) {
    throw new Error('No pages to export');
  }

  const { pages, geometry, songbook, settings } = result;
  const orientation = geometry.widthMm > geometry.heightMm ? 'landscape' : 'portrait';
  const widthMm = geometry.widthMm;
  const heightMm = geometry.heightMm;

  const { PaperPage } = await import('../components/PaperPage.jsx');
  const doc = createPdfDocument({ geometry });

  // Mount temporary container on document.body so all CSS and layout metrics apply
  const container = document.createElement('div');
  container.className = 'pdf-render-container';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  const root = createRoot(container);

  try {
    // Give fonts a moment to resolve if needed
    try {
      await Promise.race([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch {
      // no-op
    }

    for (let i = 0; i < pages.length; i++) {
      if (signal?.aborted) {
        const error = new Error('Export cancelled');
        error.name = 'AbortError';
        throw error;
      }

      const page = pages[i];
      const pageName = page.type === 'cover'
        ? 'Cover'
        : page.type === 'contents'
          ? 'Table of Contents'
          : page.song?.name || `Page ${page.number}`;

      onProgress?.({
        current: i + 1,
        total: pages.length,
        pageName,
      });

      // Render the current page with React
      await new Promise((resolve) => {
        root.render(
          React.createElement(PaperPage, {
            page,
            book: songbook,
            settings,
            geometry,
            className: 'export-paper',
          }),
        );
        // Double rAF ensures DOM mutation, font layout, and useLineScale layout effect have painted
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });

      if (signal?.aborted) {
        const error = new Error('Export cancelled');
        error.name = 'AbortError';
        throw error;
      }

      let pageEl = container.querySelector('.paper-page');
      // If the .paper-page element is not found, fall back to the container itself.
      if (!pageEl) {
        console.warn(`Warning: .paper-page not found for page ${i + 1}, using container as fallback.`);
        pageEl = container;
      }

      await waitForImages(pageEl);

      // Render page to canvas at 2x scale for sharp print-quality typography
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: settings.paperTint || '#fffdf8',
        windowWidth: geometry.widthPx,
        windowHeight: geometry.heightPx,
        scrollX: 0,
        scrollY: 0,
      });

      if (signal?.aborted) {
        const error = new Error('Export cancelled');
        error.name = 'AbortError';
        throw error;
      }

      const imgData = canvas.toDataURL('image/jpeg', 0.95);

      if (i > 0) {
        doc.addPage([widthMm, heightMm], orientation);
      }
      doc.addImage(
        imgData,
        'JPEG',
        0,
        0,
        widthMm,
        heightMm,
        undefined,
        'FAST',
      );
    }

    if (signal?.aborted) {
      const error = new Error('Export cancelled');
      error.name = 'AbortError';
      throw error;
    }

    const filename = getPdfFilename(songbook);
    doc.save(filename);
    return filename;
  } finally {
    try {
      root.unmount();
    } catch {
      // no-op
    }
    container.remove();
  }
}
