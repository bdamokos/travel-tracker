/** @jest-environment node */

import { addDays, formatISO } from 'date-fns';
import { weatherServiceTestUtils } from '@/app/services/weatherService';
import { WeatherSummary } from '@/app/types/weather';

function toISODate(date: Date): string {
  return formatISO(date, { representation: 'date' });
}

function makeSummary(overrides?: Partial<WeatherSummary>): WeatherSummary {
  const now = new Date();
  const tomorrow = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  const weatherDate = toISODate(tomorrow);

  return {
    locationId: 'loc-1',
    startDate: weatherDate,
    endDate: weatherDate,
    dailyWeather: [
      {
        id: 'w1',
        date: weatherDate,
        coordinates: [47.4979, 19.0402],
        temperature: { min: 5, max: 10, average: 7.5 },
        precipitation: { total: 0, probability: 10 },
        wind: { speed: 5, direction: 180 },
        conditions: { description: 'Clear sky', icon: '☀️', code: 0, cloudCover: 5, humidity: null },
        isHistorical: true,
        isForecast: false,
        dataSource: 'historical-average',
        fetchedAt: new Date(Date.now() - (10 * 60 * 1000)).toISOString(),
        expiresAt: new Date(Date.now() + (5 * 60 * 60 * 1000)).toISOString()
      }
    ],
    summary: { averageTemp: 7.5, totalPrecipitation: 0, predominantCondition: 'Clear sky' },
    ...overrides
  };
}

describe('weatherService forecast refresh policy', () => {
  it('does not refresh fresh historical-average forecast entries', () => {
    const summary = makeSummary();
    expect(weatherServiceTestUtils.needsForecastRefresh(summary)).toBe(false);
  });

  it('refreshes stale historical-average forecast entries by fetched age', () => {
    const summary = makeSummary();
    summary.dailyWeather[0].fetchedAt = new Date(Date.now() - (7 * 60 * 60 * 1000)).toISOString();
    summary.dailyWeather[0].expiresAt = undefined;
    expect(weatherServiceTestUtils.needsForecastRefresh(summary)).toBe(true);
  });

  it('refreshes historical-average forecast entries when expiration has passed', () => {
    const summary = makeSummary();
    summary.dailyWeather[0].fetchedAt = new Date(Date.now() - (10 * 60 * 1000)).toISOString();
    summary.dailyWeather[0].expiresAt = new Date(Date.now() - 1_000).toISOString();
    expect(weatherServiceTestUtils.needsForecastRefresh(summary)).toBe(true);
  });
});
