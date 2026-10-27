import fs from 'fs/promises';
import { NextRequest } from 'next/server';

import { GET } from '@/app/api/weather/[...params]/route';

describe('weather range API and service integration', () => {
  beforeEach(() => {
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('No synthetic cache'));
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected upstream request'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['0001-01-01', '1901-01-01'],
    ['0000-01-01', '1900-01-01'],
    ['0099-01-01', '1999-01-01'],
  ])('rejects %s to %s before cache or upstream work', async (start, end) => {
    const response = await GET(new NextRequest(
      `http://localhost/api/weather/location?lat=47.5&lon=19&start=${start}&end=${end}`
    ), { params: Promise.resolve({ params: ['location'] }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Weather date range cannot exceed 370 days',
    });
    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a valid early-year leap range through the real service cache path', async () => {
    const dates = ['0004-02-28', '0004-02-29', '0004-03-01'];
    jest.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      fetchedAt: '2026-01-01T00:00:00Z',
      summary: {
        locationId: 'synthetic',
        startDate: dates[0],
        endDate: dates[2],
        dailyWeather: dates.map(date => ({
          id: `synthetic-${date}`,
          date,
          coordinates: [47.5, 19],
          temperature: { min: 1, max: 3, average: 2 },
          precipitation: { total: 0, probability: null },
          wind: { speed: null, direction: null },
          conditions: { description: 'Clear', icon: 'sun', code: 0, cloudCover: null, humidity: null },
          isHistorical: true,
          isForecast: false,
          dataSource: 'open-meteo',
        })),
      },
    }));

    const response = await GET(new NextRequest(
      'http://localhost/api/weather/location?lat=47.5&lon=19&start=0004-02-28&end=0004-03-01'
    ), { params: Promise.resolve({ params: ['location'] }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.dailyWeather.map((day: { date: string }) => day.date)).toEqual(dates);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
