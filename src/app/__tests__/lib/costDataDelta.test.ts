import { describe, it, expect } from '@jest/globals';
import { CostTrackingData, Expense, BudgetItem } from '@/app/types';
import {
  applyCostDataDelta,
  createCostDataDelta,
  isCostDataDelta,
  isCostDataDeltaEmpty,
  CostDataDelta
} from '@/app/lib/costDataDelta';

const baseDate = new Date('2025-01-01T00:00:00.000Z');

const buildBudget = (id: string, country: string): BudgetItem => ({
  id,
  country,
  amount: 100,
  currency: 'EUR'
});

const buildExpense = (id: string, amount: number): Expense => ({
  id,
  date: baseDate,
  amount,
  currency: 'EUR',
  category: 'Food',
  country: 'Hungary',
  description: 'Expense',
  expenseType: 'actual'
});

const buildCostData = (): CostTrackingData => ({
  id: 'cost-trip-1',
  tripId: 'trip-1',
  tripTitle: 'Trip',
  tripStartDate: baseDate,
  tripEndDate: baseDate,
  overallBudget: 200,
  reservedBudget: 25,
  currency: 'EUR',
  countryBudgets: [buildBudget('budget-1', 'Hungary')],
  expenses: [buildExpense('expense-1', 20)],
  customCategories: ['Food', 'Transport'],
  createdAt: '2025-01-01T00:00:00.000Z'
});

describe('costDataDelta', () => {
  it('creates a minimal delta for added expenses', () => {
    const previous = buildCostData();
    const current: CostTrackingData = {
      ...previous,
      expenses: [...previous.expenses, buildExpense('expense-2', 30)]
    };

    const delta = createCostDataDelta(previous, current);

    expect(delta).not.toBeNull();
    expect(delta?.expenses?.added).toHaveLength(1);
    expect(delta?.expenses?.added?.[0].id).toBe('expense-2');
    expect(delta?.expenses?.updated).toBeUndefined();
    expect(delta?.expenses?.removedIds).toBeUndefined();
  });

  it('does not imply deletion when delta only adds one budget', () => {
    const previous = buildCostData();

    const delta: CostDataDelta = {
      countryBudgets: {
        added: [buildBudget('budget-2', 'Austria')]
      }
    };

    const merged = applyCostDataDelta(previous, delta);

    expect(merged.countryBudgets.map((item) => item.id)).toEqual(['budget-1', 'budget-2']);
  });

  it('ignores dirty updates for unknown IDs instead of deleting existing data', () => {
    const previous = buildCostData();

    const delta: CostDataDelta = {
      countryBudgets: {
        updated: [{ id: 'missing-budget', country: 'Nowhere' }]
      },
      expenses: {
        updated: [{ id: 'missing-expense', description: 'Should not exist' }]
      }
    };

    const merged = applyCostDataDelta(previous, delta);

    expect(merged.countryBudgets).toHaveLength(1);
    expect(merged.countryBudgets[0].id).toBe('budget-1');
    expect(merged.expenses).toHaveLength(1);
    expect(merged.expenses[0].id).toBe('expense-1');
  });

  it('removes entries only when removedIds is explicitly provided', () => {
    const previous = buildCostData();

    const delta: CostDataDelta = {
      expenses: {
        removedIds: ['expense-1']
      }
    };

    const merged = applyCostDataDelta(previous, delta);
    expect(merged.expenses).toHaveLength(0);
  });

  it('applies scalar changes without touching omitted collections', () => {
    const previous = buildCostData();

    const delta: CostDataDelta = {
      overallBudget: 500,
      currency: 'USD'
    };

    const merged = applyCostDataDelta(previous, delta);

    expect(merged.overallBudget).toBe(500);
    expect(merged.currency).toBe('USD');
    expect(merged.expenses).toHaveLength(1);
    expect(merged.countryBudgets).toHaveLength(1);
  });

  it('validates delta payload shape', () => {
    expect(isCostDataDelta({ expenses: { added: [] } })).toBe(true);
    expect(isCostDataDelta({ countryBudgets: [] })).toBe(false);
    expect(isCostDataDelta({ customCategories: 'not-array' })).toBe(false);
  });

  it('detects empty delta payload', () => {
    expect(isCostDataDeltaEmpty({})).toBe(true);
    expect(isCostDataDeltaEmpty({ overallBudget: 120 })).toBe(false);
  });

  it('preserves Date instances when cloning/applying deltas', () => {
    const previous = buildCostData();
    const merged = applyCostDataDelta(previous, {});

    expect(merged.tripStartDate).toBeInstanceOf(Date);
    expect(merged.tripEndDate).toBeInstanceOf(Date);
    expect(merged.expenses[0].date).toBeInstanceOf(Date);
  });
});
