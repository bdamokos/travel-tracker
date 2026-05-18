/**
 * @jest-environment node
 */

import { GET } from '@/app/api/travel-data/list/route';
import { listAllTrips } from '@/app/lib/unifiedDataService';

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  listAllTrips: jest.fn(),
}));

const mockListAllTrips = listAllTrips as jest.MockedFunction<typeof listAllTrips>;

describe('travel-data list privacy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts only public accommodations in unauthenticated trip listings', async () => {
    mockListAllTrips.mockResolvedValue([
      {
        id: 'trip-1',
        title: 'Listed Trip',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        createdAt: '2026-05-01T00:00:00.000Z',
        hasTravel: true,
        hasCost: false,
        isUnified: true,
        locationCount: 2,
        accommodationCount: 2,
        publicAccommodationCount: 1,
        routeCount: 1,
      },
    ]);

    const response = await GET();
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual([
      expect.objectContaining({
        id: 'trip-1',
        accommodationCount: 1,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain('Private Hotel');
    expect(JSON.stringify(result)).not.toContain('booking code');
  });
});
