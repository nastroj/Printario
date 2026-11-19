/* Printario service worker — app shell + runtime caching. */
const CACHE = 'printario-shell-v2';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon.svg',
];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL).catch(() => {});

  // The build's hashed JS/CSS are named in index.html. Cache them during
  // install so the app is usable offline after its very first visit.
  try {
    const response = await fetch('/index.html', { cache: 'no-cache' });
    const html = await response.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
    const fontUrls = new Set();
    await Promise.all(assets.map(async (url) => {
      const asset = await fetch(url, { cache: 'reload' });
      if (!asset.ok) return;
      const copy = asset.clone();
      await cache.put(url, asset);
      if (url.endsWith('.css')) {
        const css = await copy.text();
        for (const match of css.matchAll(/url\((\/assets\/[^)]+\.woff2)\)/g)) {
          fontUrls.add(match[1]);
        }
      }
    }));
    await Promise.all([...fontUrls].map(async (url) => {
      const font = await fetch(url, { cache: 'reload' });
      if (font.ok) await cache.put(url, font);
    }));
  } catch {
    // The runtime cache will pick assets up on the next visit.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      });
    }),
  );
});
