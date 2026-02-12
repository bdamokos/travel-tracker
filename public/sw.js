const CACHE_VERSION = 'v5';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = `tiles-${CACHE_VERSION}`;
const ACTIVE_CACHES = [APP_SHELL_CACHE, STATIC_CACHE, DATA_CACHE, TILE_CACHE];

const APP_SHELL_URLS = ['/', '/manifest.json'];
const APP_ROUTE_URLS = [
  '/maps',
  '/admin',
  '/admin/edit/new',
  '/admin/cost-tracking/new',
  '/calendars',
  '/demo/accessible-date-picker',
  '/demo/accessible-modal',
  '/demo/ynab-import-form'
];
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_CACHE_LIMIT = 500;
const MAX_DYNAMIC_PRECACHE_ROUTES = 200;
const CRITICAL_APP_SHELL_URLS = new Set(['/']);
const OFFLINE_NAVIGATION_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Offline</title>
  </head>
  <body>
    <p>You're offline, and this page is not cached yet.</p>
  </body>
</html>`;

const isRedirectResponse = (response) => {
  if (!response) {
    return false;
  }

  if (response.type === 'opaqueredirect') {
    return true;
  }

  if (response.redirected) {
    return true;
  }

  return response.status >= 300 && response.status < 400;
};

const isCacheableResponse = (response) => {
  if (!response || !response.ok) {
    return false;
  }

  if (response.type !== 'basic' && response.type !== 'cors') {
    return false;
  }

  const cacheControl = response.headers.get('Cache-Control') || '';
  return !cacheControl.includes('no-store');
};

const trimCache = async (cacheName, maxItems) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const itemsToDelete = keys.length - maxItems;

  if (itemsToDelete <= 0) {
    return;
  }

  await Promise.all(keys.slice(0, itemsToDelete).map((key) => cache.delete(key)));
};

const isApiRequest = (url) => url.origin === self.location.origin && url.pathname.startsWith('/api/');
const isStaticAssetRequest = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/manifest.json');

const clearDataCache = async () => {
  const cache = await caches.open(DATA_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map((key) => cache.delete(key)));
};

const preCacheAppShell = async () => {
  const cache = await caches.open(APP_SHELL_CACHE);
  const preCacheResults = await Promise.allSettled(
    APP_SHELL_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!isCacheableResponse(response) || isRedirectResponse(response)) {
        throw new Error(`Unable to pre-cache app shell URL: ${url}`);
      }

      await cache.put(url, response.clone());
    })
  );

  preCacheResults.forEach((result, index) => {
    if (result.status === 'rejected' && CRITICAL_APP_SHELL_URLS.has(APP_SHELL_URLS[index])) {
      throw result.reason;
    }
  });
};

const preCacheRoutes = async () => {
  const cache = await caches.open(APP_SHELL_CACHE);
  await Promise.allSettled(
    APP_ROUTE_URLS.map(async (url) => {
      const response = await fetch(url);
      if (!isCacheableResponse(response) || isRedirectResponse(response)) {
        return;
      }

      await cache.put(url, response.clone());
    })
  );
};

const preCacheKnownDynamicRoutes = async () => {
  const cache = await caches.open(APP_SHELL_CACHE);
  const routeUrls = new Set();
  const addRouteUrl = (url) => {
    if (routeUrls.size >= MAX_DYNAMIC_PRECACHE_ROUTES) {
      return;
    }

    routeUrls.add(url);
  };

  try {
    const tripsResponse = await fetch('/api/travel-data/list', { cache: 'no-store' });
    if (tripsResponse.ok) {
      const trips = await tripsResponse.json();
      if (Array.isArray(trips)) {
        trips.forEach((trip) => {
          if (!trip || typeof trip.id !== 'string' || trip.id.length === 0) {
            return;
          }

          addRouteUrl(`/map/${trip.id}`);
          addRouteUrl(`/embed/${trip.id}`);
          addRouteUrl(`/calendars/${trip.id}`);
          addRouteUrl(`/admin/edit/${trip.id}`);
        });
      }
    }
  } catch {
    // Best effort. Ignore offline/authorization errors during pre-cache.
  }

  try {
    const costResponse = await fetch('/api/cost-tracking/list', { cache: 'no-store' });
    if (costResponse.ok) {
      const costEntries = await costResponse.json();
      if (Array.isArray(costEntries)) {
        costEntries.forEach((entry) => {
          if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
            return;
          }
          addRouteUrl(`/admin/cost-tracking/${entry.id}`);
        });
      }
    }
  } catch {
    // Best effort. Ignore offline/authorization errors during pre-cache.
  }

  if (routeUrls.size === 0) {
    return;
  }

  await Promise.allSettled(
    Array.from(routeUrls).map(async (url) => {
      const response = await fetch(url);
      if (!isCacheableResponse(response) || isRedirectResponse(response)) {
        return;
      }

      await cache.put(url, response.clone());
    })
  );
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([preCacheAppShell(), preCacheRoutes(), preCacheKnownDynamicRoutes()]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !ACTIVE_CACHES.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => trimCache(TILE_CACHE, TILE_CACHE_LIMIT))
      .then(() => self.clients.claim())
  );
});

const networkFirst = async (request, cacheName) => {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (isCacheableResponse(response) && !isRedirectResponse(response)) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedRequestMatch = await cache.match(request);
    if (cachedRequestMatch && !isRedirectResponse(cachedRequestMatch)) {
      return cachedRequestMatch;
    }

    if (request.mode === 'navigate') {
      const shellFallback = await cache.match('/');
      if (shellFallback && !isRedirectResponse(shellFallback)) {
        return shellFallback;
      }

      return new Response(OFFLINE_NAVIGATION_HTML, {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Offline and no cached copy is available.', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
};

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(async (response) => {
      if (isCacheableResponse(response) && !isRedirectResponse(response)) {
        await cache.put(request, response.clone());

        if (cacheName === TILE_CACHE) {
          await trimCache(TILE_CACHE, TILE_CACHE_LIMIT);
        }
      } else if (cacheName === DATA_CACHE) {
        await cache.delete(request);
      }

      return response;
    })
    .catch(() => null);

  if (cached && !isRedirectResponse(cached)) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response('Offline and no cached copy is available.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (isApiRequest(url) && request.method !== 'GET') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } finally {
          await clearDataCache();
        }
      })()
    );
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname === TILE_HOST) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
