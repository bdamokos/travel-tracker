import { render, screen } from '@testing-library/react';
import ExpenseDisplay from '@/app/admin/components/ExpenseDisplay';
import { createCashConversion, createCashSourceExpense } from '@/app/lib/cashTransactions';

describe('ExpenseDisplay', () => {
  const baseDate = new Date('2024-01-01T00:00:00Z');

  test('shows which earlier cash event funded a converted cash source', () => {
    const sourceExpense = createCashSourceExpense({
      id: 'cash-source-clp',
      date: baseDate,
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'CLP',
      trackingCurrency: 'EUR',
      country: 'Chile',
      description: 'CLP ATM withdrawal'
    });

    const { newSource } = createCashConversion({
      id: 'cash-source-ves',
      sources: [sourceExpense],
      sourceLocalAmount: 4000,
      targetLocalAmount: 20,
      targetCurrency: 'VES',
      date: new Date('2024-02-01T00:00:00Z'),
      trackingCurrency: 'EUR',
      country: 'Venezuela',
      description: 'CLP to VES conversion'
    });

    render(
      <ExpenseDisplay
        expense={newSource}
        allExpenses={[sourceExpense, newSource]}
        onEdit={() => undefined}
      />
    );

    expect(screen.getByText('Funding deducted from earlier cash events:')).toBeInTheDocument();
    expect(screen.getByText(/CLP ATM withdrawal/)).toBeInTheDocument();
    expect(screen.getByText(/4\.00 EUR \(4000\.00 CLP\)/)).toBeInTheDocument();
  });

  test('shows later conversion deductions on the original source expense', () => {
    const sourceExpense = createCashSourceExpense({
      id: 'cash-source-clp',
      date: baseDate,
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'CLP',
      trackingCurrency: 'EUR',
      country: 'Chile',
      description: 'CLP ATM withdrawal'
    });

    const { newSource } = createCashConversion({
      id: 'cash-source-ves',
      sources: [sourceExpense],
      sourceLocalAmount: 4000,
      targetLocalAmount: 20,
      targetCurrency: 'VES',
      date: new Date('2024-02-01T00:00:00Z'),
      trackingCurrency: 'EUR',
      country: 'Venezuela',
      description: 'CLP to VES conversion'
    });

    render(
      <ExpenseDisplay
        expense={sourceExpense}
        allExpenses={[sourceExpense, newSource]}
        onEdit={() => undefined}
      />
    );

    expect(screen.getByText('Deductions into later cash events:')).toBeInTheDocument();
    expect(screen.getByText(/CLP to VES conversion/)).toBeInTheDocument();
    expect(screen.getByText(/4\.00 EUR \(4000\.00 CLP\)/)).toBeInTheDocument();
  });
});
