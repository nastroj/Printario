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
      author: 'Zebra Folk',
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
      author: 'Middle Band',
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
      author: 'Alpha Duo',
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
  if (!document.querySelector('.preview-toolbar-right .zoom-control')) {
    throw new Error('Zoom controls should be in preview-toolbar-right');
  }
  if (!document.querySelector('.preview-toolbar-right .page-nav')) {
    throw new Error('Pagination controls should be in preview-toolbar-right');
  }

  const zoomControl = document.querySelector('.zoom-control');
  const zoomChildren = [...(zoomControl?.children ?? [])].map((el) => el.getAttribute('aria-label'));
  if (JSON.stringify(zoomChildren) !== JSON.stringify(['Zoom out', 'Zoom level', 'Reset zoom', 'Zoom in'])) {
    throw new Error(`Unexpected zoom control order: ${JSON.stringify(zoomChildren)}`);
  }
  const initialZoomSelect = document.querySelector('.zoom-select')?.value;
  document.querySelector('.zoom-control button[aria-label="Zoom in"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (document.querySelector('.zoom-select')?.value === initialZoomSelect) {
    throw new Error('Zoom in button did not change zoom level');
  }
  document.querySelector('.zoom-control button[aria-label="Reset zoom"]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 40));
  if (document.querySelector('.zoom-select')?.value !== initialZoomSelect) {
    throw new Error('Reset zoom button did not restore fit-to-page zoom');
  }

  const actionLabels = [...document.querySelectorAll('.studio-actions button')]
    .map((el) => el.textContent?.replace(/\d+$/, '').trim());
  if (JSON.stringify(actionLabels) !== JSON.stringify(['New', 'Settings', 'Contents', 'PDF'])) {
    throw new Error(`Unexpected studio action button order: ${JSON.stringify(actionLabels)}`);
  }
  if (document.querySelector('.header-print')) {
    throw new Error('Print button should not be rendered');
  }
  if (!document.querySelector('.header-pdf')?.classList.contains('btn-primary')) {
    throw new Error('PDF button should use btn-primary style');
  }

  // Open contents, verify search at top on desktop, Number / Song / Artist sorting, then jump into Lantern Song.
  document.querySelector('.contents-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer-layer.is-open');
  if (!document.querySelector('.drawer-search-desktop input')) {
    throw new Error('Desktop search bar should be rendered at the top of the Contents sidebar');
  }
  let rows = document.querySelectorAll('.drawer-row');
  if (rows.length !== 3) throw new Error(`Expected 3 contents rows, got ${rows.length}`);
  if (!rows[0].textContent.includes('02') || !rows[0].textContent.includes('Lantern Song')) {
    throw new Error('Contents should default to title order and retain original song numbers');
  }
  const sortButtons = [...document.querySelectorAll('.drawer-sort-bar button')];
  if (sortButtons.length !== 3) {
    throw new Error(`Expected 3 sort buttons in Contents drawer, got ${sortButtons.length}`);
  }
  sortButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // Number asc
  await new Promise((resolve) => setTimeout(resolve, 30));
  rows = document.querySelectorAll('.drawer-row');
  if (!rows[0].textContent.includes('01') || !rows[0].textContent.includes('Morning Rail')) {
    throw new Error('Sorting by Number asc should place 01 Morning Rail first');
  }
  sortButtons[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // Number desc
  await new Promise((resolve) => setTimeout(resolve, 30));
  rows = document.querySelectorAll('.drawer-row');
  if (!rows[0].textContent.includes('03') || !rows[0].textContent.includes('Paper Boat')) {
    throw new Error('Clicking active Number sort should reverse to 03 Paper Boat first');
  }
  sortButtons[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // Artist asc
  await new Promise((resolve) => setTimeout(resolve, 30));
  rows = document.querySelectorAll('.drawer-row');
  if (!rows[0].textContent.includes('Alpha Duo') || !rows[2].textContent.includes('Zebra Folk')) {
    throw new Error('Sorting by Artist asc should sort Alpha Duo before Zebra Folk');
  }
  sortButtons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // Song asc
  await new Promise((resolve) => setTimeout(resolve, 30));
  rows = document.querySelectorAll('.drawer-row');
  if (!rows[0].textContent.includes('02') || !rows[0].textContent.includes('Lantern Song')) {
    throw new Error('Sorting by Song asc should restore Lantern Song first');
  }
  rows[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  const title = document.querySelector('.song-title')?.textContent;
  if (!title) throw new Error('Preview did not render a song title');
  if (document.querySelector('.fit-chip')) throw new Error('Fit status should not be rendered');
  if (document.querySelector('.stage-caption, .page-footer')) throw new Error('Page caption and footer should not be rendered');

  // Jump to the second song from the contents drawer.
  document.querySelector('.contents-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer-layer.is-open');
  document.querySelectorAll('.drawer-row')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const activeTitle = document.querySelector('.song-title')?.textContent;
  if (!activeTitle || activeTitle === title) throw new Error('Song navigation did not change the page');

  // Verify toolbar overflow count badge, Contents drawer overflow indicator/filter, and preview overflow banner.
  const warnBadge = document.querySelector('.toolbar-warn-badge');
  if (!warnBadge || warnBadge.textContent.trim() !== '1') {
    throw new Error(`Expected toolbar overflow badge "1", got "${warnBadge?.textContent}"`);
  }

  document.querySelector('.contents-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer-layer.is-open');
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
  if (document.querySelector('.song-drawer-layer.is-open')) {
    throw new Error('Contents drawer footer close button did not close drawer');
  }
  document.querySelector('.contents-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer-layer.is-open');
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

  const paperSelect = document.querySelector('select[aria-label="Paper size"]');
  if (!paperSelect) throw new Error('Paper size select missing');
  const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  selectSetter.call(paperSelect, 'A5');
  paperSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  const reflowDeadline = Date.now() + 12000;
  while (Date.now() < reflowDeadline) {
    const page = document.querySelector('.paper-page');
    const width = page?.style.getPropertyValue('--page-w');
    if (width === '148' && !document.querySelector('.reflow-overlay')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await waitFor('.paper-page', 8000);

  // Trigger the Ctrl+P print flow; verify mirrored margins and alternating page numbers across pages.
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
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

  // Open the Export PDF dialog, verify Standard PDF omits summary box/heading and updates footer specs, then verify Print shop (Pro).
  document.querySelector('.header-pdf')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.pdf-export-layer.is-open');
  if (document.querySelector('.pdf-standard-summary')) {
    throw new Error('Standard PDF summary box should not be rendered');
  }
  if (document.querySelector('.pdf-standard-setup-head')) {
    throw new Error('Standard PDF Page setup heading should not be rendered');
  }
  const stdPaperSelect = document.querySelector('.pdf-export-dialog select[aria-label="Paper size"]');
  if (!stdPaperSelect) throw new Error('Standard PDF Page Setup Paper size select missing');
  if (!document.querySelector('.pdf-export-dialog [aria-label="Paper orientation"]')) {
    throw new Error('Standard PDF Page Setup orientation controls missing');
  }
  if (!document.querySelector('.pdf-export-dialog [aria-label="Print columns"]')) {
    throw new Error('Standard PDF Page Setup columns controls missing');
  }
  if (document.querySelectorAll('.pdf-export-dialog .margin-grid .stepper-control').length !== 4) {
    throw new Error('Standard PDF Page Setup margin steppers missing');
  }
  const initialFootSummary = document.querySelector('.pdf-export-summary-line')?.textContent || '';
  if (!initialFootSummary.includes('148')) {
    throw new Error(`Expected Standard PDF footer summary to reflect A5 dimensions, got: ${initialFootSummary}`);
  }
  selectSetter.call(stdPaperSelect, 'Letter');
  stdPaperSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  const stdReflowDeadline = Date.now() + 12000;
  while (Date.now() < stdReflowDeadline) {
    const footText = document.querySelector('.pdf-export-summary-line')?.textContent || '';
    if (footText.includes('215.9') && !document.querySelector('.pdf-download-submit')?.disabled) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const updatedFootSummary = document.querySelector('.pdf-export-summary-line')?.textContent || '';
  if (!updatedFootSummary.includes('215.9')) {
    throw new Error(`Standard PDF footer summary did not update after Paper size change: ${updatedFootSummary}`);
  }
  // Restore A5 so subsequent Pro imposition check sees expected A5 page count.
  selectSetter.call(stdPaperSelect, 'A5');
  stdPaperSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
  const restoreReflowDeadline = Date.now() + 12000;
  while (Date.now() < restoreReflowDeadline) {
    const footText = document.querySelector('.pdf-export-summary-line')?.textContent || '';
    if (footText.includes('148') && !document.querySelector('.pdf-download-submit')?.disabled) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

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
  if (document.querySelector('.pdf-export-head .settings-sheet-kicker')) {
    throw new Error('PDF export header should not render songbook kicker');
  }
  const summaryLine = document.querySelector('.pdf-export-summary-line')?.textContent || '';
  if (!summaryLine.includes('Songs for the Slow Road') || !summaryLine.includes('5 pages') || !summaryLine.includes('sheets')) {
    throw new Error(`Expected songbook name, pages, and sheets in pdf-export-summary-line, got: ${summaryLine}`);
  }
  if (document.querySelector('.pdf-export-dialog .confirm-cancel-btn')) {
    throw new Error('PDF export modal should not render a Cancel button');
  }
  document.querySelector('.pdf-export-dialog .settings-sheet-head button[aria-label="Close export dialog"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (document.querySelector('.pdf-export-layer.is-open')) {
    throw new Error('PDF export dialog did not close');
  }

  // Verify responsive mobile mode moves studio actions into the two-row bottom toolbar.
  let mobileChangeListener = null;
  window.matchMedia = (query) => ({
    matches: query === '(max-width: 720px)',
    media: query,
    addEventListener: (_event, cb) => { mobileChangeListener = cb; },
    removeEventListener: () => { mobileChangeListener = null; },
  });
  // Trigger mobile listener if already mounted, or remount briefly in mobile mode.
  root.unmount();
  const mobileRoot = createRoot(container);
  mobileRoot.render(React.createElement(App));
  await waitFor('input[aria-label="Kytario songbook link"]');
  valueSetter.call(document.querySelector('input[aria-label="Kytario songbook link"]'), 'https://kytario.com/fixture-book');
  document.querySelector('input[aria-label="Kytario songbook link"]').dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  document.querySelector('.url-form')?.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor('.preview-toolbar.is-mobile-dock', 8000);
  if (document.querySelectorAll('.studio-header button').length !== 0) {
    throw new Error('Mobile studio header should not render action buttons');
  }
  if (document.querySelectorAll('.preview-toolbar-row').length !== 2) {
    throw new Error('Mobile bottom toolbar should render two rows');
  }
  if (document.querySelectorAll('.preview-toolbar-actions-row .studio-actions button').length !== 4) {
    throw new Error('Mobile bottom actions row should render 4 studio buttons');
  }
  if (!document.querySelector('.preview-toolbar-nav-row .preview-toolbar-right .zoom-control')) {
    throw new Error('Mobile zoom controls should be in preview-toolbar-right');
  }
  if (!document.querySelector('.preview-toolbar-nav-row .preview-toolbar-right .page-nav')) {
    throw new Error('Mobile pagination controls should be in preview-toolbar-right');
  }
  document.querySelector('.settings-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.settings-sheet-layer.is-open');
  document.querySelector('.settings-bottom-close button[aria-label="Close settings"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (document.querySelector('.settings-sheet-layer.is-open')) {
    throw new Error('Settings bottom close button did not close settings');
  }
  document.querySelector('.contents-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.song-drawer-layer.is-open');
  if (!document.querySelector('.drawer-search-mobile input')) {
    throw new Error('Mobile search bar should be rendered in the bottom footer on mobile');
  }
  document.querySelector('.drawer-foot-actions button[aria-label="Close contents"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (document.querySelector('.song-drawer-layer.is-open')) {
    throw new Error('Contents bottom close button did not close Contents sheet');
  }

  document.querySelector('.header-pdf')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.pdf-export-layer.is-open');
  document.querySelector('.pdf-export-bottom-close button[aria-label="Close export dialog"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (document.querySelector('.pdf-export-layer.is-open')) {
    throw new Error('PDF export bottom close button did not close PDF sheet');
  }

  console.log(JSON.stringify({
    title,
    navText,
    activeTitle,
    printedPages,
    printCalls: calls,
  }, null, 2));
  mobileRoot.unmount();
} finally {
  await vite.close();
  window.close();
}
