import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { importFromKytario, parseKytarioUrl, ImportError } from './kytario.js';
import { demoSongbook } from './demo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 5173);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Small, process-local cache. Songbook payloads can be a few megabytes, so keep
// the entry count deliberately small.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 12;
const cache = new Map();
const inflight = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh recency.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { createdAt: Date.now(), value });
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

async function importWithCache(input) {
  let descriptor;
  try {
    descriptor = parseKytarioUrl(input);
  } catch (error) {
    throw error;
  }
  const key = `${descriptor.kind}:${descriptor.token}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  if (inflight.has(key)) return inflight.get(key);

  const promise = importFromKytario(input)
    .then((data) => {
      cacheSet(key, data);
      return { ...data, cached: false };
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

// Very light abuse protection: imports are expensive and hit a third party.
const rate = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now - entry.start > 60_000) {
    rate.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > 30) {
    return res.status(429).json({
      ok: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many imports in a short time. Please wait a minute and try again.',
      },
    });
  }
  return next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0.0' });
});

app.get('/api/demo', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json({ ok: true, data: demoSongbook });
});

app.post('/api/import', rateLimit, async (req, res, next) => {
  try {
    const rawUrl = req.body?.url;
    if (typeof rawUrl !== 'string') {
      throw new ImportError('Paste a Kytario songbook link first.', { code: 'URL_REQUIRED' });
    }
    const data = await importWithCache(rawUrl.trim());
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

app.get('/api/songbook/:token', rateLimit, async (req, res, next) => {
  try {
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(req.params.token)) {
      throw new ImportError('That songbook token is invalid.', { code: 'INVALID_TOKEN' });
    }
    const data = await importWithCache(req.params.token);
    res.json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: 'That API endpoint does not exist.' },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((error, _req, res, _next) => {
  if (error instanceof ImportError) {
    return res.status(error.status || 400).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }
  console.error('[printario] Unhandled error:', error);
  return res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong while preparing that songbook. Please try again.',
    },
  });
});

if (IS_PROD) {
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(dist)) {
    console.error('The production build is missing. Run `npm run build` first.');
    process.exit(1);
  }
  app.use(express.static(dist, {
    maxAge: '1y',
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`\n  Printario ${IS_PROD ? 'production' : 'dev'} server`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
});
