const CACHE_VERSION = 'v9';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = `tiles-${CACHE_VERSION}`;
const ACTIVE_CACHES = [APP_SHELL_CACHE, STATIC_CACHE, DATA_CACHE, TILE_CACHE];

const APP_SHELL_URLS = ['/maps', '/admin', '/admin?tab=travel', '/admin?tab=cost', '/manifest.json'];
const ADMIN_NAVIGATION_FALLBACK_URLS = ['/admin', '/admin?tab=travel', '/admin?tab=cost', '/'];
const PUBLIC_NAVIGATION_FALLBACK_URLS = ['/maps', '/'];
const DEFAULT_NAVIGATION_FALLBACK_URLS = ['/', '/admin', '/maps'];
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_CACHE_LIMIT = 500;
const CRITICAL_APP_SHELL_URLS = new Set(['/maps', '/admin']);
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
const MAX_PRECACHE_REDIRECTS = 3;
const PRECACHE_FETCH_TIMEOUT_MS = 10_000;
const CACHE_WARMUP_HEADER = 'x-travel-tracker-precache';

const isHttpRedirectStatus = (status) => status >= 300 && status < 400;

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

  return isHttpRedirectStatus(response.status);
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

const cloneResponseForCache = async (response) => {
  if (!response.redirected) {
    return response;
  }

  const responseBody = await response.arrayBuffer();
  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
};

const toRuntimeSafeResponse = async (response) => {
  if (!response) {
    return null;
  }

  if (response.type === 'opaqueredirect' || isHttpRedirectStatus(response.status)) {
    return null;
  }

  if (response.redirected) {
    return cloneResponseForCache(response);
  }

  return response;
};

const fetchWithTimeout = async (input, init = {}, timeoutMs = PRECACHE_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const purgeRedirectResponsesFromCache = async (cacheName) => {
  const cache = await openCacheSafely(cacheName);
  if (!cache) {
    return;
  }

  const keys = await cache.keys();

  await Promise.all(
    keys.map(async (key) => {
      const response = await cache.match(key);
      if (isRedirectResponse(response)) {
        await cache.delete(key);
      }
    })
  );
};
const trimCache = async (cacheName, maxItems) => {
  const cache = await openCacheSafely(cacheName);
  if (!cache) {
    return;
  }

  const keys = await cache.keys();
  const itemsToDelete = keys.length - maxItems;

  if (itemsToDelete <= 0) {
    return;
  }

  await Promise.all(keys.slice(0, itemsToDelete).map((key) => cache.delete(key)));
};

const isDataRequest = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/'));
const isAppRouteRequest = (url) =>
  url.origin === self.location.origin &&
  !isDataRequest(url) &&
  !url.pathname.startsWith('/_next/') &&
  !url.pathname.startsWith('/icon-') &&
  url.pathname !== '/manifest.json';
const isNextChunkRequest = (url) =>
  url.origin === self.location.origin && url.pathname.startsWith('/_next/static/chunks/');
const isStaticAssetRequest = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/manifest.json');

const openCacheSafely = async (cacheName) => {
  try {
    return await caches.open(cacheName);
  } catch (error) {
    console.warn(`[sw] Unable to open cache "${cacheName}".`, error);
    return null;
  }
};

const clearDataCache = async () => {
  const cache = await openCacheSafely(DATA_CACHE);
  if (!cache) {
    return;
  }

  const keys = await cache.keys();
  await Promise.all(keys.map((key) => cache.delete(key)));
};

const resolvePreCacheResponse = async (url) => {
  let requestUrl = new URL(url, self.location.origin).toString();

  for (let redirectCount = 0; redirectCount <= MAX_PRECACHE_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(requestUrl, { redirect: 'manual' });
    if (isCacheableResponse(response) && !isRedirectResponse(response)) {
      return response;
    }

    if (response.type === 'opaqueredirect') {
      const followedResponse = await fetchWithTimeout(requestUrl, { redirect: 'follow' });
      if (!isCacheableResponse(followedResponse)) {
        break;
      }

      const finalUrl = new URL(followedResponse.url || requestUrl, requestUrl);
      if (finalUrl.origin !== self.location.origin) {
        break;
      }

      return cloneResponseForCache(followedResponse);
    }

    if (!isHttpRedirectStatus(response.status)) {
      break;
    }

    const location = response.headers.get('Location');
    if (!location) {
      break;
    }

    const nextUrl = new URL(location, requestUrl);
    if (nextUrl.origin !== self.location.origin) {
      break;
    }

    requestUrl = nextUrl.toString();
  }

  throw new Error(`Unable to resolve pre-cache URL: ${url}`);
};

const preCacheAppShell = async () => {
  const cache = await openCacheSafely(APP_SHELL_CACHE);
  if (!cache) {
    return;
  }

  const preCacheResults = await Promise.allSettled(
    APP_SHELL_URLS.map(async (url) => {
      const response = await resolvePreCacheResponse(url);
      await cache.put(url, response.clone());
    })
  );

  preCacheResults.forEach((result, index) => {
    if (result.status === 'rejected' && CRITICAL_APP_SHELL_URLS.has(APP_SHELL_URLS[index])) {
      throw result.reason;
    }
  });
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    preCacheAppShell()
      .catch((error) => {
        console.warn('[sw] App shell pre-cache failed. Continuing without blocking activation.', error);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !ACTIVE_CACHES.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => Promise.all(ACTIVE_CACHES.map((cacheName) => purgeRedirectResponsesFromCache(cacheName))))
      .then(() => trimCache(TILE_CACHE, TILE_CACHE_LIMIT))
      .then(() => self.clients.claim())
  );
});

const getCachedNonRedirectResponse = async (cache, request) => {
  if (!cache) {
    return null;
  }

  const cachedResponse = await cache.match(request);
  if (!cachedResponse || isRedirectResponse(cachedResponse)) {
    return null;
  }

  return cachedResponse;
};

const getNavigationFallbackUrls = (pathname) => {
  if (pathname.startsWith('/admin')) {
    return ADMIN_NAVIGATION_FALLBACK_URLS;
  }

  if (
    pathname.startsWith('/maps') ||
    pathname.startsWith('/map/') ||
    pathname.startsWith('/embed/') ||
    pathname.startsWith('/calendars')
  ) {
    return PUBLIC_NAVIGATION_FALLBACK_URLS;
  }

  return DEFAULT_NAVIGATION_FALLBACK_URLS;
};

const getNavigationFallbackResponse = async (cache, requestUrl) => {
  if (!cache) {
    return null;
  }

  for (const fallbackUrl of getNavigationFallbackUrls(requestUrl.pathname)) {
    const fallback = await getCachedNonRedirectResponse(cache, fallbackUrl);
    if (fallback) {
      return fallback;
    }
  }

  return null;
};

const networkFirst = async (request, cacheName, { fallbackToCacheOnHttpError = false } = {}) => {
  const cache = await openCacheSafely(cacheName);

  try {
    const networkResponse = await fetch(request);
    const response = await toRuntimeSafeResponse(networkResponse);

    if (!response) {
      throw new Error(`[sw] Redirect response blocked for ${request.url}`);
    }

    if (fallbackToCacheOnHttpError && !response.ok) {
      const cachedHttpFallback = await getCachedNonRedirectResponse(cache, request);
      if (cachedHttpFallback) {
        return cachedHttpFallback;
      }
    }

    if (cache && isCacheableResponse(response)) {
      try {
        await cache.put(request, response.clone());
      } catch (error) {
        console.warn(`[sw] Failed to cache network-first response for ${request.url}.`, error);
      }
    }

    return response;
  } catch {
    const cachedRequestMatch = await getCachedNonRedirectResponse(cache, request);
    if (cachedRequestMatch) {
      return cachedRequestMatch;
    }

    if (request.mode === 'navigate') {
      const shellFallback = await getNavigationFallbackResponse(cache, new URL(request.url));
      if (shellFallback) {
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
  const cache = await openCacheSafely(cacheName);
  const cached = await getCachedNonRedirectResponse(cache, request);

  const networkPromise = fetch(request)
    .then(async (networkResponse) => {
      const response = await toRuntimeSafeResponse(networkResponse);
      if (!response) {
        return null;
      }

      if (cache && isCacheableResponse(response)) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn(`[sw] Failed to cache stale-while-revalidate response for ${request.url}.`, error);
        }

        if (cacheName === TILE_CACHE) {
          await trimCache(TILE_CACHE, TILE_CACHE_LIMIT);
        }
      } else if (cache && cacheName === DATA_CACHE) {
        await cache.delete(request);
      }

      return response;
    })
    .catch(() => null);

  if (cached) {
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
  const isWarmupRequest = request.headers.get(CACHE_WARMUP_HEADER) === '1';

  if (isDataRequest(url) && request.method !== 'GET') {
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

  if (isWarmupRequest && isAppRouteRequest(url)) {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, { fallbackToCacheOnHttpError: true }));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, APP_SHELL_CACHE));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname === TILE_HOST) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE));
    return;
  }

  if (isNextChunkRequest(url)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, { fallbackToCacheOnHttpError: true }));
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
