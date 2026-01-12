/**
 * Integration test for trip data isolation migration (v3 to v4)
 */

import { migrateToLatestSchema, UnifiedTripData, CURRENT_SCHEMA_VERSION } from '@/app/lib/dataMigration';

describe('Trip Data Isolation Migration Integration', () => {
  it('should successfully migrate real-world data structure from v3 to v4', () => {
    // Simulate a real-world v3 data structure with cross-trip expense links
    const v3Data: UnifiedTripData = {
      schemaVersion: 3,
      id: 'trip-real-world-test',
      title: 'European Adventure',
      description: 'A trip through Europe',
      startDate: '2024-06-01',
      endDate: '2024-06-15',
      createdAt: '2024-05-01T10:00:00Z',
      updatedAt: '2024-05-01T10:00:00Z',
      travelData: {
        locations: [
          {
            id: 'paris-location',
            name: 'Paris, France',
            coordinates: [48.8566, 2.3522],
            date: new Date('2024-06-01'),
            endDate: new Date('2024-06-03'),
            duration: 3,
            notes: 'Beautiful city',
            accommodationIds: ['paris-hotel'],
            costTrackingLinks: [
              { expenseId: 'paris-food-expense', description: 'Restaurant meals' },
              { expenseId: 'invalid-cross-trip-expense', description: 'This should be removed' },
              { expenseId: 'paris-transport-expense', description: 'Metro tickets' }
            ]
          },
          {
            id: 'rome-location',
            name: 'Rome, Italy',
            coordinates: [41.9028, 12.4964],
            date: new Date('2024-06-04'),
            endDate: new Date('2024-06-06'),
            duration: 3,
            costTrackingLinks: [
              { expenseId: 'rome-food-expense', description: 'Italian cuisine' },
              { expenseId: 'another-invalid-expense', description: 'Another cross-trip expense' }
            ]
          }
        ],
        routes: [
          {
            id: 'paris-to-rome-flight',
            type: 'plane',
            from: 'Paris',
            to: 'Rome',
            departureTime: '2024-06-04T08:00:00Z',
            arrivalTime: '2024-06-04T10:30:00Z',
            fromCoordinates: [48.8566, 2.3522],
            toCoordinates: [41.9028, 12.4964],
            costTrackingLinks: [
              { expenseId: 'flight-expense', description: 'Flight ticket' },
              { expenseId: 'invalid-flight-expense', description: 'Invalid cross-trip flight' }
            ]
          }
        ]
      },
      accommodations: [
        {
          id: 'paris-hotel',
          name: 'Hotel de Paris',
          locationId: 'paris-location',
          accommodationData: 'address: 123 Rue de Rivoli\ncheck-in: 15:00\ncheck-out: 11:00',
          isAccommodationPublic: false,
          createdAt: '2024-05-01T10:00:00Z',
          costTrackingLinks: [
            { expenseId: 'hotel-expense', description: 'Hotel booking' },
            { expenseId: 'invalid-hotel-expense', description: 'Cross-trip hotel expense' }
          ]
        }
      ],
      costData: {
        overallBudget: 3000,
        currency: 'EUR',
        countryBudgets: [
          {
            id: 'france-budget',
            country: 'France',
            amount: 1500,
            currency: 'EUR',
            notes: 'Paris expenses'
          },
          {
            id: 'italy-budget',
            country: 'Italy',
            amount: 1500,
            currency: 'EUR',
            notes: 'Rome expenses'
          }
        ],
        expenses: [
          {
            id: 'paris-food-expense',
            date: new Date('2024-06-01'),
            amount: 150,
            currency: 'EUR',
            category: 'Food',
            country: 'France',
            description: 'Restaurant meals in Paris',
            expenseType: 'actual'
          },
          {
            id: 'paris-transport-expense',
            date: new Date('2024-06-01'),
            amount: 30,
            currency: 'EUR',
            category: 'Transportation',
            country: 'France',
            description: 'Metro tickets',
            expenseType: 'actual'
          },
          {
            id: 'rome-food-expense',
            date: new Date('2024-06-04'),
            amount: 120,
            currency: 'EUR',
            category: 'Food',
            country: 'Italy',
            description: 'Italian cuisine',
            expenseType: 'actual'
          },
          {
            id: 'flight-expense',
            date: new Date('2024-06-04'),
            amount: 200,
            currency: 'EUR',
            category: 'Transportation',
            country: 'France',
            description: 'Flight from Paris to Rome',
            expenseType: 'actual'
          },
          {
            id: 'hotel-expense',
            date: new Date('2024-06-01'),
            amount: 300,
            currency: 'EUR',
            category: 'Accommodation',
            country: 'France',
            description: 'Hotel de Paris booking',
            expenseType: 'actual'
          }
        ]
      }
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Perform the migration
    const migratedData = migrateToLatestSchema(v3Data);

    // Verify the migration results
    expect(migratedData.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    // Verify that invalid expense links were removed from locations
    const parisLocation = migratedData.travelData?.locations?.find(l => l.id === 'paris-location');
    expect(parisLocation?.costTrackingLinks).toHaveLength(2);
    expect(parisLocation?.costTrackingLinks?.map(l => l.expenseId)).toEqual([
      'paris-food-expense',
      'paris-transport-expense'
    ]);

    const romeLocation = migratedData.travelData?.locations?.find(l => l.id === 'rome-location');
    expect(romeLocation?.costTrackingLinks).toHaveLength(1);
    expect(romeLocation?.costTrackingLinks?.[0].expenseId).toBe('rome-food-expense');

    // Verify that invalid expense links were removed from routes
    const flightRoute = migratedData.travelData?.routes?.find(r => r.id === 'paris-to-rome-flight');
    expect(flightRoute?.costTrackingLinks).toHaveLength(1);
    expect(flightRoute?.costTrackingLinks?.[0].expenseId).toBe('flight-expense');

    // Verify that invalid expense links were removed from accommodations
    const parisHotel = migratedData.accommodations?.find(a => a.id === 'paris-hotel');
    expect(parisHotel?.costTrackingLinks).toHaveLength(1);
    expect(parisHotel?.costTrackingLinks?.[0].expenseId).toBe('hotel-expense');

    // Verify that all valid expenses are preserved
    expect(migratedData.costData?.expenses).toHaveLength(5);
    const expenseIds = migratedData.costData?.expenses?.map(e => e.id);
    expect(expenseIds).toContain('paris-food-expense');
    expect(expenseIds).toContain('paris-transport-expense');
    expect(expenseIds).toContain('rome-food-expense');
    expect(expenseIds).toContain('flight-expense');
    expect(expenseIds).toContain('hotel-expense');

    // Verify that cleanup was logged for the v3→v4 migration while allowing additional migration logs
    const cleanupLogCall = consoleSpy.mock.calls.find(
      ([message]) => typeof message === 'string' && message.includes('Trip trip-real-world-test v3→v4 migration cleanup:')
    );
    expect(cleanupLogCall).toBeDefined();
    if (cleanupLogCall) {
      expect(cleanupLogCall[1]).toEqual(
        expect.arrayContaining([
          'Removed invalid expense link invalid-cross-trip-expense from location paris-location',
          'Removed invalid expense link another-invalid-expense from location rome-location',
          'Removed invalid expense link invalid-flight-expense from route paris-to-rome-flight',
          'Removed invalid expense link invalid-hotel-expense from accommodation paris-hotel'
        ])
      );
    }

    // Verify that updatedAt timestamp was updated
    expect(migratedData.updatedAt).not.toBe(v3Data.updatedAt);
    expect(new Date(migratedData.updatedAt).getTime()).toBeGreaterThan(new Date(v3Data.updatedAt).getTime());

    consoleSpy.mockRestore();
  });

  it('should handle migration of data without any invalid links', () => {
    const v3DataClean: UnifiedTripData = {
      schemaVersion: 3,
      id: 'clean-trip-test',
      title: 'Clean Trip',
      description: 'A trip with no invalid links',
      startDate: '2024-07-01',
      endDate: '2024-07-05',
      createdAt: '2024-06-01T10:00:00Z',
      updatedAt: '2024-06-01T10:00:00Z',
      travelData: {
        locations: [
          {
            id: 'clean-location',
            name: 'Clean Location',
            coordinates: [40.7128, -74.0060],
            date: new Date('2024-07-01'),
            costTrackingLinks: [
              { expenseId: 'valid-expense', description: 'Valid expense' }
            ]
          }
        ]
      },
      costData: {
        overallBudget: 1000,
        currency: 'USD',
        countryBudgets: [],
        expenses: [
          {
            id: 'valid-expense',
            date: new Date('2024-07-01'),
            amount: 100,
            currency: 'USD',
            category: 'Food',
            country: 'USA',
            description: 'Valid expense',
            expenseType: 'actual'
          }
        ]
      }
    };

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    const migratedData = migrateToLatestSchema(v3DataClean);

    expect(migratedData.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migratedData.travelData?.locations?.[0].costTrackingLinks).toHaveLength(1);
    expect(migratedData.travelData?.locations?.[0].costTrackingLinks?.[0].expenseId).toBe('valid-expense');

    // No cleanup should be logged for clean data (other migration logs are allowed)
    const cleanupLogCall = consoleSpy.mock.calls.find(
      ([message]) => typeof message === 'string' && message.includes('Trip clean-trip-test v3→v4 migration cleanup:')
    );
    expect(cleanupLogCall).toBeUndefined();

    consoleSpy.mockRestore();
  });
});
