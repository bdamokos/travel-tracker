/**
 * Integration test for ExpenseTravelLookup service with trip isolation
 */

import { ExpenseTravelLookup, TripData } from '../../lib/expenseTravelLookup';
import { UnifiedTripData } from '../../lib/dataMigration';

describe('ExpenseTravelLookup Integration', () => {
  const mockUnifiedTripData: UnifiedTripData = {
    schemaVersion: 4,
    id: 'trip-123',
    title: 'European Adventure',
    description: 'A trip through Europe',
    startDate: '2024-01-01',
    endDate: '2024-01-15',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    travelData: {
      locations: [
        {
          id: 'paris',
          name: 'Paris',
          coordinates: [48.8566, 2.3522],
          date: new Date('2024-01-01'),
          costTrackingLinks: [
            { expenseId: 'meal-paris-1', description: 'Dinner at restaurant' },
            { expenseId: 'museum-paris-1', description: 'Louvre ticket' }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        },
        {
          id: 'london',
          name: 'London',
          coordinates: [51.5074, -0.1278],
          date: new Date('2024-01-10'),
          costTrackingLinks: [
            { expenseId: 'pub-london-1', description: 'Pub dinner' }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        }
      ],
      routes: [
        {
          id: 'eurostar-1',
          type: 'train',
          from: 'Paris',
          to: 'London',
          costTrackingLinks: [
            { expenseId: 'eurostar-ticket', description: 'Eurostar ticket' }
          ]
        }
      ]
    },
    accommodations: [
      {
        id: 'hotel-paris',
        name: 'Hotel de Ville',
        locationId: 'paris',
        costTrackingLinks: [
          { expenseId: 'hotel-paris-booking', description: 'Hotel booking' }
        ],
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'bnb-london',
        name: 'Cozy London Flat',
        locationId: 'london',
        costTrackingLinks: [
          { expenseId: 'bnb-london-booking', description: 'Airbnb booking' }
        ],
        createdAt: '2024-01-01T00:00:00Z'
      }
    ],
    costData: {
      overallBudget: 2000,
      currency: 'EUR',
      countryBudgets: [],
      expenses: [
        {
          id: 'meal-paris-1',
          date: new Date('2024-01-01'),
          amount: 45,
          currency: 'EUR',
          category: 'Food',
          country: 'France',
          description: 'Dinner at restaurant',
          expenseType: 'actual'
        },
        {
          id: 'museum-paris-1',
          date: new Date('2024-01-02'),
          amount: 15,
          currency: 'EUR',
          category: 'Entertainment',
          country: 'France',
          description: 'Louvre ticket',
          expenseType: 'actual'
        },
        {
          id: 'eurostar-ticket',
          date: new Date('2024-01-09'),
          amount: 120,
          currency: 'EUR',
          category: 'Transport',
          country: 'France',
          description: 'Eurostar ticket',
          expenseType: 'actual'
        },
        {
          id: 'hotel-paris-booking',
          date: new Date('2024-01-01'),
          amount: 300,
          currency: 'EUR',
          category: 'Accommodation',
          country: 'France',
          description: 'Hotel booking',
          expenseType: 'actual'
        },
        {
          id: 'bnb-london-booking',
          date: new Date('2024-01-10'),
          amount: 200,
          currency: 'GBP',
          category: 'Accommodation',
          country: 'UK',
          description: 'Airbnb booking',
          expenseType: 'actual'
        },
        {
          id: 'pub-london-1',
          date: new Date('2024-01-10'),
          amount: 25,
          currency: 'GBP',
          category: 'Food',
          country: 'UK',
          description: 'Pub dinner',
          expenseType: 'actual'
        }
      ]
    }
  };

  describe('Trip isolation functionality', () => {
    it('should work with unified trip data structure', () => {
      const tripData: TripData = {
        title: mockUnifiedTripData.title,
        locations: mockUnifiedTripData.travelData?.locations,
        accommodations: mockUnifiedTripData.accommodations,
        routes: mockUnifiedTripData.travelData?.routes
      };

      const lookup = new ExpenseTravelLookup(mockUnifiedTripData.id, tripData);

      // Verify all expense mappings are created correctly
      expect(lookup.getAllTravelLinks().size).toBe(6);

      // Test location mappings
      const parisExpense1 = lookup.getTravelLinkForExpense('meal-paris-1');
      expect(parisExpense1).toEqual({
        type: 'location',
        id: 'paris',
        name: 'Paris',
        tripTitle: 'European Adventure'
      });

      const parisExpense2 = lookup.getTravelLinkForExpense('museum-paris-1');
      expect(parisExpense2).toEqual({
        type: 'location',
        id: 'paris',
        name: 'Paris',
        tripTitle: 'European Adventure'
      });

      const londonExpense = lookup.getTravelLinkForExpense('pub-london-1');
      expect(londonExpense).toEqual({
        type: 'location',
        id: 'london',
        name: 'London',
        tripTitle: 'European Adventure'
      });

      // Test accommodation mappings
      const hotelExpense = lookup.getTravelLinkForExpense('hotel-paris-booking');
      expect(hotelExpense).toEqual({
        type: 'accommodation',
        id: 'hotel-paris',
        name: 'Hotel de Ville',
        locationName: 'Paris',
        tripTitle: 'European Adventure'
      });

      const bnbExpense = lookup.getTravelLinkForExpense('bnb-london-booking');
      expect(bnbExpense).toEqual({
        type: 'accommodation',
        id: 'bnb-london',
        name: 'Cozy London Flat',
        locationName: 'London',
        tripTitle: 'European Adventure'
      });

      // Test route mappings
      const trainExpense = lookup.getTravelLinkForExpense('eurostar-ticket');
      expect(trainExpense).toEqual({
        type: 'route',
        id: 'eurostar-1',
        name: 'Paris → London',
        tripTitle: 'European Adventure'
      });
    });

    it('should only work with single trip data (isolation)', () => {
      const tripData: TripData = {
        title: mockUnifiedTripData.title,
        locations: mockUnifiedTripData.travelData?.locations,
        accommodations: mockUnifiedTripData.accommodations,
        routes: mockUnifiedTripData.travelData?.routes
      };

      const lookup = new ExpenseTravelLookup(mockUnifiedTripData.id, tripData);

      // Should only have mappings for expenses in this trip
      expect(lookup.getTravelLinkForExpense('meal-paris-1')).toBeTruthy();
      expect(lookup.getTravelLinkForExpense('hotel-paris-booking')).toBeTruthy();
      
      // Should not have mappings for expenses from other trips
      expect(lookup.getTravelLinkForExpense('other-trip-expense')).toBeNull();
      expect(lookup.getTravelLinkForExpense('random-expense-id')).toBeNull();
    });

    it('should support rebuilding index with different trip data', () => {
      const initialTripData: TripData = {
        title: 'Initial Trip',
        locations: [
          {
            id: 'loc1',
            name: 'Location 1',
            coordinates: [0, 0],
            date: new Date(),
            costTrackingLinks: [
              { expenseId: 'exp1', description: 'Expense 1' }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        accommodations: [],
        routes: []
      };

      const newTripData: TripData = {
        title: 'New Trip',
        locations: [
          {
            id: 'loc2',
            name: 'Location 2',
            coordinates: [1, 1],
            date: new Date(),
            costTrackingLinks: [
              { expenseId: 'exp2', description: 'Expense 2' }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          }
        ],
        accommodations: [],
        routes: []
      };

      const lookup = new ExpenseTravelLookup('trip1', initialTripData);

      // Initially should have exp1 mapping
      expect(lookup.getTravelLinkForExpense('exp1')).toBeTruthy();
      expect(lookup.getTravelLinkForExpense('exp2')).toBeNull();

      // Rebuild with new data
      lookup.buildIndexFromData(newTripData);

      // Now should have exp2 mapping and not exp1
      expect(lookup.getTravelLinkForExpense('exp1')).toBeNull();
      expect(lookup.getTravelLinkForExpense('exp2')).toBeTruthy();
      expect(lookup.getTravelLinkForExpense('exp2')?.name).toBe('Location 2');
    });

    it('should handle complex expense-to-travel relationships', () => {
      const tripData: TripData = {
        title: mockUnifiedTripData.title,
        locations: mockUnifiedTripData.travelData?.locations,
        accommodations: mockUnifiedTripData.accommodations,
        routes: mockUnifiedTripData.travelData?.routes
      };

      const lookup = new ExpenseTravelLookup(mockUnifiedTripData.id, tripData);

      // Test reverse lookups - find all expenses for a travel item
      const parisExpenses = lookup.getExpensesForTravelItem('location', 'paris');
      expect(parisExpenses).toEqual(['meal-paris-1', 'museum-paris-1']);

      const londonExpenses = lookup.getExpensesForTravelItem('location', 'london');
      expect(londonExpenses).toEqual(['pub-london-1']);

      const hotelExpenses = lookup.getExpensesForTravelItem('accommodation', 'hotel-paris');
      expect(hotelExpenses).toEqual(['hotel-paris-booking']);

      const routeExpenses = lookup.getExpensesForTravelItem('route', 'eurostar-1');
      expect(routeExpenses).toEqual(['eurostar-ticket']);

      // Test existence checks
      expect(lookup.hasExpenseTravelLink('meal-paris-1')).toBe(true);
      expect(lookup.hasExpenseTravelLink('nonexistent-expense')).toBe(false);
    });
  });

  describe('Performance and memory efficiency', () => {
    it('should handle large datasets efficiently', () => {
      // Create a large dataset
      const locations = [];
      const accommodations = [];
      const routes = [];
      const expectedMappings = [];

      for (let i = 0; i < 100; i++) {
        locations.push({
          id: `loc-${i}`,
          name: `Location ${i}`,
          coordinates: [i, i],
          date: new Date(),
          costTrackingLinks: [
            { expenseId: `exp-loc-${i}`, description: `Location expense ${i}` }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        });
        expectedMappings.push(`exp-loc-${i}`);

        accommodations.push({
          id: `acc-${i}`,
          name: `Accommodation ${i}`,
          locationId: `loc-${i}`,
          costTrackingLinks: [
            { expenseId: `exp-acc-${i}`, description: `Accommodation expense ${i}` }
          ],
          createdAt: '2024-01-01T00:00:00Z'
        });
        expectedMappings.push(`exp-acc-${i}`);

        routes.push({
          id: `route-${i}`,
          type: 'car',
          from: `Location ${i}`,
          to: `Location ${i + 1}`,
          costTrackingLinks: [
            { expenseId: `exp-route-${i}`, description: `Route expense ${i}` }
          ]
        });
        expectedMappings.push(`exp-route-${i}`);
      }

      const largeTripData: TripData = {
        title: 'Large Trip',
        locations,
        accommodations,
        routes
      };

      const startTime = performance.now();
      const lookup = new ExpenseTravelLookup('large-trip', largeTripData);
      const endTime = performance.now();

      // Should complete quickly (less than 100ms for 300 items)
      expect(endTime - startTime).toBeLessThan(100);

      // Should have all mappings
      expect(lookup.getAllTravelLinks().size).toBe(300);

      // Spot check some mappings
      expect(lookup.getTravelLinkForExpense('exp-loc-50')).toBeTruthy();
      expect(lookup.getTravelLinkForExpense('exp-acc-75')).toBeTruthy();
      expect(lookup.getTravelLinkForExpense('exp-route-25')).toBeTruthy();
    });
  });
});