/** @jest-environment node */

import fs from 'fs';
import path from 'path';
import vm from 'vm';

type ListenerMap = Record<string, (event: unknown) => void>;

type CacheMock = {
  match: jest.Mock;
  put: jest.Mock;
  keys: jest.Mock;
  delete: jest.Mock;
};

const makeRequestLike = (url: string, mode = 'same-origin') => ({
  url,
  method: 'GET',
  mode,
  headers: new Headers()
});

const makeBasicResponse = (body: BodyInit | null, url: string, init: ResponseInit = {}): Response => {
  const response = new Response(body, init);
  Object.defineProperty(response, 'type', { value: 'basic' });
  Object.defineProperty(response, 'url', { value: url });
  return response;
};

const makeRedirectedBasicResponse = (body: BodyInit | null, url: string, init: ResponseInit = {}): Response => {
  const response = makeBasicResponse(body, url, init);
  Object.defineProperty(response, 'redirected', { value: true });
  return response;
};

const loadServiceWorker = (cache: CacheMock, fetchMock: jest.Mock, cacheNames: string[] = [], deleteCache = jest.fn().mockResolvedValue(true), cacheUnavailable = false, cacheByName?: Map<string, CacheMock>): ListenerMap => {
  const listeners: ListenerMap = {};
  const swPath = path.join(process.cwd(), 'public/sw.js');
  const swSource = fs.readFileSync(swPath, 'utf8');

  const context = {
    self: {
      location: { origin: 'https://admin.example.test' },
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners[type] = handler;
      },
      skipWaiting: jest.fn(),
      clients: {
        claim: jest.fn()
      }
    },
    caches: {
      open: cacheUnavailable ? jest.fn().mockRejectedValue(new Error('CacheStorage unavailable')) : jest.fn(async (name: string) => cacheByName?.get(name) ?? cache),
      keys: jest.fn().mockResolvedValue(cacheNames),
      delete: deleteCache
    },
    fetch: fetchMock,
    Response,
    Request,
    Headers,
    URL,
    Uint8Array,
    AbortController,
    setTimeout,
    clearTimeout,
    console
  };

  vm.runInNewContext(swSource, context);
  return listeners;
};

const dispatchFetch = async (listeners: ListenerMap, request: ReturnType<typeof makeRequestLike>): Promise<Response> => {
  const respondWith = jest.fn();
  const waitUntil = jest.fn();

  listeners.fetch({
    request,
    respondWith,
    waitUntil
  });

  expect(respondWith).toHaveBeenCalledTimes(1);
  return await respondWith.mock.calls[0][0];
};

const dispatchInstall = async (listeners: ListenerMap): Promise<void> => {
  const waitUntil = jest.fn();

  listeners.install({
    waitUntil
  });

  expect(waitUntil).toHaveBeenCalledTimes(1);
  await waitUntil.mock.calls[0][0];
};

describe('service worker cache privacy', () => {
  it('does not cache responses whose Cache-Control has mixed-case no-store', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(makeBasicResponse('fresh', 'https://admin.example.test/api/weather/Budapest', {
      status: 200,
      headers: { 'Cache-Control': 'Private, No-Store' }
    }));
    const listeners = loadServiceWorker(cache, fetchMock);

    const response = await dispatchFetch(
      listeners,
      makeRequestLike('https://admin.example.test/api/weather/Budapest')
    );

    expect(await response.text()).toBe('fresh');
    expect(cache.put).not.toHaveBeenCalled();
  });

  const privateUrls = [
    '/api/shadow-trips',
    '/api/shadow-trips/trip-1',
    '/api/shadow-trips/trip-1?view=planning',
    '/api/shadow-trips/',
    '/api/backups',
    '/api/backups?type=trip&q=synthetic',
    '/api/backups/backup-1',
    '/admin/api/accommodations?tripId=fixture',
    '/admin/api/accommodations/acc-1?tripId=fixture',
    '/admin/api/accommodations/?tripId=fixture&locationId=location-1',
    '/api/travel-data/fixture/expense-links',
    '/api/travel-data/fixture/expense-links/?view=all',
    '/api/travel-data/expense-links/move',
    '/api/cost-tracking?id=fixture',
    '/admin/%61pi/accommodations?tripId=fixture',
    '/%61pi/travel-data/fixture/expense-links',
    '/api/%74ravel-data/fixture/%65xpense-links',
  ];

  describe.each(['normal', 'navigate', 'warmup'])('%s private requests', (kind) => {
    it.each(privateUrls)('never stores or replays requests for %s', async (pathname) => {
      const url = `https://admin.example.test${pathname}`;
      const secret = '{"syntheticSecret":"fixture-only"}';
      const cache: CacheMock = {
        match: jest.fn().mockResolvedValue(makeBasicResponse(secret, url)),
        put: jest.fn().mockResolvedValue(undefined),
        keys: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(true)
      };
      const fetchMock = jest.fn()
        .mockResolvedValueOnce(makeBasicResponse(secret, url))
        .mockResolvedValueOnce(makeBasicResponse('unauthorized', url, { status: 401 }))
        .mockResolvedValueOnce(makeBasicResponse('unavailable', url, { status: 500 }))
        .mockResolvedValueOnce(makeBasicResponse('forbidden', url, { status: 403 }))
        .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/login' } }))
        .mockRejectedValueOnce(new Error('offline'));
      const listeners = loadServiceWorker(cache, fetchMock);
      const request = makeRequestLike(url, kind === 'navigate' ? 'navigate' : 'same-origin');
      if (kind === 'warmup') request.headers.set('x-travel-tracker-precache', '1');

      expect(await (await dispatchFetch(listeners, request)).text()).toBe(secret);
      expect((await dispatchFetch(listeners, request)).status).toBe(401);
      expect((await dispatchFetch(listeners, request)).status).toBe(500);
      expect((await dispatchFetch(listeners, request)).status).toBe(403);
      const redirect = await dispatchFetch(listeners, request);
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('Location')).toBe('/login');
      const offline = await dispatchFetch(listeners, request);
      expect(offline.status).toBe(503);
      expect(await offline.text()).not.toContain('fixture-only');
      expect(offline.headers.get('Cache-Control')).toBe('no-store');
      expect(cache.match).not.toHaveBeenCalled();
      expect(cache.put).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(request, { cache: 'no-store' });
    });
  });

  it.each(['/api/weather/Budapest', '/api/backups-public', '/api/shadow-trips-public'])(
    'preserves cacheable normal fetches for %s', async (pathname) => {
      const url = `https://admin.example.test${pathname}`;
      const cache: CacheMock = {
        match: jest.fn().mockResolvedValue(makeBasicResponse('cached public', url)),
        put: jest.fn().mockResolvedValue(undefined),
        keys: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(true)
      };
      const fetchMock = jest.fn()
        .mockResolvedValueOnce(makeBasicResponse('fresh public', url))
        .mockRejectedValueOnce(new Error('offline'));
      const listeners = loadServiceWorker(cache, fetchMock);
      const request = makeRequestLike(url);
      expect(await (await dispatchFetch(listeners, request)).text()).toBe('fresh public');
      expect(cache.put).toHaveBeenCalledTimes(1);
      expect(await (await dispatchFetch(listeners, request)).text()).toBe('cached public');
    }
  );

  it('evicts old cache versions and private copies from every surviving cache', async () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    const version = source.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
    expect(version).not.toBe('v13');
    expect(version).not.toBe('v14');
    const activeCaches = ['app-shell', 'static', 'data', 'tiles'].map((prefix) => `${prefix}-${version}`);
    const privateKeys = privateUrls.map((pathname) => new Request(`https://admin.example.test${pathname}`));
    const publicKey = new Request('https://admin.example.test/api/weather/Budapest');
    const foreignKey = new Request('https://other.example.test/api/backups');
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(new Response('synthetic cached response')),
      put: jest.fn(),
      keys: jest.fn().mockResolvedValue([...privateKeys, publicKey, foreignKey]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const deleteCache = jest.fn().mockResolvedValue(true);
    const listeners = loadServiceWorker(cache, jest.fn(), [...activeCaches, 'data-v13', 'app-shell-v12', 'app-shell-v14'], deleteCache);
    const waitUntil = jest.fn();
    listeners.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(deleteCache.mock.calls).toEqual([['data-v13'], ['app-shell-v12'], ['app-shell-v14']]);
    for (const key of privateKeys) {
      expect(cache.delete.mock.calls.filter(([deleted]) => deleted === key)).toHaveLength(activeCaches.length);
    }
    expect(cache.delete.mock.calls.some(([deleted]) => deleted === publicKey)).toBe(false);
    expect(cache.delete.mock.calls.some(([deleted]) => deleted === foreignKey)).toBe(false);
  });

  it('removes stale private bodies from distinct active caches and cannot repopulate them', async () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'public/sw.js'), 'utf8');
    const version = source.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
    const names = ['app-shell', 'data', 'static', 'tiles'].map((prefix) => `${prefix}-${version}`);
    const publicUrl = 'https://admin.example.test/maps';
    const privateUrl = 'https://admin.example.test/admin/api/accommodations?tripId=fixture';
    const entriesByName = new Map(names.map((name) => [name, new Map([
      ...privateUrls.map((pathname) => [`https://admin.example.test${pathname}`, 'synthetic private body']),
      [publicUrl, 'public shell']
    ])]));
    const cacheByName = new Map(names.map((name) => {
      const entries = entriesByName.get(name)!;
      return [name, {
        keys: jest.fn(async () => [...entries.keys()].map((url) => new Request(url))),
        match: jest.fn(async (request: Request) => {
          const body = entries.get(request.url);
          return body ? makeBasicResponse(body, request.url) : undefined;
        }),
        put: jest.fn(async (request: Request, response: Response) => { entries.set(request.url, await response.text()); }),
        delete: jest.fn(async (request: Request) => entries.delete(request.url))
      }];
    }));
    const fetchMock = jest.fn().mockResolvedValueOnce(makeBasicResponse('fresh private', privateUrl))
      .mockRejectedValue(new Error('offline'));
    const listeners = loadServiceWorker(cacheByName.get(names[0])!, fetchMock, names, jest.fn(), false, cacheByName);
    for (let activation = 0; activation < 2; activation += 1) {
      const waitUntil = jest.fn();
      listeners.activate({ waitUntil });
      await waitUntil.mock.calls[0][0];
      for (const entries of entriesByName.values()) expect([...entries]).toEqual([[publicUrl, 'public shell']]);
    }
    expect(await (await dispatchFetch(listeners, makeRequestLike(privateUrl, 'navigate'))).text()).toBe('fresh private');
    const offline = await dispatchFetch(listeners, makeRequestLike(privateUrl, 'navigate'));
    expect(offline.status).toBe(503);
    expect(await offline.text()).not.toContain('private');
    for (const cache of cacheByName.values()) expect(cache.put).not.toHaveBeenCalled();
  });

  it.each(['navigate', 'normal', 'warmup'])('handles private %s requests without CacheStorage', async (mode) => {
    const cache = { match: jest.fn(), put: jest.fn(), keys: jest.fn(), delete: jest.fn() };
    for (const pathname of ['/admin/api/accommodations?tripId=fixture', '/api/travel-data/fixture/expense-links', '/api/shadow-trips/fixture', '/api/backups']) {
      const url = `https://admin.example.test${pathname}`;
      const fetchMock = jest.fn()
        .mockResolvedValueOnce(makeBasicResponse('online fixture', url))
        .mockRejectedValueOnce(new Error('offline'));
      const listeners = loadServiceWorker(cache, fetchMock, [], jest.fn(), true);
      const request = makeRequestLike(url, mode === 'navigate' ? mode : 'same-origin');
      if (mode === 'warmup') request.headers.set('x-travel-tracker-precache', '1');
      expect(await (await dispatchFetch(listeners, request)).text()).toBe('online fixture');
      const offline = await dispatchFetch(listeners, request);
      expect(offline.status).toBe(503);
      expect(offline.headers.get('Cache-Control')).toBe('no-store');
      expect(cache.match).not.toHaveBeenCalled();
      expect(cache.put).not.toHaveBeenCalled();
    }
  });

  it.each(['/maps', '/admin?tab=cost', '/admin/edit/fixture'])('preserves navigation and warmup caching for %s', async (pathname) => {
    for (const mode of ['navigate', 'same-origin']) {
      const url = `https://admin.example.test${pathname}`;
      const cache = {
        match: jest.fn().mockResolvedValue(makeBasicResponse('cached shell', url)),
        put: jest.fn(), keys: jest.fn().mockResolvedValue([]), delete: jest.fn()
      };
      const fetchMock = jest.fn().mockResolvedValueOnce(makeBasicResponse('fresh shell', url))
        .mockRejectedValueOnce(new Error('offline'));
      const listeners = loadServiceWorker(cache, fetchMock);
      const request = makeRequestLike(url, mode);
      if (mode !== 'navigate') request.headers.set('x-travel-tracker-precache', '1');
      expect(await (await dispatchFetch(listeners, request)).text()).toBe('fresh shell');
      expect(cache.put).toHaveBeenCalledTimes(1);
      expect(await (await dispatchFetch(listeners, request)).text()).toBe('cached shell');
    }
  });

  it('treats private admin data APIs as network-only even when cached data exists', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(new Response('cached secret', { status: 200 })),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
    const listeners = loadServiceWorker(cache, fetchMock);

    const response = await dispatchFetch(
      listeners,
      makeRequestLike('https://admin.example.test/api/cost-tracking?id=cost-trip-1')
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('forbidden');
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('treats travel-data APIs as network-only', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(new Response('cached trip data', { status: 200 })),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(new Response('fresh trip data', { status: 200 }));
    const listeners = loadServiceWorker(cache, fetchMock);

    const response = await dispatchFetch(
      listeners,
      makeRequestLike('https://admin.example.test/api/travel-data?id=trip-1')
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('fresh trip data');
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('returns private API redirect responses without converting them to offline errors', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(new Response('cached secret', { status: 200 })),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: '/login' }
    }));
    const listeners = loadServiceWorker(cache, fetchMock);

    const response = await dispatchFetch(
      listeners,
      makeRequestLike('https://admin.example.test/api/cost-tracking?id=cost-trip-1')
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('does not serve cached admin shells after authorization failures', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(new Response('cached admin shell', { status: 200 })),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
    const listeners = loadServiceWorker(cache, fetchMock);

    const response = await dispatchFetch(
      listeners,
      makeRequestLike('https://admin.example.test/admin', 'navigate')
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe('forbidden');
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it.each(['manual', 'opaque'])('rejects private app-shell precache redirect destinations (%s)', async (kind) => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cache = { match: jest.fn(), put: jest.fn(), keys: jest.fn().mockResolvedValue([]), delete: jest.fn() };
    const privateUrl = 'https://admin.example.test/admin/api/accommodations?tripId=fixture';
    const fetchMock = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'https://admin.example.test/') {
        if (kind === 'manual') return Promise.resolve(new Response(null, { status: 302, headers: { Location: privateUrl } }));
        if (init?.redirect === 'manual') return Promise.resolve({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() });
        return Promise.resolve(makeRedirectedBasicResponse('synthetic private body', privateUrl));
      }
      return Promise.resolve(makeBasicResponse('public shell', url));
    });
    const listeners = loadServiceWorker(cache, fetchMock);
    try {
      await expect(dispatchInstall(listeners)).rejects.toThrow('Critical app shell pre-cache failures');
      expect(cache.put.mock.calls.some(([key]) => key === '/')).toBe(false);
      expect(fetchMock.mock.calls.some(([url]) => url === privateUrl)).toBe(false);
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('pre-caches root shell entries that resolve through same-origin Location redirects', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === 'https://admin.example.test/') {
        return Promise.resolve(new Response(null, {
          status: 308,
          headers: { Location: '/admin' }
        }));
      }

      return Promise.resolve(makeBasicResponse(`shell ${url}`, url, { status: 200 }));
    });
    const listeners = loadServiceWorker(cache, fetchMock);

    await dispatchInstall(listeners);

    const rootPutCall = cache.put.mock.calls.find(([url]) => url === '/');
    expect(rootPutCall).toBeDefined();
    const cachedRootResponse = rootPutCall?.[1] as Response;
    expect(cachedRootResponse.redirected).toBe(false);
    expect(await cachedRootResponse.text()).toBe('shell https://admin.example.test/admin');
  });

  it('pre-caches root shell entries when manual redirects are opaque but followed fetches stay same-origin', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === 'https://admin.example.test/' && init?.redirect === 'manual') {
        return Promise.resolve({
          ok: false,
          status: 0,
          type: 'opaqueredirect',
          redirected: false,
          headers: new Headers()
        });
      }

      if (url === 'https://admin.example.test/' && init?.redirect === 'follow') {
        return Promise.resolve(makeRedirectedBasicResponse('followed admin shell', 'https://admin.example.test/admin', {
          status: 200
        }));
      }

      return Promise.resolve(makeBasicResponse(`shell ${url}`, url, { status: 200 }));
    });
    const listeners = loadServiceWorker(cache, fetchMock);

    await dispatchInstall(listeners);

    const rootPutCall = cache.put.mock.calls.find(([url]) => url === '/');
    expect(rootPutCall).toBeDefined();
    const cachedRootResponse = rootPutCall?.[1] as Response;
    expect(cachedRootResponse.redirected).toBe(false);
    expect(cachedRootResponse.headers.get('X-Travel-Tracker-Original-Url')).toBe('https://admin.example.test/admin');
    expect(await cachedRootResponse.text()).toBe('followed admin shell');
  });
});
