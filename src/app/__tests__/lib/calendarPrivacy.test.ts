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
      arrivalTime: undefined,
      departureTime: undefined,
      notes: undefined,
      costTrackingLinks: undefined,
      accommodationData: 'Public hotel name',
      isAccommodationPublic: undefined,
    });
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      id: 'route-public',
      departureTime: undefined,
      arrivalTime: undefined,
      privateNotes: undefined,
      costTrackingLinks: undefined,
    });
    expect(result.routes[0].subRoutes?.[0]).toMatchObject({
      privateNotes: undefined,
      costTrackingLinks: undefined,
    });
    expect(result.accommodations).toHaveLength(1);
    expect(result.accommodations[0]).toMatchObject({
      id: 'acc-public',
      accommodationData: 'public booking note',
      isAccommodationPublic: undefined,
      costTrackingLinks: undefined,
    });
  });
});
