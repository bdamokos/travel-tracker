import { weatherServiceTestUtils } from '@/app/services/weatherService';
import type { WeatherSummary } from '@/app/types/weather';

const emptySummary: WeatherSummary = {
  locationId: 'loc-1',
  startDate: '2026-06-01',
  endDate: '2026-06-01',
  dailyWeather: [],
  summary: {
    averageTemp: null,
    totalPrecipitation: null,
    predominantCondition: 'Mixed'
  }
};

describe('weatherService negative cache helpers', () => {
  it('treats recent empty cache entries as fresh negative results', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');

    expect(weatherServiceTestUtils.isFreshEmptyCacheEntry({
      key: 'weather-key',
      summary: emptySummary,
      fetchedAt: '2026-06-01T11:55:00.000Z',
      sources: {
        hasHistoricalAverage: false,
        hasForecast: false,
        hasRecorded: false
      }
    }, now)).toBe(true);
  });

  it('expires empty cache entries after the negative cache TTL', () => {
    const now = new Date('2026-06-01T12:20:00.000Z');

    expect(weatherServiceTestUtils.isFreshEmptyCacheEntry({
      key: 'weather-key',
      summary: emptySummary,
      fetchedAt: '2026-06-01T12:00:00.000Z',
      sources: {
        hasHistoricalAverage: false,
        hasForecast: false,
        hasRecorded: false
      }
    }, now)).toBe(false);
  });

  it('does not treat cache entries with data as negative results', () => {
    const now = new Date('2026-06-01T12:00:00.000Z');

    expect(weatherServiceTestUtils.isFreshEmptyCacheEntry({
      key: 'weather-key',
      summary: {
        ...emptySummary,
        dailyWeather: [
          {
            id: 'weather-1',
            date: '2026-06-01',
            coordinates: [47.5, 19],
            temperature: { min: null, max: null, average: null },
            precipitation: { total: null, probability: null },
            wind: { speed: null, direction: null },
            conditions: { description: 'Unknown', icon: '?', code: null, cloudCover: null, humidity: null },
            isHistorical: false,
            isForecast: true,
            dataSource: 'open-meteo',
            fetchedAt: '2026-06-01T11:55:00.000Z'
          }
        ]
      },
      fetchedAt: '2026-06-01T11:55:00.000Z',
      sources: {
        hasHistoricalAverage: false,
        hasForecast: true,
        hasRecorded: false
      }
    }, now)).toBe(false);
  });
});
