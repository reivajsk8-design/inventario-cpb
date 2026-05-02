// js/db.js
const DB_NAME    = 'inventario-cpb';
const DB_VERSION = 1;
let _db = null;

export async function openDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('products')) {
        const s = db.createObjectStore('products', { keyPath: 'ref' });
        s.createIndex('ean',    'ean',    { unique: false });
        s.createIndex('family', 'family', { unique: false });
      }
      if (!db.objectStoreNames.contains('albaranes')) {
        db.createObjectStore('albaranes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('albaran_photos')) {
        db.createObjectStore('albaran_photos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}

function idbReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function getStoredDBVersion() {
  await openDB();
  const rec = await idbReq(tx('meta').get('db-version'));
  return rec?.value ?? null;
}

export async function setStoredDBVersion(v) {
  await openDB();
  return idbReq(tx('meta', 'readwrite').put({ key: 'db-version', value: v }));
}

export async function loadProductsFromNetwork() {
  const res   = await fetch('db.json.gz');
  const buf   = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Netlify may transparently decompress gzip before the browser sees it.
  // Check for gzip magic bytes (0x1f 0x8b); if absent, data is already plain JSON.
  const json = (bytes[0] === 0x1f && bytes[1] === 0x8b)
    ? pako.inflate(bytes, { to: 'string' })
    : new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

export async function saveProductsToDB(products) {
  await openDB();
  const store = _db.transaction('products', 'readwrite').objectStore('products');
  store.clear();
  for (const p of products) store.put(p);
  return new Promise((res, rej) => {
    store.transaction.oncomplete = res;
    store.transaction.onerror    = e => rej(e.target.error);
  });
}

export async function getAllProducts() {
  await openDB();
  return idbReq(tx('products').getAll());
}

export async function getProductByEAN(ean) {
  await openDB();
  return idbReq(tx('products').index('ean').get(ean));
}

export async function getProductByRef(ref) {
  await openDB();
  return idbReq(tx('products').get(ref));
}

export async function getFamilies() {
  const products = await getAllProducts();
  return [...new Set(products.map(p => p.family).filter(Boolean))].sort();
}

export async function fetchRemoteVersion() {
  try {
    const res  = await fetch('db-version.json?_=' + Date.now());
    const data = await res.json();
    return data.version;
  } catch { return null; }
}
