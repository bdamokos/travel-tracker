import {
  applyAllocationToSource,
  createCashAllocationExpense,
  createCashSourceExpense,
  restoreAllocationOnSource
} from '@/app/lib/cashTransactions';
import { CASH_CATEGORY_NAME } from '@/app/lib/costUtils';

describe('cash transaction utilities', () => {
  const baseDate = new Date('2024-01-01T00:00:00Z');

  function createSource() {
    return createCashSourceExpense({
      id: 'cash-source-1',
      date: baseDate,
      baseAmount: 50,
      localAmount: 10000,
      localCurrency: 'ARS',
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });
  }

  test('createCashSourceExpense initialises metadata correctly', () => {
    const source = createSource();

    expect(source.category).toBe(CASH_CATEGORY_NAME);
    expect(source.cashTransaction).toBeDefined();
    expect(source.cashTransaction?.cashTransactionId).toBe(source.id);
    expect(source.cashTransaction?.originalBaseAmount).toBe(50);
    expect(source.cashTransaction?.originalLocalAmount).toBe(10000);
    expect(source.cashTransaction?.remainingBaseAmount).toBe(50);
    expect(source.cashTransaction?.remainingLocalAmount).toBe(10000);
  });

  test('createCashAllocationExpense converts amounts using source exchange rate', () => {
    const source = createSource();
    const allocation = createCashAllocationExpense({
      id: 'cash-allocation-1',
      parentExpense: source,
      localAmount: 2000,
      date: baseDate,
      trackingCurrency: 'EUR',
      category: 'Food & Dining'
    });

    expect(allocation.cashTransaction).toBeDefined();
    expect(allocation.cashTransaction?.baseAmount).toBeCloseTo(10, 5);
    expect(allocation.amount).toBeCloseTo(10, 5);
    expect(allocation.cashTransaction?.cashTransactionId).toBe(source.id);
  });

  test('applyAllocationToSource reduces remaining balances, restoreAllocationOnSource reverses them', () => {
    const source = createSource();
    const allocation = createCashAllocationExpense({
      id: 'cash-allocation-2',
      parentExpense: source,
      localAmount: 4000,
      date: baseDate,
      trackingCurrency: 'EUR',
      category: 'Activities & Tours'
    });

    const updatedSource = applyAllocationToSource(source, allocation.cashTransaction!, allocation.id);

    expect(updatedSource.cashTransaction?.remainingLocalAmount).toBeCloseTo(6000, 5);
    expect(updatedSource.cashTransaction?.remainingBaseAmount).toBeCloseTo(30, 5);
    expect(updatedSource.amount).toBeCloseTo(30, 5);
    expect(updatedSource.cashTransaction?.allocationIds).toContain(allocation.id);

    const restoredSource = restoreAllocationOnSource(updatedSource, allocation.cashTransaction!, allocation.id);
    expect(restoredSource.cashTransaction?.remainingLocalAmount).toBeCloseTo(10000, 5);
    expect(restoredSource.cashTransaction?.remainingBaseAmount).toBeCloseTo(50, 5);
    expect(restoredSource.amount).toBeCloseTo(50, 5);
    expect(restoredSource.cashTransaction?.allocationIds).not.toContain(allocation.id);
  });

  test('createCashAllocationExpense throws when overspending remaining cash', () => {
    const source = createSource();

    expect(() =>
      createCashAllocationExpense({
        parentExpense: source,
        localAmount: 20000,
        date: baseDate,
        trackingCurrency: 'EUR',
        category: 'Shopping'
      })
    ).toThrow('Cash spending exceeds remaining local amount.');
  });
});
