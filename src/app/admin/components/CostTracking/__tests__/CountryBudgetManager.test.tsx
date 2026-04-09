import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CountryBudgetManager from '@/app/admin/components/CostTracking/CountryBudgetManager';
import type { BudgetItem, CostTrackingData, CountryPeriod } from '@/app/types';

describe('CountryBudgetManager', () => {
  it('preserves visit periods when clearing an existing budget amount', async () => {
    const user = userEvent.setup();

    const period: CountryPeriod = {
      id: 'period-1',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-03-05T00:00:00.000Z'),
      notes: 'Initial visit'
    };

    const budget: BudgetItem = {
      id: 'budget-1',
      country: 'Japan',
      amount: 1500,
      currency: 'EUR',
      notes: 'Main budget',
      periods: [period]
    };

    const initialCostData: CostTrackingData = {
      id: 'cost-1',
      tripId: 'trip-1',
      tripTitle: 'Japan Trip',
      tripStartDate: new Date('2026-03-01T00:00:00.000Z'),
      tripEndDate: new Date('2026-03-10T00:00:00.000Z'),
      overallBudget: 3000,
      currency: 'EUR',
      countryBudgets: [budget],
      expenses: [],
      customCategories: [],
      createdAt: '2026-03-01T00:00:00.000Z'
    };

    function Wrapper(): React.JSX.Element {
      const [costData, setCostData] = React.useState<CostTrackingData>(initialCostData);
      const [currentBudget, setCurrentBudget] = React.useState<Partial<BudgetItem>>({
        country: '',
        notes: ''
      });
      const [editingBudgetIndex, setEditingBudgetIndex] = React.useState<number | null>(null);
      const [currentPeriod, setCurrentPeriod] = React.useState<Partial<CountryPeriod>>({
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        endDate: new Date('2026-03-01T00:00:00.000Z'),
        notes: ''
      });
      const [editingPeriodForBudget, setEditingPeriodForBudget] = React.useState<string | null>(null);
      const [editingPeriodIndex, setEditingPeriodIndex] = React.useState<number | null>(null);

      return (
        <CountryBudgetManager
          costData={costData}
          setCostData={setCostData}
          currentBudget={currentBudget}
          setCurrentBudget={setCurrentBudget}
          editingBudgetIndex={editingBudgetIndex}
          setEditingBudgetIndex={setEditingBudgetIndex}
          currentPeriod={currentPeriod}
          setCurrentPeriod={setCurrentPeriod}
          editingPeriodForBudget={editingPeriodForBudget}
          setEditingPeriodForBudget={setEditingPeriodForBudget}
          editingPeriodIndex={editingPeriodIndex}
          setEditingPeriodIndex={setEditingPeriodIndex}
        />
      );
    }

    render(<Wrapper />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const amountInput = screen.getByLabelText('Budget Amount');
    await user.clear(amountInput);
    await user.click(screen.getByRole('button', { name: 'Update Budget' }));

    expect(screen.getByText('Not set')).toBeInTheDocument();
    expect(screen.getByText(/Mar 1, 2026 - Mar 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Total days: 5')).toBeInTheDocument();
  });
});
