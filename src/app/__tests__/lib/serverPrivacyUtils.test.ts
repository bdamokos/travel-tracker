import {
  filterAccommodationForServer,
  filterJourneyForServer,
  filterTravelDataForServer,
} from '@/app/lib/serverPrivacyUtils';
import { Accommodation } from '@/app/types';
import { buildMixedJourneyPrivacyFixture } from '@/app/__tests__/utils/mixedJourneyPrivacyFixture';

describe('server privacy utilities', () => {
  const originalAdminDomain = process.env.ADMIN_DOMAIN;
  const originalNodeEnv = process.env.NODE_ENV;

  const privateAccommodation: Accommodation = {
    id: 'acc-1',
    name: 'Private Hotel',
    locationId: 'loc-1',
    accommodationData: 'booking: private',
    isAccommodationPublic: false,
    costTrackingLinks: [{ expenseId: 'expense-1', description: 'Hotel cost' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const publicAccommodation: Accommodation = {
    ...privateAccommodation,
    id: 'acc-2',
    name: 'Public Hotel',
    accommodationData: 'Public stay notes',
    isAccommodationPublic: true,
  };

  beforeEach(() => {
    process.env.ADMIN_DOMAIN = 'admin.example';
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
    });
  });

  afterAll(() => {
    if (originalAdminDomain === undefined) {
      delete process.env.ADMIN_DOMAIN;
    } else {
      process.env.ADMIN_DOMAIN = originalAdminDomain;
    }

    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it('removes private accommodations from public travel data', () => {
    const result = filterTravelDataForServer(
      {
        accommodations: [privateAccommodation, publicAccommodation],
      },
      'travel.example'
    );

    expect(result.accommodations).toEqual([
      {
        ...publicAccommodation,
        isAccommodationPublic: undefined,
        costTrackingLinks: undefined,
      },
    ]);
  });

  it.each([false, true])('filters mixed collections through the direct journey helper, populated=%s', (populatedDays) => {
    const trip = buildMixedJourneyPrivacyFixture(populatedDays);
    const journey = {
      id: trip.id, title: trip.title, startDate: new Date(trip.startDate),
      ...trip.travelData, days: trip.travelData?.days ?? [], accommodations: trip.accommodations,
    };
    const result = filterJourneyForServer(journey, 'travel.example');
    expect(JSON.stringify(result)).not.toContain('secret-');
    expect(result.days).toHaveLength(populatedDays ? 1 : 0);
    expect(journey.locations?.[0].accommodationData).toBe('secret-booking');
  });

  it.each([undefined, [], [{
    id: 'period', title: 'Period', date: new Date('2026-01-01'), locations: [],
  }]])('sanitizes nested route copies while preserving their geometry with days=%j', (days) => {
    const route = {
      id: 'route', type: 'train' as const, from: 'A', to: 'B',
      privateNotes: 'secret-root', costTrackingLinks: [{ expenseId: 'secret-expense' }],
      isReadOnly: true, routePoints: [[50, 4], [51, 5]] as [number, number][],
    };
    const nestedRoute = { ...route, subRoutes: [{ ...route, subRoutes: [route] }] };
    const data = { routes: [nestedRoute], days };
    const result = filterTravelDataForServer(data, null);
    expect(JSON.stringify(result)).not.toContain('secret-');
    expect(JSON.stringify(result)).not.toContain('isReadOnly');
    expect(JSON.stringify(result).match(/routePoints/g)).toHaveLength(3);
    expect(result.routes?.[0].routePoints).toEqual(route.routePoints);
    expect(filterTravelDataForServer(data, 'admin.example')).toBe(data);
    expect(route.privateNotes).toBe('secret-root');
  });

  it('removes top-level private accommodations when journey days are present', () => {
    const result = filterTravelDataForServer(
      {
        days: [],
        accommodations: [privateAccommodation, publicAccommodation],
      },
      'travel.example'
    );

    expect(result.accommodations).toHaveLength(1);
    expect(result.accommodations?.[0]?.id).toBe(publicAccommodation.id);
    expect(result.accommodations?.[0]?.costTrackingLinks).toBeUndefined();
  });

  it('filters top-level accommodations when filtering journey data directly', () => {
    const result = filterJourneyForServer(
      {
        id: 'trip-1',
        title: 'Trip',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        days: [],
        accommodations: [privateAccommodation, publicAccommodation],
      } as never,
      'travel.example'
    ) as unknown as { accommodations?: Accommodation[] };

    expect(result.accommodations).toHaveLength(1);
    expect(result.accommodations?.[0]?.id).toBe(publicAccommodation.id);
    expect(result.accommodations?.[0]?.costTrackingLinks).toBeUndefined();
  });

  it('removes unsafe post URLs from public journey periods', () => {
    const result = filterJourneyForServer(
      {
        id: 'trip-1',
        title: 'Trip',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        days: [
          {
            id: 'period-1',
            title: 'City',
            date: new Date('2026-01-01T00:00:00.000Z'),
            locations: [],
            instagramPosts: [
              { id: 'ig-safe', url: 'https://instagram.com/p/safe', caption: 'safe' },
              { id: 'ig-unsafe', url: 'javascript:alert(1)', caption: 'unsafe' },
            ],
            tikTokPosts: [
              { id: 'tt-safe', url: 'https://example.com/tiktok', caption: 'safe' },
              { id: 'tt-unsafe', url: 'data:text/html,<script>alert(1)</script>', caption: 'unsafe' },
            ],
          },
        ],
      },
      'travel.example'
    );

    expect(result.days[0].instagramPosts).toEqual([
      { id: 'ig-safe', url: 'https://instagram.com/p/safe', caption: 'safe' },
    ]);
    expect(result.days[0].tikTokPosts).toEqual([
      { id: 'tt-safe', url: 'https://example.com/tiktok', caption: 'safe' },
    ]);
  });

  it('handles null public post arrays from JSON data defensively', () => {
    const result = filterTravelDataForServer(
      {
        locations: [
          {
            id: 'loc-1',
            name: 'City',
            coordinates: [50, 4],
            date: new Date('2026-01-01T00:00:00.000Z'),
            instagramPosts: null,
          },
        ],
      } as never,
      'travel.example'
    );

    expect(result.locations?.[0]?.instagramPosts).toBeUndefined();
  });

  it('removes accommodation references and shadow flags from public locations', () => {
    const result = filterTravelDataForServer(
      {
        locations: [
          {
            id: 'loc-1',
            name: 'City',
            coordinates: [50, 4],
            date: new Date('2026-01-01T00:00:00.000Z'),
            accommodationIds: ['acc-private'],
            accommodationData: 'private hotel note',
            isAccommodationPublic: false,
            isReadOnly: true,
            costTrackingLinks: [{ expenseId: 'expense-1', description: 'private dinner' }],
          },
        ],
      },
      'travel.example'
    );

    expect(result.locations?.[0]?.accommodationIds).toBeUndefined();
    expect(result.locations?.[0]?.accommodationData).toBeUndefined();
    expect(result.locations?.[0]?.isAccommodationPublic).toBeUndefined();
    expect(result.locations?.[0]?.isReadOnly).toBeUndefined();
    expect(result.locations?.[0]?.costTrackingLinks).toBeUndefined();
  });

  it('removes unsafe post URLs from public locations', () => {
    const result = filterTravelDataForServer(
      {
        locations: [
          {
            id: 'loc-1',
            name: 'City',
            coordinates: [50, 4],
            date: new Date('2026-01-01T00:00:00.000Z'),
            instagramPosts: [
              { id: 'ig-safe', url: 'https://instagram.com/p/safe', caption: 'safe' },
              { id: 'ig-unsafe', url: 'javascript:alert(1)', caption: 'unsafe' },
            ],
            tikTokPosts: [
              { id: 'tt-safe', url: 'http://example.com/tiktok', caption: 'safe' },
              { id: 'tt-unsafe', url: 'data:text/html,<script>alert(1)</script>', caption: 'unsafe' },
            ],
            blogPosts: [
              { id: 'blog-safe', title: 'Safe', url: 'https://example.com/blog' },
              { id: 'blog-unsafe', title: 'Unsafe', url: 'vbscript:msgbox(1)' },
            ],
          },
        ],
      },
      'travel.example'
    );

    expect(result.locations?.[0]?.instagramPosts).toEqual([
      { id: 'ig-safe', url: 'https://instagram.com/p/safe', caption: 'safe' },
    ]);
    expect(result.locations?.[0]?.tikTokPosts).toEqual([
      { id: 'tt-safe', url: 'http://example.com/tiktok', caption: 'safe' },
    ]);
    expect(result.locations?.[0]?.blogPosts).toEqual([
      { id: 'blog-safe', title: 'Safe', url: 'https://example.com/blog' },
    ]);
  });

  it('preserves accommodation expense links for admin travel data', () => {
    const result = filterTravelDataForServer(
      {
        accommodations: [privateAccommodation],
      },
      'admin.example'
    );

    expect(result.accommodations?.[0]?.costTrackingLinks).toEqual(privateAccommodation.costTrackingLinks);
  });

  it('keeps direct public accommodation filtering defensive', () => {
    const result = filterAccommodationForServer(privateAccommodation, 'travel.example');

    expect(result.accommodationData).toBeUndefined();
    expect(result.isAccommodationPublic).toBeUndefined();
    expect(result.costTrackingLinks).toBeUndefined();
  });
});
