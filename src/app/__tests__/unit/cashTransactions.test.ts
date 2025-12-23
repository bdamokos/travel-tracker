import {
  applyAllocationSegmentsToSources,
  createCashConversion,
  createCashAllocationExpense,
  createCashRefundExpense,
  createCashRefundToBase,
  createCashSourceExpense,
  restoreAllocationSegmentsOnSources
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
    expect(source.cashTransaction?.sourceType).toBe('exchange');
    expect(source.cashTransaction?.originalBaseAmount).toBe(50);
    expect(source.cashTransaction?.originalLocalAmount).toBe(10000);
    expect(source.cashTransaction?.remainingBaseAmount).toBe(50);
    expect(source.cashTransaction?.remainingLocalAmount).toBe(10000);
  });

  test('createCashRefundExpense creates a negative refund expense with cash on hand', () => {
    const refund = createCashRefundExpense({
      id: 'cash-refund-1',
      date: baseDate,
      localAmount: 10000,
      localCurrency: 'ARS',
      exchangeRate: 0.005,
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    expect(refund.amount).toBeCloseTo(-50, 5);
    expect(refund.category).toBe(CASH_CATEGORY_NAME);
    expect(refund.cashTransaction).toBeDefined();
    expect(refund.cashTransaction?.sourceType).toBe('refund');
    expect(refund.cashTransaction?.originalBaseAmount).toBeCloseTo(50, 5);
    expect(refund.cashTransaction?.remainingLocalAmount).toBeCloseTo(10000, 5);
  });

  test('createCashAllocationExpense converts amounts using source exchange rate', () => {
    const source = createSource();
    const { expense, segments } = createCashAllocationExpense({
      id: 'cash-allocation-1',
      sources: [source],
      localAmount: 2000,
      date: baseDate,
      trackingCurrency: 'EUR',
      category: 'Food & Dining'
    });

    expect(expense.cashTransaction).toBeDefined();
    expect(expense.cashTransaction?.baseAmount).toBeCloseTo(10, 5);
    expect(expense.amount).toBeCloseTo(10, 5);
    expect(expense.cashTransaction?.cashTransactionId).toBe(source.id);
    expect(segments).toHaveLength(1);
    expect(segments[0].sourceExpenseId).toBe(source.id);
  });

  test('applyAllocationSegmentsToSources reduces remaining balances, restoreAllocationSegmentsOnSources reverses them', () => {
    const source = createSource();
    const { expense: allocationExpense, segments } = createCashAllocationExpense({
      id: 'cash-allocation-2',
      sources: [source],
      localAmount: 4000,
      date: baseDate,
      trackingCurrency: 'EUR',
      category: 'Activities & Tours'
    });

    const updatedSources = applyAllocationSegmentsToSources([source], segments, allocationExpense.id);
    const updatedSource = updatedSources[0];

    expect(updatedSource.cashTransaction?.remainingLocalAmount).toBeCloseTo(6000, 5);
    expect(updatedSource.cashTransaction?.remainingBaseAmount).toBeCloseTo(30, 5);
    expect(updatedSource.amount).toBeCloseTo(30, 5);
    expect(updatedSource.cashTransaction?.allocationIds).toContain(allocationExpense.id);

    const restoredSources = restoreAllocationSegmentsOnSources(
      updatedSources,
      segments,
      allocationExpense.id
    );
    const restoredSource = restoredSources[0];
    expect(restoredSource.cashTransaction?.remainingLocalAmount).toBeCloseTo(10000, 5);
    expect(restoredSource.cashTransaction?.remainingBaseAmount).toBeCloseTo(50, 5);
    expect(restoredSource.amount).toBeCloseTo(50, 5);
    expect(restoredSource.cashTransaction?.allocationIds).not.toContain(allocationExpense.id);
  });

  test('refund sources keep the original refund amount when allocations are applied', () => {
    const refund = createCashRefundExpense({
      id: 'cash-refund-2',
      date: baseDate,
      localAmount: 10000,
      localCurrency: 'ARS',
      exchangeRate: 0.005,
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    const { expense: allocationExpense, segments } = createCashAllocationExpense({
      id: 'cash-allocation-refund-1',
      sources: [refund],
      localAmount: 2000,
      date: baseDate,
      trackingCurrency: 'EUR',
      category: 'Food & Dining'
    });

    const updatedSources = applyAllocationSegmentsToSources([refund], segments, allocationExpense.id);
    const updatedRefund = updatedSources[0];

    expect(updatedRefund.cashTransaction?.remainingLocalAmount).toBeCloseTo(8000, 5);
    expect(updatedRefund.cashTransaction?.remainingBaseAmount).toBeCloseTo(40, 5);
    expect(updatedRefund.amount).toBeCloseTo(-50, 5);
  });

  test('createCashAllocationExpense throws when overspending remaining cash', () => {
    const source = createSource();

    expect(() =>
      createCashAllocationExpense({
        sources: [source],
        localAmount: 20000,
        date: baseDate,
        trackingCurrency: 'EUR',
        category: 'Shopping'
      })
    ).toThrow('Not enough cash available in this currency to cover the spending.');
  });

  test('cash allocation splits spend across multiple sources using FIFO', () => {
    const firstSource = createCashSourceExpense({
      id: 'cash-source-1',
      date: baseDate,
      baseAmount: 10,
      localAmount: 17000,
      localCurrency: 'ARS',
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    const secondSource = createCashSourceExpense({
      id: 'cash-source-2',
      date: new Date('2024-01-02T00:00:00Z'),
      baseAmount: 10,
      localAmount: 20000,
      localCurrency: 'ARS',
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    const { expense: allocationExpense, segments } = createCashAllocationExpense({
      id: 'cash-allocation-3',
      sources: [firstSource, secondSource],
      localAmount: 18000,
      date: new Date('2024-01-03T00:00:00Z'),
      trackingCurrency: 'EUR',
      category: 'Food & Dining'
    });

    expect(segments).toHaveLength(2);
    expect(segments[0].sourceExpenseId).toBe(firstSource.id);
    expect(segments[0].localAmount).toBeCloseTo(17000, 5);
    expect(segments[1].sourceExpenseId).toBe(secondSource.id);
    expect(segments[1].localAmount).toBeCloseTo(1000, 5);

    const updatedSources = applyAllocationSegmentsToSources(
      [firstSource, secondSource],
      segments,
      allocationExpense.id
    );

    expect(updatedSources[0].cashTransaction.remainingLocalAmount).toBeCloseTo(0, 5);
    expect(updatedSources[1].cashTransaction.remainingLocalAmount).toBeCloseTo(19000, 5);

    const restored = restoreAllocationSegmentsOnSources(
      updatedSources,
      segments,
      allocationExpense.id
    );

    expect(restored[0].cashTransaction.remainingLocalAmount).toBeCloseTo(17000, 5);
    expect(restored[1].cashTransaction.remainingLocalAmount).toBeCloseTo(20000, 5);
  });

  test('cash allocation uses remaining balances when spanning multiple exchanges', () => {
    const firstSource = createCashSourceExpense({
      id: 'cash-source-1',
      date: baseDate,
      baseAmount: 20,
      localAmount: 20000,
      localCurrency: 'ARS',
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    const secondSource = createCashSourceExpense({
      id: 'cash-source-2',
      date: new Date('2024-01-02T00:00:00Z'),
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'ARS',
      trackingCurrency: 'EUR',
      country: 'Argentina'
    });

    const { expense: firstAllocation, segments: firstSegments } = createCashAllocationExpense({
      id: 'cash-allocation-4',
      sources: [firstSource, secondSource],
      localAmount: 19000,
      date: new Date('2024-01-03T00:00:00Z'),
      trackingCurrency: 'EUR',
      category: 'Shopping'
    });

    const updatedSources = applyAllocationSegmentsToSources(
      [firstSource, secondSource],
      firstSegments,
      firstAllocation.id
    );

    const { expense: secondAllocation, segments: secondSegments } = createCashAllocationExpense({
      id: 'cash-allocation-5',
      sources: updatedSources,
      localAmount: 1500,
      date: new Date('2024-01-04T00:00:00Z'),
      trackingCurrency: 'EUR',
      category: 'Food & Dining'
    });

    expect(secondSegments).toHaveLength(2);
    expect(secondSegments[0].sourceExpenseId).toBe(firstSource.id);
    expect(secondSegments[0].localAmount).toBeCloseTo(1000, 5);
    expect(secondSegments[0].baseAmount).toBeCloseTo(1, 5);
    expect(secondSegments[1].sourceExpenseId).toBe(secondSource.id);
    expect(secondSegments[1].localAmount).toBeCloseTo(500, 5);
    expect(secondSegments[1].baseAmount).toBeCloseTo(0.5, 5);

    const finalSources = applyAllocationSegmentsToSources(
      updatedSources,
      secondSegments,
      secondAllocation.id
    );

    expect(finalSources[0].cashTransaction.remainingLocalAmount).toBeCloseTo(0, 5);
    expect(finalSources[1].cashTransaction.remainingLocalAmount).toBeCloseTo(9500, 5);
  });

  test('currency conversion creates a new source funded by prior exchanges', () => {
    const clpSource = createCashSourceExpense({
      id: 'clp-source-1',
      date: baseDate,
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'CLP',
      trackingCurrency: 'EUR',
      country: 'Chile'
    });

    const { newSource, updatedSources, segments } = createCashConversion({
      sources: [clpSource],
      sourceLocalAmount: 4000,
      targetLocalAmount: 20,
      targetCurrency: 'VES',
      date: new Date('2024-02-01T00:00:00Z'),
      trackingCurrency: 'EUR',
      country: 'Bolivia'
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].localAmount).toBeCloseTo(4000, 5);
    expect(newSource.cashTransaction?.fundingSegments).toHaveLength(1);
    expect(newSource.cashTransaction?.originalBaseAmount).toBeCloseTo(4, 5);
    expect(newSource.cashTransaction?.localCurrency).toBe('VES');
    expect(updatedSources[0].cashTransaction.remainingLocalAmount).toBeCloseTo(6000, 5);
    expect(updatedSources[0].cashTransaction.remainingBaseAmount).toBeCloseTo(6, 5);
  });

  test('cash refund to base accounts for losses with exchange fee expense', () => {
    const clpSource = createCashSourceExpense({
      id: 'clp-source-2',
      date: baseDate,
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'CLP',
      trackingCurrency: 'EUR',
      country: 'Chile'
    });

    const { refundExpense, feeExpense, updatedSources, loss, profit } = createCashRefundToBase({
      sources: [clpSource],
      localAmount: 10000,
      exchangeRateBasePerLocal: 0.0009, // Receive €9 back
      date: new Date('2024-02-05T00:00:00Z'),
      trackingCurrency: 'EUR',
      country: 'Chile',
      exchangeFeeCategory: 'Exchange fees'
    });

    expect(refundExpense.amount).toBeCloseTo(-10, 5);
    expect(feeExpense?.amount).toBeCloseTo(1, 5);
    expect(loss).toBeCloseTo(1, 5);
    expect(profit).toBeCloseTo(0, 5);
    expect(updatedSources[0].cashTransaction.remainingLocalAmount).toBeCloseTo(0, 5);
    expect(updatedSources[0].cashTransaction.remainingBaseAmount).toBeCloseTo(0, 5);
  });

  test('cash refund to base captures exchange profit without fee expense', () => {
    const clpSource = createCashSourceExpense({
      id: 'clp-source-3',
      date: baseDate,
      baseAmount: 10,
      localAmount: 10000,
      localCurrency: 'CLP',
      trackingCurrency: 'EUR',
      country: 'Chile'
    });

    const { refundExpense, feeExpense, updatedSources, loss, profit } = createCashRefundToBase({
      sources: [clpSource],
      localAmount: 10000,
      exchangeRateBasePerLocal: 0.0011, // Receive €11 back
      date: new Date('2024-02-06T00:00:00Z'),
      trackingCurrency: 'EUR',
      country: 'Chile'
    });

    expect(refundExpense.amount).toBeCloseTo(-11, 5);
    expect(refundExpense.cashTransaction?.fundingSegments?.[0].localAmount).toBeCloseTo(10000, 5);
    expect(feeExpense).toBeUndefined();
    expect(loss).toBeCloseTo(0, 5);
    expect(profit).toBeCloseTo(1, 5);
    expect(updatedSources[0].cashTransaction.remainingLocalAmount).toBeCloseTo(0, 5);
    expect(updatedSources[0].cashTransaction.remainingBaseAmount).toBeCloseTo(0, 5);
  });
});
