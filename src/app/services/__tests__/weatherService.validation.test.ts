/** @jest-environment node */

import fs from 'fs/promises';

import { weatherService } from '@/app/services/weatherService';
import { Location } from '@/app/types';

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
});
