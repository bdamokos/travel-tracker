/**
 * Tests for ExpenseTravelLookup service with trip isolation
 */

import { ExpenseTravelLookup, TripData } from '@/app/lib/expenseTravelLookup';
import { Location, Accommodation, Transportation, CostTrackingLink, Expense } from '@/app/types';

describe('ExpenseTravelLookup', () => {
  const mockTripData: TripData = {
    title: 'Test Trip',
    locations: [
      {
        id: 'loc1',
        name: 'Paris',
        coordinates: [48.8566, 2.3522],
        date: new Date('2024-01-01'),
        costTrackingLinks: [
          { expenseId: 'exp1', description: 'Hotel expense' },
          { expenseId: 'exp2', description: 'Food expense' }
        ],
        createdAt: '2024-01-01T00:00:00Z'
      } as Location,
      {
        id: 'loc2',
        name: 'London',
        coordinates: [51.5074, -0.1278],
        date: new Date('2024-01-05'),
        costTrackingLinks: [
          { expenseId: 'exp3', description: 'Transport expense' }
        ],
        createdAt: '2024-01-01T00:00:00Z'
      } as Location
    ],
    accommodations: [
      {
        id: 'acc1',
        name: 'Hotel Paris',
        locationId: 'loc1',
        costTrackingLinks: [
          { expenseId: 'exp4', description: 'Accommodation expense' }
        ],
        createdAt: '2024-01-01T00:00:00Z'
      } as Accommodation
    ],
    routes: [
      {
        id: 'route1',
        type: 'train',
        from: 'Paris',
        to: 'London',
        costTrackingLinks: [
          { expenseId: 'exp5', description: 'Train ticket' }
        ]
      } as Transportation
    ]
  };

  describe('constructor with trip data', () => {
    it('should build index from provided trip data', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);

      // Verify location mappings
      const locationLink = lookup.getTravelLinkForExpense('exp1');
      expect(locationLink).toEqual({
        type: 'location',
        id: 'loc1',
        name: 'Paris',
        tripTitle: 'Test Trip'
      });

      const locationLink2 = lookup.getTravelLinkForExpense('exp2');
      expect(locationLink2).toEqual({
        type: 'location',
        id: 'loc1',
        name: 'Paris',
        tripTitle: 'Test Trip'
      });

      const locationLink3 = lookup.getTravelLinkForExpense('exp3');
      expect(locationLink3).toEqual({
        type: 'location',
        id: 'loc2',
        name: 'London',
        tripTitle: 'Test Trip'
      });
    });

    it('should build accommodation mappings correctly', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const accommodationLink = lookup.getTravelLinkForExpense('exp4');
      expect(accommodationLink).toEqual({
        type: 'accommodation',
        id: 'acc1',
        name: 'Hotel Paris',
        locationName: 'Paris',
        tripTitle: 'Test Trip'
      });
    });

    it('should build route mappings correctly', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const routeLink = lookup.getTravelLinkForExpense('exp5');
      expect(routeLink).toEqual({
        type: 'route',
        id: 'route1',
        name: 'Paris → London',
        tripTitle: 'Test Trip'
      });
    });
  });

  describe('travelReference support', () => {
    const travelReferenceTripData: TripData = {
      title: 'Legacy Trip',
      locations: [
        {
          id: 'legacy-location',
          name: 'Ushuaia',
          coordinates: [-54.8019, -68.303],
          date: new Date('2024-02-01'),
          createdAt: '2024-01-01T00:00:00Z'
        } as Location
      ],
      accommodations: [],
      routes: [
        {
          id: 'legacy-route',
          type: 'plane',
          from: 'Buenos Aires',
          to: 'Ushuaia',
          costTrackingLinks: []
        } as Transportation
      ]
    };

    const baseExpense: Expense = {
      id: 'legacy-expense',
      date: new Date('2024-02-02'),
      amount: 100,
      currency: 'USD',
      category: 'Cash',
      country: 'Argentina',
      description: 'Antarctica tour deposit',
      notes: 'Linked via travelReference only',
      isGeneralExpense: false,
      expenseType: 'actual',
      travelReference: undefined
    };

    it('indexes expenses using travelReference data when provided via costData', () => {
      const expenses: Expense[] = [
        {
          ...baseExpense,
          travelReference: {
            type: 'location',
            locationId: 'legacy-location',
            description: 'Stay in Ushuaia'
          }
        }
      ];

      const lookup = new ExpenseTravelLookup('trip1', {
        ...travelReferenceTripData,
        costData: { expenses }
      });

      expect(lookup.getTravelLinkForExpense('legacy-expense')).toEqual({
        type: 'location',
        id: 'legacy-location',
        name: 'Stay in Ushuaia',
        tripTitle: 'Legacy Trip'
      });
    });

    it('hydrates travelReference mappings when expenses are updated later', () => {
      const expenses: Expense[] = [
        {
          ...baseExpense,
          travelReference: {
            type: 'location',
            locationId: 'legacy-location'
          }
        }
      ];

      const lookup = new ExpenseTravelLookup('trip1', travelReferenceTripData);

      expect(lookup.getTravelLinkForExpense('legacy-expense')).toBeNull();

      lookup.hydrateFromExpenses(expenses);

      expect(lookup.getTravelLinkForExpense('legacy-expense')).toEqual({
        type: 'location',
        id: 'legacy-location',
        name: 'Ushuaia',
        tripTitle: 'Legacy Trip'
      });
    });

    it('removes hydrated travelReference mappings when reference is cleared', () => {
      const expensesWithReference: Expense[] = [
        {
          ...baseExpense,
          travelReference: {
            type: 'location',
            locationId: 'legacy-location'
          }
        }
      ];

      const expensesWithoutReference: Expense[] = [
        {
          ...baseExpense,
          travelReference: undefined
        }
      ];

      const lookup = new ExpenseTravelLookup('trip1', {
        ...travelReferenceTripData,
        costData: { expenses: expensesWithReference }
      });

      expect(lookup.getTravelLinkForExpense('legacy-expense')).not.toBeNull();

      lookup.hydrateFromExpenses(expensesWithoutReference);

      expect(lookup.getTravelLinkForExpense('legacy-expense')).toBeNull();
    });
  });

  describe('buildIndexFromData', () => {
    it('should rebuild index when called with new data', () => {
      const lookup = new ExpenseTravelLookup('trip1');
      
      // Initially no mappings
      expect(lookup.getTravelLinkForExpense('exp1')).toBeNull();
      
      // Build index from data
      lookup.buildIndexFromData(mockTripData);
      
      // Now should have mappings
      expect(lookup.getTravelLinkForExpense('exp1')).toBeTruthy();
    });

    it('should clear existing mappings when rebuilding', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      // Verify initial mapping exists
      expect(lookup.getTravelLinkForExpense('exp1')).toBeTruthy();
      
      // Rebuild with empty data
      lookup.buildIndexFromData({
        title: 'Empty Trip',
        locations: [],
        accommodations: [],
        routes: []
      });
      
      // Should no longer have the mapping
      expect(lookup.getTravelLinkForExpense('exp1')).toBeNull();
    });
  });

  describe('getExpensesForTravelItem', () => {
    it('should return all expenses linked to a location', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const expenses = lookup.getExpensesForTravelItem('location', 'loc1');
      expect(expenses).toEqual(['exp1', 'exp2']);
    });

    it('should return expenses linked to accommodation', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const expenses = lookup.getExpensesForTravelItem('accommodation', 'acc1');
      expect(expenses).toEqual(['exp4']);
    });

    it('should return expenses linked to route', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const expenses = lookup.getExpensesForTravelItem('route', 'route1');
      expect(expenses).toEqual(['exp5']);
    });
  });

  describe('hasExpenseTravelLink', () => {
    it('should return true for linked expenses', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      expect(lookup.hasExpenseTravelLink('exp1')).toBe(true);
      expect(lookup.hasExpenseTravelLink('exp4')).toBe(true);
      expect(lookup.hasExpenseTravelLink('exp5')).toBe(true);
    });

    it('should return false for unlinked expenses', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      expect(lookup.hasExpenseTravelLink('nonexistent')).toBe(false);
    });
  });

  describe('getAllTravelLinks', () => {
    it('should return all mappings as a Map', () => {
      const lookup = new ExpenseTravelLookup('trip1', mockTripData);
      
      const allLinks = lookup.getAllTravelLinks();
      expect(allLinks.size).toBe(5); // exp1, exp2, exp3, exp4, exp5
      expect(allLinks.has('exp1')).toBe(true);
      expect(allLinks.has('exp4')).toBe(true);
      expect(allLinks.has('exp5')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle missing location for accommodation', () => {
      const tripDataWithMissingLocation: TripData = {
        title: 'Test Trip',
        locations: [],
        accommodations: [
          {
            id: 'acc1',
            name: 'Hotel Nowhere',
            locationId: 'missing-location',
            costTrackingLinks: [
              { expenseId: 'exp1', description: 'Accommodation expense' }
            ],
            createdAt: '2024-01-01T00:00:00Z'
          } as Accommodation
        ],
        routes: []
      };

      const lookup = new ExpenseTravelLookup('trip1', tripDataWithMissingLocation);
      
      const accommodationLink = lookup.getTravelLinkForExpense('exp1');
      expect(accommodationLink).toEqual({
        type: 'accommodation',
        id: 'acc1',
        name: 'Hotel Nowhere',
        locationName: 'Unknown location',
        tripTitle: 'Test Trip'
      });
    });

    it('should handle empty trip data', () => {
      const emptyTripData: TripData = {
        title: 'Empty Trip',
        locations: [],
        accommodations: [],
        routes: []
      };

      const lookup = new ExpenseTravelLookup('trip1', emptyTripData);
      
      expect(lookup.getTravelLinkForExpense('exp1')).toBeNull();
      expect(lookup.getAllTravelLinks().size).toBe(0);
    });

    it('should handle undefined optional arrays', () => {
      const minimalTripData: TripData = {
        title: 'Minimal Trip'
        // locations, accommodations, routes are undefined
      };

      const lookup = new ExpenseTravelLookup('trip1', minimalTripData);
      
      expect(lookup.getTravelLinkForExpense('exp1')).toBeNull();
      expect(lookup.getAllTravelLinks().size).toBe(0);
    });
  });
});