/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';

import { DELETE, GET, PATCH, PUT } from '@/app/api/travel-data/route';
import { deleteTripWithBackup, loadUnifiedTripData, updateTravelData } from '@/app/lib/unifiedDataService';
import { MAX_ROUTE_POINTS_PER_ROUTE } from '@/app/lib/routePointValidation';

jest.mock('@/app/lib/server-domains', () => ({
  __esModule: true,
  isAdminDomain: jest.fn(),
  isAdminHost: jest.fn((host: string | null) => host === 'admin.example.test')
}));

jest.mock('@/app/lib/unifiedDataService', () => ({
  __esModule: true,
  deleteTripWithBackup: jest.fn(),
  loadUnifiedTripData: jest.fn(),
  updateTravelData: jest.fn()
}));

const { isAdminDomain: mockIsAdminDomain } = jest.requireMock('@/app/lib/server-domains');
const mockLoadUnifiedTripData = loadUnifiedTripData as jest.MockedFunction<typeof loadUnifiedTripData>;
const mockUpdateTravelData = updateTravelData as jest.MockedFunction<typeof updateTravelData>;
const mockDeleteTripWithBackup = deleteTripWithBackup as jest.MockedFunction<typeof deleteTripWithBackup>;

const buildTrip = () => ({
  schemaVersion: 4,
  id: 'trip-1',
  title: 'Private Trip',
  description: 'Trip with admin-only fields',
  startDate: '2024-01-01',
  endDate: '2024-01-10',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  travelData: {
    instagramUsername: 'private-handle',
    locations: [
      {
        id: 'location-1',
        name: 'Admin Location',
        coordinates: [52.52, 13.405],
        costTrackingLinks: [{ expenseId: 'expense-1', linkType: 'manual' }]
      }
    ],
    routes: [
      {
        id: 'route-1',
        from: 'A',
        to: 'B',
        privateNotes: 'admin only',
        costTrackingLinks: [{ expenseId: 'expense-1', linkType: 'manual' }]
      }
    ]
  },
  accommodations: [],
  publicUpdates: []
});

const buildTripWithMigratedPrivateAccommodation = () => ({
  ...buildTrip(),
  accommodations: [
    {
      id: 'acc-private',
      name: 'Recovered accommodation (Private expense merchant)',
      locationId: 'location-1',
      accommodationData: 'confirmation: private-booking-code',
      isAccommodationPublic: false,
      costTrackingLinks: [{ expenseId: 'expense-private', description: 'Private expense merchant' }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: 'acc-public',
      name: 'Public Campsite',
      locationId: 'location-1',
      accommodationData: 'public note',
      isAccommodationPublic: true,
      costTrackingLinks: [{ expenseId: 'expense-public', description: 'Public linked expense' }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
  ]
});

describe('travel-data API auth and cache boundary', () => {
  const originalAdminDomain = process.env.ADMIN_DOMAIN;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_DOMAIN = 'admin.example.test';
  });

  afterAll(() => {
    if (originalAdminDomain === undefined) {
      delete process.env.ADMIN_DOMAIN;
    } else {
      process.env.ADMIN_DOMAIN = originalAdminDomain;
    }
  });

  it('rejects unauthenticated delta PATCH before loading or updating trip data', async () => {
    mockIsAdminDomain.mockResolvedValue(false);

    const request = new NextRequest('https://public.example.test/api/travel-data?id=trip-1', {
      method: 'PATCH',
      body: JSON.stringify({
        deltaUpdate: {
          locations: {
            updated: [
              {
                id: 'location-1',
                name: 'Attacker Rewrite'
              }
            ]
          }
        }
      })
    });

    const response = await PATCH(request);
    const result = await response.json();

    expect(response.status).toBe(403);
    expect(result).toEqual({ error: 'Patch operation only allowed on admin domain' });
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockUpdateTravelData).not.toHaveBeenCalled();
  });

  it('rejects malformed trip IDs on DELETE before loading or deleting trip data', async () => {
    mockIsAdminDomain.mockResolvedValue(true);

    const request = new NextRequest('https://admin.example.test/api/travel-data?id=victim%26x%3D1', {
      method: 'DELETE',
      headers: { host: 'admin.example.test' }
    });

    const response = await DELETE(request);
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result).toEqual({ error: 'Invalid trip ID' });
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockDeleteTripWithBackup).not.toHaveBeenCalled();
  });

  it('marks admin-domain travel data responses as private and no-store', async () => {
    mockLoadUnifiedTripData.mockResolvedValue(buildTrip());

    const response = await GET(
      new NextRequest('https://admin.example.test/api/travel-data?id=trip-1', {
        headers: { host: 'admin.example.test' }
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(result.instagramUsername).toBe('private-handle');
    expect(result.locations[0].costTrackingLinks).toHaveLength(1);
    expect(result.routes[0].privateNotes).toBe('admin only');
  });

  it('keeps public travel data responses cacheable after privacy filtering', async () => {
    mockLoadUnifiedTripData.mockResolvedValue(buildTrip());

    const response = await GET(
      new NextRequest('https://public.example.test/api/travel-data?id=trip-1', {
        headers: { host: 'public.example.test' }
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
    );
    expect(result.instagramUsername).toBeUndefined();
    expect(result.locations[0].costTrackingLinks).toBeUndefined();
    expect(result.routes[0].privateNotes).toBeUndefined();
  });

  it('does not expose migrated private accommodation expense data in public travel responses', async () => {
    mockLoadUnifiedTripData.mockResolvedValue(buildTripWithMigratedPrivateAccommodation());

    const response = await GET(
      new NextRequest('https://public.example.test/api/travel-data?id=trip-1', {
        headers: { host: 'public.example.test' }
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.accommodations).toEqual([
      expect.objectContaining({
        id: 'acc-public',
        name: 'Public Campsite',
        accommodationData: 'public note'
      })
    ]);
    expect(JSON.stringify(result)).not.toContain('acc-private');
    expect(JSON.stringify(result)).not.toContain('Private expense merchant');
    expect(JSON.stringify(result)).not.toContain('private-booking-code');
    expect(result.accommodations[0].costTrackingLinks).toBeUndefined();
    expect(result.locations[0].accommodationIds).toBeUndefined();
  });

  it('rejects oversized route point geometry on full trip updates', async () => {
    mockIsAdminDomain.mockResolvedValue(true);

    const response = await PUT(
      new NextRequest('https://admin.example.test/api/travel-data?id=trip-1', {
        method: 'PUT',
        headers: { host: 'admin.example.test' },
        body: JSON.stringify({
          title: 'Trip',
          routes: [
            {
              id: 'route-1',
              from: 'A',
              to: 'B',
              routePoints: Array.from(
                { length: MAX_ROUTE_POINTS_PER_ROUTE + 1 },
                () => [48.8566, 2.3522]
              )
            }
          ]
        })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toContain(`more than ${MAX_ROUTE_POINTS_PER_ROUTE} points`);
    expect(mockUpdateTravelData).not.toHaveBeenCalled();
  });

  it('rejects malformed route point geometry on route-point PATCH updates', async () => {
    mockIsAdminDomain.mockResolvedValue(true);

    const response = await PATCH(
      new NextRequest('https://admin.example.test/api/travel-data?id=trip-1', {
        method: 'PATCH',
        headers: { host: 'admin.example.test' },
        body: JSON.stringify({
          routeUpdate: {
            routeId: 'route-1',
            routePoints: [[91, 2.3522]]
          }
        })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.error).toBe('Route route-1 routePoints[0] must be a valid [latitude, longitude] pair');
    expect(mockLoadUnifiedTripData).not.toHaveBeenCalled();
    expect(mockUpdateTravelData).not.toHaveBeenCalled();
  });

  it('coerces stale stored route transport types before validating unrelated delta PATCH updates', async () => {
    mockIsAdminDomain.mockResolvedValue(true);
    mockLoadUnifiedTripData.mockResolvedValue({
      ...buildTrip(),
      travelData: {
        ...buildTrip().travelData,
        locations: [
          {
            id: 'location-1',
            name: 'Admin Location',
            coordinates: [52.52, 13.405]
          }
        ],
        routes: [
          {
            id: 'route-1',
            from: 'A',
            to: 'B',
            transportType: 'sidecar',
            subRoutes: [
              {
                id: 'segment-1',
                from: 'A',
                to: 'B',
                type: 'wagon'
              }
            ]
          }
        ]
      }
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const response = await PATCH(
      new NextRequest('https://admin.example.test/api/travel-data?id=trip-1', {
        method: 'PATCH',
        headers: { host: 'admin.example.test' },
        body: JSON.stringify({
          deltaUpdate: {
            locations: {
              updated: [
                {
                  id: 'location-1',
                  name: 'Renamed Location'
                }
              ]
            }
          }
        })
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toEqual({
      success: true,
      message: 'Delta applied successfully'
    });
    expect(mockUpdateTravelData).toHaveBeenCalledWith('trip-1', expect.objectContaining({
      locations: [
        expect.objectContaining({
          id: 'location-1',
          name: 'Renamed Location'
        })
      ],
      routes: [
        expect.objectContaining({
          id: 'route-1',
          transportType: 'other',
          subRoutes: [
            expect.objectContaining({
              id: 'segment-1',
              type: 'other'
            })
          ]
        })
      ]
    }));
  });
});
