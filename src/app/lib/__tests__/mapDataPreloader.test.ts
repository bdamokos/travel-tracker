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
    getWeatherForLocation: jest.fn()
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

  beforeEach(() => {
    jest.clearAllMocks();
    mockWikipedia.mockResolvedValue(null);
    mockWeather.mockResolvedValue(makeWeatherSummary());
  });

  it('preloads both wikipedia and weather during startup warm-up', async () => {
    const target = {
      tripId: 'trip-1',
      location: makeLocation()
    };

    await precalculateMapDynamicData([target]);

    expect(mockWikipedia).toHaveBeenCalledTimes(1);
    expect(mockWeather).toHaveBeenCalledTimes(1);
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
  });
});
