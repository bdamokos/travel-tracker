/**
 * @jest-environment jsdom
 */

import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CostSummaryDashboard from '@/app/admin/components/CostTracking/CostSummaryDashboard';
import { calculateCostSummary } from '@/app/lib/costUtils';
import { parseDateAsLocalDay } from '@/app/lib/localDateUtils';
import type { CostTrackingData, Expense } from '@/app/types';

function localDay(value: string): Date {
  const parsed = parseDateAsLocalDay(value);
  if (!parsed) {
    throw new Error(`Invalid test date: ${value}`);
  }
  return parsed;
}

function buildExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-default',
    date: localDay('2026-02-10'),
    amount: 0,
    currency: 'USD',
    category: 'Food',
    country: 'Argentina',
    description: 'Default expense',
    expenseType: 'actual',
    ...overrides,
  };
}

function buildCostData(): CostTrackingData {
  return {
    id: 'cost-1',
    tripId: 'trip-1',
    tripTitle: 'Polar To Patagonia',
    tripStartDate: localDay('2026-02-01'),
    tripEndDate: localDay('2026-02-20'),
    overallBudget: 5000,
    reservedBudget: 500,
    currency: 'USD',
    countryBudgets: [
      {
        id: 'budget-antarctica',
        country: 'Antarctica',
        amount: 2600,
        currency: 'USD',
        periods: [
          {
            id: 'period-antarctica',
            startDate: localDay('2026-02-01'),
            endDate: localDay('2026-02-12'),
          },
        ],
      },
      {
        id: 'budget-argentina',
        country: 'Argentina',
        amount: 1800,
        currency: 'USD',
        periods: [
          {
            id: 'period-argentina',
            startDate: localDay('2026-02-13'),
            endDate: localDay('2026-02-20'),
          },
        ],
      },
    ],
    expenses: [
      buildExpense({
        id: 'expense-antarctica-1',
        description: 'Breakfast',
        amount: 80,
        category: 'Food & Dining',
        country: 'Antarctica',
        date: localDay('2026-02-10'),
      }),
      buildExpense({
        id: 'expense-antarctica-2',
        description: 'Metro pass',
        amount: 40,
        category: 'Transportation',
        country: 'Antarctica',
        date: localDay('2026-02-10'),
      }),
      buildExpense({
        id: 'expense-cash-1',
        description: 'Cash spending (2 PEN)',
        amount: 10,
        notes: 'Street snacks',
        category: 'Food & Dining',
        country: 'Antarctica',
        date: localDay('2026-02-10'),
        cashTransaction: {
          kind: 'allocation',
          cashTransactionId: 'expense-antarctica-1',
          localCurrency: 'PEN',
          localAmount: 2,
          baseAmount: 10,
          exchangeRate: 5,
        },
      }),
      buildExpense({
        id: 'expense-antarctica-3',
        description: 'Ice excursion',
        amount: 800,
        category: 'Activities & Tours',
        country: 'Antarctica',
        date: localDay('2026-02-11'),
      }),
      buildExpense({
        id: 'expense-antarctica-refund',
        description: 'Excursion refund',
        amount: -50,
        category: 'Refunds',
        country: 'Antarctica',
        date: localDay('2026-02-12'),
      }),
      buildExpense({
        id: 'expense-argentina-1',
        description: 'Steak dinner',
        amount: 120,
        category: 'Food & Dining',
        country: 'Argentina',
        date: localDay('2026-02-14'),
      }),
      buildExpense({
        id: 'expense-argentina-2',
        description: 'Hotel night',
        amount: 260,
        category: 'Accommodation',
        country: 'Argentina',
        date: localDay('2026-02-15'),
      }),
      buildExpense({
        id: 'expense-general',
        description: 'Travel insurance',
        amount: 90,
        category: 'Insurance',
        country: 'General',
        isGeneralExpense: true,
        date: localDay('2026-02-03'),
      }),
      buildExpense({
        id: 'expense-planned',
        description: 'Planned museum ticket',
        amount: 25,
        category: 'Activities & Tours',
        country: 'Argentina',
        expenseType: 'planned',
        date: localDay('2026-02-18'),
      }),
    ],
    createdAt: '2026-02-01T00:00:00.000Z',
  };
}

function DashboardHarness({
  costData,
  initialExcludedCountries = [],
}: {
  costData: CostTrackingData;
  initialExcludedCountries?: string[];
}) {
  const [excludedCountries, setExcludedCountries] = useState(initialExcludedCountries);
  const costSummary = calculateCostSummary(costData);

  return (
    <CostSummaryDashboard
      costSummary={costSummary}
      costData={costData}
      excludedCountries={excludedCountries}
      setExcludedCountries={setExcludedCountries}
    />
  );
}

describe('CostSummaryDashboard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 1, 25, 12, 0, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders overview cards and updates included day counts when a country is excluded', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<DashboardHarness costData={buildCostData()} />);

    expect(screen.getByText('Cost operations board')).toBeInTheDocument();
    expect(screen.getByText('Available for planning')).toBeInTheDocument();
    expect(screen.getByText('Calculated over 20 trip days in view.')).toBeInTheDocument();

    const antarcticaChip = screen.getByRole('button', { name: /exclude antarctica from analytics/i });
    expect(antarcticaChip).toHaveAttribute('aria-pressed', 'false');

    await user.click(antarcticaChip);

    expect(screen.getByRole('button', { name: /include antarctica from analytics/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Calculated over 8 trip days in view.')).toBeInTheDocument();
  });

  it('drives category context from the selected country analysis row', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<DashboardHarness costData={buildCostData()} />);

    await user.click(screen.getByRole('button', { name: /focus categories below/i }));

    expect(screen.getByText(/context:/i)).toHaveTextContent('Antarctica only');
    expect(screen.getAllByText('Transportation').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Accommodation')).toHaveLength(0);
  });

  it('keeps category context aligned when selecting a country from the detail table', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<DashboardHarness costData={buildCostData()} />);

    await user.click(screen.getByRole('button', { name: /focus categories below/i }));
    expect(screen.getByText(/context:/i)).toHaveTextContent('Antarctica only');

    const detailSection = screen.getByText('Compact country detail table').closest('section');
    expect(detailSection).not.toBeNull();

    const argentinaButtons = within(detailSection as HTMLElement).getAllByRole('button', { name: 'Argentina' });
    await user.click(argentinaButtons[0]);

    expect(screen.getByText(/context:/i)).toHaveTextContent('Argentina only');
    expect(screen.getAllByText('Accommodation').length).toBeGreaterThan(0);
  });

  it('opens and closes a daily expense modal when a spending bar is clicked', async () => {
    jest.setSystemTime(new Date(2026, 1, 11, 12, 0, 0, 0));
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<DashboardHarness costData={buildCostData()} />);

    const targetButton = screen.getByRole('button', { name: /show expenses for feb 10/i });
    await user.click(targetButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('3 expenses recorded')).toBeInTheDocument();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Metro pass')).toBeInTheDocument();
    expect(screen.getByText('Street snacks')).toBeInTheDocument();
    expect(screen.queryByText('Cash spending (2 PEN)')).not.toBeInTheDocument();
    expect(screen.queryByText('Planned museum ticket')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close modal/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the empty timeline state when no recent trip spending exists', () => {
    const costData = buildCostData();
    costData.tripStartDate = localDay('2026-03-01');
    costData.tripEndDate = localDay('2026-03-20');
    costData.expenses = [];

    render(<DashboardHarness costData={costData} />);

    expect(screen.getByText(/No trip-day spending has been recorded yet/i)).toBeInTheDocument();
  });
});
