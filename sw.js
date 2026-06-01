// sw.js — Service Worker para Inventario CPB
// CACHE_NAME se incrementa automáticamente via git pre-commit hook
const CACHE_NAME = 'cpb-v40';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/filters.js',
  './js/scanner.js',
  './js/eans.js',
  './js/lista.js',
  './js/conteos.js',
  './js/camera-scanner.js',
  './js/stock.js',
  './js/pedidos.js',
  './js/resumen.js',
  './js/albaranes.js',
  'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
];

// Instalación: pre-cachea todos los archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// Activación: elimina cachés antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Network-first para la BD y EANs extra (se actualizan con frecuencia)
  if (url.pathname.endsWith('db.json.gz') || url.pathname.endsWith('db-version.json') || url.pathname.endsWith('eans-extra.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first para el resto (app funciona sin internet)
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        }
        return res;
      });
    })
  );
});
