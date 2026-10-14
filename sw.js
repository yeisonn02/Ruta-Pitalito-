/* Service worker: guarda los archivos de la app para abrirla sin internet.
   Al cambiar cualquier archivo, sube el número de VERSION_CACHE. */
var VERSION_CACHE = 'mi-ruta-etapa-4-v1';
var ARCHIVOS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'db.js',
  'gps.js',
  'clientes.js',
  'sectores.js',
  'ubicacion.js',
  'manifest.webmanifest'
];
/* Iconos: si alguno falta, la app igual se instala y funciona sin internet. */
var ICONOS = [
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION_CACHE)
      .then(function (c) {
        /* cache: 'reload' = pedir al servidor, NO usar la copia temporal del navegador
           (GitHub Pages guarda 10 min y así quedaban archivos viejos). */
        var nuevos = function (u) { return new Request(u, { cache: 'reload' }); };
        return c.addAll(ARCHIVOS.map(nuevos)).then(function () {
          return Promise.all(ICONOS.map(function (u) { return c.add(nuevos(u)).catch(function () {}); }));
        });
      })
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
