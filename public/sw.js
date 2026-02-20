const CACHE_VERSION = 'v11';
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = `tiles-${CACHE_VERSION}`;
const ACTIVE_CACHES = [APP_SHELL_CACHE, STATIC_CACHE, DATA_CACHE, TILE_CACHE];

const APP_SHELL_URLS = ['/', '/maps', '/admin', '/admin?tab=travel', '/admin?tab=cost'];
const ADMIN_NAVIGATION_FALLBACK_URLS = ['/admin', '/admin?tab=cost', '/admin?tab=travel', '/'];
const ADMIN_COST_NAVIGATION_FALLBACK_URLS = ['/admin?tab=cost', '/admin', '/'];
const ADMIN_TRAVEL_NAVIGATION_FALLBACK_URLS = ['/admin?tab=travel', '/admin', '/'];
const PUBLIC_NAVIGATION_FALLBACK_URLS = ['/maps', '/'];
const DEFAULT_NAVIGATION_FALLBACK_URLS = ['/', '/admin', '/maps'];
const TILE_HOST = 'tile.openstreetmap.org';
const TILE_CACHE_LIMIT = 500;
const TILE_TRIM_MIN_INTERVAL_MS = 60_000;
const CRITICAL_APP_SHELL_URLS = new Set(['/', '/maps', '/admin']);
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
const OFFLINE_TILE_PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
  0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0, 5, 254,
  2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

let tileTrimInFlight = null;
let lastTileTrimAt = 0;

const openCacheSafely = async (cacheName) => {
  try {
    return await caches.open(cacheName);
  } catch (error) {
    console.warn(`[sw] Unable to open cache "${cacheName}".`, error);
    return null;
  }
};

const isHttpRedirectStatus = (status) => status >= 300 && status < 400;
const isTileHost = (hostname) => hostname === TILE_HOST || hostname.endsWith(`.${TILE_HOST}`);

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

const isCacheableTileResponse = (response) => {
  if (!response) {
    return false;
  }

  if (response.type === 'opaque') {
    return true;
  }

  return isCacheableResponse(response);
};

const cloneResponseForCache = async (response) => {
  if (!response.redirected) {
    return response;
  }

  const responseBody = await response.arrayBuffer();
  const responseHeaders = new Headers(response.headers);
  if (response.url) {
    responseHeaders.set('X-Travel-Tracker-Original-Url', response.url);
  }

  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
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

const createOfflineTileResponse = () =>
  new Response(OFFLINE_TILE_PNG_BYTES, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });

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
      try {
        const response = await cache.match(key);
        if (isRedirectResponse(response)) {
          await cache.delete(key);
        }
      } catch (error) {
        console.warn(`[sw] Failed to inspect cached response for ${key.url}.`, error);
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

const scheduleTileCacheTrim = async () => {
  const now = Date.now();

  if (tileTrimInFlight) {
    await tileTrimInFlight;
    return;
  }

  if (now - lastTileTrimAt < TILE_TRIM_MIN_INTERVAL_MS) {
    return;
  }

  lastTileTrimAt = now;
  tileTrimInFlight = trimCache(TILE_CACHE, TILE_CACHE_LIMIT)
    .catch((error) => {
      console.warn('[sw] Failed to trim tile cache.', error);
    })
    .finally(() => {
      tileTrimInFlight = null;
    });

  await tileTrimInFlight;
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
    url.pathname.startsWith('/images/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname === '/manifest.json');

const clearDataCache = async () => {
  const cache = await openCacheSafely(DATA_CACHE);
  if (!cache) {
    return;
  }

  const keys = await cache.keys();
  await Promise.all(keys.map((key) => cache.delete(key)));
};

const dataCachePrefixGroups = [
  {
    matcher: (pathname) =>
      pathname.startsWith('/api/travel-data') || pathname.startsWith('/admin/api/accommodations'),
    prefixes: ['/api/travel-data', '/admin/api/accommodations'],
  },
  {
    matcher: (pathname) => pathname.startsWith('/api/cost-tracking'),
    prefixes: ['/api/cost-tracking', '/api/travel-data', '/admin/api/accommodations'],
  },
];

const invalidateDataCacheForMutation = async (requestUrl) => {
  const cache = await openCacheSafely(DATA_CACHE);
  if (!cache) {
    return;
  }

  const matchingGroup = dataCachePrefixGroups.find((group) => group.matcher(requestUrl.pathname));
  if (!matchingGroup) {
    await clearDataCache();
    return;
  }

  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (key) => {
      let cachedUrl;

      try {
        cachedUrl = new URL(key.url);
      } catch {
        return;
      }

      if (matchingGroup.prefixes.some((prefix) => cachedUrl.pathname.startsWith(prefix))) {
        await cache.delete(key);
      }
    })
  );
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
    if (result.status === 'rejected') {
      if (CRITICAL_APP_SHELL_URLS.has(APP_SHELL_URLS[index])) {
        throw result.reason;
      }

      console.warn(`[sw] Non-critical app shell URL failed to pre-cache: ${APP_SHELL_URLS[index]}.`, result.reason);
    }
  });
};

self.addEventListener('install', (event) => {
  event.waitUntil(preCacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !ACTIVE_CACHES.includes(key)).map((key) => caches.delete(key)))
      )
      .then(() => Promise.all(ACTIVE_CACHES.map((cacheName) => purgeRedirectResponsesFromCache(cacheName))))
      .then(() => scheduleTileCacheTrim())
      .then(() => self.clients.claim())
  );
});

const getCachedNonRedirectResponse = async (cache, request, matchOptions = undefined) => {
  if (!cache) {
    return null;
  }

  const cachedResponse = await cache.match(request, matchOptions);
  if (!cachedResponse || isRedirectResponse(cachedResponse)) {
    return null;
  }

  return cachedResponse;
};

const getNavigationFallbackUrls = (pathname) => {
  if (pathname.startsWith('/admin/cost-tracking')) {
    return ADMIN_COST_NAVIGATION_FALLBACK_URLS;
  }

  if (pathname.startsWith('/admin/edit')) {
    return ADMIN_TRAVEL_NAVIGATION_FALLBACK_URLS;
  }

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

const getNavigationFallbackResponse = async (requestUrl) => {
  const cache = await openCacheSafely(APP_SHELL_CACHE);
  if (!cache) {
    return null;
  }

  for (const fallbackUrl of getNavigationFallbackUrls(requestUrl.pathname)) {
    const fallbackMatchOptions = fallbackUrl.includes('?') ? undefined : { ignoreSearch: true };
    const fallback = await getCachedNonRedirectResponse(cache, fallbackUrl, fallbackMatchOptions);
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

      if (request.mode === 'navigate') {
        const shellFallback = await getNavigationFallbackResponse(new URL(request.url));
        if (shellFallback) {
          return shellFallback;
        }
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
      const shellFallback = await getNavigationFallbackResponse(new URL(request.url));
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

const staleWhileRevalidate = async (event, request, cacheName, { isTileRequest = false } = {}) => {
  const cachePromise = openCacheSafely(cacheName);
  const shouldCacheResponse = isTileRequest ? isCacheableTileResponse : isCacheableResponse;

  const networkPromise = (async () => {
    const cache = await cachePromise;

    try {
      const networkResponse = await fetch(request);
      const response = await toRuntimeSafeResponse(networkResponse);
      if (!response) {
        return null;
      }

      if (cache && shouldCacheResponse(response)) {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn(`[sw] Failed to cache stale-while-revalidate response for ${request.url}.`, error);
        }

        if (isTileRequest) {
          await scheduleTileCacheTrim();
        }
      }

      return response;
    } catch {
      return null;
    }
  })();

  event.waitUntil(
    networkPromise
      .then(() => undefined)
      .catch(() => undefined)
  );

  const cache = await cachePromise;
  const cached = await getCachedNonRedirectResponse(cache, request);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  if (isTileRequest) {
    return createOfflineTileResponse();
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
  const isSameOriginRequest = url.origin === self.location.origin;

  // Never intercept cross-origin requests (except OSM tiles).
  // This prevents the service worker from hijacking navigations to other *.bdamokos.org subdomains.
  if (!isSameOriginRequest && !isTileHost(url.hostname)) {
    return;
  }

  if (isDataRequest(url) && request.method !== 'GET') {
    const networkPromise = fetch(request);

    event.respondWith(networkPromise);
    event.waitUntil(
      networkPromise
        .then(async (response) => {
          if (!response.ok) {
            return;
          }

          await invalidateDataCacheForMutation(url);
        })
        .catch(() => undefined)
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
    event.respondWith(networkFirst(request, APP_SHELL_CACHE, { fallbackToCacheOnHttpError: true }));
    return;
  }

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (isTileHost(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, request, TILE_CACHE, { isTileRequest: true }));
    return;
  }

  if (isNextChunkRequest(url)) {
    event.respondWith(staleWhileRevalidate(event, request, STATIC_CACHE));
    return;
  }

  if (isStaticAssetRequest(url)) {
    event.respondWith(staleWhileRevalidate(event, request, STATIC_CACHE));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
