import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BudgetSetup from '@/app/admin/components/CostTracking/BudgetSetup';
import type { CostTrackingData, ExistingTrip } from '@/app/types';

function BudgetSetupHarness() {
  const [costData, setCostData] = useState<CostTrackingData>({
    id: 'cost-1',
    tripId: 'trip-1',
    tripTitle: 'South America',
    tripStartDate: new Date('2025-01-01'),
    tripEndDate: new Date('2025-02-01'),
    overallBudget: 10000,
    reservedBudget: 6000,
    currency: 'EUR',
    countryBudgets: [],
    expenses: [],
    customCategories: [],
    createdAt: '2025-01-01T00:00:00.000Z',
  });
  const [selectedTrip, setSelectedTrip] = useState<ExistingTrip | null>(null);

  return (
    <>
      <BudgetSetup
        costData={costData}
        setCostData={setCostData}
        existingTrips={[]}
        selectedTrip={selectedTrip}
        setSelectedTrip={setSelectedTrip}
        mode="edit"
      />
      <div data-testid="reserved-budget-state">
        {costData.reservedBudget === undefined ? 'undefined' : String(costData.reservedBudget)}
      </div>
    </>
  );
}

describe('BudgetSetup reserved budget input', () => {
  it('allows clearing the reserved budget input without forcing 0', () => {
    render(<BudgetSetupHarness />);

    const reservedInput = screen.getByLabelText('Reserved (set aside)') as HTMLInputElement;
    expect(reservedInput.value).toBe('6000');

    fireEvent.change(reservedInput, { target: { value: '' } });

    expect(reservedInput.value).toBe('');
    expect(screen.getByTestId('reserved-budget-state')).toHaveTextContent('undefined');
  });
});
