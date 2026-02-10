import { dateReviver } from '@/app/lib/jsonDateReviver';

export type EntityWithId = { id: string };

export type CollectionDelta<T extends EntityWithId> = {
  added?: T[];
  updated?: Array<Partial<T> & Pick<T, 'id'>>;
  removedIds?: string[];
  order?: string[];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const withDateSerialization = (_key: string, value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export const serialize = (value: unknown): string => JSON.stringify(value, withDateSerialization) ?? 'null';

export const cloneSerializable = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(serialize(value), dateReviver) as T;
};

export const hasCollectionChanges = <T extends EntityWithId>(delta?: CollectionDelta<T>): boolean => {
  if (!delta) return false;

  const added = Array.isArray(delta.added) ? delta.added.length : 0;
  const updated = Array.isArray(delta.updated) ? delta.updated.length : 0;
  const removed = Array.isArray(delta.removedIds) ? delta.removedIds.length : 0;
  const order = Array.isArray(delta.order) ? delta.order.length : 0;

  return added > 0 || updated > 0 || removed > 0 || order > 0;
};

export const createCollectionDelta = <T extends EntityWithId>(
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

export const applyCollectionDelta = <T extends EntityWithId>(
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
      if (!candidate || !isValidId(candidate.id)) {
        continue;
      }

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
      if (!candidate || !isValidId(candidate.id)) {
        continue;
      }

      const id = candidate.id;
      const existingIndex = indexById.get(id);
      if (existingIndex === undefined) {
        continue;
      }

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

export const isCollectionDeltaShape = (value: unknown): value is CollectionDelta<EntityWithId> => {
  if (!isRecord(value)) return false;

  if (value.added !== undefined && !Array.isArray(value.added)) return false;
  if (value.updated !== undefined && !Array.isArray(value.updated)) return false;
  if (value.removedIds !== undefined && !Array.isArray(value.removedIds)) return false;
  if (value.order !== undefined && !Array.isArray(value.order)) return false;

  return true;
};
