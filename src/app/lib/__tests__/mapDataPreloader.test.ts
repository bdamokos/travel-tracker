/** @jest-environment node */

import { precalculateMapDynamicData } from '@/app/lib/mapDataPreloader';
import { wikipediaService } from '@/app/services/wikipediaService';
import { weatherService } from '@/app/services/weatherService';
import { Location } from '@/app/types';
import { WeatherSummary } from '@/app/types/weather';

jest.mock('@/app/services/wikipediaService', () => ({
  wikipediaService: {
    getLocationData: jest.fn()
  }
}));

jest.mock('@/app/services/weatherService', () => ({
  weatherService: {
    getWeatherForLocation: jest.fn(),
    getWeatherForDate: jest.fn()
  }
}));

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'loc-1',
    name: 'Budapest',
    coordinates: [47.4979, 19.0402],
    date: new Date('2026-02-17T00:00:00.000Z'),
    endDate: new Date('2026-02-18T00:00:00.000Z'),
    ...overrides
  };
}

function makeWeatherSummary(): WeatherSummary {
  return {
    locationId: 'loc-1',
    startDate: '2026-02-17',
    endDate: '2026-02-18',
    dailyWeather: [],
    summary: {
      averageTemp: null,
      totalPrecipitation: null,
      predominantCondition: 'Unknown'
    }
  };
}

describe('mapDataPreloader', () => {
  const mockWikipedia = wikipediaService.getLocationData as jest.MockedFunction<typeof wikipediaService.getLocationData>;
  const mockWeather = weatherService.getWeatherForLocation as jest.MockedFunction<typeof weatherService.getWeatherForLocation>;
  const mockWeatherForDate = weatherService.getWeatherForDate as jest.MockedFunction<typeof weatherService.getWeatherForDate>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWikipedia.mockResolvedValue(null);
    mockWeather.mockResolvedValue(makeWeatherSummary());
    mockWeatherForDate.mockResolvedValue({
      id: 'weather-1',
      date: '2026-02-17',
      coordinates: [47.4979, 19.0402],
      temperature: {
        min: null,
        max: null,
        average: null
      },
      precipitation: {
        total: null,
        probability: null
      },
      wind: {
        speed: null,
        direction: null
      },
      conditions: {
        description: 'Unknown',
        icon: '❓',
        code: null,
        cloudCover: null,
        humidity: null
      },
      isHistorical: false,
      isForecast: true,
      dataSource: 'open-meteo',
      fetchedAt: new Date().toISOString()
    });
  });

  it('preloads both wikipedia and weather during startup warm-up', async () => {
    const target = {
      tripId: 'trip-1',
      location: makeLocation()
    };

    await precalculateMapDynamicData([target]);

    expect(mockWikipedia).toHaveBeenCalledTimes(1);
    expect(mockWeather).toHaveBeenCalledTimes(1);
    expect(mockWeather).toHaveBeenCalledWith(expect.objectContaining({ id: 'loc-1' }), { preferCache: true });
    expect(mockWeatherForDate).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated locations for warm-up keys', async () => {
    const sameLocationA = makeLocation({
      id: 'loc-a'
    });
    const sameLocationB = makeLocation({
      id: 'loc-b'
    });
    const laterStaySamePlace = makeLocation({
      id: 'loc-c',
      date: new Date('2026-02-20T00:00:00.000Z'),
      endDate: new Date('2026-02-22T00:00:00.000Z')
    });

    await precalculateMapDynamicData([
      { tripId: 'trip-1', location: sameLocationA },
      { tripId: 'trip-1', location: sameLocationB },
      { tripId: 'trip-1', location: laterStaySamePlace }
    ]);

    // Wikipedia is keyed by name+coordinates; repeated stays reuse one cached article.
    expect(mockWikipedia).toHaveBeenCalledTimes(1);
    // Weather is keyed by name+coordinates+date range; repeated same range dedupes, different stay dates warm separately.
    expect(mockWeather).toHaveBeenCalledTimes(2);
    expect(mockWeather).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'loc-a' }), { preferCache: true });
    expect(mockWeather).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'loc-c' }), { preferCache: true });
    // Daily popup warm-up is keyed by coordinates + today date and dedupes across stays.
    expect(mockWeatherForDate).toHaveBeenCalledTimes(1);
  });
});
