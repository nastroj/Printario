/**
 * Kytario import helpers.
 *
 * The public songbook API is same-origin only, so the browser cannot call it
 * directly. This module runs on the Printario server, resolves a pasted
 * Kytario URL, fetches the public songbook data and normalises it for the
 * print engine.
 */

import * as cheerio from 'cheerio';

export const KYTARIO_ORIGIN = 'https://kytario.com';
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

const KNOWN_LOCALES = new Set([
  'cs', 'sk', 'en', 'de', 'sv', 'fr', 'pl', 'bg',
]);

const RESERVED_ROOTS = new Set([
  'about-kytario', 'account', 'api', 'docs', 'how-to-contribute', 'images',
  'monitoring', 'news', 'page-turner', 'playlists', 'privacy', 'projects',
  'report-content', 'sign-in', 'sign-up', 'site.webmanifest', 'sitemap.xml',
  'song', 'songbooks', 'songs', 'terms',
]);

const SONGBOOK_TOKEN_RE = /^[A-Za-z0-9_-]{4,64}$/;
const SONG_TOKEN_RE = /^[A-Za-z0-9_-]{1,160}$/;

export class ImportError extends Error {
  constructor(message, { code = 'IMPORT_FAILED', status = 400, details = null } = {}) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function cleanText(value, max = 1_000) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function cleanTokenText(value, max = 2_000) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function asInt(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/**
 * Turn a pasted Kytario link (or a bare songbook token) into a descriptor.
 */
export function parseKytarioUrl(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new ImportError('Paste a Kytario songbook link first.', { code: 'URL_REQUIRED' });
  }

  let input = rawInput.trim();
  if (input.length > 600) {
    throw new ImportError('That link is too long.', { code: 'URL_TOO_LONG' });
  }

  // Be generous with bare tokens, but not with arbitrary URLs.
  if (!/^https?:\/\//i.test(input) && !/[/?#]/.test(input)) {
    if (!SONGBOOK_TOKEN_RE.test(input)) {
      throw new ImportError(
        'That doesn’t look like a Kytario songbook link. Try something like https://kytario.com/songbook.',
        { code: 'INVALID_URL' },
      );
    }
    return { kind: 'songbook', token: input, sourceUrl: `${KYTARIO_ORIGIN}/${input}` };
  }

  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;

  let url;
  try {
    url = new URL(input);
  } catch {
    throw new ImportError(
      'That doesn’t look like a valid link. Paste the full URL from your browser.',
      { code: 'INVALID_URL' },
    );
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['kytario.com', 'kytario.cz'].includes(host)) {
    throw new ImportError(
      'Only Kytario songbook links can be imported. The link should start with kytario.com.',
      { code: 'UNSUPPORTED_HOST' },
    );
  }

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });

  if (segments[0] && KNOWN_LOCALES.has(segments[0].toLowerCase())) segments.shift();

  if (segments.length === 0) {
    throw new ImportError(
      'That’s the Kytario homepage. Open a songbook first, then copy its link.',
      { code: 'NOT_A_SONGBOOK' },
    );
  }

  const [first, second, third] = segments;
  const projectParam = url.searchParams.get('project');

  if (first === 'song') {
    if (!second || !SONG_TOKEN_RE.test(second)) {
      throw new ImportError(
        'That song link is missing a song id. Open the song on Kytario and copy the address bar.',
        { code: 'INVALID_SONG_URL' },
      );
    }
    return { kind: 'song', token: second, sourceUrl: `${KYTARIO_ORIGIN}/song/${second}` };
  }

  if (first === 'songbooks') {
    // /songbooks/<token>/edit, /songbooks/<token>/print, ...
    if (second && !['new'].includes(second) && SONGBOOK_TOKEN_RE.test(second)) {
      return {
        kind: 'songbook',
        token: second,
        sourceUrl: `${KYTARIO_ORIGIN}/${second}`,
      };
    }
    if (projectParam) {
      return {
        kind: 'project',
        token: projectParam,
        sourceUrl: `${KYTARIO_ORIGIN}/projects/${projectParam}`,
      };
    }
    throw new ImportError(
      'That’s the public songbook directory. Open one songbook, then copy its link — for example kytario.com/songbook.',
      { code: 'NOT_A_SONGBOOK' },
    );
  }

  if (first === 'songs') {
    if (projectParam) {
      return {
        kind: 'project',
        token: projectParam,
        sourceUrl: `${KYTARIO_ORIGIN}/projects/${projectParam}`,
      };
    }
    throw new ImportError(
      'That link points to a list of individual songs, not a printable songbook. Open a songbook page instead.',
      { code: 'NOT_A_SONGBOOK' },
    );
  }

  if (first === 'projects') {
    if (!second) {
      throw new ImportError(
        'That’s the projects directory. Open a project’s songbook and copy that link.',
        { code: 'NOT_A_SONGBOOK' },
      );
    }
    return {
      kind: 'project',
      token: second,
      sourceUrl: `${KYTARIO_ORIGIN}/projects/${second}`,
    };
  }

  if (RESERVED_ROOTS.has(first)) {
    throw new ImportError(
      'That page isn’t a songbook. Open the songbook itself, then copy the link from your browser.',
      { code: 'NOT_A_SONGBOOK' },
    );
  }

  if (!SONGBOOK_TOKEN_RE.test(first)) {
    throw new ImportError(
      'That doesn’t look like a Kytario songbook link. Try something like https://kytario.com/songbook.',
      { code: 'INVALID_TOKEN' },
    );
  }

  // /<songbookUrlToken>, /<songbookUrlToken>/<page>, etc.
  if (second && third) {
    // A path such as /en/songbook/1 is still the same songbook.
  }
  return {
    kind: 'songbook',
    token: first,
    sourceUrl: `${KYTARIO_ORIGIN}/${first}`,
  };
}

async function fetchText(url, { accept = 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept,
        'accept-language': 'en,cs;q=0.8',
        'user-agent': 'Printario/1.0 (songbook printing tool; +https://github.com/printario)',
      },
    });

    if (!response.ok) {
      const error = new ImportError(
        response.status === 404
          ? 'Kytario couldn’t find that songbook. It may be private, renamed, or the link may be incomplete.'
          : `Kytario returned an error (${response.status}). Please try again in a moment.`,
        {
          code: response.status === 404 ? 'SONGBOOK_NOT_FOUND' : 'UPSTREAM_ERROR',
          status: response.status === 404 ? 404 : 502,
        },
      );
      error.upstreamStatus = response.status;
      throw error;
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new ImportError('That songbook is too large to import.', {
        code: 'SONGBOOK_TOO_LARGE',
        status: 413,
      });
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new ImportError('That songbook is too large to import.', {
        code: 'SONGBOOK_TOO_LARGE',
        status: 413,
      });
    }
    return new TextDecoder('utf-8').decode(buffer);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error?.name === 'AbortError') {
      throw new ImportError('Kytario took too long to respond. Please try again.', {
        code: 'UPSTREAM_TIMEOUT',
        status: 504,
      });
    }
    throw new ImportError('Couldn’t reach Kytario. Check your connection and try again.', {
      code: 'UPSTREAM_UNREACHABLE',
      status: 502,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const text = await fetchText(url, { accept: 'application/json' });
  try {
    return JSON.parse(text);
  } catch {
    throw new ImportError('Kytario sent songbook data we couldn’t read. Please try again.', {
      code: 'BAD_UPSTREAM_JSON',
      status: 502,
    });
  }
}

/** Decode the Next.js flight stream embedded in Kytario pages. */
export function decodeNextFlight(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let match;
  while ((match = re.exec(html))) {
    try {
      chunks.push(JSON.parse(match[1]));
    } catch {
      // Ignore a malformed flight chunk; the rest of the page can still be useful.
    }
  }
  return chunks.join('');
}

function findBalancedJson(text, startIndex) {
  if (startIndex < 0 || startIndex >= text.length) return null;
  if (text[startIndex] !== '{' && text[startIndex] !== '[') return null;

  const stack = [];
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if (char === '}' || char === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== char) return null;
      stack.pop();
      if (stack.length === 0) {
        try {
          return JSON.parse(text.slice(startIndex, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function jsonAfterMarker(text, marker) {
  let index = text.indexOf(marker);
  while (index !== -1) {
    const value = findBalancedJson(text, index + marker.length);
    if (value !== null) return value;
    index = text.indexOf(marker, index + marker.length);
  }
  return null;
}

function parseSongbookMeta(html, token) {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]');
  let playlist = null;

  scripts.each((_, element) => {
    if (playlist) return;
    try {
      const data = JSON.parse($(element).text());
      const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
      for (const node of nodes) {
        if (node?.['@type'] === 'MusicPlaylist') {
          playlist = node;
          break;
        }
      }
    } catch {
      // Ignore malformed structured data.
    }
  });

  const titleTag = cleanText($('title').first().text(), 200) ?? '';
  const titleMatch = titleTag.match(/^Songbook\s+(.+?)\s*\|\s*Kytario/i);
  const ogTitle = cleanText($('meta[property="og:title"]').attr('content'), 200);
  const ogDescription = cleanText($('meta[property="og:description"]').attr('content'), 1_200);
  const rawName = cleanText(playlist?.name, 160)
    ?? cleanText(titleMatch?.[1], 160)
    ?? cleanText(ogTitle?.replace(/^Songbook\s+/i, '').replace(/\s*\|\s*Kytario$/i, ''), 160)
    ?? 'Untitled songbook';

  let projectName = null;
  let projectToken = null;
  const authorUrl = playlist?.author?.url;
  if (typeof authorUrl === 'string') {
    try {
      const author = new URL(authorUrl);
      const parts = author.pathname.split('/').filter(Boolean);
      if (parts[0] === 'projects' && parts[1]) projectToken = parts[1];
    } catch {
      // no-op
    }
  }
  projectName = cleanText(playlist?.author?.name, 160);

  const description = cleanText(playlist?.description, 1_500)
    ?? ogDescription
    ?? null;

  return {
    name: rawName,
    description,
    projectName,
    projectToken,
    numTracks: asInt(playlist?.numTracks, null),
    sourceUrl: `${KYTARIO_ORIGIN}/${token}`,
  };
}

function normaliseToken(token) {
  if (!token || typeof token !== 'object') return null;
  const type = asInt(token.type, -1);
  if (type < 0 || type > 8) return null;
  const content = type === 4 || type === 5 || type === 3
    ? asInt(token.content, type === 3 ? 1 : 2)
    : type === 0
      ? cleanTokenText(token.content)
      : cleanText(token.content, 2_000);
  return {
    type,
    ...(content !== null ? { content } : {}),
  };
}

function normaliseSection(section) {
  if (!section || typeof section !== 'object') return null;
  const tokens = Array.isArray(section.tokens)
    ? section.tokens.slice(0, 6_000).map(normaliseToken).filter(Boolean)
    : [];
  if (tokens.length === 0) return null;
  return {
    title: cleanText(section.title, 80) ?? '',
    expandable: Boolean(section.expandable),
    tokens,
  };
}

export function normaliseSong(song) {
  if (!song || typeof song !== 'object' || !song.name) return null;
  const sections = Array.isArray(song.sections)
    ? song.sections.slice(0, 120).map(normaliseSection).filter(Boolean)
    : [];
  if (sections.length === 0) return null;

  return {
    id: asInt(song.id, null),
    name: cleanText(song.name, 200) ?? 'Untitled song',
    author: cleanText(song.author, 200) ?? cleanText(song.authorLabel, 200),
    interpreter: cleanText(song.interpreter, 200),
    capo: Math.max(0, Math.min(12, asInt(song.capo, 0) ?? 0)),
    tonalKey: cleanText(song.tonalKey, 20),
    originalKey: cleanText(song.originalKey, 20),
    language: cleanText(song.language, 8),
    tempo: cleanText(song.tempo, 20),
    genre: cleanText(song.genre, 40),
    notation: song.notation === 'german' ? 'german' : 'english',
    urlToken: cleanText(song.urlToken, 180),
    sections,
  };
}

function emptySongbook(token, meta = {}) {
  return {
    token,
    name: meta.name ?? 'Untitled songbook',
    description: meta.description ?? null,
    projectName: meta.projectName ?? null,
    projectToken: meta.projectToken ?? null,
    sourceUrl: meta.sourceUrl ?? `${KYTARIO_ORIGIN}/${token}`,
    importedAt: new Date().toISOString(),
    songs: [],
  };
}

export async function importSongbook(token) {
  if (!SONGBOOK_TOKEN_RE.test(token)) {
    throw new ImportError('That songbook link has an invalid address.', { code: 'INVALID_TOKEN' });
  }

  const [sectionsResult, pageResult] = await Promise.allSettled([
    fetchJson(`${KYTARIO_ORIGIN}/api/songbooks/${encodeURIComponent(token)}/sections`),
    fetchText(`${KYTARIO_ORIGIN}/${encodeURIComponent(token)}`),
  ]);

  if (sectionsResult.status === 'rejected') {
    const reason = sectionsResult.reason;
    if (reason instanceof ImportError && reason.code === 'SONGBOOK_NOT_FOUND') {
      throw new ImportError(
        'Kytario couldn’t find a public songbook at that link. Make sure the songbook is public and the link is complete.',
        { code: 'SONGBOOK_NOT_FOUND', status: 404 },
      );
    }
    throw reason;
  }

  const payload = sectionsResult.value;
  if (!payload || !Array.isArray(payload.songbookSongs)) {
    throw new ImportError('Kytario sent an unexpected songbook format. Please try again.', {
      code: 'BAD_UPSTREAM_DATA',
      status: 502,
    });
  }

  const meta = pageResult.status === 'fulfilled'
    ? parseSongbookMeta(pageResult.value, token)
    : {};

  const songs = payload.songbookSongs
    .slice()
    .sort((a, b) => (asInt(a.orderIndex, 0) ?? 0) - (asInt(b.orderIndex, 0) ?? 0))
    .map((item) => normaliseSong(item?.song))
    .filter(Boolean);

  if (songs.length === 0) {
    throw new ImportError(
      'This songbook doesn’t contain any songs that Printario can print yet.',
      { code: 'EMPTY_SONGBOOK', status: 422 },
    );
  }

  return {
    ...emptySongbook(token, meta),
    songCount: songs.length,
    songs,
  };
}

export async function importSong(token) {
  if (!SONG_TOKEN_RE.test(token)) {
    throw new ImportError('That song link has an invalid address.', { code: 'INVALID_SONG_TOKEN' });
  }

  const html = await fetchText(`${KYTARIO_ORIGIN}/song/${encodeURIComponent(token)}`);
  const flight = decodeNextFlight(html);

  let songData = tryExtractSongFromFlight(flight);
  if (!songData) {
    // Some page variants put the serialized JSON in the HTML itself.
    songData = tryExtractSongFromFlight(html);
  }
  if (!songData) {
    throw new ImportError(
      'Kytario didn’t include printable data for that song. Try opening the songbook instead.',
      { code: 'SONG_DATA_NOT_FOUND', status: 422 },
    );
  }

  const song = normaliseSong(songData);
  if (!song) {
    throw new ImportError(
      'That song doesn’t have any printable lyrics yet.',
      { code: 'EMPTY_SONG', status: 422 },
    );
  }

  const $ = cheerio.load(html);
  const titleTag = cleanText($('title').first().text(), 200) ?? '';
  const title = cleanText(titleTag.replace(/,\s*chords and lyrics\s*\|\s*Kytario.*$/i, ''), 160);
  const projectName = cleanText(songData?.project?.name, 160);
  const projectToken = cleanText(songData?.project?.urlToken, 160);

  return {
    token: `song-${token}`,
    name: title || song.name,
    description: 'A single song imported from Kytario.',
    projectName,
    projectToken,
    sourceUrl: `${KYTARIO_ORIGIN}/song/${token}`,
    importedAt: new Date().toISOString(),
    singleSong: true,
    songCount: 1,
    songs: [song],
  };
}

function tryExtractSongFromFlight(text) {
  if (!text) return null;
  // The serialized page prop is usually: "song":{"id":...
  let index = text.indexOf('"song":{"id"');
  if (index === -1) index = text.indexOf('"song":{');
  if (index === -1) return null;
  const brace = text.indexOf('{', index);
  const candidate = findBalancedJson(text, brace);
  if (!candidate || !Array.isArray(candidate.sections)) return null;
  return candidate;
}

async function importProject(token) {
  if (!SONGBOOK_TOKEN_RE.test(token)) {
    throw new ImportError('That project link has an invalid address.', { code: 'INVALID_PROJECT' });
  }

  const html = await fetchText(`${KYTARIO_ORIGIN}/projects/${encodeURIComponent(token)}`);
  const flight = decodeNextFlight(html);
  let songbooks = null;
  let markerIndex = flight.indexOf('"songbooks":[');
  if (markerIndex !== -1) {
    songbooks = findBalancedJson(flight, markerIndex + '"songbooks":'.length);
  }
  if (!Array.isArray(songbooks)) {
    markerIndex = html.indexOf('\\"songbooks\\":[');
    if (markerIndex !== -1) {
      songbooks = findBalancedJson(html, markerIndex + '\\"songbooks\\":'.length);
    }
  }

  if (!Array.isArray(songbooks) || songbooks.length === 0) {
    throw new ImportError(
      'No public songbook was found for that project. Open one of its songs and use the songbook link instead.',
      { code: 'PROJECT_SONGBOOK_NOT_FOUND', status: 404 },
    );
  }

  if (songbooks.length > 1) {
    const candidates = songbooks.slice(0, 8).map((item) => ({
      name: cleanText(item?.name, 160) ?? 'Untitled songbook',
      token: cleanText(item?.urlToken, 160),
      songCount: asInt(item?._count?.songbookSongs, null),
    }));
    throw new ImportError(
      `That project has ${songbooks.length} songbooks. Open the one you want to print and paste its link.`,
      { code: 'MULTIPLE_SONGBOOKS', status: 422, details: { candidates } },
    );
  }

  const songbookToken = cleanText(songbooks[0]?.urlToken, 160);
  if (!songbookToken) {
    throw new ImportError('That project’s songbook has no usable address.', {
      code: 'PROJECT_SONGBOOK_NOT_FOUND',
      status: 404,
    });
  }

  const result = await importSongbook(songbookToken);
  return { ...result, sourceUrl: `${KYTARIO_ORIGIN}/${songbookToken}` };
}

export async function importFromKytario(rawInput) {
  const descriptor = parseKytarioUrl(rawInput);
  if (descriptor.kind === 'songbook') return importSongbook(descriptor.token);
  if (descriptor.kind === 'song') return importSong(descriptor.token);
  if (descriptor.kind === 'project') return importProject(descriptor.token);
  throw new ImportError('That link can’t be imported.', { code: 'UNSUPPORTED_LINK' });
}

/** Exported for tests. */
export const __test = {
  normaliseSong,
  normaliseSection,
  findBalancedJson,
  jsonAfterMarker,
  decodeNextFlight,
  tryExtractSongFromFlight,
};
