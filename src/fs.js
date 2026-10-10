// Acceso a la carpeta de notas (File System Access API de Chrome/Edge).
// El handle de la carpeta se guarda en IndexedDB para no pedirla cada vez.

const DB = 'cuaderno';
const STORE = 'kv';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function kvGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

async function kvSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const supported = 'showDirectoryPicker' in window;

export async function pickRoot() {
  const handle = await window.showDirectoryPicker({ id: 'cuaderno', mode: 'readwrite', startIn: 'documents' });
  await kvSet('root', handle);
  return handle;
}

export async function storedRoot() {
  try { return (await kvGet('root')) || null; } catch { return null; }
}

export async function hasPermission(handle, request = false) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (request) return (await handle.requestPermission(opts)) === 'granted';
  return false;
}

const hidden = (name) => name.startsWith('.') || name.startsWith('_');
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

// Árbol de carpetas y páginas .md. Cada nodo lleva su ruta relativa a la raíz.
export async function readTree(dir, path = []) {
  const node = { name: dir.name, kind: 'dir', handle: dir, path, children: [] };
  for await (const [name, handle] of dir.entries()) {
    if (hidden(name)) continue;
    if (handle.kind === 'directory') {
      node.children.push(await readTree(handle, [...path, name]));
    } else if (name.toLowerCase().endsWith('.md')) {
      node.children.push({ name, kind: 'file', handle, path: [...path, name] });
    }
  }
  node.children.sort((a, b) => collator.compare(a.name, b.name));
  return node;
}

export async function readText(fileHandle) {
  return (await fileHandle.getFile()).text();
}

export async function writeText(fileHandle, text) {
  const w = await fileHandle.createWritable();
  await w.write(text);
  await w.close();
}

export async function getDir(root, parts, create = false) {
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return dir;
}

export async function exists(dir, name) {
  try { await dir.getFileHandle(name); return true; } catch { /* no existe */ }
  try { await dir.getDirectoryHandle(name); return true; } catch { return false; }
}

// Crea un archivo nuevo sin pisar uno existente (agrega " (2)", " (3)"...).
export async function createFile(dir, name, text) {
  const dot = name.lastIndexOf('.');
  const base = name.slice(0, dot), ext = name.slice(dot);
  let finalName = name;
  for (let i = 2; await exists(dir, finalName); i++) finalName = `${base} (${i})${ext}`;
  const fh = await dir.getFileHandle(finalName, { create: true });
  await writeText(fh, text);
  return { handle: fh, name: finalName };
}

export const safeName = (s) => s.replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ').trim();

// Imágenes: se guardan en _assets/ junto a la página y se referencian con ruta relativa.
export async function saveAsset(pageDir, file) {
  const assets = await pageDir.getDirectoryHandle('_assets', { create: true });
  const ext = (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase() : (file.type.split('/')[1] || 'png');
  const stem = (file.name ? file.name.replace(/\.[^.]+$/, '') : 'imagen').replace(/[^\w-]+/g, '-').slice(0, 40) || 'imagen';
  const rnd = Math.random().toString(36).slice(2, 6);
  const name = `${Date.now().toString(36)}-${rnd}-${stem}.${ext}`;
  const fh = await assets.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
  return `_assets/${name}`;
}

const blobCache = new Map();
export async function resolveAsset(pageDir, src) {
  if (!src || /^(https?:|data:|blob:)/.test(src)) return src;
  const key = `${pageDir.name}|${src}`;
  if (blobCache.has(key)) return blobCache.get(key);
  const parts = decodeURI(src).split('/').filter(Boolean);
  const fileName = parts.pop();
  const dir = await getDir(pageDir, parts);
  const file = await (await dir.getFileHandle(fileName)).getFile();
  const url = URL.createObjectURL(file);
  blobCache.set(key, url);
  return url;
}
