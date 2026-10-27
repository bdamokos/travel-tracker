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

const loadServiceWorker = (cache: CacheMock, fetchMock: jest.Mock, cacheNames: string[] = [], deleteCache = jest.fn().mockResolvedValue(true)): ListenerMap => {
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
      open: jest.fn().mockResolvedValue(cache),
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
  ];

  it.each(privateUrls)('never stores or replays normal fetches for %s', async (pathname) => {
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
      .mockResolvedValueOnce(makeBasicResponse('forbidden', url, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/login' } }))
      .mockRejectedValueOnce(new Error('offline'));
    const listeners = loadServiceWorker(cache, fetchMock);
    const request = makeRequestLike(url);

    expect(await (await dispatchFetch(listeners, request)).text()).toBe(secret);
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
    const listeners = loadServiceWorker(cache, jest.fn(), [...activeCaches, 'data-v13', 'app-shell-v12'], deleteCache);
    const waitUntil = jest.fn();
    listeners.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(deleteCache.mock.calls).toEqual([['data-v13'], ['app-shell-v12']]);
    for (const key of privateKeys) {
      expect(cache.delete.mock.calls.filter(([deleted]) => deleted === key)).toHaveLength(activeCaches.length);
    }
    expect(cache.delete.mock.calls.some(([deleted]) => deleted === publicKey)).toBe(false);
    expect(cache.delete.mock.calls.some(([deleted]) => deleted === foreignKey)).toBe(false);
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
