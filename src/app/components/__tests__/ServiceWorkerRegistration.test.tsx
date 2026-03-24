/** @jest-environment jsdom */

import { render, waitFor } from '@testing-library/react';
import ServiceWorkerRegistration from '@/app/components/ServiceWorkerRegistration';

jest.mock('@/app/lib/offlineDeltaSync', () => ({
  formatOfflineConflictMessage: jest.fn(() => 'offline conflict'),
  syncOfflineDeltaQueue: jest.fn().mockResolvedValue({
    synced: 0,
    conflicts: 0,
    failed: 0,
    remainingPending: 0,
    remainingConflicts: 0
  })
}));

type MockJsonResponse = {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

const makeJsonResponse = (payload: unknown, status = 200): MockJsonResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
  text: async () => JSON.stringify(payload)
});

describe('ServiceWorkerRegistration', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts offline warmup after the first controllerchange', async () => {
    const serviceWorkerTarget = new EventTarget();
    const registrationTarget = new EventTarget();
    const registration = Object.assign(registrationTarget, {
      waiting: null,
      installing: null,
      update: jest.fn().mockResolvedValue(undefined)
    });
    const mockServiceWorker = Object.assign(serviceWorkerTarget, {
      controller: null as ServiceWorker | null,
      register: jest.fn().mockResolvedValue(registration),
      getRegistrations: jest.fn().mockResolvedValue([])
    });

    Object.defineProperty(global, 'caches', {
      configurable: true,
      value: {
        keys: jest.fn().mockResolvedValue([])
      }
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: global.caches
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: mockServiceWorker
    });

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/sw.js?version-check=')) {
        return {
          ok: true,
          text: async () => "const CACHE_VERSION = 'v13';"
        };
      }

      if (url === '/api/travel-data/list') {
        return makeJsonResponse([{ id: 'trip-1' }]);
      }

      if (url === '/api/cost-tracking/list') {
        return makeJsonResponse([{ id: 'cost-trip-1', tripId: 'trip-1' }]);
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => ''
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(mockServiceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/travel-data/list'))).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/cost-tracking/list'))).toBe(false);

    mockServiceWorker.controller = {} as ServiceWorker;
    serviceWorkerTarget.dispatchEvent(new Event('controllerchange'));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/travel-data/list'))).toBe(true);
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes('/api/cost-tracking/list'))).toBe(true);
    });
  });

  it('warms same-origin Next static assets referenced by warmed route HTML', async () => {
    const serviceWorkerTarget = new EventTarget();
    const registrationTarget = new EventTarget();
    const registration = Object.assign(registrationTarget, {
      waiting: null,
      installing: null,
      update: jest.fn().mockResolvedValue(undefined)
    });
    const mockServiceWorker = Object.assign(serviceWorkerTarget, {
      controller: null as ServiceWorker | null,
      register: jest.fn().mockResolvedValue(registration),
      getRegistrations: jest.fn().mockResolvedValue([])
    });

    Object.defineProperty(global, 'caches', {
      configurable: true,
      value: {
        keys: jest.fn().mockResolvedValue([])
      }
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: global.caches
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: mockServiceWorker
    });

    const warmedAssets = new Set<string>();
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('/sw.js?version-check=')) {
        return {
          ok: true,
          text: async () => "const CACHE_VERSION = 'v13';"
        };
      }

      if (url === '/api/travel-data/list') {
        return makeJsonResponse([{ id: 'trip-1' }]);
      }

      if (url === '/api/cost-tracking/list') {
        return makeJsonResponse([]);
      }

      if (url === '/maps') {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head>
                <link rel="stylesheet" href="/_next/static/css/app.css" />
                <script src="/_next/static/chunks/app.js"></script>
                <script src="https://example.com/_next/static/chunks/external.js"></script>
              </head>
            </html>
          `,
          json: async () => ({})
        };
      }

      if (url.startsWith('http://localhost/_next/static/')) {
        warmedAssets.add(url);
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => ''
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ServiceWorkerRegistration />);

    await waitFor(() => {
      expect(mockServiceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    mockServiceWorker.controller = {} as ServiceWorker;
    serviceWorkerTarget.dispatchEvent(new Event('controllerchange'));

    await waitFor(() => {
      expect(warmedAssets.has('http://localhost/_next/static/css/app.css')).toBe(true);
      expect(warmedAssets.has('http://localhost/_next/static/chunks/app.js')).toBe(true);
    });
  });
});
