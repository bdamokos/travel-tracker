import { BudgetItem, CostTrackingData, Expense, YnabConfig, YnabImportData } from '@/app/types';
import {
  CollectionDelta,
  applyCollectionDelta,
  cloneSerializable,
  createCollectionDelta,
  hasCollectionChanges,
  isCollectionDeltaShape,
  isRecord,
  serialize
} from '@/app/lib/collectionDelta';

export type CostDataDelta = {
  tripTitle?: string;
  tripStartDate?: Date | string;
  tripEndDate?: Date | string;
  overallBudget?: number;
  reservedBudget?: number;
  currency?: string;
  customCategories?: string[];
  countryBudgets?: CollectionDelta<BudgetItem>;
  expenses?: CollectionDelta<Expense>;
  ynabImportData?: YnabImportData;
  ynabConfig?: YnabConfig;
};

const isDateLike = (value: unknown): value is Date | string =>
  value instanceof Date || typeof value === 'string';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isCostDataDeltaEmpty = (delta: CostDataDelta | null | undefined): boolean => {
  if (!delta) return true;

  const scalarChanged =
    Object.prototype.hasOwnProperty.call(delta, 'tripTitle') ||
    Object.prototype.hasOwnProperty.call(delta, 'tripStartDate') ||
    Object.prototype.hasOwnProperty.call(delta, 'tripEndDate') ||
    Object.prototype.hasOwnProperty.call(delta, 'overallBudget') ||
    Object.prototype.hasOwnProperty.call(delta, 'reservedBudget') ||
    Object.prototype.hasOwnProperty.call(delta, 'currency') ||
    Object.prototype.hasOwnProperty.call(delta, 'customCategories') ||
    Object.prototype.hasOwnProperty.call(delta, 'ynabImportData') ||
    Object.prototype.hasOwnProperty.call(delta, 'ynabConfig');

  if (scalarChanged) return false;

  return !hasCollectionChanges(delta.countryBudgets) && !hasCollectionChanges(delta.expenses);
};

export const createCostDataDelta = (
  previous: CostTrackingData,
  current: CostTrackingData
): CostDataDelta | null => {
  const delta: CostDataDelta = {};

  if (serialize(previous.tripTitle) !== serialize(current.tripTitle)) {
    delta.tripTitle = current.tripTitle;
  }

  if (serialize(previous.tripStartDate) !== serialize(current.tripStartDate)) {
    delta.tripStartDate = current.tripStartDate;
  }

  if (serialize(previous.tripEndDate) !== serialize(current.tripEndDate)) {
    delta.tripEndDate = current.tripEndDate;
  }

  if (serialize(previous.overallBudget) !== serialize(current.overallBudget)) {
    delta.overallBudget = current.overallBudget;
  }

  if (serialize(previous.reservedBudget) !== serialize(current.reservedBudget)) {
    delta.reservedBudget = current.reservedBudget;
  }

  if (serialize(previous.currency) !== serialize(current.currency)) {
    delta.currency = current.currency;
  }

  if (serialize(previous.customCategories) !== serialize(current.customCategories)) {
    delta.customCategories = cloneSerializable(current.customCategories || []);
  }

  const countryBudgetsDelta = createCollectionDelta(previous.countryBudgets || [], current.countryBudgets || []);
  if (countryBudgetsDelta) {
    delta.countryBudgets = countryBudgetsDelta;
  }

  const expensesDelta = createCollectionDelta(previous.expenses || [], current.expenses || []);
  if (expensesDelta) {
    delta.expenses = expensesDelta;
  }

  if (serialize(previous.ynabImportData) !== serialize(current.ynabImportData)) {
    delta.ynabImportData = cloneSerializable(current.ynabImportData);
  }

  if (serialize(previous.ynabConfig) !== serialize(current.ynabConfig)) {
    delta.ynabConfig = cloneSerializable(current.ynabConfig);
  }

  return isCostDataDeltaEmpty(delta) ? null : delta;
};

export const applyCostDataDelta = (
  base: CostTrackingData,
  delta: CostDataDelta
): CostTrackingData => {
  const next: CostTrackingData = {
    ...cloneSerializable(base),
    countryBudgets: applyCollectionDelta(base.countryBudgets || [], delta.countryBudgets),
    expenses: applyCollectionDelta(base.expenses || [], delta.expenses)
  };

  if (Object.prototype.hasOwnProperty.call(delta, 'tripTitle') && delta.tripTitle !== undefined) {
    next.tripTitle = delta.tripTitle;
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'tripStartDate') && delta.tripStartDate !== undefined) {
    next.tripStartDate = delta.tripStartDate as CostTrackingData['tripStartDate'];
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'tripEndDate') && delta.tripEndDate !== undefined) {
    next.tripEndDate = delta.tripEndDate as CostTrackingData['tripEndDate'];
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'overallBudget') && delta.overallBudget !== undefined) {
    next.overallBudget = delta.overallBudget;
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'reservedBudget')) {
    next.reservedBudget = delta.reservedBudget;
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'currency') && delta.currency !== undefined) {
    next.currency = delta.currency;
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'customCategories') && delta.customCategories !== undefined) {
    next.customCategories = cloneSerializable(delta.customCategories);
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'ynabImportData')) {
    next.ynabImportData = cloneSerializable(delta.ynabImportData);
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'ynabConfig')) {
    next.ynabConfig = cloneSerializable(delta.ynabConfig);
  }

  return next;
};

export const isCostDataDelta = (value: unknown): value is CostDataDelta => {
  if (!isRecord(value)) return false;

  if (value.tripTitle !== undefined && typeof value.tripTitle !== 'string') return false;
  if (value.tripStartDate !== undefined && !isDateLike(value.tripStartDate)) return false;
  if (value.tripEndDate !== undefined && !isDateLike(value.tripEndDate)) return false;
  if (value.overallBudget !== undefined && !isFiniteNumber(value.overallBudget)) return false;
  if (value.reservedBudget !== undefined && !isFiniteNumber(value.reservedBudget)) return false;
  if (value.currency !== undefined && typeof value.currency !== 'string') return false;

  if (value.countryBudgets !== undefined && !isCollectionDeltaShape(value.countryBudgets)) {
    return false;
  }

  if (value.expenses !== undefined && !isCollectionDeltaShape(value.expenses)) {
    return false;
  }

  if (
    value.customCategories !== undefined &&
    (!Array.isArray(value.customCategories) || value.customCategories.some((category) => typeof category !== 'string'))
  ) {
    return false;
  }

  return true;
};

export const snapshotCostData = (data: CostTrackingData): CostTrackingData => cloneSerializable(data);
