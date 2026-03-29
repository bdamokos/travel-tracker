import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CostTrackerEditor from '@/app/admin/components/CostTracking/CostTrackerEditor';
import { createCashRefundToBase, createCashSourceExpense } from '@/app/lib/cashTransactions';
import type { CostTrackingData, ExistingTrip, Expense } from '@/app/types';

jest.mock('@/app/admin/components/CostPieCharts', () => ({
  __esModule: true,
  default: () => <div data-testid="cost-pie-charts" />
}));

jest.mock('@/app/admin/components/CostTracking/BudgetSetup', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-setup" />
}));

jest.mock('@/app/admin/components/CostTracking/CountryBudgetManager', () => ({
  __esModule: true,
  default: () => <div data-testid="country-budget-manager" />
}));

jest.mock('@/app/admin/components/CostTracking/CategoryManager', () => ({
  __esModule: true,
  default: () => <div data-testid="category-manager" />
}));

jest.mock('@/app/admin/components/CostTracking/CountryBreakdownDisplay', () => ({
  __esModule: true,
  default: () => <div data-testid="country-breakdown-display" />
}));

jest.mock('@/app/admin/components/CostTracking/CostSummaryDashboard', () => ({
  __esModule: true,
  default: () => <div data-testid="cost-summary-dashboard" />
}));

jest.mock('@/app/admin/components/CostTracking/ExpenseLeaderboards', () => ({
  __esModule: true,
  default: () => <div data-testid="expense-leaderboards" />
}));

jest.mock('@/app/admin/components/CostTracking/ExportDataMenu', () => ({
  __esModule: true,
  default: () => <div data-testid="export-data-menu" />
}));

jest.mock('@/app/admin/components/YnabImportForm', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('@/app/admin/components/YnabMappingManager', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('@/app/admin/components/YnabSetup', () => ({
  __esModule: true,
  default: () => null
}));

jest.mock('@/app/admin/components/CostTracking/ExpenseManager', () => ({
  __esModule: true,
  default: ({
    costData,
    onExpenseAdded
  }: {
    costData: CostTrackingData;
    onExpenseAdded: (expense: Expense) => Promise<void>;
  }) => {
    const source = costData.expenses.find(
      expense => expense.id === 'cash-source-cop' && expense.cashTransaction?.kind === 'source'
    );
    const remainingLocalAmount = source?.cashTransaction?.remainingLocalAmount ?? 0;
    const refundCount = costData.expenses.filter(expense => expense.id === 'cash-refund-cop').length;
    const feeCount = costData.expenses.filter(expense => expense.category === 'Exchange fees').length;

    return (
      <div>
        <div data-testid="remaining-cop">{remainingLocalAmount}</div>
        <div data-testid="refund-count">{refundCount}</div>
        <div data-testid="fee-count">{feeCount}</div>
        <button
          type="button"
          onClick={async () => {
            const sourceExpense = costData.expenses.find(expense => expense.id === 'cash-source-cop');
            if (!sourceExpense) {
              throw new Error('Missing source expense');
            }

            const { refundExpense, feeExpense } = createCashRefundToBase({
              id: 'cash-refund-cop',
              sources: [sourceExpense],
              localAmount: 50000,
              exchangeRateBasePerLocal: 15 / 50000,
              date: new Date('2026-03-05T00:00:00.000Z'),
              trackingCurrency: 'EUR',
              country: 'Colombia',
              exchangeFeeCategory: 'Exchange fees'
            });

            await onExpenseAdded(refundExpense);
            if (feeExpense) {
              await onExpenseAdded(feeExpense);
            }
          }}
        >
          Add refund with loss
        </button>
      </div>
    );
  }
}));

describe('CostTrackerEditor', () => {
  it('preserves prior cash-source deductions when a refund-to-base adds both refund and fee expenses', async () => {
    const user = userEvent.setup();

    const sourceExpense = createCashSourceExpense({
      id: 'cash-source-cop',
      date: new Date('2026-03-01T00:00:00.000Z'),
      baseAmount: 20,
      localAmount: 61000,
      localCurrency: 'COP',
      trackingCurrency: 'EUR',
      country: 'Colombia',
      description: 'ATM withdrawal'
    });

    const initialCostData: CostTrackingData = {
      id: 'cost-1',
      tripId: '',
      tripTitle: 'Test Trip',
      tripStartDate: new Date('2026-03-01T00:00:00.000Z'),
      tripEndDate: new Date('2026-03-10T00:00:00.000Z'),
      overallBudget: 1000,
      currency: 'EUR',
      countryBudgets: [],
      expenses: [sourceExpense],
      customCategories: ['Food', 'Exchange fees'],
      createdAt: '2026-03-01T00:00:00.000Z'
    };

    const existingTrip = {
      id: 'trip-1',
      title: 'Test Trip',
      startDate: '2026-03-01',
      endDate: '2026-03-10'
    } as ExistingTrip;

    function Wrapper(): React.JSX.Element {
      const [costData, setCostData] = React.useState<CostTrackingData>(initialCostData);

      return (
        <CostTrackerEditor
          costData={costData}
          setCostData={setCostData}
          onSave={() => undefined}
          existingTrips={[existingTrip]}
          selectedTrip={existingTrip}
          setSelectedTrip={() => undefined}
          mode="create"
          autoSaving={false}
          setHasUnsavedChanges={() => undefined}
        />
      );
    }

    render(<Wrapper />);

    expect(screen.getByTestId('remaining-cop')).toHaveTextContent('61000');
    expect(screen.getByTestId('refund-count')).toHaveTextContent('0');
    expect(screen.getByTestId('fee-count')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: /add refund with loss/i }));

    await waitFor(() => {
      expect(screen.getByTestId('remaining-cop')).toHaveTextContent('11000');
    });

    expect(screen.getByTestId('refund-count')).toHaveTextContent('1');
    expect(screen.getByTestId('fee-count')).toHaveTextContent('1');
  });
});
