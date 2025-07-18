/**
 * Integration test for LinkedExpensesDisplay component
 * Tests the component with real data structures to ensure trip isolation works correctly
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import LinkedExpensesDisplay from '../LinkedExpensesDisplay';
import { ExpenseTravelLookup } from '../../../lib/expenseTravelLookup';
import { CostTrackingData, Expense, Location, Accommodation, Transportation } from '../../../types';

// Mock the cost utils
jest.mock('../../../lib/costUtils', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
  formatDate: (date: Date | string) => new Date(date).toLocaleDateString()
}));

describe('LinkedExpensesDisplay Integration Tests', () => {
  const tripId = 'trip-paris-2024';
  
  // Sample trip data with locations, accommodations, and routes
  const tripData = {
    title: 'Paris Trip 2024',
    locations: [
      {
        id: 'location-eiffel',
        name: 'Eiffel Tower',
        coordinates: [48.8584, 2.2945] as [number, number],
        date: new Date('2024-01-01'),
        costTrackingLinks: [
          { expenseId: 'expense-entrance-fee' },
          { expenseId: 'expense-lunch-nearby' }
        ]
      } as Location,
      {
        id: 'location-louvre',
        name: 'Louvre Museum',
        coordinates: [48.8606, 2.3376] as [number, number],
        date: new Date('2024-01-02'),
        costTrackingLinks: [
          { expenseId: 'expense-museum-ticket' }
        ]
      } as Location
    ],
    accommodations: [
      {
        id: 'accommodation-hotel',
        name: 'Hotel Paris Center',
        locationId: 'location-eiffel',
        costTrackingLinks: [
          { expenseId: 'expense-hotel-night1' },
          { expenseId: 'expense-hotel-night2' }
        ]
      } as Accommodation
    ],
    routes: [
      {
        id: 'route-airport-hotel',
        type: 'train' as const,
        from: 'CDG Airport',
        to: 'Hotel Paris Center',
        fromCoordinates: [49.0097, 2.5479] as [number, number],
        toCoordinates: [48.8584, 2.2945] as [number, number],
        costTrackingLinks: [
          { expenseId: 'expense-train-ticket' }
        ]
      } as Transportation
    ]
  };

  const expenses: Expense[] = [
    {
      id: 'expense-entrance-fee',
      date: new Date('2024-01-01'),
      amount: 25,
      currency: 'EUR',
      category: 'Entertainment',
      country: 'France',
      description: 'Eiffel Tower entrance fee',
      expenseType: 'actual'
    },
    {
      id: 'expense-lunch-nearby',
      date: new Date('2024-01-01'),
      amount: 35,
      currency: 'EUR',
      category: 'Food',
      country: 'France',
      description: 'Lunch near Eiffel Tower',
      expenseType: 'actual'
    },
    {
      id: 'expense-museum-ticket',
      date: new Date('2024-01-02'),
      amount: 17,
      currency: 'EUR',
      category: 'Entertainment',
      country: 'France',
      description: 'Louvre Museum ticket',
      expenseType: 'actual'
    },
    {
      id: 'expense-hotel-night1',
      date: new Date('2024-01-01'),
      amount: 120,
      currency: 'EUR',
      category: 'Accommodation',
      country: 'France',
      description: 'Hotel night 1',
      expenseType: 'actual'
    },
    {
      id: 'expense-hotel-night2',
      date: new Date('2024-01-02'),
      amount: 120,
      currency: 'EUR',
      category: 'Accommodation',
      country: 'France',
      description: 'Hotel night 2',
      expenseType: 'actual'
    },
    {
      id: 'expense-train-ticket',
      date: new Date('2024-01-01'),
      amount: 12,
      currency: 'EUR',
      category: 'Transport',
      country: 'France',
      description: 'Train from airport',
      expenseType: 'actual'
    }
  ];

  const costData: CostTrackingData = {
    id: 'cost-paris-2024',
    tripId: tripId,
    tripTitle: 'Paris Trip 2024',
    tripStartDate: new Date('2024-01-01'),
    tripEndDate: new Date('2024-01-03'),
    overallBudget: 500,
    currency: 'EUR',
    countryBudgets: [],
    expenses: expenses,
    createdAt: '2024-01-01T00:00:00Z'
  };

  let travelLookup: ExpenseTravelLookup;

  beforeEach(() => {
    // Create a real ExpenseTravelLookup instance with trip data
    travelLookup = new ExpenseTravelLookup(tripId, tripData);
  });

  it('should display expenses linked to a specific location', async () => {
    render(
      <LinkedExpensesDisplay
        itemId="location-eiffel"
        itemType="location"
        travelLookup={travelLookup}
        costData={costData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      // Should show 2 expenses linked to Eiffel Tower location
      expect(screen.getByText('💰 Linked Expenses (2)')).toBeInTheDocument();
      expect(screen.getByText('Eiffel Tower entrance fee')).toBeInTheDocument();
      expect(screen.getByText('Lunch near Eiffel Tower')).toBeInTheDocument();
      expect(screen.getByText('EUR 25.00')).toBeInTheDocument();
      expect(screen.getByText('EUR 35.00')).toBeInTheDocument();
      expect(screen.getByText('Total: EUR 60.00')).toBeInTheDocument();
    });
  });

  it('should display expenses linked to an accommodation', async () => {
    render(
      <LinkedExpensesDisplay
        itemId="accommodation-hotel"
        itemType="accommodation"
        travelLookup={travelLookup}
        costData={costData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      // Should show 2 expenses linked to hotel accommodation
      expect(screen.getByText('💰 Linked Expenses (2)')).toBeInTheDocument();
      expect(screen.getByText('Hotel night 1')).toBeInTheDocument();
      expect(screen.getByText('Hotel night 2')).toBeInTheDocument();
      expect(screen.getByText('Total: EUR 240.00')).toBeInTheDocument();
    });
  });

  it('should display expenses linked to a route', async () => {
    render(
      <LinkedExpensesDisplay
        itemId="route-airport-hotel"
        itemType="route"
        travelLookup={travelLookup}
        costData={costData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      // Should show 1 expense linked to the route
      expect(screen.getByText('💰 Linked Expenses (1)')).toBeInTheDocument();
      expect(screen.getByText('Train from airport')).toBeInTheDocument();
      expect(screen.getByText('EUR 12.00')).toBeInTheDocument();
    });
  });

  it('should handle multiple travel items and deduplicate expenses', async () => {
    render(
      <LinkedExpensesDisplay
        items={[
          { itemType: 'location', itemId: 'location-eiffel' },
          { itemType: 'accommodation', itemId: 'accommodation-hotel' }
        ]}
        travelLookup={travelLookup}
        costData={costData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      // Should show 4 unique expenses (2 from location + 2 from accommodation)
      expect(screen.getByText('💰 Linked Expenses (4)')).toBeInTheDocument();
      expect(screen.getByText('Eiffel Tower entrance fee')).toBeInTheDocument();
      expect(screen.getByText('Lunch near Eiffel Tower')).toBeInTheDocument();
      expect(screen.getByText('Hotel night 1')).toBeInTheDocument();
      expect(screen.getByText('Hotel night 2')).toBeInTheDocument();
      expect(screen.getByText('Total: EUR 300.00')).toBeInTheDocument();
    });
  });

  it('should enforce trip boundaries and reject cross-trip data', async () => {
    // Create cost data for a different trip
    const otherTripCostData: CostTrackingData = {
      ...costData,
      id: 'cost-london-2024',
      tripId: 'trip-london-2024',
      tripTitle: 'London Trip 2024'
    };

    render(
      <LinkedExpensesDisplay
        itemId="location-eiffel"
        itemType="location"
        travelLookup={travelLookup}
        costData={otherTripCostData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      // Should not display any expenses due to trip ID mismatch
      expect(screen.queryByText('💰 Linked Expenses')).not.toBeInTheDocument();
      expect(screen.queryByText('Eiffel Tower entrance fee')).not.toBeInTheDocument();
    });
  });

  it('should sort expenses by date chronologically', async () => {
    render(
      <LinkedExpensesDisplay
        items={[
          { itemType: 'location', itemId: 'location-eiffel' },
          { itemType: 'location', itemId: 'location-louvre' }
        ]}
        travelLookup={travelLookup}
        costData={costData}
        tripId={tripId}
      />
    );

    await waitFor(() => {
      const expenseElements = screen.getAllByText(/Eiffel Tower entrance fee|Lunch near Eiffel Tower|Louvre Museum ticket/);
      // Should be sorted by date: Jan 1 expenses first, then Jan 2
      expect(expenseElements[0]).toHaveTextContent('Eiffel Tower entrance fee'); // Jan 1
      expect(expenseElements[1]).toHaveTextContent('Lunch near Eiffel Tower'); // Jan 1
      expect(expenseElements[2]).toHaveTextContent('Louvre Museum ticket'); // Jan 2
    });
  });
});