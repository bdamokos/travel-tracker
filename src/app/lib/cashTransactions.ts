import {
  CashTransactionAllocationDetails,
  CashTransactionAllocationSegment,
  CashTransactionSourceDetails,
  Expense,
  TravelReference
} from '../types';
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

export interface CashRefundParams {
  id?: string;
  date: Date;
  localAmount: number;
  localCurrency: string;
  exchangeRate: number;
  trackingCurrency: string;
  country?: string;
  description?: string;
  notes?: string;
  isGeneralExpense?: boolean;
}

export interface CashConversionParams {
  id?: string;
  sources: Expense[];
  sourceLocalAmount: number;
  targetLocalAmount: number;
  targetCurrency: string;
  date: Date;
  trackingCurrency: string;
  country?: string;
  description?: string;
  notes?: string;
  isGeneralExpense?: boolean;
}

export interface CashRefundToBaseParams {
  id?: string;
  sources: Expense[];
  localAmount: number;
  exchangeRateBasePerLocal: number;
  date: Date;
  trackingCurrency: string;
  country?: string;
  description?: string;
  notes?: string;
  isGeneralExpense?: boolean;
  exchangeFeeCategory?: string;
}

function getSourceType(details: CashTransactionSourceDetails): 'exchange' | 'refund' {
  return details.sourceType ?? 'exchange';
}

function getSourceDisplayAmount(details: CashTransactionSourceDetails): number {
  if (getSourceType(details) === 'refund') {
    return roundCurrency(-details.originalBaseAmount);
  }
  return roundCurrency(details.remainingBaseAmount);
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
      sourceType: 'exchange',
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

export function createCashRefundExpense(params: CashRefundParams): Expense {
  if (params.localAmount <= 0) {
    throw new Error('Refund amount must be greater than zero.');
  }

  if (params.exchangeRate <= 0) {
    throw new Error('Exchange rate must be greater than zero.');
  }

  const id = params.id ?? generateId();
  const roundedLocal = roundCurrency(params.localAmount);
  const roundedBase = roundCurrency(roundedLocal * params.exchangeRate);

  if (roundedBase <= 0) {
    throw new Error('Refund base amount must be greater than zero.');
  }

  return {
    id,
    date: params.date,
    amount: -roundedBase,
    currency: params.trackingCurrency,
    category: CASH_CATEGORY_NAME,
    country: params.country || '',
    description:
      params.description ||
      `Cash refund (${roundedLocal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${params.localCurrency})`,
    notes: params.notes,
    isGeneralExpense: params.isGeneralExpense ?? !params.country,
    expenseType: 'actual',
    cashTransaction: {
      kind: 'source',
      cashTransactionId: id,
      sourceType: 'refund',
      localCurrency: params.localCurrency,
      originalLocalAmount: roundedLocal,
      remainingLocalAmount: roundedLocal,
      originalBaseAmount: roundedBase,
      remainingBaseAmount: roundedBase,
      exchangeRate: params.exchangeRate,
      allocationIds: []
    }
  };
}

export function validateSourceCurrencyConsistency(sources: Expense[]): string {
  const cashSources = sources.filter(isCashSource);
  if (cashSources.length === 0) {
    throw new Error('No valid cash transactions provided for this operation.');
  }

  const referenceCurrency = cashSources[0].cashTransaction.localCurrency;
  const mismatchedCurrency = cashSources.find(source => getSourceCurrency(source) !== referenceCurrency);
  if (mismatchedCurrency) {
    throw new Error('All cash transactions must be in the same local currency for this operation.');
  }

  return referenceCurrency;
}

export interface CashAllocationParams {
  id?: string;
  sources: Expense[];
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

export interface CashAllocationResult {
  expense: Expense;
  segments: CashTransactionAllocationSegment[];
}

function getSourceCurrency(source: Expense): string {
  if (!isCashSource(source)) {
    throw new Error('Expense is not a cash source transaction.');
  }
  return source.cashTransaction.localCurrency;
}

function sortSourcesFifo(sources: Expense[]): Expense[] {
  return [...sources].sort((a, b) => {
    const aDate = new Date(a.date).getTime();
    const bDate = new Date(b.date).getTime();
    if (aDate !== bDate) {
      return aDate - bDate;
    }
    return a.id.localeCompare(b.id);
  });
}

function createSegmentsFromSources(
  sources: Expense[],
  requestedLocalAmount: number
): CashTransactionAllocationSegment[] {
  const sortedSources = sortSourcesFifo(sources);
  const segments: CashTransactionAllocationSegment[] = [];
  let remaining = roundCurrency(requestedLocalAmount, 6);

  const calculateBaseForSegment = (source: Expense, localAmount: number, availableLocal: number): number => {
    if (!isCashSource(source)) {
      throw new Error('Cannot calculate base amount for non-cash source.');
    }

    const usesFullSource = Math.abs(localAmount - availableLocal) <= CURRENCY_EPSILON;
    if (usesFullSource) {
      return roundCurrency(source.cashTransaction.remainingBaseAmount);
    }

    const baseRate =
      source.cashTransaction.originalLocalAmount > 0
        ? source.cashTransaction.originalBaseAmount / source.cashTransaction.originalLocalAmount
        : 0;

    return roundCurrency(localAmount * baseRate);
  };

  for (const source of sortedSources) {
    if (!isCashSource(source)) {
      continue;
    }

    const availableLocal = roundCurrency(source.cashTransaction.remainingLocalAmount, 6);
    if (availableLocal <= 0) {
      continue;
    }

    const localToUse = Math.min(availableLocal, remaining);
    if (localToUse <= 0) {
      continue;
    }

    const roundedLocalToUse = roundCurrency(localToUse, 6);
    const baseToUse = calculateBaseForSegment(source, roundedLocalToUse, availableLocal);

    segments.push({
      sourceExpenseId: source.id,
      localAmount: roundedLocalToUse,
      baseAmount: baseToUse
    });

    remaining = roundCurrency(remaining - roundedLocalToUse, 6);

    if (remaining <= CURRENCY_EPSILON) {
      remaining = 0;
      break;
    }
  }

  if (remaining > CURRENCY_EPSILON) {
    throw new Error('Not enough cash available in this currency to cover the spending.');
  }

  // Adjust final segment for rounding discrepancies
  const totalLocal = segments.reduce((sum, segment) => sum + segment.localAmount, 0);
  const localDiscrepancy = roundCurrency(requestedLocalAmount - totalLocal, 6);
  if (Math.abs(localDiscrepancy) > CURRENCY_EPSILON && segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    const lastSource = sortedSources.find(source => source.id === lastSegment.sourceExpenseId);
    if (!lastSource || !isCashSource(lastSource)) {
      throw new Error(
        'Failed to find a valid cash source for the final allocation segment adjustment.'
      );
    }
    lastSegment.localAmount = roundCurrency(lastSegment.localAmount + localDiscrepancy, 6);
    const availableLocal = roundCurrency(lastSource.cashTransaction.remainingLocalAmount, 6);
    lastSegment.baseAmount = calculateBaseForSegment(lastSource, lastSegment.localAmount, availableLocal);
  }

  return segments;
}

export function createCashAllocationExpense(params: CashAllocationParams): CashAllocationResult {
  if (params.localAmount <= 0) {
    throw new Error('Cash spending must be greater than zero.');
  }

  if (!params.sources || params.sources.length === 0) {
    throw new Error('At least one cash transaction is required to allocate spending.');
  }

  const cashSources = params.sources.filter(isCashSource);
  if (cashSources.length === 0) {
    throw new Error('No valid cash transactions provided for allocation.');
  }

  const referenceCurrency = validateSourceCurrencyConsistency(cashSources);

  const segments = createSegmentsFromSources(cashSources, params.localAmount);
  const totalBaseAmount = roundCurrency(
    segments.reduce((sum, segment) => sum + segment.baseAmount, 0)
  );
  const roundedLocalAmount = roundCurrency(params.localAmount);

  if (segments.length === 0 || totalBaseAmount <= 0) {
    throw new Error('Unable to allocate cash spending with the provided transactions.');
  }

  const id = params.id ?? generateId();

  const expense: Expense = {
    id,
    date: params.date,
    amount: totalBaseAmount,
    currency: params.trackingCurrency,
    category: params.category,
    country: params.country ?? cashSources[0].country ?? '',
    description:
      params.description ||
      `Cash spending (${roundedLocalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${referenceCurrency})`,
    notes: params.notes,
    isGeneralExpense: params.isGeneralExpense ?? !params.country,
    expenseType: 'actual',
    travelReference: params.travelReference,
    cashTransaction: {
      kind: 'allocation',
      cashTransactionId: segments[0].sourceExpenseId,
      parentExpenseId: segments.length === 1 ? segments[0].sourceExpenseId : undefined,
      localCurrency: referenceCurrency,
      localAmount: roundedLocalAmount,
      baseAmount: totalBaseAmount,
      exchangeRate: roundedLocalAmount > 0 ? totalBaseAmount / roundedLocalAmount : 0,
      segments
    }
  };

  return { expense, segments };
}

function applyAllocationSegmentToSource(
  source: Expense,
  segment: CashTransactionAllocationSegment,
  allocationExpenseId: string
): Expense {
  if (!isCashSource(source)) {
    throw new Error('Cannot apply allocation to non-cash source.');
  }

  if (segment.localAmount - source.cashTransaction.remainingLocalAmount > CURRENCY_EPSILON) {
    throw new Error('Allocation exceeds remaining local amount on source.');
  }

  if (segment.baseAmount - source.cashTransaction.remainingBaseAmount > CURRENCY_EPSILON) {
    throw new Error('Allocation exceeds remaining base amount on source.');
  }

  const updatedMeta: CashTransactionSourceDetails = {
    ...source.cashTransaction,
    remainingLocalAmount: roundCurrency(source.cashTransaction.remainingLocalAmount - segment.localAmount, 6),
    remainingBaseAmount: roundCurrency(source.cashTransaction.remainingBaseAmount - segment.baseAmount),
    allocationIds: source.cashTransaction.allocationIds.includes(allocationExpenseId)
      ? source.cashTransaction.allocationIds
      : [...source.cashTransaction.allocationIds, allocationExpenseId]
  };

  if (updatedMeta.remainingLocalAmount < CURRENCY_EPSILON) {
    updatedMeta.remainingLocalAmount = 0;
  }

  if (updatedMeta.remainingBaseAmount < CURRENCY_EPSILON) {
    updatedMeta.remainingBaseAmount = 0;
  }

  return {
    ...source,
    amount: getSourceDisplayAmount(updatedMeta),
    cashTransaction: updatedMeta
  };
}

function restoreAllocationSegmentOnSource(
  source: Expense,
  segment: CashTransactionAllocationSegment,
  allocationExpenseId: string
): Expense {
  if (!isCashSource(source)) {
    throw new Error('Cannot restore allocation on non-cash source.');
  }

  const updatedMeta: CashTransactionSourceDetails = {
    ...source.cashTransaction,
    remainingLocalAmount: roundCurrency(source.cashTransaction.remainingLocalAmount + segment.localAmount, 6),
    remainingBaseAmount: roundCurrency(source.cashTransaction.remainingBaseAmount + segment.baseAmount),
    allocationIds: source.cashTransaction.allocationIds.filter(id => id !== allocationExpenseId)
  };

  if (updatedMeta.remainingLocalAmount > source.cashTransaction.originalLocalAmount) {
    updatedMeta.remainingLocalAmount = source.cashTransaction.originalLocalAmount;
  }

  if (updatedMeta.remainingBaseAmount > source.cashTransaction.originalBaseAmount) {
    updatedMeta.remainingBaseAmount = source.cashTransaction.originalBaseAmount;
  }

  return {
    ...source,
    amount: getSourceDisplayAmount(updatedMeta),
    cashTransaction: updatedMeta
  };
}

export function applyAllocationSegmentsToSources(
  sources: Expense[],
  segments: CashTransactionAllocationSegment[],
  allocationExpenseId: string
): Expense[] {
  if (segments.length === 0) {
    return sources;
  }

  const segmentMap = new Map(segments.map(segment => [segment.sourceExpenseId, segment]));

  return sources.map(source => {
    const segment = segmentMap.get(source.id);
    if (!segment) {
      return source;
    }
    return applyAllocationSegmentToSource(source, segment, allocationExpenseId);
  });
}

export function restoreAllocationSegmentsOnSources(
  sources: Expense[],
  segments: CashTransactionAllocationSegment[],
  allocationExpenseId: string
): Expense[] {
  if (segments.length === 0) {
    return sources;
  }

  const segmentMap = new Map(segments.map(segment => [segment.sourceExpenseId, segment]));

  return sources.map(source => {
    const segment = segmentMap.get(source.id);
    if (!segment) {
      return source;
    }
    return restoreAllocationSegmentOnSource(source, segment, allocationExpenseId);
  });
}

export function getAllocationSegments(details: CashTransactionAllocationDetails): CashTransactionAllocationSegment[] {
  if (details.segments && details.segments.length > 0) {
    return details.segments.map(segment => ({ ...segment }));
  }

  const sourceExpenseId = details.parentExpenseId || details.cashTransactionId;

  return [
    {
      sourceExpenseId,
      localAmount: details.localAmount,
      baseAmount: details.baseAmount
    }
  ];
}

export function getAllocationsForSource(expenses: Expense[], sourceId: string): Expense[] {
  return expenses
    .filter(isCashAllocation)
    .filter(expense => getAllocationSegments(expense.cashTransaction).some(segment => segment.sourceExpenseId === sourceId));
}

export function createCashConversion(params: CashConversionParams): {
  newSource: Expense;
  segments: CashTransactionAllocationSegment[];
  updatedSources: Expense[];
} {
  if (params.sourceLocalAmount <= 0 || params.targetLocalAmount <= 0) {
    throw new Error('Conversion amounts must be greater than zero.');
  }

  const referenceCurrency = validateSourceCurrencyConsistency(params.sources);
  const segments = createSegmentsFromSources(params.sources, params.sourceLocalAmount);
  const totalBaseAmount = roundCurrency(segments.reduce((sum, segment) => sum + segment.baseAmount, 0));

  if (totalBaseAmount <= 0) {
    throw new Error('Unable to determine base amount for converted cash.');
  }

  const newSource = createCashSourceExpense({
    id: params.id,
    date: params.date,
    baseAmount: totalBaseAmount,
    localAmount: params.targetLocalAmount,
    localCurrency: params.targetCurrency,
    trackingCurrency: params.trackingCurrency,
    country: params.country,
    description:
      params.description ||
      `Cash conversion from ${referenceCurrency} to ${params.targetCurrency}`,
    notes: params.notes,
    isGeneralExpense: params.isGeneralExpense ?? !params.country
  });

  const updatedSources = applyAllocationSegmentsToSources(params.sources, segments, newSource.id);
  const newSourceDetails = newSource.cashTransaction as CashTransactionSourceDetails;

  return {
    newSource: {
      ...newSource,
      cashTransaction: {
        ...newSourceDetails,
        fundingSegments: segments
      }
    },
    segments,
    updatedSources
  };
}

export function createCashRefundToBase(params: CashRefundToBaseParams): {
  refundExpense: Expense;
  feeExpense: Expense | undefined;
  segments: CashTransactionAllocationSegment[];
  updatedSources: Expense[];
  loss: number;
  profit: number;
} {
  if (params.localAmount <= 0) {
    throw new Error('Refund amount must be greater than zero.');
  }

  if (params.exchangeRateBasePerLocal <= 0) {
    throw new Error('Exchange rate must be greater than zero.');
  }

  const referenceCurrency = validateSourceCurrencyConsistency(params.sources);
  const segments = createSegmentsFromSources(params.sources, params.localAmount);
  const baseFromSources = roundCurrency(segments.reduce((sum, segment) => sum + segment.baseAmount, 0));
  const baseReceived = roundCurrency(params.localAmount * params.exchangeRateBasePerLocal);

  if (baseFromSources <= 0) {
    throw new Error('Unable to calculate the source base amount for the refund.');
  }

  const refundBaseAmount = baseReceived > baseFromSources ? baseReceived : baseFromSources;
  const loss = baseFromSources > baseReceived ? roundCurrency(baseFromSources - baseReceived) : 0;
  const profit = baseReceived > baseFromSources ? roundCurrency(baseReceived - baseFromSources) : 0;

  const description =
    params.description || `Cash refund to ${params.trackingCurrency} from ${referenceCurrency}`;

  const notesParts: string[] = [];
  if (loss > 0) {
    notesParts.push(
      `Exchange loss of ${loss.toFixed(2)} ${params.trackingCurrency} recorded as a separate fee expense.`
    );
  }
  if (profit > 0) {
    notesParts.push(`Exchange profit of ${profit.toFixed(2)} ${params.trackingCurrency}.`);
  }
  if (params.notes) {
    notesParts.push(params.notes);
  }

  const refundExpense = createCashRefundExpense({
    id: params.id,
    date: params.date,
    localAmount: params.localAmount,
    localCurrency: referenceCurrency,
    exchangeRate: refundBaseAmount / params.localAmount,
    trackingCurrency: params.trackingCurrency,
    country: params.country,
    description,
    notes: notesParts.length > 0 ? notesParts.join(' ') : undefined,
    isGeneralExpense: params.isGeneralExpense ?? !params.country
  });

  const refundSourceDetails = refundExpense.cashTransaction as CashTransactionSourceDetails;
  const refundWithFunding: Expense = {
    ...refundExpense,
    cashTransaction: {
      ...refundSourceDetails,
      remainingLocalAmount: 0,
      remainingBaseAmount: 0,
      fundingSegments: segments
    }
  };

  const feeExpense =
    loss > 0
      ? ({
          id: generateId(),
          date: params.date,
          amount: loss,
          currency: params.trackingCurrency,
          category: params.exchangeFeeCategory || 'Exchange fees',
          country: params.country || '',
          description: `Exchange loss on ${referenceCurrency} refund`,
          notes: `Associated with refund transaction: ${refundExpense.id}`,
          isGeneralExpense: params.isGeneralExpense ?? !params.country,
          expenseType: 'actual'
        } satisfies Expense)
      : undefined;

  const updatedSources = applyAllocationSegmentsToSources(params.sources, segments, refundExpense.id);

  return {
    refundExpense: refundWithFunding,
    feeExpense,
    segments,
    updatedSources,
    loss,
    profit
  };
}
