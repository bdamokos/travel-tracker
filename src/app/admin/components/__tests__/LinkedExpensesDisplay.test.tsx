import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import LinkedExpensesDisplay from '../LinkedExpensesDisplay';
import { ExpenseTravelLookup } from '../../../lib/expenseTravelLookup';
import { CostTrackingData, Expense } from '../../../types';

// Mock the cost utils
jest.mock('../../../lib/costUtils', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
  formatDate: (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(d);
  }
}));

describe('LinkedExpensesDisplay', () => {
  const mockTripId = 'trip-123';
  const mockOtherTripId = 'trip-456';

  const mockExpenses: Expense[] = [
    {
      id: 'expense-1',
      date: new Date('2024-01-01'),
      amount: 100,
      currency: 'EUR',
      category: 'Food',
      country: 'France',
      description: 'Restaurant dinner',
      expenseType: 'actual'
    },
    {
      id: 'expense-2',
      date: new Date('2024-01-02'),
      amount: 50,
      currency: 'EUR',
      category: 'Transport',
      country: 'France',
      description: 'Train ticket',
      expenseType: 'actual'
    },
    {
      id: 'expense-3',
      date: new Date('2024-01-03'),
      amount: 75,
      currency: 'EUR',
      category: 'Accommodation',
      country: 'France',
      description: 'Hotel night',
      expenseType: 'actual'
    }
  ];

  const mockCostData: CostTrackingData = {
    id: 'cost-123',
    tripId: mockTripId,
    tripTitle: 'Test Trip',
    tripStartDate: new Date('2024-01-01'),
    tripEndDate: new Date('2024-01-10'),
    overallBudget: 1000,
    currency: 'EUR',
    countryBudgets: [],
    expenses: mockExpenses,
    createdAt: '2024-01-01T00:00:00Z'
  };

  const mockCostDataOtherTrip: CostTrackingData = {
    ...mockCostData,
    id: 'cost-456',
    tripId: mockOtherTripId,
    tripTitle: 'Other Trip'
  };

  const createMockTravelLookup = (expenseIds: string[]) => {
    const mockLookup = new ExpenseTravelLookup(mockTripId);
    
    // Mock the getExpensesForTravelItem method
    jest.spyOn(mockLookup, 'getExpensesForTravelItem').mockReturnValue(expenseIds);
    
    // Mock the getTravelLinkForExpense method to return valid travel links
    jest.spyOn(mockLookup, 'getTravelLinkForExpense').mockImplementation((expenseId: string) => {
      if (expenseIds.includes(expenseId)) {
        return {
          type: 'location',
          id: 'location-1',
          name: 'Test Location',
          tripTitle: mockCostData.tripTitle
        };
      }
      return null;
    });
    
    // Mock the getAllTravelLinks method to return a proper map
    const mockMap = new Map();
    expenseIds.forEach(expenseId => {
      mockMap.set(expenseId, {
        type: 'location',
        id: 'location-1',
        name: 'Test Location',
        tripTitle: mockCostData.tripTitle
      });
    });
    jest.spyOn(mockLookup, 'getAllTravelLinks').mockReturnValue(mockMap);
    
    return mockLookup;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display linked expenses from the same trip', async () => {
    const mockTravelLookup = createMockTravelLookup(['expense-1', 'expense-2']);

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💰 Linked Expenses (2)')).toBeInTheDocument();
      expect(screen.getByText('Restaurant dinner')).toBeInTheDocument();
      expect(screen.getByText('Train ticket')).toBeInTheDocument();
      expect(screen.getByText('EUR 100.00')).toBeInTheDocument();
      expect(screen.getByText('EUR 50.00')).toBeInTheDocument();
    });
  });

  it('should display total amount for multiple expenses', async () => {
    const mockTravelLookup = createMockTravelLookup(['expense-1', 'expense-2']);

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Total: EUR 150.00')).toBeInTheDocument();
    });
  });

  it('should not display expenses when trip IDs do not match', async () => {
    const mockTravelLookup = createMockTravelLookup(['expense-1', 'expense-2']);

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={mockCostDataOtherTrip}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      // Should not display any expenses due to trip ID mismatch
      expect(screen.queryByText('💰 Linked Expenses')).not.toBeInTheDocument();
      expect(screen.queryByText('Restaurant dinner')).not.toBeInTheDocument();
      expect(screen.queryByText('Train ticket')).not.toBeInTheDocument();
    });
  });

  it('should handle multiple travel items from the same trip', async () => {
    const mockTravelLookup = createMockTravelLookup(['expense-1', 'expense-3']);

    render(
      <LinkedExpensesDisplay
        items={[
          { itemType: 'location', itemId: 'location-1' },
          { itemType: 'accommodation', itemId: 'accommodation-1' }
        ]}
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💰 Linked Expenses (2)')).toBeInTheDocument();
      expect(screen.getByText('Restaurant dinner')).toBeInTheDocument();
      expect(screen.getByText('Hotel night')).toBeInTheDocument();
    });
  });

  it('should deduplicate expense IDs from multiple items', async () => {
    // Mock the lookup to return the same expense ID for both items
    const mockTravelLookup = new ExpenseTravelLookup(mockTripId);
    jest.spyOn(mockTravelLookup, 'getExpensesForTravelItem')
      .mockReturnValueOnce(['expense-1', 'expense-2'])
      .mockReturnValueOnce(['expense-2', 'expense-3']);
    
    // Mock the getTravelLinkForExpense method
    jest.spyOn(mockTravelLookup, 'getTravelLinkForExpense').mockImplementation((expenseId: string) => {
      if (['expense-1', 'expense-2', 'expense-3'].includes(expenseId)) {
        return {
          type: 'location',
          id: 'location-1',
          name: 'Test Location',
          tripTitle: mockCostData.tripTitle
        };
      }
      return null;
    });
    
    // Mock the getAllTravelLinks method
    const mockMap = new Map();
    ['expense-1', 'expense-2', 'expense-3'].forEach(expenseId => {
      mockMap.set(expenseId, {
        type: 'location',
        id: 'location-1',
        name: 'Test Location',
        tripTitle: mockCostData.tripTitle
      });
    });
    jest.spyOn(mockTravelLookup, 'getAllTravelLinks').mockReturnValue(mockMap);

    render(
      <LinkedExpensesDisplay
        items={[
          { itemType: 'location', itemId: 'location-1' },
          { itemType: 'accommodation', itemId: 'accommodation-1' }
        ]}
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      // Should show 3 unique expenses (expense-1, expense-2, expense-3)
      expect(screen.getByText('💰 Linked Expenses (3)')).toBeInTheDocument();
      expect(screen.getByText('Restaurant dinner')).toBeInTheDocument();
      expect(screen.getByText('Train ticket')).toBeInTheDocument();
      expect(screen.getByText('Hotel night')).toBeInTheDocument();
    });
  });

  it('should sort expenses by date', async () => {
    const mockTravelLookup = createMockTravelLookup(['expense-3', 'expense-1', 'expense-2']);

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      const expenseElements = screen.getAllByText(/Restaurant dinner|Train ticket|Hotel night/);
      // Should be sorted by date: expense-1 (Jan 1), expense-2 (Jan 2), expense-3 (Jan 3)
      expect(expenseElements[0]).toHaveTextContent('Restaurant dinner');
      expect(expenseElements[1]).toHaveTextContent('Train ticket');
      expect(expenseElements[2]).toHaveTextContent('Hotel night');
    });
  });

  it('should not render when no expenses are linked', async () => {
    const mockTravelLookup = createMockTravelLookup([]);

    const { container } = render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should handle null travelLookup gracefully', () => {
    const { container } = render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={null}
        costData={mockCostData}
        tripId={mockTripId}
      />
    );

    // Component should not render anything when travelLookup is null
    expect(container.firstChild).toBeNull();
  });

  it('should handle null costData gracefully', () => {
    const mockTravelLookup = createMockTravelLookup(['expense-1']);

    const { container } = render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        travelLookup={mockTravelLookup}
        costData={null}
        tripId={mockTripId}
      />
    );

    // Component should not render anything when costData is null
    expect(container.firstChild).toBeNull();
  });
});
