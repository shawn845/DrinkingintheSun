const CACHE_VERSION = 'v10';
const CACHE_NAME = `drinking-in-the-sun-${CACHE_VERSION}`;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './public/styles.css',
  './public/app.js',
  './public/icons/icon-192.png',
  './public/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Network-first for HTML
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for same-origin assets (JS/CSS/icons)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        });
      })
    );
    return;
  }

  // For cross-origin (Leaflet CDN / tiles): just go network.
  event.respondWith(fetch(req));
});
