/**
 * @jest-environment node
 */

import { generateRoutePoints } from '@/app/lib/routeUtils';
import { generateRailRoutePoints } from '@/app/lib/railRouting';
import type { Transportation } from '@/app/types';

jest.mock('@/app/lib/railRouting', () => ({
  generateRailRoutePoints: jest.fn()
}));

const mockedGenerateRailRoutePoints = generateRailRoutePoints as jest.MockedFunction<typeof generateRailRoutePoints>;

describe('routeUtils rail integration', () => {
  const originalFetch = global.fetch;
  const originalOsrmBaseUrl = process.env.OSRM_BASE_URL;

  afterEach(() => {
    jest.resetAllMocks();
    if (originalOsrmBaseUrl === undefined) {
      delete process.env.OSRM_BASE_URL;
    } else {
      process.env.OSRM_BASE_URL = originalOsrmBaseUrl;
    }
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('uses rail routing output for train routes when available', async () => {
    const transportation: Transportation = {
      id: 'train-1',
      type: 'train',
      from: 'A',
      to: 'B',
      fromCoordinates: [-13.155, -72.524],
      toCoordinates: [-13.263, -72.270]
    };

    const railPoints: [number, number][] = [
      [-13.155, -72.524],
      [-13.2, -72.4],
      [-13.263, -72.27]
    ];

    mockedGenerateRailRoutePoints.mockResolvedValue(railPoints);
    global.fetch = jest.fn() as unknown as typeof fetch;

    const result = await generateRoutePoints(transportation);

    expect(mockedGenerateRailRoutePoints).toHaveBeenCalledWith(
      transportation.fromCoordinates!,
      transportation.toCoordinates!,
      'train'
    );
    expect(result).toEqual(railPoints);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to OSRM when rail routing returns null', async () => {
    process.env.OSRM_BASE_URL = 'https://private-osrm.example.test';
    const transportation: Transportation = {
      id: 'train-2',
      type: 'train',
      from: 'A',
      to: 'B',
      fromCoordinates: [10, 10],
      toCoordinates: [11, 11]
    };

    mockedGenerateRailRoutePoints.mockResolvedValue(null);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              coordinates: [
                [10, 10],
                [10.5, 10.5],
                [11, 11]
              ]
            }
          }
        ]
      })
    }) as unknown as typeof fetch;

    const result = await generateRoutePoints(transportation);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://private-osrm.example.test/route/v1/car/10,10;11,11?overview=full&geometries=geojson'
    );
    expect(result).toEqual([
      [10, 10],
      [10.5, 10.5],
      [11, 11]
    ]);
  });

  it('uses public OSRM by default when no server backend is configured', async () => {
    delete process.env.OSRM_BASE_URL;
    const transportation: Transportation = {
      id: 'car-1',
      type: 'car',
      from: 'A',
      to: 'B',
      fromCoordinates: [10, 10],
      toCoordinates: [11, 11]
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              coordinates: [
                [10, 10],
                [10.25, 10.5],
                [11, 11]
              ]
            }
          }
        ]
      })
    }) as unknown as typeof fetch;

    const result = await generateRoutePoints(transportation);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://router.project-osrm.org/route/v1/car/10,10;11,11?overview=full&geometries=geojson'
    );
    expect(result).toEqual([
      [10, 10],
      [10.5, 10.25],
      [11, 11]
    ]);
  });
});
