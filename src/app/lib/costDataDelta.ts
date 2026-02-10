import { BudgetItem, CostTrackingData, Expense, YnabConfig, YnabImportData } from '@/app/types';
import { dateReviver } from '@/app/lib/jsonDateReviver';

type EntityWithId = { id: string };

export type CollectionDelta<T extends EntityWithId> = {
  added?: T[];
  updated?: Array<Partial<T> & Pick<T, 'id'>>;
  removedIds?: string[];
  order?: string[];
};

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const withDateSerialization = (_key: string, value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

const serialize = (value: unknown): string => JSON.stringify(value, withDateSerialization) ?? 'null';

const cloneSerializable = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(serialize(value), dateReviver) as T;
};

const hasCollectionChanges = <T extends EntityWithId>(delta?: CollectionDelta<T>): boolean => {
  if (!delta) return false;

  const added = Array.isArray(delta.added) ? delta.added.length : 0;
  const updated = Array.isArray(delta.updated) ? delta.updated.length : 0;
  const removed = Array.isArray(delta.removedIds) ? delta.removedIds.length : 0;
  const order = Array.isArray(delta.order) ? delta.order.length : 0;

  return added > 0 || updated > 0 || removed > 0 || order > 0;
};

const createCollectionDelta = <T extends EntityWithId>(
  previous: T[],
  current: T[]
): CollectionDelta<T> | undefined => {
  const previousMap = new Map(previous.map((item) => [item.id, item]));
  const currentMap = new Map(current.map((item) => [item.id, item]));

  const added = current.filter((item) => !previousMap.has(item.id));
  const updated = current.filter((item) => {
    const previousItem = previousMap.get(item.id);
    if (!previousItem) return false;
    return serialize(previousItem) !== serialize(item);
  });
  const removedIds = previous.filter((item) => !currentMap.has(item.id)).map((item) => item.id);

  const previousOrder = previous.map((item) => item.id);
  const currentOrder = current.map((item) => item.id);
  const orderChanged =
    previousOrder.length !== currentOrder.length ||
    previousOrder.some((id, index) => id !== currentOrder[index]);

  const delta: CollectionDelta<T> = {};
  if (added.length > 0) delta.added = cloneSerializable(added);
  if (updated.length > 0) delta.updated = cloneSerializable(updated);
  if (removedIds.length > 0) delta.removedIds = removedIds;
  if (orderChanged) delta.order = currentOrder;

  return hasCollectionChanges(delta) ? delta : undefined;
};

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

const applyCollectionDelta = <T extends EntityWithId>(
  existing: T[],
  delta?: CollectionDelta<T>
): T[] => {
  const merged = existing.map((item) => cloneSerializable(item));

  if (!delta) {
    return merged;
  }

  const indexById = new Map(merged.map((item, index) => [item.id, index]));

  if (Array.isArray(delta.added)) {
    for (const candidate of delta.added) {
      if (!candidate || !isValidId(candidate.id)) continue;

      const id = candidate.id;
      const next = cloneSerializable(candidate);
      const existingIndex = indexById.get(id);

      if (existingIndex === undefined) {
        indexById.set(id, merged.push(next as T) - 1);
      } else {
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...next
        } as T;
      }
    }
  }

  if (Array.isArray(delta.updated)) {
    for (const candidate of delta.updated) {
      if (!candidate || !isValidId(candidate.id)) continue;

      const id = candidate.id;
      const existingIndex = indexById.get(id);
      if (existingIndex === undefined) continue;

      const next = cloneSerializable(candidate);
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...next
      } as T;
    }
  }

  let filtered = merged;
  if (Array.isArray(delta.removedIds) && delta.removedIds.length > 0) {
    const removed = new Set(delta.removedIds.filter(isValidId));
    if (removed.size > 0) {
      filtered = merged.filter((item) => !removed.has(item.id));
    }
  }

  if (Array.isArray(delta.order) && delta.order.length > 0) {
    const byId = new Map(filtered.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const reordered: T[] = [];

    for (const id of delta.order) {
      if (!isValidId(id)) continue;
      const item = byId.get(id);
      if (!item || seen.has(id)) continue;
      reordered.push(item);
      seen.add(id);
    }

    for (const item of filtered) {
      if (!seen.has(item.id)) {
        reordered.push(item);
      }
    }

    return reordered;
  }

  return filtered;
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

const isCollectionDeltaShape = (value: unknown): value is CollectionDelta<EntityWithId> => {
  if (!isRecord(value)) return false;

  if (value.added !== undefined && !Array.isArray(value.added)) return false;
  if (value.updated !== undefined && !Array.isArray(value.updated)) return false;
  if (value.removedIds !== undefined && !Array.isArray(value.removedIds)) return false;
  if (value.order !== undefined && !Array.isArray(value.order)) return false;

  return true;
};

export const isCostDataDelta = (value: unknown): value is CostDataDelta => {
  if (!isRecord(value)) return false;

  if (value.countryBudgets !== undefined && !isCollectionDeltaShape(value.countryBudgets)) {
    return false;
  }

  if (value.expenses !== undefined && !isCollectionDeltaShape(value.expenses)) {
    return false;
  }

  if (value.customCategories !== undefined && !Array.isArray(value.customCategories)) {
    return false;
  }

  return true;
};

export const snapshotCostData = (data: CostTrackingData): CostTrackingData => cloneSerializable(data);
