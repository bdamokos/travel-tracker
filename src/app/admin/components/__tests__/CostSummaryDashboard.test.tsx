/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CostSummaryDashboard from '@/app/admin/components/CostTracking/CostSummaryDashboard';
import type { CostSummary, CostTrackingData, Expense } from '@/app/types';

function buildExpense(overrides: Partial<Expense>): Expense {
  return {
    id: 'expense-default',
    date: new Date('2026-02-10'),
    amount: 0,
    currency: 'USD',
    category: 'Food',
    country: 'France',
    description: 'Default expense',
    expenseType: 'actual',
    ...overrides,
  };
}

describe('CostSummaryDashboard', () => {
  const costSummary: CostSummary = {
    totalBudget: 1000,
    spendableBudget: 1000,
    reservedBudget: 0,
    totalSpent: 150,
    totalRefunds: 0,
    remainingBudget: 850,
    totalDays: 10,
    remainingDays: 8,
    daysCompleted: 2,
    averageSpentPerDay: 75,
    suggestedDailyBudget: 106.25,
    dailyBudgetBasisDays: 8,
    countryBreakdown: [],
    preTripSpent: 0,
    preTripRefunds: 0,
    tripSpent: 150,
    tripRefunds: 0,
    averageSpentPerTripDay: 75,
    tripStatus: 'during',
    postTripSpent: 0,
    postTripRefunds: 0,
    plannedSpending: 0,
    plannedRefunds: 0,
    totalCommittedSpending: 150,
    availableForPlanning: 850,
    recentTripSpending: [
      { date: '2026-02-10', amount: 120 },
      { date: '2026-02-11', amount: 30 },
    ],
  };

  const costData: CostTrackingData = {
    id: 'cost-1',
    tripId: 'trip-1',
    tripTitle: 'Test Trip',
    tripStartDate: new Date('2026-02-01'),
    tripEndDate: new Date('2026-02-20'),
    overallBudget: 1000,
    currency: 'USD',
    countryBudgets: [],
    expenses: [
      buildExpense({
        id: 'expense-1',
        description: 'Breakfast',
        amount: 80,
        date: new Date('2026-02-10'),
      }),
      buildExpense({
        id: 'expense-2',
        description: 'Metro pass',
        amount: 40,
        category: 'Transport',
        date: new Date('2026-02-10'),
      }),
      buildExpense({
        id: 'expense-cash-1',
        description: 'Cash spending (2 PEN)',
        amount: 10,
        notes: 'Street snacks',
        date: new Date('2026-02-10'),
        cashTransaction: {
          kind: 'allocation',
          cashTransactionId: 'expense-1',
          localCurrency: 'PEN',
          localAmount: 2,
          baseAmount: 10,
          exchangeRate: 5,
        },
      }),
      buildExpense({
        id: 'expense-3',
        description: 'Planned museum ticket',
        amount: 25,
        expenseType: 'planned',
        date: new Date('2026-02-10'),
      }),
      buildExpense({
        id: 'expense-4',
        description: 'Coffee next day',
        amount: 30,
        date: new Date('2026-02-11'),
      }),
    ],
    createdAt: '2026-02-01T00:00:00.000Z',
  };

  it('opens a daily expense modal when a spending bar is clicked', async () => {
    const user = userEvent.setup();
    render(<CostSummaryDashboard costSummary={costSummary} costData={costData} />);

    const dayButtons = screen.getAllByRole('button', { name: /show expenses for/i });
    await user.click(dayButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('3 expenses recorded')).toBeInTheDocument();
    expect(screen.getByText('Breakfast')).toBeInTheDocument();
    expect(screen.getByText('Metro pass')).toBeInTheDocument();
    expect(screen.getByText('Street snacks')).toBeInTheDocument();
    expect(screen.queryByText('Cash spending (2 PEN)')).not.toBeInTheDocument();
    expect(screen.queryByText('Planned museum ticket')).not.toBeInTheDocument();
    expect(screen.queryByText('Coffee next day')).not.toBeInTheDocument();
  });

  it('closes the daily expense modal', async () => {
    const user = userEvent.setup();
    render(<CostSummaryDashboard costSummary={costSummary} costData={costData} />);

    const dayButtons = screen.getAllByRole('button', { name: /show expenses for/i });
    await user.click(dayButtons[0]);
    await user.click(screen.getByRole('button', { name: /close modal/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
