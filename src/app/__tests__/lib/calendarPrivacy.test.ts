import { buildPublicCalendarTrip } from '@/app/lib/calendarPrivacy';
import type { Trip } from '@/app/types';

describe('calendar privacy helpers', () => {
  it('removes private calendar-only details before public rendering', () => {
    const trip: Trip = {
      id: 'trip-1',
      title: 'Private itinerary',
      description: 'Test trip',
      startDate: '2026-01-01',
      endDate: '2026-01-05',
      locations: [
        {
          id: 'loc-public',
          name: 'Public City',
          coordinates: [48.8566, 2.3522],
          date: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-03T00:00:00.000Z'),
          arrivalTime: '2026-01-01T08:30:00.000Z',
          departureTime: '2026-01-03T21:00:00.000Z',
          notes: 'Hotel door code 1234',
          costTrackingLinks: [{ expenseId: 'expense-1' }],
          accommodationData: 'Public hotel name',
          isAccommodationPublic: true,
          accommodationIds: ['acc-private', 'acc-public'],
        },
        {
          id: 'loc-private',
          name: 'Private Stop',
          coordinates: [50.8503, 4.3517],
          date: new Date('2026-01-04T00:00:00.000Z'),
          notes: '[PRIVATE] family address',
        },
        {
          id: 'loc-private-lowercase',
          name: 'Private Lowercase Stop',
          coordinates: [51.5074, -0.1278],
          date: new Date('2026-01-05T00:00:00.000Z'),
          notes: '[private] backup address',
        },
      ],
      routes: [
        {
          id: 'route-public',
          type: 'train',
          from: 'Public City',
          to: 'Next City',
          departureTime: '2026-01-03T21:00:00.000Z',
          arrivalTime: '2026-01-03T23:00:00.000Z',
          privateNotes: undefined,
          costTrackingLinks: [{ expenseId: 'expense-2' }],
          subRoutes: [
            {
              id: 'sub-route',
              type: 'metro',
              from: 'Station A',
              to: 'Station B',
              privateNotes: 'platform detail',
              costTrackingLinks: [{ expenseId: 'expense-3' }],
            },
          ],
        },
        {
          id: 'route-private',
          type: 'car',
          from: 'A',
          to: 'B',
          privateNotes: 'private pickup',
        },
      ],
      accommodations: [
        {
          id: 'acc-private',
          name: 'Private Hotel',
          locationId: 'loc-public',
          accommodationData: 'booking reference',
          isAccommodationPublic: false,
          costTrackingLinks: [{ expenseId: 'expense-4' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc-public',
          name: 'Public Hotel',
          locationId: 'loc-public',
          accommodationData: 'public booking note',
          isAccommodationPublic: true,
          costTrackingLinks: [{ expenseId: 'expense-5' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = buildPublicCalendarTrip(trip);

    expect(result.locations).toHaveLength(1);
    expect(result.locations[0]).toMatchObject({
      id: 'loc-public',
      accommodationData: 'Public hotel name',
    });
    expect(result.locations[0]).not.toHaveProperty('arrivalTime');
    expect(result.locations[0]).not.toHaveProperty('departureTime');
    expect(result.locations[0]).not.toHaveProperty('notes');
    expect(result.locations[0]).not.toHaveProperty('costTrackingLinks');
    expect(result.locations[0]).not.toHaveProperty('isAccommodationPublic');
    expect(result.locations[0]).not.toHaveProperty('accommodationIds');
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      id: 'route-public',
    });
    expect(result.routes[0]).not.toHaveProperty('departureTime');
    expect(result.routes[0]).not.toHaveProperty('arrivalTime');
    expect(result.routes[0]).not.toHaveProperty('privateNotes');
    expect(result.routes[0]).not.toHaveProperty('costTrackingLinks');
    expect(result.routes[0].subRoutes).toHaveLength(0);
    expect(result.accommodations).toHaveLength(1);
    expect(result.accommodations[0]).toMatchObject({
      id: 'acc-public',
      accommodationData: 'public booking note',
    });
    expect(result.accommodations[0]).not.toHaveProperty('isAccommodationPublic');
    expect(result.accommodations[0]).not.toHaveProperty('costTrackingLinks');
  });

  it('builds a strict public calendar payload allowlist from trip-shaped unified data', () => {
    const trip = {
      id: 'trip-1',
      title: 'Calendar trip',
      description: 'Public description',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      isArchived: false,
      costData: {
        ynabConfig: {
          apiKey: 'SENTINEL_YNAB_TOKEN',
        },
        expenses: [{ notes: 'SENTINEL_COST_NOTES' }],
      },
      travelData: {
        instagramUsername: 'SENTINEL_PRIVATE_INSTAGRAM',
      },
      publicUpdates: [{ message: 'SENTINEL_PUBLIC_UPDATE_FIELD' }],
      shadowData: {
        shadowLocations: [{ name: 'SENTINEL_SHADOW_LOCATION' }],
      },
      locations: [
        {
          id: 'loc-public',
          name: 'Public City',
          coordinates: [48.8566, 2.3522],
          date: new Date('2026-01-01T00:00:00.000Z'),
          notes: 'SENTINEL_PRIVATE_LOCATION_NOTES',
          costTrackingLinks: [{ expenseId: 'SENTINEL_LOCATION_COST_LINK' }],
          accommodationIds: ['SENTINEL_PRIVATE_ACCOMMODATION_ID'],
          isAccommodationPublic: false,
          accommodationData: 'SENTINEL_PRIVATE_LOCATION_ACCOMMODATION',
          isReadOnly: true,
          shadowData: 'SENTINEL_LOCATION_SHADOW_FIELD',
          instagramPosts: [
            {
              id: 'ig-public',
              url: 'https://instagram.com/p/public',
              caption: 'Public caption',
              privateCaptionDraft: 'SENTINEL_PRIVATE_POST_FIELD',
            },
          ],
        },
      ],
      routes: [
        {
          id: 'route-public',
          type: 'train',
          from: 'Public City',
          to: 'Next City',
          departureTime: 'SENTINEL_ROUTE_DEPARTURE_TIME',
          arrivalTime: 'SENTINEL_ROUTE_ARRIVAL_TIME',
          privateNotes: undefined,
          costTrackingLinks: [{ expenseId: 'SENTINEL_ROUTE_COST_LINK' }],
          shadowData: 'SENTINEL_ROUTE_SHADOW_FIELD',
          subRoutes: [
            {
              id: 'sub-route-public',
              type: 'metro',
              from: 'Station A',
              to: 'Station B',
              costTrackingLinks: [{ expenseId: 'SENTINEL_SUBROUTE_COST_LINK' }],
              shadowData: 'SENTINEL_SUBROUTE_SHADOW_FIELD',
            },
          ],
        },
      ],
      accommodations: [
        {
          id: 'acc-private',
          name: 'SENTINEL_PRIVATE_ACCOMMODATION',
          locationId: 'loc-public',
          accommodationData: 'SENTINEL_PRIVATE_ACCOMMODATION_DATA',
          isAccommodationPublic: false,
          costTrackingLinks: [{ expenseId: 'SENTINEL_ACCOMMODATION_COST_LINK' }],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc-public',
          name: 'Public Hotel',
          locationId: 'loc-public',
          accommodationData: 'Public accommodation detail',
          isAccommodationPublic: true,
          costTrackingLinks: [{ expenseId: 'SENTINEL_PUBLIC_ACCOMMODATION_COST_LINK' }],
          isReadOnly: true,
          shadowData: 'SENTINEL_PUBLIC_ACCOMMODATION_SHADOW_FIELD',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    } as unknown as Trip;

    const result = buildPublicCalendarTrip(trip);
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      id: 'trip-1',
      title: 'Calendar trip',
      description: 'Public description',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      isArchived: false,
      locations: [
        {
          id: 'loc-public',
          name: 'Public City',
          coordinates: [48.8566, 2.3522],
          date: new Date('2026-01-01T00:00:00.000Z'),
          instagramPosts: [
            {
              id: 'ig-public',
              url: 'https://instagram.com/p/public',
              caption: 'Public caption',
            },
          ],
        },
      ],
      routes: [
        {
          id: 'route-public',
          type: 'train',
          from: 'Public City',
          to: 'Next City',
          subRoutes: [
            {
              id: 'sub-route-public',
              type: 'metro',
              from: 'Station A',
              to: 'Station B',
            },
          ],
        },
      ],
      accommodations: [
        {
          id: 'acc-public',
          name: 'Public Hotel',
          locationId: 'loc-public',
          accommodationData: 'Public accommodation detail',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(serialized).not.toContain('SENTINEL_');
    expect(serialized).not.toContain('costData');
    expect(serialized).not.toContain('travelData');
    expect(serialized).not.toContain('publicUpdates');
    expect(serialized).not.toContain('shadowData');
  });
});
