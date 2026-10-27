/** @jest-environment node */

import fs from 'fs/promises';
import { addDays, formatISO, parseISO } from 'date-fns';

import { daysBetweenInclusive, weatherService } from '@/app/services/weatherService';
import { Location } from '@/app/types';
import { WeatherData } from '@/app/types/weather';

function buildLocation(overrides?: Partial<Location>): Location {
  return {
    id: 'loc-1',
    name: 'Budapest',
    coordinates: [47.4979, 19.0402],
    date: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2027-01-10T00:00:00.000Z'),
    ...overrides,
  } as Location;
}

describe('weatherService validation', () => {
  beforeEach(() => {
    jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'readFile').mockRejectedValue(new Error('No synthetic cache'));
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Unexpected upstream request'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects oversized location ranges before cache or fetch work', async () => {
    const mkdirSpy = jest.spyOn(fs, 'mkdir');
    const readFileSpy = jest.spyOn(fs, 'readFile');
    const writeFileSpy = jest.spyOn(fs, 'writeFile');
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(weatherService.getWeatherForLocation(buildLocation())).rejects.toThrow(
      'Weather date range cannot exceed 370 days'
    );

    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(readFileSpy).not.toHaveBeenCalled();
    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects invalid coordinates before cache or fetch work', async () => {
    const mkdirSpy = jest.spyOn(fs, 'mkdir');
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      weatherService.getWeatherForLocation(buildLocation({
        coordinates: [Number.POSITIVE_INFINITY, 19.0402],
        endDate: new Date('2026-01-02T00:00:00.000Z'),
      }))
    ).rejects.toThrow('Invalid coordinates');

    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['0001-01-01', '1901-01-01'],
    ['0000-01-01', '1900-01-01'],
    ['0099-01-01', '1999-01-01'],
  ])('rejects aliased early-year range %s to %s before I/O', async (start, end) => {
    await expect(weatherService.getWeatherForLocation(buildLocation({
      date: parseISO(start),
      endDate: parseISO(end),
    }))).rejects.toThrow('Weather date range cannot exceed 370 days');

    expect(fs.mkdir).not.toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['0001-01-01', '1901-01-01', 693961],
    ['0099-12-31', '0100-01-01', 2],
    ['0000-02-28', '0000-03-01', 3],
    ['0004-02-28', '0004-03-01', 3],
    ['1900-02-28', '1900-03-01', 2],
    ['1901-01-01', '0001-01-01', -693959],
  ])('counts literal calendar days from %s to %s', (start, end, expected) => {
    expect(daysBetweenInclusive(parseISO(start), parseISO(end))).toBe(expected);
  });

  it('rejects 371 local calendar days even when UTC dates span only 370 days', async () => {
    await expect(weatherService.getWeatherForLocation(buildLocation({
      date: parseISO('2026-01-01T23:30:00'),
      endDate: parseISO('2027-01-06T00:30:00'),
    }))).rejects.toThrow('Weather date range cannot exceed 370 days');
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  function seedCache(start: string, count: number): string[] {
    const dates = Array.from({ length: count }, (_, offset) =>
      formatISO(addDays(parseISO(start), offset), { representation: 'date' }));
    const dailyWeather: WeatherData[] = dates.map(date => ({
      id: `synthetic-${date}`,
      date,
      coordinates: [47.4979, 19.0402],
      temperature: { min: 1, max: 3, average: 2 },
      precipitation: { total: 0, probability: null },
      wind: { speed: null, direction: null },
      conditions: { description: 'Clear', icon: 'sun', code: 0, cloudCover: null, humidity: null },
      isHistorical: true,
      isForecast: false,
      dataSource: 'open-meteo',
      fetchedAt: '2026-01-01T00:00:00Z',
    }));
    jest.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
      fetchedAt: '2026-01-01T00:00:00Z',
      summary: { locationId: 'loc-1', startDate: start, endDate: dates.at(-1), dailyWeather },
    }));
    return dates;
  }

  it.each([true, false])('independently rejects oversized cache metadata (preferCache=%s)', async preferCache => {
    // Only 371 synthetic days, so the regression remains bounded even without the fix.
    seedCache('0001-01-01', 371);
    await expect(weatherService.getWeatherForLocation(buildLocation({
      date: parseISO('0001-01-01'),
      endDate: parseISO('0001-01-01'),
    }), { preferCache })).rejects.toThrow('Weather date range cannot exceed 370 days');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    ['0004-02-28', 3],
    ['0099-12-31', 2],
    ['2024-02-28', 3],
    ['0001-01-01', 370],
  ])('preserves cached valid range beginning %s for %i days', async (start, count) => {
    const dates = seedCache(start, count);
    const result = await weatherService.getWeatherForLocation(buildLocation({
      date: parseISO(start),
      endDate: parseISO(dates[dates.length - 1]),
    }));
    expect(result.dailyWeather.map(day => day.date)).toEqual(dates);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
