import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TravelItemSelector from '@/app/admin/components/TravelItemSelector';
import { useExpenseLinks } from '@/app/hooks/useExpenseLinks';

jest.mock('@/app/hooks/useExpenseLinks', () => ({
  useExpenseLinks: jest.fn()
}));

const mockUseExpenseLinks = useExpenseLinks as jest.MockedFunction<typeof useExpenseLinks>;
const mockFetch = jest.fn();

global.fetch = mockFetch;

describe('TravelItemSelector', () => {
  const mockOnReferenceChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Test Trip',
        locations: [],
        routes: [],
        accommodations: []
      })
    } as Response);

    mockUseExpenseLinks.mockImplementation((tripId: string | null) => ({
      expenseLinks: tripId
        ? [
            {
              expenseId: 'expense-1',
              travelItemId: 'route-1',
              travelItemName: 'Train to Paris',
              travelItemType: 'route',
              description: 'Ticket'
            }
          ]
        : [],
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    }));
  });

  it('skips existing expense-link lookups when loadExistingLink is false', async () => {
    render(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="test-trip-id"
        onReferenceChange={mockOnReferenceChange}
        loadExistingLink={false}
      />
    );

    await waitFor(() => {
      expect(mockUseExpenseLinks).toHaveBeenCalledWith(null);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/travel-data?id=test-trip-id',
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/expense-links'),
      expect.anything()
    );
  });

  it('clears hydrated state when loadExistingLink is turned off', async () => {
    const { rerender } = render(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="test-trip-id"
        onReferenceChange={mockOnReferenceChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Clear link')).toBeInTheDocument();
    });

    mockOnReferenceChange.mockClear();

    rerender(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="test-trip-id"
        onReferenceChange={mockOnReferenceChange}
        loadExistingLink={false}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Clear link')).not.toBeInTheDocument();
    });

    expect(mockOnReferenceChange).toHaveBeenCalledWith(undefined);
  });

  it('does not re-run link clearing when the parent passes a new callback identity', async () => {
    const firstCallback = jest.fn();
    const secondCallback = jest.fn();

    const { rerender } = render(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="test-trip-id"
        onReferenceChange={firstCallback}
        loadExistingLink={false}
      />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/travel-data?id=test-trip-id',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    expect(firstCallback).not.toHaveBeenCalled();

    rerender(
      <TravelItemSelector
        expenseId="expense-1"
        tripId="test-trip-id"
        onReferenceChange={secondCallback}
        loadExistingLink={false}
      />
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/travel-data?id=test-trip-id',
        expect.objectContaining({ signal: expect.anything() })
      );
    });

    expect(firstCallback).not.toHaveBeenCalled();
    expect(secondCallback).not.toHaveBeenCalled();
  });
});
