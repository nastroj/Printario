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
      sections: [
        {
          title: '1.',
          expandable: false,
          tokens: [
            { type: 1, content: 'C' },
            { type: 0, content: 'Folded from an old ' },
            { type: 1, content: 'F' },
            { type: 0, content: 'letter' },
            { type: 6 },
          ],
        },
      ],
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

  // Open the settings sheet, verify margin presets are absent, test Book mode, then change paper size to A5.
  document.querySelector('.settings-toggle-button')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor('.settings-sheet-layer.is-open');
  if (document.querySelector('.preset-row')) throw new Error('Margin presets should not be rendered');

  const bookToggle = [...document.querySelectorAll('.toggle-row')]
    .find((row) => row.textContent.includes('Book mode'))
    ?.querySelector('button[role="switch"]');
  if (!bookToggle) throw new Error('Book mode toggle missing');
  bookToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
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
