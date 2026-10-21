const CACHE_NAME = 'dorfflohmarkt-v92';
const APP_FILES = [
  './',
  './index.html',
  './style.css?update-notice=1',
  './app.js?update-notice=1',
  './routing-client.js',
  './supabase-config.js',
  './geocoding-config.js',
  './geocoding-client.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './marker.png',
  './marker-favorite.svg',
  './marker-food.svg',
  './ovd-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) =>
    cache.addAll(APP_FILES.map(path => new Request(path, { cache: 'reload' })))));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_APP_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('dorfflohmarkt-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/supabase-config.js') || url.pathname.endsWith('/geocoding-config.js')) return;

  if (request.mode === 'navigate') {
    const rootPath = new URL('./', self.location.href).pathname;
    if (url.pathname !== rootPath && url.pathname !== rootPath + 'index.html') return;
    // Keep HTML and scripts from the same installed release while an update waits.
    event.respondWith(caches.open(CACHE_NAME).then(async cache =>
      (await cache.match('./index.html')) || fetch(request)));
    return;
  }

  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(request)).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
