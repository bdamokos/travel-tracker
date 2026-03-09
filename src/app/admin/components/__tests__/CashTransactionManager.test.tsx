import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CashTransactionManager from '@/app/admin/components/CostTracking/CashTransactionManager';
import { createCashSourceExpense } from '@/app/lib/cashTransactions';
import { formatLocalDateInput, parseDateAsLocalDay } from '@/app/lib/localDateUtils';
import type { CostTrackingData } from '@/app/types';

jest.mock('@/app/admin/components/TravelItemSelector', () => ({
  __esModule: true,
  default: () => <div data-testid="travel-item-selector" />
}));

jest.mock('@/app/admin/components/AccessibleDatePicker', () => ({
  __esModule: true,
  default: ({
    id,
    value,
    onChange
  }: {
    id: string;
    value?: Date | null;
    onChange?: (date: Date | null) => void;
  }) => (
    <input
      data-testid={id}
      id={id}
      type="date"
      value={formatLocalDateInput(value)}
      onChange={event => onChange?.(parseDateAsLocalDay(event.target.value))}
    />
  )
}));

describe('CashTransactionManager', () => {
  const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => undefined);

  afterEach(() => {
    alertSpy.mockClear();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  it('keeps the last selected allocation date after adding cash spending', async () => {
    const user = userEvent.setup();
    const onExpenseAdded = jest.fn().mockResolvedValue(undefined);
    const sourceExpense = createCashSourceExpense({
      id: 'cash-source-1',
      date: new Date('2026-03-01T00:00:00.000Z'),
      baseAmount: 100,
      localAmount: 40000,
      localCurrency: 'ARS',
      trackingCurrency: 'USD',
      country: 'Argentina',
      description: 'ATM withdrawal'
    });

    const costData: CostTrackingData = {
      id: 'cost-1',
      tripId: 'trip-1',
      tripTitle: 'Test Trip',
      tripStartDate: new Date('2026-03-01T00:00:00.000Z'),
      tripEndDate: new Date('2026-03-10T00:00:00.000Z'),
      overallBudget: 1000,
      currency: 'USD',
      countryBudgets: [],
      expenses: [sourceExpense],
      createdAt: '2026-03-01T00:00:00.000Z'
    };

    render(
      <CashTransactionManager
        costData={costData}
        currency="USD"
        categories={['Food', 'Transport']}
        countryOptions={['Argentina']}
        tripId="trip-1"
        onExpenseAdded={onExpenseAdded}
      />
    );

    const dateInput = await screen.findByTestId('cash-allocation-date-ARS');
    fireEvent.change(dateInput, { target: { value: '2026-03-05' } });
    fireEvent.change(screen.getByLabelText(/local amount \(ARS\)/i), { target: { value: '2500' } });
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'Food' } });

    await user.click(screen.getByRole('button', { name: /add cash spending/i }));

    await waitFor(() => {
      expect(onExpenseAdded).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('cash-allocation-date-ARS')).toHaveValue('2026-03-05');
  });
});
