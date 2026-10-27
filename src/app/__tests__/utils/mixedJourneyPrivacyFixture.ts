import type { UnifiedTripData } from '@/app/lib/dataMigration';
import type { JourneyPeriod, Location, Transportation } from '@/app/types';

export function buildMixedJourneyPrivacyFixture(populatedDays: boolean): UnifiedTripData {
  const location: Location = {
    id: 'sibling-location',
    name: 'Public city',
    coordinates: [50, 4],
    date: new Date('2026-01-01T00:00:00Z'),
    notes: 'Public location note',
    accommodationIds: ['secret-accommodation-id'],
    accommodationData: 'secret-booking',
    costTrackingLinks: [{ expenseId: 'secret-location-expense' }],
    isReadOnly: true,
  };
  const route: Transportation = {
    id: 'sibling-route',
    type: 'train',
    from: 'A',
    to: 'B',
    fromCoordinates: [50, 4],
    toCoordinates: [51, 5],
    routePoints: [[50, 4], [51, 5]],
    privateNotes: 'secret-route-note',
    costTrackingLinks: [{ expenseId: 'secret-route-expense' }],
    subRoutes: [{
      id: 'segment', type: 'train', from: 'A', to: 'B',
      routePoints: [[50, 4], [51, 5]],
      privateNotes: 'secret-segment-note',
      costTrackingLinks: [{ expenseId: 'secret-segment-expense' }],
    }],
  };
  const days: JourneyPeriod[] = populatedDays ? [{
    id: 'period', title: 'Public period', date: location.date,
    locations: [{ ...location, id: 'period-location' }],
    transportation: { ...route, id: 'period-route' },
  }] : [];

  return {
    schemaVersion: 9,
    id: 'mixed-privacy-trip', title: 'Synthetic trip', description: 'Public description',
    startDate: '2026-01-01', endDate: '2026-01-02',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    travelData: {
      instagramUsername: 'secret-handle',
      locations: [location, {
        ...location, id: 'public-stay-location',
        accommodationData: 'Public stay details', isAccommodationPublic: true,
      }],
      routes: [route], days,
    },
    accommodations: [{
      id: 'secret-accommodation-id', name: 'secret-hotel', locationId: location.id,
      accommodationData: 'secret-booking', createdAt: '2026-01-01T00:00:00Z',
    }, {
      id: 'public-accommodation', name: 'Public campsite', locationId: location.id,
      accommodationData: 'Public stay details', isAccommodationPublic: true,
      costTrackingLinks: [{ expenseId: 'secret-public-stay-expense' }],
      createdAt: '2026-01-01T00:00:00Z',
    }],
  };
}
