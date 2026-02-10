const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = `tiles-${CACHE_VERSION}`;

const APP_SHELL_URLS = ['/', '/maps', '/manifest.json'];
const DATA_PATHS = ['/api/travel-data', '/api/cost-tracking'];
const TILE_HOST = 'tile.openstreetmap.org';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_SHELL_CACHE, STATIC_CACHE, DATA_CACHE, TILE_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === 'navigate') {
      return cache.match('/');
    }

    throw new Error('Network unavailable and no cache entry found.');
  }
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
    void networkPromise;
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  throw new Error('Network unavailable and no cache entry found.');
};

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (url.origin === self.location.origin && DATA_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (url.hostname === TILE_HOST) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  if (url.origin === self.location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-') || url.pathname === '/manifest.json')) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
