import express from 'express';
import compression from 'compression';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { importFromKytario, fetchSongbookQrSvg, parseKytarioUrl, ImportError } from './kytario.js';

function readCliFlag(name) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = Number(readCliFlag('--port') || process.env.PORT || 3000);
const HOST = readCliFlag('--host') || process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '16kb' }));

// ---------------------------------------------------------------------------
// Minimal structured logging (JSON lines in production, human-readable in dev)
// so import latency and cache hit rates can be aggregated by any log shipper.
// ---------------------------------------------------------------------------
const log = IS_PROD
  ? (level, event, fields = {}) => console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }),
  )
  : (level, event, fields = {}) => console.log(`[printario:${level}] ${event}`, fields);

function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    if (req.path.startsWith('/api/')) {
      log('info', 'request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      });
    }
  });
  next();
}
app.use(requestLogger);

const CSP_DIRECTIVES = [
  "default-src 'self'",
  // Vite injects small inline style blocks; keep scripts strictly self-hosted.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', CSP_DIRECTIVES.join('; '));
  next();
});

// Small, process-local cache. Songbook payloads can be a few megabytes, so keep
// the entry count deliberately small.
//
// NOTE: this cache is intentionally per-process. If you scale to multiple
// replicas behind a load balancer, either replace it with a shared store
// (e.g. Redis) or accept that each replica warms its own copy. The keys below
// are normalised so semantically identical links still share an entry.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 12;
const cache = new Map();
const inflight = new Map();
let cacheStats = { hits: 0, misses: 0 };

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
  // Normalise the key: parseKytarioUrl already strips locale prefixes, trailing
  // paths and www., but lowercase the kind so future variants cannot split the
  // cache for the same resource.
  const key = `${descriptor.kind.toLowerCase()}:${descriptor.token}`;
  const cached = cacheGet(key);
  if (cached) {
    cacheStats.hits += 1;
    return { ...cached, cached: true };
  }
  cacheStats.misses += 1;

  if (inflight.has(key)) return inflight.get(key);

  const startedAt = process.hrtime.bigint();
  const promise = importFromKytario(input)
    .then((data) => {
      // Freeze a deep copy before caching so a mutated response object can
      // never poison later readers of the cache.
      cacheSet(key, structuredClone(data));
      log('info', 'import', {
        key,
        cached: false,
        durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
        songs: data?.songs?.length ?? 0,
      });
      return { ...data, cached: false };
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

// Very light abuse protection: imports are expensive and hit a third party.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 30;
const RATE_SWEEP_INTERVAL_MS = 5 * 60_000;
const rate = new Map();

// Periodically evict stale buckets so the map cannot grow without bound when
// many distinct client IPs pass through (e.g. behind a large proxy fleet).
const rateSweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rate) {
    if (now - entry.start > RATE_WINDOW_MS) rate.delete(key);
  }
}, RATE_SWEEP_INTERVAL_MS);
rateSweeper.unref();

function rateLimit(req, res, next) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = rate.get(key);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rate.set(key, { start: now, count: 1 });
    return next();
  }
  entry.count += 1;
  if (entry.count > RATE_MAX_PER_WINDOW) {
    log('warn', 'rate_limited', { ip: key });
    res.setHeader('Retry-After', Math.ceil((entry.start + RATE_WINDOW_MS - now) / 1000));
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
  const total = cacheStats.hits + cacheStats.misses;
  res.json({
    ok: true,
    version: '1.0.0',
    cache: {
      entries: cache.size,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: total > 0 ? Math.round((cacheStats.hits / total) * 100) / 100 : null,
    },
  });
});

app.get('/api/qr/:token', async (req, res, next) => {
  try {
    const svg = await fetchSongbookQrSvg(req.params.token);
    // SVG is XML markup from a third party; force sniffing/download semantics
    // and sandbox it if it is ever embedded, so it cannot execute in our origin.
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline; filename="qr.svg"');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(svg);
  } catch (error) {
    next(error);
  }
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

const server = http.createServer(app);

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
  const disableHmr = process.env.DISABLE_HMR === 'true';
  const { createServer } = await import('vite');
  const vite = await createServer({
    root: ROOT,
    server: {
      middlewareMode: true,
      allowedHosts: true,
      hmr: disableHmr ? false : { server },
      ...(disableHmr ? { ws: false } : {}),
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.on('error', (error) => {
  console.error('[printario] Server failed to start:', error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Printario ${IS_PROD ? 'production' : 'dev'} server`);
  console.log(`  ➜  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
});
