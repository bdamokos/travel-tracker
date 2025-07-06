const CACHE_NAME = 'travel-tracker-cache-v1';
const TILE_CACHE_NAME = 'travel-tracker-map-tiles-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/_next/static/',
  '/images/'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name !== CACHE_NAME && name !== TILE_CACHE_NAME;
        }).map((name) => {
          return caches.delete(name);
        })
      );
    })
  );
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle map tile requests specifically
  if (url.pathname.includes('/tile/')) {
    event.respondWith(handleMapTileRequest(event.request));
    return;
  }

  // For all other requests, try network first, then cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If we got a valid response, clone it and store in cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(() => {
        // If network request fails, try to serve from cache
        return caches.match(event.request);
      })
  );
});

// Special handling for map tiles
async function handleMapTileRequest(request) {
  // Try to find it in the tile cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // If not in cache, fetch from network
  try {
    const response = await fetch(request);
    
    // Cache the tile if response is valid
    if (response && response.status === 200) {
      const responseToCache = response.clone();
      const cache = await caches.open(TILE_CACHE_NAME);
      cache.put(request, responseToCache);
    }
    
    return response;
  } catch (error) {
    // If both cache and network fail, return a fallback
    return new Response('Map tile not available', { status: 404 });
  }
}

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 