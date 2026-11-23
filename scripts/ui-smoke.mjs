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

const { demoSongbook } = await import('../server/demo.js');

const demoResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, data: demoSongbook }),
});
window.fetch = async (url, options) => {
  if (String(url).includes('/api/demo')) return demoResponse();
  if (String(url).includes('/api/import')) return demoResponse();
  return { ok: false, status: 404, json: async () => ({ ok: false, error: { message: 'Not found' } }) };
};
globalThis.fetch = window.fetch;

const vite = await createServer({
  server: { middlewareMode: true },
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
  const demoButton = await waitFor('.demo-button');
  demoButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  window.addEventListener('unhandledrejection', (event) => console.error('UNHANDLED', event.reason));
  await waitFor('.paper-page', 8000);
  if (!document.querySelector('.page-cover')) throw new Error('Cover page did not render');

  const navText = document.querySelector('.page-number-input')?.textContent?.trim();
  if (!navText || !navText.includes('/')) throw new Error('Page navigation missing');

  // Open contents and jump into the first song.
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

  // Change paper size and verify the fixed layout is regenerated.
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

  // Open the print flow; the print root should mount and print() should be called.
  document.querySelector('.header-print')?.click();
  const deadline = Date.now() + 5000;
  while (!document.querySelector('.print-root') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  const printedPages = document.querySelectorAll('.print-root .paper-page').length;
  if (!printedPages) {
    console.error('DEBUG print', {
      calls,
      printButton: Boolean(document.querySelector('.header-print')),
      overlay: document.querySelector('.reflow-overlay')?.textContent,
      toast: document.querySelector('.toast')?.textContent,
      pageClass: document.querySelector('.paper-page')?.className,
      bodyEnd: document.body.innerHTML.slice(-400),
    });
    throw new Error('Print root did not render pages');
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
