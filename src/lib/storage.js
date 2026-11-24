const DB_NAME = 'printario';
const DB_VERSION = 1;
const STORE = 'songbooks';
const RECENT_KEY = 'printario.recent.v1';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheSongbook(data) {
  if (!data?.token) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ data, savedAt: Date.now() }, data.token);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Cache is a convenience; ignore storage failures.
  }
}

export async function readCachedSongbook(token) {
  if (!token) return null;
  try {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(token);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!value || Date.now() - value.savedAt > 1000 * 60 * 60 * 24 * 30) return null;
    return value.data;
  } catch {
    return null;
  }
}

export async function deleteCachedSongbook(token) {
  if (!token) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(token);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Cache is a convenience; ignore storage failures.
  }
}

export function loadRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && !entry.demo && entry.token !== 'printario-demo').slice(0, 7)
      : [];
  } catch {
    return [];
  }
}

export function addRecent(data) {
  const item = {
    token: data.token,
    name: data.name,
    songCount: data.songs?.length ?? data.songCount ?? 0,
    sourceUrl: data.sourceUrl,
    at: Date.now(),
  };
  const next = [item, ...loadRecent().filter((entry) => entry.token !== item.token)].slice(0, 7);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
  return next;
}

export function removeRecent(token) {
  const next = loadRecent().filter((entry) => entry.token !== token);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // no-op
  }
  deleteCachedSongbook(token);
  return next;
}
