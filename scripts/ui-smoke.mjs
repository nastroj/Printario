/**
 * A lightweight client smoke test that runs the studio flow in jsdom without
 * requiring a real browser.
 */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.indexedDB = undefined;
globalThis.document.fonts = { ready: Promise.resolve() };
window.document.fonts = globalThis.document.fonts;
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

window.ResizeObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() { this.cb([{ contentRect: { width: 920, height: 760 } }]); }
  disconnect() {}
};
globalThis.ResizeObserver = window.ResizeObserver;

const calls = [];
window.print = () => calls.push('print');

const fixtureSongbook = {
  token: 'fixture-book',
  name: 'Songs for the Slow Road',
  description: 'Smoke test songbook fixture.',
  projectName: 'Printario Studio',
  sourceUrl: 'https://kytario.com/fixture-book',
  importedAt: '2026-01-01T00:00:00.000Z',
  songCount: 3,
  songs: [
    {
      id: 101,
      name: 'Morning Rail',
      author: 'Printario Studio',
      capo: 0,
      tonalKey: 'D',
      notation: 'english',
      sections: [
        {
          title: '1.',
          expandable: false,
          tokens: [
            { type: 1, content: 'D' },
            { type: 0, content: 'Coffee cooling on the ' },
            { type: 1, content: 'A' },
            { type: 0, content: 'sill' },
            { type: 6 },
          ],
        },
      ],
    },
    {
      id: 102,
      name: 'Lantern Song',
      author: 'Printario Studio',
      capo: 0,
      tonalKey: 'G',
      notation: 'english',
      sections: [
        {
          title: '1.',
          expandable: false,
          tokens: [
            { type: 1, content: 'G' },
            { type: 0, content: 'Carry the lantern, ' },
            { type: 1, content: 'C' },
            { type: 0, content: 'carry it high' },
            { type: 6 },
          ],
        },
      ],
    },
    {
      id: 103,
      name: 'Paper Boat',
      author: 'Printario Studio',
      capo: 0,
      tonalKey: 'C',
      notation: 'english',
      sections: Array.from({ length: 14 }, (_, idx) => ({
        title: `${idx + 1}.`,
        expandable: false,
        tokens: [
          { type: 1, content: 'C' },
          { type: 0, content: `Folded from an old letter verse ${idx + 1}` },
          { type: 6 },
          { type: 1, content: 'F' },
          { type: 0, content: `Drifting down the quiet river bend ${idx + 1}` },
          { type: 6 },
          { type: 1, content: 'G' },
          { type: 0, content: `Carrying a tune past the reeds ${idx + 1}` },
          { type: 6 },
          { type: 1, content: 'C' },
          { type: 0, content: `Until evening falls on shore ${idx + 1}` },
          { type: 6 },
        ],
      })),
    },
  ],
};

const fixtureResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, data: fixtureSongbook }),
});
window.fetch = async (url) => {
  if (String(url).includes('/api/import')) return fixtureResponse();
  return { ok: false, status: 404, json: async () => ({ ok: false, error: { message: 'Not found' } }) };
};
globalThis.fetch = window.fetch;

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
});

try {
  const { default: App } = await vite.ssrLoadModule('/src/App.jsx');
  const { createRoot } = await import('react-dom/client');
  const container = document.getElementById('root');
  const root = createRoot(container);
  root.render(React.createElement(App));

  const waitFor = async (selector, timeout = 4000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${selector}`);
  };

  window.addEventListener('error', (event) => console.error('WINDOW ERROR', event.error));
  window.addEventListener('unhandledrejection', (event) => console.error('UNHANDLED', event.reason));

  const input = await waitFor('input[aria-label="Kytario songbook link"]');
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  valueSetter.call(input, 'https://kytario.com/fixture-book');
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.querySelector('.url-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await waitFor('.paper-page', 8000);
  if (!document.querySelector('.page-cover')) throw new Error('Cover page did not render');

  const navText = document.querySelector('.page-number-input')?.textContent?.trim();
  if (!navText || !navText.includes('/')) throw new Error('Page navigation missing');

  // Open contents and jump into the first song (alphabetical ToC: Lantern Song, original #2).
  document.querySelector('.toolbar-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer');
  const rows = document.querySelectorAll('.drawer-row');
  if (rows.length !== 3) throw new Error(`Expected 3 contents rows, got ${rows.length}`);
  if (!rows[0].textContent.includes('02') || !rows[0].textContent.includes('Lantern Song')) {
    throw new Error('Contents should use title order and retain original song numbers');
  }
  rows[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const title = document.querySelector('.song-title')?.textContent;
  if (!title) throw new Error('Preview did not render a song title');
  if (document.querySelector('.fit-chip')) throw new Error('Fit status should not be rendered');
  if (document.querySelector('.stage-caption, .page-footer')) throw new Error('Page caption and footer should not be rendered');

  // Jump to the second song from the contents drawer.
  document.querySelector('.toolbar-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer');
  document.querySelectorAll('.drawer-row')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const activeTitle = document.querySelector('.song-title')?.textContent;
  if (!activeTitle || activeTitle === title) throw new Error('Song navigation did not change the page');

  // Verify toolbar overflow count badge, Contents drawer overflow indicator/filter, and preview overflow banner.
  const warnBadge = document.querySelector('.toolbar-warn-badge');
  if (!warnBadge || warnBadge.textContent.trim() !== '1') {
    throw new Error(`Expected toolbar overflow badge "1", got "${warnBadge?.textContent}"`);
  }

  document.querySelector('.toolbar-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer');
  const drawerAlert = document.querySelector('.drawer-overflow-alert');
  if (!drawerAlert || !drawerAlert.textContent.includes('1 song clips')) {
    throw new Error('Contents drawer overflow summary alert missing');
  }
  const drawerBadges = document.querySelectorAll('.drawer-overflow-badge');
  if (drawerBadges.length !== 1) {
    throw new Error(`Expected 1 clipping badge in Contents drawer, got ${drawerBadges.length}`);
  }
  const drawerFooterCloseBtn = document.querySelector('.drawer-foot-actions button[aria-label="Close contents"]');
  if (!drawerFooterCloseBtn) throw new Error('Contents drawer footer close button missing');
  drawerFooterCloseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (document.querySelector('.song-drawer')) {
    throw new Error('Contents drawer footer close button did not close drawer');
  }
  document.querySelector('.toolbar-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer');
  document.querySelector('.drawer-overflow-filter')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  const filteredRows = document.querySelectorAll('.drawer-row');
  if (filteredRows.length !== 1 || !filteredRows[0].textContent.includes('Paper Boat')) {
    throw new Error('Clipping-only filter should narrow Contents list to Paper Boat');
  }
  filteredRows[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.overflow-banner');
  const overflowBannerText = document.querySelector('.overflow-banner')?.textContent || '';
  if (!overflowBannerText.includes('clips past the bottom margin')) {
    throw new Error(`Unexpected overflow banner text: ${overflowBannerText}`);
  }
  document.querySelector('.overflow-banner-btn')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.settings-sheet-layer.is-open');
  document.querySelector(".settings-panel .settings-sheet-head button[aria-label=\"Close settings\"]")
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Open the settings sheet, verify margin presets are absent, test Book mode, then change paper size to A5.
  document.querySelector('.settings-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.settings-sheet-layer.is-open');
  if (document.querySelector('.preset-row')) throw new Error('Margin presets should not be rendered');
  if (document.querySelector('.book-card')) throw new Error('Dark book card should not be rendered');
  const marginTip = [...document.querySelectorAll('.settings-panel .control-note')]
    .find((el) => el.textContent.includes('Margins → None'));
  if (!marginTip) throw new Error('Print margin advice should be rendered in settings');

  const bookToggle = [...document.querySelectorAll('.toggle-row')]
    .find((row) => row.textContent.includes('Book mode'))
    ?.querySelector('button[role="switch"]');
  if (!bookToggle) throw new Error('Book mode toggle missing');
  bookToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const sectionLineToggle = [...document.querySelectorAll('.toggle-row')]
    .find((row) => row.textContent.includes('Section lines'))
    ?.querySelector('button[role="switch"]');
  if (!sectionLineToggle) throw new Error('Section lines toggle missing');
  sectionLineToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const beforeBtn = [...document.querySelectorAll('.segment')]
    .find((button) => button.textContent.trim() === 'Before line');
  if (!beforeBtn) throw new Error('Before line section label option missing');
  beforeBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const footerCloseBtn = document.querySelector(".settings-panel .settings-sheet-head button[aria-label=\"Close settings\"]");
  if (!footerCloseBtn) throw new Error('Settings footer close button missing');
  footerCloseBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (document.querySelector('.settings-sheet-layer.is-open')) {
    throw new Error('Settings footer close button did not close settings');
  }

  await new Promise((resolve) => setTimeout(resolve, 250));
  const marginLabels = [...document.querySelectorAll('.margin-grid .stepper-label')].map((el) => el.textContent.trim());
  if (!marginLabels.includes('Outer') || !marginLabels.includes('Inner')) {
    throw new Error(`Expected Outer/Inner margin labels in Book mode, got: ${marginLabels.join(', ')}`);
  }

  const paperButtons = [...document.querySelectorAll('.segment')];
  const a5 = paperButtons.find((button) => button.textContent.trim() === 'A5');
  if (!a5) throw new Error('A5 paper option missing');
  a5.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const reflowDeadline = Date.now() + 12000;
  while (Date.now() < reflowDeadline) {
    const page = document.querySelector('.paper-page');
    const width = page?.style.getPropertyValue('--page-w');
    if (width === '148' && !document.querySelector('.reflow-overlay')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitFor('.paper-page', 8000);

  // Open the print flow; verify mirrored margins and alternating page numbers across pages.
  document.querySelector('.header-print')?.click();
  const deadline = Date.now() + 5000;
  while (!document.querySelector('.print-root') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const printedPageEls = [...document.querySelectorAll('.print-root .paper-page')];
  const printedPages = printedPageEls.length;
  if (!printedPages) {
    throw new Error('Print root did not render pages');
  }
  if (document.querySelector('.book-page-number')) {
    throw new Error('Separate small page numbers should not be rendered');
  }
  if (printedPageEls[1]?.style.getPropertyValue('--margin-left') !== '5' || printedPageEls[1]?.style.getPropertyValue('--margin-right') !== '12') {
    throw new Error('Page 2 (even) should mirror outer=5mm on left and inner=12mm on right');
  }
  if (!printedPageEls[2]?.querySelector('.song-sheet.is-badge-right')) {
    throw new Error('Page 3 (odd) should place song number badge on the right top corner');
  }
  if (!printedPageEls[2]?.querySelector('.song-section.no-section-line.labels-before')) {
    throw new Error('Song section should apply no-section-line and labels-before classes');
  }
  if (printedPageEls[2]?.style.getPropertyValue('--margin-left') !== '12' || printedPageEls[2]?.style.getPropertyValue('--margin-right') !== '5') {
    throw new Error('Page 3 (odd) should place inner=12mm on left and outer=5mm on right');
  }
  if (!printedPageEls[3]?.querySelector('.song-sheet.is-badge-left')) {
    throw new Error('Page 4 (even) should place song number badge on the left top corner');
  }
  if (!printedPageEls[4]?.querySelector('.song-sheet.is-badge-right')) {
    throw new Error('Page 5 (odd) should place song number badge on the right top corner');
  }
  await new Promise((resolve) => setTimeout(resolve, 250));

  // Open the Export PDF dialog and verify Print shop (Pro) sheet preview + controls.
  document.querySelector('.header-pdf')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.pdf-export-dialog');
  const proBtn = [...document.querySelectorAll('.pdf-export-dialog .segment')]
    .find((btn) => btn.textContent.includes('Print shop (Pro)'));
  if (!proBtn) throw new Error('Print shop (Pro) mode option missing');
  proBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.sheet-preview-svg');
  const caption = document.querySelector('.sheet-preview-caption')?.textContent || '';
  if (!caption.includes('A3') || !caption.includes('297')) {
    throw new Error(`Expected A3 sheet preview caption, got: ${caption}`);
  }
  const crossStyleBtn = [...document.querySelectorAll('.crop-style-btn')]
    .find((btn) => btn.textContent.includes('Hairline crosses'));
  if (!crossStyleBtn) throw new Error('Hairline crosses crop mark style option missing');
  crossStyleBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (!crossStyleBtn.classList.contains('is-active')) {
    throw new Error('Hairline crosses crop mark style did not activate');
  }
  if (document.querySelector('.pdf-export-dialog .confirm-cancel-btn')) {
    throw new Error('PDF export modal should not render a Cancel button');
  }
  document.querySelector('.pdf-export-dialog button[aria-label="Close export dialog"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (document.querySelector('.pdf-export-dialog')) {
    throw new Error('PDF export dialog did not close');
  }

  console.log(JSON.stringify({
    title,
    navText,
    activeTitle,
    printedPages,
    printCalls: calls,
  }, null, 2));
  root.unmount();
} finally {
  await vite.close();
  window.close();
}
