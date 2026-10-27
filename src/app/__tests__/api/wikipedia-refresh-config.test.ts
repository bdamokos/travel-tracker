/**
 * @jest-environment node
 */

import fs from 'fs/promises';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/wikipedia/refresh/route';
import { getDataDir } from '@/app/lib/dataDirectory';
import { listAllTrips, loadUnifiedTripData } from '@/app/lib/unifiedDataService';
import { wikipediaService } from '@/app/services/wikipediaService';

jest.mock('fs/promises', () => ({
  __esModule: true,
  default: { readFile: jest.fn(), mkdir: jest.fn(), writeFile: jest.fn() },
}));
jest.mock('@/app/lib/dataDirectory', () => ({ getDataDir: jest.fn() }));
jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn() }));
jest.mock('@/app/lib/unifiedDataService', () => ({
  listAllTrips: jest.fn(), loadUnifiedTripData: jest.fn(),
}));
jest.mock('@/app/services/wikipediaService', () => ({
  wikipediaService: { fetchLocationData: jest.fn(), listCachedFiles: jest.fn() },
}));

const { isAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const mockFs = jest.mocked(fs);
const mockTrips = jest.mocked(listAllTrips);
const mockTrip = jest.mocked(loadUnifiedTripData);
const mockFetch = jest.mocked(wikipediaService.fetchLocationData);

function request(body?: string): NextRequest {
  return new NextRequest('https://admin.example.test/api/wikipedia/refresh', {
    method: 'POST', body,
  });
}

function seedLocations(count: number): void {
  mockTrips.mockResolvedValue([{ id: 'synthetic-trip' }] as Awaited<ReturnType<typeof listAllTrips>>);
  mockTrip.mockResolvedValue({
    travelData: { days: [{ locations: Array.from({ length: count }, (_, i) => ({
      id: `location-${i}`, name: `Synthetic ${i}`, coordinates: [i, 0],
    })) }] },
  } as Awaited<ReturnType<typeof loadUnifiedTripData>>);
}

describe('Wikipedia refresh configuration', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    isAdminDomain.mockResolvedValue(true);
    jest.mocked(getDataDir).mockReturnValue('/tmp/travel-tracker-synthetic');
    mockFs.readFile.mockRejectedValue(new Error('No synthetic metadata'));
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockTrips.mockResolvedValue([]);
    mockTrip.mockResolvedValue(null);
    mockFetch.mockResolvedValue(null);
    jest.mocked(wikipediaService.listCachedFiles).mockResolvedValue([]);
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function expectNoWork(): void {
    expect(getDataDir).not.toHaveBeenCalled();
    expect(mockFs.readFile).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    expect(mockTrips).not.toHaveBeenCalled();
    expect(mockTrip).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(wikipediaService.listCachedFiles).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  }

  it('rejects zero batch size promptly with nonempty locations and no scheduled work', async () => {
    seedLocations(1);
    let response: Awaited<ReturnType<typeof POST>> | undefined;
    void POST(request('{"config":{"batchSize":0}}')).then(result => { response = result; });
    // Bound the reproduction: the vulnerable handler schedules its next empty batch forever.
    await jest.advanceTimersByTimeAsync(1);
    expect(response?.status).toBe(400);
    expectNoWork();
  });

  const fields = ['batchSize', 'delayBetweenRequests', 'maxRetries', 'timeoutMs'];
  const invalidValues = [-1, 0.5, '2', null, false, true, [], {}, Number.MAX_VALUE];
  it.each(fields.flatMap(field => invalidValues.map(value => ({ field, value }))))(
    'rejects $field=$value before metadata or trip access', async ({ field, value }) => {
      const response = await POST(request(JSON.stringify({ config: { [field]: value } })));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ success: false, error: expect.any(String) });
      expectNoWork();
    }
  );

  it.each(fields.flatMap(field => ['1e309', '-1e309'].map(value => ({ field, value }))))(
    'rejects nonfinite JSON numbers for $field ($value)', async ({ field, value }) => {
      const response = await POST(request(`{"config":{"${field}":${value}}}`));
      expect(response.status).toBe(400);
      expectNoWork();
    }
  );

  it.each([
    { batchSize: 0 }, { batchSize: 21 }, { timeoutMs: 0 }, { timeoutMs: 30001 },
    { delayBetweenRequests: 30001 }, { maxRetries: 4 },
  ])('rejects out-of-range overrides %j', async config => {
    const response = await POST(request(JSON.stringify({ config })));
    expect(response.status).toBe(400);
    expectNoWork();
  });

  it.each(['null', '[]', 'false', '2', '"text"', '{"config":null}', '{"config":[]}',
    '{"config":false}', '{"config":"text"}', '{', '{"config":{"batchSize":NaN}}'])(
    'rejects malformed body/config %s', async body => {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
      expectNoWork();
    }
  );

  it.each([undefined, '{}', '{"config":{}}', '{"config":{"maxRetries":0}}'])(
    'preserves defaults and partial overrides for %s', async body => {
      seedLocations(21);
      const timerSpy = jest.spyOn(global, 'setTimeout');
      const pending = POST(request(body));
      await jest.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(20);
      expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      await jest.advanceTimersByTimeAsync(100);
      const response = await pending;
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(21);
      expect(await response.json()).toMatchObject({ success: true, summary: {
        totalLocations: 21, processed: 21, notFound: 21, failed: 0,
      } });
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    { batchSize: 1, delayBetweenRequests: 0, maxRetries: 0, timeoutMs: 1 },
    { batchSize: 20, delayBetweenRequests: 30000, maxRetries: 3, timeoutMs: 30000 },
  ])('accepts inclusive bounds %j', async config => {
    seedLocations(2);
    const pending = POST(request(JSON.stringify({ config })));
    await jest.advanceTimersByTimeAsync(0);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await response.json()).toMatchObject({ summary: { processed: 2 } });
  });

  it('uses bounded retry count and delay overrides', async () => {
    seedLocations(1);
    mockFetch.mockRejectedValue(new Error('Synthetic failure'));
    const pending = POST(request(JSON.stringify({ config: {
      batchSize: 1, maxRetries: 2, delayBetweenRequests: 5,
    } })));
    await jest.advanceTimersByTimeAsync(15);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(await response.json()).toMatchObject({ summary: { processed: 1, failed: 1 } });
  });

  it('uses a valid timeout override without retrying a timed-out location', async () => {
    seedLocations(1);
    mockFetch.mockReturnValue(new Promise(() => {}));
    const pending = POST(request('{"config":{"timeoutMs":10}}'));
    await jest.advanceTimersByTimeAsync(10);
    const response = await pending;
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await response.json()).toMatchObject({ summary: {
      processed: 1, failed: 1, errors: [{ error: 'Timeout' }],
    } });
  });

  it('keeps the admin guard ahead of parsing and validation', async () => {
    isAdminDomain.mockResolvedValue(false);
    const input = request('{');
    const parseSpy = jest.spyOn(input, 'text');
    expect((await POST(input)).status).toBe(403);
    expect(parseSpy).not.toHaveBeenCalled();
    expectNoWork();
  });
});
