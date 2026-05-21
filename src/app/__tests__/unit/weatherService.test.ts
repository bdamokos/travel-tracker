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
  it('does not treat recent empty cache entries as fresh negative results', () => {
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
    }, now)).toBe(false);
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

describe('weatherService legacy cache normalization', () => {
  const legacyDay = (date: string) => ({
    id: `weather-${date}`,
    date,
    coordinates: [47.5, 19] as [number, number],
    temperature: { min: 10, max: 20, average: 15 },
    precipitation: { total: 0, probability: null },
    wind: { speed: null, direction: null },
    conditions: { description: 'Clear', icon: 'sun', code: 0, cloudCover: null, humidity: null },
    fetchedAt: '2026-06-01T00:00:00.000Z'
  });

  it('marks all-future legacy cache entries as historical averages', () => {
    const normalized = weatherServiceTestUtils.normalizeCachedWeatherSummary({
      ...emptySummary,
      startDate: '2027-06-01',
      endDate: '2027-06-02',
      dailyWeather: [
        legacyDay('2027-06-01'),
        legacyDay('2027-06-02')
      ] as WeatherSummary['dailyWeather']
    }, new Date('2026-06-01T12:00:00.000Z'));

    expect(normalized.dailyWeather).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: '2027-06-01',
        dataSource: 'historical-average',
        isHistorical: true,
        isForecast: false
      }),
      expect.objectContaining({
        date: '2027-06-02',
        dataSource: 'historical-average',
        isHistorical: true,
        isForecast: false
      })
    ]));
  });

  it('infers recorded open-meteo data for legacy cache entries that include past days', () => {
    const normalized = weatherServiceTestUtils.normalizeCachedWeatherSummary({
      ...emptySummary,
      startDate: '2026-05-30',
      endDate: '2026-06-01',
      dailyWeather: [
        legacyDay('2026-05-30'),
        legacyDay('2026-06-01')
      ] as WeatherSummary['dailyWeather']
    }, new Date('2026-06-01T12:00:00.000Z'));

    expect(normalized.dailyWeather).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: '2026-05-30',
        dataSource: 'open-meteo',
        isHistorical: true,
        isForecast: false
      }),
      expect.objectContaining({
        date: '2026-06-01',
        dataSource: 'open-meteo',
        isHistorical: true,
        isForecast: false
      })
    ]));
  });

  it('fills missing forecast and historical flags when cached data has a source', () => {
    const normalized = weatherServiceTestUtils.normalizeCachedWeatherSummary({
      ...emptySummary,
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      dailyWeather: [
        { ...legacyDay('2026-06-02'), dataSource: 'open-meteo' }
      ] as WeatherSummary['dailyWeather']
    }, new Date('2026-06-01T12:00:00.000Z'));

    expect(normalized.dailyWeather[0]).toEqual(expect.objectContaining({
      date: '2026-06-02',
      dataSource: 'open-meteo',
      isHistorical: false,
      isForecast: true
    }));
  });
});
