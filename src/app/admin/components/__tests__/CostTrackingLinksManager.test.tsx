import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CostTrackingLinksManager from '../CostTrackingLinksManager';
import { useExpenses } from '../../../hooks/useExpenses';
import {
  useExpenseLinks,
  useExpenseLinksForTravelItem,
  useLinkExpense,
  useMoveExpenseLink,
  useUnlinkExpense
} from '../../../hooks/useExpenseLinks';

jest.mock('../../../hooks/useExpenses');
jest.mock('../../../hooks/useExpenseLinks');

const mockUseExpenses = useExpenses as jest.MockedFunction<typeof useExpenses>;
const mockUseExpenseLinks = useExpenseLinks as jest.MockedFunction<typeof useExpenseLinks>;
const mockUseExpenseLinksForTravelItem = useExpenseLinksForTravelItem as jest.MockedFunction<typeof useExpenseLinksForTravelItem>;
const mockUseLinkExpense = useLinkExpense as jest.MockedFunction<typeof useLinkExpense>;
const mockUseUnlinkExpense = useUnlinkExpense as jest.MockedFunction<typeof useUnlinkExpense>;
const mockUseMoveExpenseLink = useMoveExpenseLink as jest.MockedFunction<typeof useMoveExpenseLink>;

describe('CostTrackingLinksManager', () => {
  const defaultProps = {
    tripId: 'trip-123',
    travelItemId: 'travel-item-1',
    travelItemType: 'location' as const
  };

  const expensesFixture = [
    {
      id: 'expense-1',
      description: 'Trip 1 Expense',
      amount: 100,
      currency: 'EUR',
      date: '2024-01-01',
      category: 'Food'
    },
    {
      id: 'expense-2',
      description: 'Trip 2 Expense',
      amount: 200,
      currency: 'USD',
      date: '2024-01-02',
      category: 'Transport'
    }
  ];

  let linkExpenseTrigger: jest.Mock;
  let unlinkExpenseTrigger: jest.Mock;
  let mutateLinksMock: jest.Mock;
  let mutateAllLinksMock: jest.Mock;

  beforeEach(() => {
    linkExpenseTrigger = jest.fn().mockResolvedValue({ success: true });
    unlinkExpenseTrigger = jest.fn().mockResolvedValue({});
    mutateLinksMock = jest.fn().mockResolvedValue(undefined);
    mutateAllLinksMock = jest.fn().mockResolvedValue(undefined);

    mockUseExpenses.mockReturnValue({
      expenses: expensesFixture,
      isLoading: false,
      isError: undefined,
      mutate: jest.fn()
    });

    mockUseExpenseLinksForTravelItem.mockReturnValue({
      expenseLinks: [],
      isLoading: false,
      isError: undefined,
      mutate: mutateLinksMock
    });

    mockUseExpenseLinks.mockReturnValue({
      expenseLinks: [],
      isLoading: false,
      isError: undefined,
      mutate: mutateAllLinksMock
    });

    mockUseLinkExpense.mockReturnValue({
      trigger: linkExpenseTrigger,
      isMutating: false
    });

    mockUseUnlinkExpense.mockReturnValue({
      trigger: unlinkExpenseTrigger,
      isMutating: false
    });

    mockUseMoveExpenseLink.mockReturnValue({
      trigger: jest.fn().mockResolvedValue({}),
      isMutating: false
    });
  });

  it('renders expenses for the provided trip and exposes them in the select list', () => {
    render(<CostTrackingLinksManager {...defaultProps} />);

    expect(screen.getByText(/Choose an expense/)).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Trip 1 Expense - 100 EUR (2024-01-01)' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Trip 2 Expense - 200 USD (2024-01-02)' })
    ).toBeInTheDocument();
  });

  it('shows existing links and filters them out of the selectable expenses', () => {
    mockUseExpenseLinksForTravelItem.mockReturnValue({
      expenseLinks: [
        {
          expenseId: 'expense-1',
          travelItemId: defaultProps.travelItemId,
          travelItemName: 'Paris',
          travelItemType: 'location',
          description: 'Hotel stay'
        }
      ],
      isLoading: false,
      isError: undefined,
      mutate: mutateLinksMock
    });

    render(<CostTrackingLinksManager {...defaultProps} />);

    expect(screen.getByText('Trip 1 Expense')).toBeInTheDocument();
    expect(screen.getByText(/Hotel stay/)).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Trip 1 Expense - 100 EUR (2024-01-01)' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Trip 2 Expense - 200 USD (2024-01-02)' })
    ).toBeInTheDocument();
  });

  it('unlinks an expense and refreshes cached links', async () => {
    mockUseExpenseLinksForTravelItem.mockReturnValue({
      expenseLinks: [
        {
          expenseId: 'expense-1',
          travelItemId: defaultProps.travelItemId,
          travelItemName: 'Paris',
          travelItemType: 'location'
        }
      ],
      isLoading: false,
      isError: undefined,
      mutate: mutateLinksMock
    });

    render(<CostTrackingLinksManager {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));

    await waitFor(() => {
      expect(unlinkExpenseTrigger).toHaveBeenCalledWith({
        tripId: defaultProps.tripId,
        expenseId: 'expense-1',
        travelItemId: defaultProps.travelItemId
      });
    });

    expect(mutateLinksMock).toHaveBeenCalled();
    expect(mutateAllLinksMock).toHaveBeenCalled();
  });

  it('links an expense and clears the current selection', async () => {
    render(<CostTrackingLinksManager {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Choose an expense...'), {
      target: { value: 'expense-2' }
    });

    fireEvent.change(screen.getByPlaceholderText(/e.g., Hotel booking/), {
      target: { value: 'Dinner with clients' }
    });

    fireEvent.click(screen.getByRole('button', { name: /Link Expense/ }));

    await waitFor(() => {
      expect(linkExpenseTrigger).toHaveBeenCalledWith({
        tripId: defaultProps.tripId,
        expenseId: 'expense-2',
        travelItemId: defaultProps.travelItemId,
        travelItemType: defaultProps.travelItemType,
        description: 'Dinner with clients'
      });
    });

    expect(mutateLinksMock).toHaveBeenCalled();
    expect(mutateAllLinksMock).toHaveBeenCalled();
    await waitFor(() => {
      expect((screen.getByLabelText('Choose an expense...') as HTMLSelectElement).value).toBe('');
    });
  });
});
