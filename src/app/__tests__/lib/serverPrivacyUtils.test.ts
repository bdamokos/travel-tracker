import {
  filterAccommodationForServer,
  filterJourneyForServer,
  filterTravelDataForServer,
} from '@/app/lib/serverPrivacyUtils';
import { Accommodation } from '@/app/types';

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
