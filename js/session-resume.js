/**
 * FOKO - Retomar una llamada en la consola del experto.
 *
 * Si el experto recarga o cierra la pestaña a mitad de llamada, al volver
 * recupera el mismo código de sala (el técnico se reconecta solo), el reloj,
 * las notas y las fotos/videos capturados. Datos de la llamada: localStorage;
 * fotos/videos (blobs): IndexedDB. Todo se borra al finalizar la sesión.
 */

const KEY = 'foko:activeSession';
const DB = 'foko-session';
const STORE = 'media';

export function loadActive(userId, { maxSessionMs, idleMs }) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  if (!s || s.userId !== userId || !s.code) return null;
  const now = Date.now();
  // Llamada iniciada: vale hasta el límite de duración. Sala sin nadie: hasta que caduca el código.
  if (s.startedAt ? now - s.startedAt >= maxSessionMs : now - (s.savedAt || 0) >= idleMs) {
    clearActive();
    return null;
  }
  return s;
}

export function saveActive(userId, patch) {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  if (!s || s.userId !== userId) s = { userId };
  Object.assign(s, patch, { savedAt: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}

export function clearActive() {
  try { localStorage.removeItem(KEY); } catch (_) {}
  return withStore('readwrite', (st) => st.clear());
}

export function putMedia(kind, name, blob) {
  return withStore('readwrite', (st) => st.add({ kind, name, blob, at: Date.now() }));
}

export async function listMedia() {
  const rows = await withStore('readonly', (st) => st.getAll());
  return (rows || []).sort((a, b) => a.at - b.at);
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Si IndexedDB no está disponible (modo privado estricto), la llamada sigue
// funcionando igual; solo no se recuperan las fotos al recargar.
async function withStore(mode, fn) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (_) {
    return null;
  }
}
