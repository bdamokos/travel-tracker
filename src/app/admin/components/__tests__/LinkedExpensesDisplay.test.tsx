import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import LinkedExpensesDisplay from '../LinkedExpensesDisplay';
import * as useExpenseLinksModule from '../../../hooks/useExpenseLinks';
import * as useExpensesModule from '../../../hooks/useExpenses';

// Mock the cost utils
jest.mock('../../../lib/costUtils', () => ({
  formatCurrency: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
  formatDate: (date: Date | string) => {
    const d = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC' }).format(d);
  }
}));

jest.mock('../../../hooks/useExpenseLinks');
jest.mock('../../../hooks/useExpenses');

const mockUseExpenseLinks = jest.mocked(useExpenseLinksModule.useExpenseLinks);
const mockUseExpenses = jest.mocked(useExpensesModule.useExpenses);

describe('LinkedExpensesDisplay', () => {
  const mockTripId = 'trip-123';

  const mockExpenses: useExpensesModule.Expense[] = [
    {
      id: 'expense-1',
      date: '2024-01-01',
      amount: 100,
      currency: 'EUR',
      category: 'Food',
      country: 'France',
      description: 'Restaurant dinner',
      expenseType: 'actual'
    },
    {
      id: 'expense-2',
      date: '2024-01-02',
      amount: 50,
      currency: 'EUR',
      category: 'Transport',
      country: 'France',
      description: 'Train ticket',
      expenseType: 'actual'
    },
    {
      id: 'expense-3',
      date: '2024-01-03',
      amount: 75,
      currency: 'EUR',
      category: 'Accommodation',
      country: 'France',
      description: 'Hotel night',
      expenseType: 'actual'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [
        {
          expenseId: 'expense-1',
          travelItemId: 'location-1',
          travelItemName: 'Test Location',
          travelItemType: 'location'
        },
        {
          expenseId: 'expense-2',
          travelItemId: 'location-1',
          travelItemName: 'Test Location',
          travelItemType: 'location'
        },
        {
          expenseId: 'expense-3',
          travelItemId: 'location-1',
          travelItemName: 'Test Accommodation',
          travelItemType: 'location'
        }
      ],
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });

    mockUseExpenses.mockReturnValue({
      expenses: mockExpenses,
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });
  });

  it('should display linked expenses from the same trip', async () => {
    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [
        {
          expenseId: 'expense-1',
          travelItemId: 'location-1',
          travelItemName: 'Test Location',
          travelItemType: 'location'
        },
        {
          expenseId: 'expense-2',
          travelItemId: 'location-1',
          travelItemName: 'Test Location',
          travelItemType: 'location'
        }
      ],
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
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

  it('should handle multiple travel items and deduplicate expense IDs', async () => {
    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [
        {
          expenseId: 'expense-1',
          travelItemId: 'location-1',
          travelItemName: 'Test Location',
          travelItemType: 'location'
        },
        {
          expenseId: 'expense-1',
          travelItemId: 'accommodation-1',
          travelItemName: 'Hotel',
          travelItemType: 'accommodation'
        }
      ],
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });

    render(
      <LinkedExpensesDisplay
        items={[
          { itemType: 'location', itemId: 'location-1' },
          { itemType: 'accommodation', itemId: 'accommodation-1' }
        ]}
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('💰 Linked Expenses (1)')).toBeInTheDocument();
      expect(screen.getByText('Restaurant dinner')).toBeInTheDocument();
    });
  });

  it('should sort expenses by date', async () => {
    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
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
    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [],
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });

    const { container } = render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        tripId={mockTripId}
      />
    );

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should handle loading state gracefully', () => {
    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [],
      isLoading: true,
      isError: undefined,
      mutate: jest.fn()
    });
    mockUseExpenses.mockReturnValue({
      expenses: [],
      isLoading: true,
      isError: undefined,
      mutate: jest.fn()
    });

    render(
      <LinkedExpensesDisplay
        itemId="location-1"
        itemType="location"
        tripId={mockTripId}
      />
    );

    expect(screen.getByText('Loading linked expenses...')).toBeInTheDocument();
  });
});
