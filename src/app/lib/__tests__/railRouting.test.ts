import { generateRailRoutePoints } from '@/app/lib/railRouting';

type MockFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const createResponse = (payload: unknown): MockFetchResponse => ({
  ok: true,
  status: 200,
  json: async () => payload
});

describe('railRouting', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('builds a rail path between two points when rail geometry exists', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createResponse({
        elements: [
          { type: 'node', id: 1, lat: 0, lon: 0.005 },
          { type: 'node', id: 2, lat: 0, lon: 0.015 },
          { type: 'node', id: 3, lat: 0, lon: 0.025 },
          { type: 'way', id: 10, nodes: [1, 2, 3], tags: { railway: 'rail' } }
        ]
      })
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    const route = await generateRailRoutePoints([0, 0], [0, 0.03], 'train');

    expect(route).toBeTruthy();
    expect(route![0]).toEqual([0, 0]);
    expect(route![route!.length - 1]).toEqual([0, 0.03]);
    expect(route!.length).toBeGreaterThanOrEqual(4);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('returns null when no rail network is found in queried area', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      createResponse({
        elements: []
      })
    );

    global.fetch = fetchMock as unknown as typeof fetch;

    const route = await generateRailRoutePoints([-13.15, -72.52], [-13.26, -72.27], 'train');

    expect(route).toBeNull();
  });

  it('retries the next Overpass endpoint when one fails', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(
        createResponse({
          elements: [
            { type: 'node', id: 1, lat: 0, lon: 0.005 },
            { type: 'node', id: 2, lat: 0, lon: 0.015 },
            { type: 'way', id: 10, nodes: [1, 2], tags: { railway: 'rail' } }
          ]
        })
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    const route = await generateRailRoutePoints([0, 0], [0, 0.02], 'metro');

    expect(route).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
  });
});
