/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/weather/[...params]/route';

jest.mock('@/app/services/weatherService', () => {
  const actual = jest.requireActual('@/app/services/weatherService');

  return {
    ...actual,
    weatherService: {
      getWeatherForLocation: jest.fn(),
      getWeatherForDate: jest.fn(),
      getWeatherForecast: jest.fn(),
    },
  };
});

const { weatherService: mockWeatherService } = jest.requireMock('@/app/services/weatherService');

const buildRequest = (path: string, query: string): NextRequest =>
  new NextRequest(`http://localhost/api/weather/${path}?${query}`);

describe('weather API validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['invalid latitude', 'location', 'lat=91&lon=19&start=2026-01-01&end=2026-01-02'],
    ['partial longitude', 'location', 'lat=47.5&lon=19abc&start=2026-01-01&end=2026-01-02'],
    ['invalid start date', 'location', 'lat=47.5&lon=19&start=2026-02-30&end=2026-03-01'],
    ['reversed location range', 'location', 'lat=47.5&lon=19&start=2026-03-02&end=2026-03-01'],
    ['too-long location range', 'location', 'lat=47.5&lon=19&start=2026-01-01&end=2027-01-10'],
  ])('rejects %s before calling the weather service', async (_name, path, query) => {
    const response = await GET(buildRequest(path, query), {
      params: Promise.resolve({ params: [path] }),
    });

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(mockWeatherService.getWeatherForLocation).not.toHaveBeenCalled();
    expect(mockWeatherService.getWeatherForDate).not.toHaveBeenCalled();
    expect(mockWeatherService.getWeatherForecast).not.toHaveBeenCalled();
  });

  it('rejects malformed date endpoint input before calling the weather service', async () => {
    const response = await GET(buildRequest('date', 'lat=47.5&lon=19&date=2026-01-01T00:00:00Z'), {
      params: Promise.resolve({ params: ['date'] }),
    });

    await expect(response.json()).resolves.toMatchObject({ success: false });
    expect(response.status).toBe(400);
    expect(mockWeatherService.getWeatherForDate).not.toHaveBeenCalled();
  });

  it('rejects malformed forecast day counts before calling the weather service', async () => {
    const response = await GET(buildRequest('forecast', 'lat=47.5&lon=19&days=7abc'), {
      params: Promise.resolve({ params: ['forecast'] }),
    });

    await expect(response.json()).resolves.toMatchObject({ success: false });
    expect(response.status).toBe(400);
    expect(mockWeatherService.getWeatherForecast).not.toHaveBeenCalled();
  });
});
