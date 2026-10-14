/* Service worker: guarda los archivos de la app para abrirla sin internet.
   Al cambiar cualquier archivo, sube el número de VERSION_CACHE. */
var VERSION_CACHE = 'mi-ruta-etapa-1-v2';
var ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION_CACHE)
      .then(function (c) { return c.addAll(ARCHIVOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) { return k !== VERSION_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // no tocamos mapas ni sitios externos
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (r) {
      return r || fetch(e.request).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('index.html');
      });
    })
  );
});
