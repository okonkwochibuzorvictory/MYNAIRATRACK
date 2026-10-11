/* MYNAIRATRACK service worker — offline app shell, network-first API. */

const VERSION = 'mynairatrack-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  // Never cache API traffic: it lives on a different origin (VITE_API_URL)
  // and same-origin /api calls must always be fresh.
  return url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Only handle same-origin requests. Cross-origin (API, fonts, CDN) passes through.
  if (url.origin !== self.location.origin) return;

  // API: network only.
  if (isApiRequest(url)) return;

  // Navigations (hash-routed SPA): network-first, fall back to cached shell, then index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => {
            if (cached) return cached;
            return new Response('Offline — MYNAIRATRACK needs a connection for this page.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' },
            });
          }),
        ),
    );
    return;
  }

  // Static assets (JS/CSS/img/icons/manifest): stale-while-revalidate.
  event.respondWith(
    caches.match(request, { ignoreSearch: false }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.status === 200 || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
