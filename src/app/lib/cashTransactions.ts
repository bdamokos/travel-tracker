import { CashTransactionAllocationDetails, CashTransactionSourceDetails, Expense, TravelReference } from '../types';
import { CASH_CATEGORY_NAME, generateId } from './costUtils';

const CURRENCY_EPSILON = 0.000001;

export function roundCurrency(value: number, precision: number = 2): number {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isCashSource(expense: Expense | undefined): expense is Expense & { cashTransaction: CashTransactionSourceDetails } {
  return Boolean(expense?.cashTransaction && expense.cashTransaction.kind === 'source');
}

export function isCashAllocation(expense: Expense | undefined): expense is Expense & { cashTransaction: CashTransactionAllocationDetails } {
  return Boolean(expense?.cashTransaction && expense.cashTransaction.kind === 'allocation');
}

export interface CashSourceParams {
  id?: string;
  date: Date;
  baseAmount: number;
  localAmount: number;
  localCurrency: string;
  trackingCurrency: string;
  country?: string;
  description?: string;
  notes?: string;
  isGeneralExpense?: boolean;
}

export function createCashSourceExpense(params: CashSourceParams): Expense {
  if (params.baseAmount <= 0 || params.localAmount <= 0) {
    throw new Error('Cash source amounts must be greater than zero.');
  }

  const id = params.id ?? generateId();
  const roundedBase = roundCurrency(params.baseAmount);
  const roundedLocal = roundCurrency(params.localAmount);
  const exchangeRate = roundedLocal > 0 ? roundedBase / roundedLocal : 0;

  return {
    id,
    date: params.date,
    amount: roundedBase,
    currency: params.trackingCurrency,
    category: CASH_CATEGORY_NAME,
    country: params.country || '',
    description:
      params.description ||
      `Cash exchange (${roundedLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${params.localCurrency})`,
    notes: params.notes,
    isGeneralExpense: params.isGeneralExpense ?? !params.country,
    expenseType: 'actual',
    cashTransaction: {
      kind: 'source',
      cashTransactionId: id,
      localCurrency: params.localCurrency,
      originalLocalAmount: roundedLocal,
      remainingLocalAmount: roundedLocal,
      originalBaseAmount: roundedBase,
      remainingBaseAmount: roundedBase,
      exchangeRate,
      allocationIds: []
    }
  };
}

export interface CashAllocationParams {
  id?: string;
  parentExpense: Expense;
  localAmount: number;
  date: Date;
  trackingCurrency: string;
  category: string;
  country?: string;
  description?: string;
  notes?: string;
  isGeneralExpense?: boolean;
  travelReference?: TravelReference;
}

export function createCashAllocationExpense(params: CashAllocationParams): Expense {
  if (!isCashSource(params.parentExpense)) {
    throw new Error('Parent expense is not a cash source transaction.');
  }

  if (params.localAmount <= 0) {
    throw new Error('Cash spending must be greater than zero.');
  }

  const { cashTransaction } = params.parentExpense;

  if (params.localAmount - cashTransaction.remainingLocalAmount > CURRENCY_EPSILON) {
    throw new Error('Cash spending exceeds remaining local amount.');
  }

  const id = params.id ?? generateId();
  const roundedLocal = roundCurrency(params.localAmount);
  const baseRate =
    cashTransaction.originalLocalAmount > 0
      ? cashTransaction.originalBaseAmount / cashTransaction.originalLocalAmount
      : 0;
  const rawBaseAmount = roundedLocal * baseRate;
  const cappedBaseAmount =
    rawBaseAmount - cashTransaction.remainingBaseAmount > CURRENCY_EPSILON
      ? cashTransaction.remainingBaseAmount
      : rawBaseAmount;
  const roundedBase = roundCurrency(cappedBaseAmount);

  return {
    id,
    date: params.date,
    amount: roundedBase,
    currency: params.trackingCurrency,
    category: params.category,
    country: params.country ?? params.parentExpense.country ?? '',
    description:
      params.description ||
      `Cash spending (${roundedLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cashTransaction.localCurrency})`,
    notes: params.notes,
    isGeneralExpense: params.isGeneralExpense ?? !params.country,
    expenseType: 'actual',
    travelReference: params.travelReference,
    cashTransaction: {
      kind: 'allocation',
      cashTransactionId: cashTransaction.cashTransactionId,
      parentExpenseId: params.parentExpense.id,
      localCurrency: cashTransaction.localCurrency,
      localAmount: roundedLocal,
      baseAmount: roundedBase,
      exchangeRate: baseRate
    }
  };
}

export function applyAllocationToSource(
  source: Expense,
  allocation: CashTransactionAllocationDetails,
  allocationExpenseId: string
): Expense {
  if (!isCashSource(source)) {
    throw new Error('Cannot apply allocation to non-cash source.');
  }

  const { cashTransaction } = source;

  if (allocation.localAmount - cashTransaction.remainingLocalAmount > CURRENCY_EPSILON) {
    throw new Error('Allocation exceeds remaining local amount on source.');
  }

  if (allocation.baseAmount - cashTransaction.remainingBaseAmount > CURRENCY_EPSILON) {
    throw new Error('Allocation exceeds remaining base amount on source.');
  }

  const updatedMeta: CashTransactionSourceDetails = {
    ...cashTransaction,
    remainingLocalAmount: roundCurrency(cashTransaction.remainingLocalAmount - allocation.localAmount),
    remainingBaseAmount: roundCurrency(cashTransaction.remainingBaseAmount - allocation.baseAmount),
    allocationIds: cashTransaction.allocationIds.includes(allocationExpenseId)
      ? cashTransaction.allocationIds
      : [...cashTransaction.allocationIds, allocationExpenseId]
  };

  if (updatedMeta.remainingLocalAmount < CURRENCY_EPSILON) {
    updatedMeta.remainingLocalAmount = 0;
  }

  if (updatedMeta.remainingBaseAmount < CURRENCY_EPSILON) {
    updatedMeta.remainingBaseAmount = 0;
  }

  return {
    ...source,
    amount: roundCurrency(updatedMeta.remainingBaseAmount),
    cashTransaction: updatedMeta
  };
}

export function restoreAllocationOnSource(
  source: Expense,
  allocation: CashTransactionAllocationDetails,
  allocationExpenseId: string
): Expense {
  if (!isCashSource(source)) {
    throw new Error('Cannot restore allocation on non-cash source.');
  }

  const { cashTransaction } = source;

  const updatedMeta: CashTransactionSourceDetails = {
    ...cashTransaction,
    remainingLocalAmount: roundCurrency(cashTransaction.remainingLocalAmount + allocation.localAmount),
    remainingBaseAmount: roundCurrency(cashTransaction.remainingBaseAmount + allocation.baseAmount),
    allocationIds: cashTransaction.allocationIds.filter(id => id !== allocationExpenseId)
  };

  if (updatedMeta.remainingLocalAmount > cashTransaction.originalLocalAmount) {
    updatedMeta.remainingLocalAmount = cashTransaction.originalLocalAmount;
  }

  if (updatedMeta.remainingBaseAmount > cashTransaction.originalBaseAmount) {
    updatedMeta.remainingBaseAmount = cashTransaction.originalBaseAmount;
  }

  return {
    ...source,
    amount: roundCurrency(updatedMeta.remainingBaseAmount),
    cashTransaction: updatedMeta
  };
}

export function getAllocationsForSource(expenses: Expense[], sourceId: string): Expense[] {
  return expenses.filter(isCashAllocation).filter(expense => expense.cashTransaction.cashTransactionId === sourceId);
}
