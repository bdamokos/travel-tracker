/** @jest-environment node */

import { NextRequest } from 'next/server';

import { GET as getWeather } from '@/app/api/weather/[...params]/route';
import { GET as getWikipedia, PUT as putWikipedia } from '@/app/api/wikipedia/[locationName]/route';

jest.mock('@/app/services/weatherService', () => ({
  ...jest.requireActual('@/app/services/weatherService'),
  weatherService: {
    getWeatherForLocation: jest.fn(),
    getWeatherForDate: jest.fn(),
    getWeatherForecast: jest.fn(),
  },
}));
jest.mock('@/app/services/wikipediaService', () => ({
  wikipediaService: { getCachedData: jest.fn(), getLocationData: jest.fn() },
}));
jest.mock('@/app/lib/server-domains', () => ({ isAdminDomain: jest.fn() }));

const { weatherService } = jest.requireMock('@/app/services/weatherService');
const { wikipediaService } = jest.requireMock('@/app/services/wikipediaService');
const { isAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const wikipediaParams = (): { params: Promise<{ locationName: string }> } => ({
  params: Promise.resolve({ locationName: 'Paris' }),
});

function queryRequest(path: string, lat: string, lon: string): NextRequest {
  const query = new URLSearchParams({ lat, lon, date: '2026-01-01', start: '2026-01-01', days: '1' });
  return new NextRequest(`https://public.example.test/api/${path}?${query}`);
}

describe('coordinate API boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAdminDomain.mockResolvedValue(false);
    weatherService.getWeatherForLocation.mockResolvedValue({ dailyWeather: [] });
    weatherService.getWeatherForDate.mockResolvedValue({});
    weatherService.getWeatherForecast.mockResolvedValue([]);
    wikipediaService.getCachedData.mockResolvedValue({ title: 'Paris' });
    wikipediaService.getLocationData.mockResolvedValue({ title: 'Paris' });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  function expectNoServiceCalls(): void {
    for (const method of Object.values(weatherService)) expect(method).not.toHaveBeenCalled();
    for (const method of Object.values(wikipediaService)) expect(method).not.toHaveBeenCalled();
  }

  describe.each([
    ['oversized near-match', '1'.repeat(4096) + 'x'],
    ['oversized decimal near-match', '.' + '1'.repeat(4096) + 'x'],
    ['oversized numeric coordinate', '0'.repeat(65)],
  ])('%s', (_name, invalid) => {
    it.each(['lat', 'lon'])('rejects %s across all weather branches before service work', async (field) => {
      for (const segment of ['location', 'date', 'forecast', 'unknown']) {
        const response = await getWeather(
          queryRequest(`weather/${segment}`, field === 'lat' ? invalid : '48', field === 'lon' ? invalid : '2'),
          { params: Promise.resolve({ params: [segment] }) }
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
          success: false, error: 'lat and lon must be finite coordinates in valid ranges',
        });
      }
      expectNoServiceCalls();
    });

    it.each(['lat', 'lon'])('rejects public Wikipedia %s before host or cache work', async (field) => {
      const response = await getWikipedia(
        queryRequest('wikipedia/Paris', field === 'lat' ? invalid : '48', field === 'lon' ? invalid : '2'),
        wikipediaParams()
      );
      expect(response.status).toBe(400);
      expect(isAdminDomain).not.toHaveBeenCalled();
      expectNoServiceCalls();
    });

    it.each([0, 1])('rejects admin PUT coordinate %s before mutation work', async (index) => {
      isAdminDomain.mockResolvedValue(true);
      const coordinates: (string | number)[] = [48, 2];
      coordinates[index] = invalid;
      const response = await putWikipedia(new NextRequest('https://admin.example.test/api/wikipedia/Paris', {
        method: 'PUT', body: JSON.stringify({ wikipediaRef: 'Paris', coordinates }),
      }), wikipediaParams());
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        success: false, error: 'coordinates must be finite coordinates in valid ranges',
      });
      expectNoServiceCalls();
    });
  });

  it('passes signed and decimal query coordinates unchanged to weather and public Wikipedia services', async () => {
    for (const segment of ['location', 'date', 'forecast']) {
      const response = await getWeather(queryRequest(`weather/${segment}`, '+48.', '-.5'), {
        params: Promise.resolve({ params: [segment] }),
      });
      expect(response.status).toBe(200);
    }
    expect(weatherService.getWeatherForLocation).toHaveBeenCalledWith(expect.objectContaining({ coordinates: [48, -0.5] }));
    expect(weatherService.getWeatherForDate).toHaveBeenCalledWith([48, -0.5], expect.any(Date));
    expect(weatherService.getWeatherForecast).toHaveBeenCalledWith([48, -0.5], 1);
    const response = await getWikipedia(queryRequest('wikipedia/Paris', '+48.', '-.5'), wikipediaParams());
    expect(response.status).toBe(200);
    expect(wikipediaService.getCachedData).toHaveBeenCalledWith(expect.objectContaining({ coordinates: [48, -0.5] }));
    expect(wikipediaService.getLocationData).not.toHaveBeenCalled();
  });

  it.each([[48, 2], ['+48.', '.5']])('preserves admin PUT numeric/string coordinates %s, %s', async (lat, lon) => {
    isAdminDomain.mockResolvedValue(true);
    const response = await putWikipedia(new NextRequest('https://admin.example.test/api/wikipedia/Paris', {
      method: 'PUT', body: JSON.stringify({ wikipediaRef: 'Paris', coordinates: [lat, lon] }),
    }), wikipediaParams());
    expect(response.status).toBe(200);
    expect(wikipediaService.getLocationData).toHaveBeenCalledWith(
      expect.objectContaining({ coordinates: [Number(lat), Number(lon)] }), true, undefined
    );
  });
});
