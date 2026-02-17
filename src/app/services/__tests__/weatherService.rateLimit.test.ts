/** @jest-environment node */

import { weatherServiceTestUtils } from '@/app/services/weatherService';

function createJsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {})
    }
  });
}

describe('weatherService rate limit handling', () => {
  beforeEach(() => {
    weatherServiceTestUtils.resetRateLimitStateForTests();
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    weatherServiceTestUtils.resetRateLimitStateForTests();
    jest.restoreAllMocks();
  });

  it('retries on 429 using Retry-After when provided', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createJsonResponse(429, { error: true }, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true }));
    global.fetch = fetchMock as typeof fetch;

    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const response = await weatherServiceTestUtils.rateLimitedFetch('https://example.test/open-meteo');
    const waits = timeoutSpy.mock.calls
      .map(call => Number(call[1] ?? 0))
      .filter(ms => Number.isFinite(ms) && ms > 0);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits.some(ms => ms >= 2000)).toBe(true);
  });

  it('uses RateLimit-Reset header when Retry-After is absent', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(createJsonResponse(429, { error: true }, { 'RateLimit-Reset': '3' }))
      .mockResolvedValueOnce(createJsonResponse(200, { ok: true }));
    global.fetch = fetchMock as typeof fetch;

    const timeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        handler();
      }
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);

    const response = await weatherServiceTestUtils.rateLimitedFetch('https://example.test/open-meteo');
    const waits = timeoutSpy.mock.calls
      .map(call => Number(call[1] ?? 0))
      .filter(ms => Number.isFinite(ms) && ms > 0);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waits.some(ms => ms >= 3000)).toBe(true);
  });
});
