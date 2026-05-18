import { buildAdminMapTravelData, buildPublicMapTravelData } from '@/app/lib/mapShadowData';
import { SHADOW_LOCATION_PREFIX } from '@/app/lib/shadowConstants';
import type { ShadowTrip } from '@/app/types';
import type { UnifiedTripData } from '@/app/lib/dataMigration';

const baseTrip: UnifiedTripData = {
  schemaVersion: 9,
  id: 'trip-1',
  title: 'Boundary Trip',
  description: 'Trip with private and shadow data',
  startDate: '2026-06-01',
  endDate: '2026-06-10',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-02T00:00:00.000Z',
  publicUpdates: [],
  travelData: {
    instagramUsername: 'private-handle',
    locations: [
      {
        id: 'loc-real',
        name: 'Real City',
        coordinates: [48.8566, 2.3522],
        date: new Date('2026-06-01T00:00:00.000Z'),
        endDate: new Date('2026-06-03T00:00:00.000Z'),
        accommodationIds: ['acc-private'],
        costTrackingLinks: [{ expenseId: 'expense-1' }],
      },
    ],
    routes: [
      {
        id: 'route-real',
        type: 'train',
        transportType: 'train',
        from: 'Real City',
        to: 'Next City',
        fromCoordinates: [48.8566, 2.3522],
        toCoordinates: [50.8503, 4.3517],
        departureTime: '2026-06-03T08:00:00.000Z',
        arrivalTime: '2026-06-03T10:00:00.000Z',
        privateNotes: 'private platform',
        costTrackingLinks: [{ expenseId: 'expense-2' }],
      },
    ],
  },
  accommodations: [
    {
      id: 'acc-private',
      name: 'Private Hotel',
      locationId: 'loc-real',
      accommodationData: 'booking reference',
      isAccommodationPublic: false,
      createdAt: '2026-05-01T00:00:00.000Z',
    },
  ],
};

const shadowTrip: ShadowTrip = {
  id: 'shadow-trip-1',
  basedOn: 'trip-1',
  createdAt: '2026-05-03T00:00:00.000Z',
  shadowLocations: [
    {
      id: 'shadow-overlap',
      name: 'Overlapping Shadow',
      coordinates: [49, 3],
      date: new Date('2026-06-02T00:00:00.000Z'),
    },
    {
      id: 'shadow-visible',
      name: 'Visible Shadow',
      coordinates: [51.5074, -0.1278],
      date: new Date('2026-06-05T00:00:00.000Z'),
    },
  ],
  shadowRoutes: [
    {
      id: 'shadow-route-overlap',
      type: 'bus',
      from: 'Overlapping Shadow',
      to: 'Hidden Shadow',
      fromCoordinates: [49, 3],
      toCoordinates: [50, 4],
      departureTime: '2026-06-03T09:00:00.000Z',
      arrivalTime: '2026-06-03T11:00:00.000Z',
      privateNotes: 'overlapping shadow route note',
    },
    {
      id: 'shadow-route',
      type: 'plane',
      from: 'Visible Shadow',
      to: 'Later Shadow',
      fromCoordinates: [51.5074, -0.1278],
      toCoordinates: [52.52, 13.405],
      departureTime: '2026-06-06T08:00:00.000Z',
      arrivalTime: '2026-06-06T10:00:00.000Z',
      privateNotes: 'shadow route note',
    },
  ],
  shadowAccommodations: [],
};

describe('map shadow data boundary', () => {
  it('builds public map data without shadow or admin-only route fields', () => {
    const result = buildPublicMapTravelData(baseTrip);
    const serialized = JSON.stringify(result);

    expect(result.locations.map(location => location.name)).toEqual(['Real City']);
    expect(result.routes.map(route => route.id)).toEqual(['route-real']);
    expect(result.routes[0].notes).toBe('');
    expect(serialized).not.toContain(SHADOW_LOCATION_PREFIX);
    expect(serialized).not.toContain('private platform');
    expect(serialized).not.toContain('costTrackingLinks');
    expect(serialized).not.toContain('accommodationIds');
    expect(serialized).not.toContain('private-handle');
  });

  it('builds admin map data with non-overlapping shadow plans', () => {
    const result = buildAdminMapTravelData(baseTrip, shadowTrip);

    expect(result.locations.map(location => location.name)).toEqual([
      'Real City',
      `${SHADOW_LOCATION_PREFIX} Visible Shadow`,
    ]);
    expect(result.routes.map(route => route.from)).toEqual([
      'Real City',
      `${SHADOW_LOCATION_PREFIX} Visible Shadow`,
    ]);
    expect(result.routes.map(route => route.id)).not.toContain('shadow-route-overlap');
    expect(JSON.stringify(result)).not.toContain('overlapping shadow route note');
  });
});
