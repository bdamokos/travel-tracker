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

const loadServiceWorker = (cache: CacheMock, fetchMock: jest.Mock): ListenerMap => {
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
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    },
    fetch: fetchMock,
    Response,
    Request,
    Headers,
    URL,
    Uint8Array,
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

describe('service worker cache privacy', () => {
  it('does not cache responses whose Cache-Control has mixed-case no-store', async () => {
    const cache: CacheMock = {
      match: jest.fn().mockResolvedValue(null),
      put: jest.fn().mockResolvedValue(undefined),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    };
    const fetchMock = jest.fn().mockResolvedValue(new Response('fresh', {
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
});
