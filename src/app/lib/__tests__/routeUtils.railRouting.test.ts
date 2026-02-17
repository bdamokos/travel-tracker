import { generateRoutePoints } from '@/app/lib/routeUtils';
import { generateRailRoutePoints } from '@/app/lib/railRouting';
import type { Transportation } from '@/app/types';

jest.mock('@/app/lib/railRouting', () => ({
  generateRailRoutePoints: jest.fn()
}));

const mockedGenerateRailRoutePoints = generateRailRoutePoints as jest.MockedFunction<typeof generateRailRoutePoints>;

describe('routeUtils rail integration', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.resetAllMocks();
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

    expect(global.fetch).toHaveBeenCalled();
    expect(result).toEqual([
      [10, 10],
      [10.5, 10.5],
      [11, 11]
    ]);
  });
});
