import { Location, TravelData, TravelRoute } from '@/app/types';
import { dateReviver } from '@/app/lib/jsonDateReviver';

type EntityWithId = { id: string };

export type CollectionDelta<T extends EntityWithId> = {
  added?: T[];
  updated?: Array<Partial<T> & Pick<T, 'id'>>;
  removedIds?: string[];
  order?: string[];
};

export type TravelDataDelta = {
  title?: string;
  description?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  instagramUsername?: string;
  locations?: CollectionDelta<Location>;
  routes?: CollectionDelta<TravelRoute>;
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

export const isTravelDataDeltaEmpty = (delta: TravelDataDelta | null | undefined): boolean => {
  if (!delta) return true;

  const scalarChanged =
    Object.prototype.hasOwnProperty.call(delta, 'title') ||
    Object.prototype.hasOwnProperty.call(delta, 'description') ||
    Object.prototype.hasOwnProperty.call(delta, 'startDate') ||
    Object.prototype.hasOwnProperty.call(delta, 'endDate') ||
    Object.prototype.hasOwnProperty.call(delta, 'instagramUsername');

  if (scalarChanged) return false;

  return !hasCollectionChanges(delta.locations) && !hasCollectionChanges(delta.routes);
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

export const createTravelDataDelta = (
  previous: TravelData,
  current: TravelData
): TravelDataDelta | null => {
  const delta: TravelDataDelta = {};

  if (serialize(previous.title) !== serialize(current.title)) {
    delta.title = current.title;
  }

  if (serialize(previous.description) !== serialize(current.description)) {
    delta.description = current.description;
  }

  if (serialize(previous.startDate) !== serialize(current.startDate)) {
    delta.startDate = current.startDate;
  }

  if (serialize(previous.endDate) !== serialize(current.endDate)) {
    delta.endDate = current.endDate;
  }

  if (serialize(previous.instagramUsername) !== serialize(current.instagramUsername)) {
    delta.instagramUsername = current.instagramUsername;
  }

  const locationsDelta = createCollectionDelta(previous.locations || [], current.locations || []);
  if (locationsDelta) {
    delta.locations = locationsDelta;
  }

  const routesDelta = createCollectionDelta(previous.routes || [], current.routes || []);
  if (routesDelta) {
    delta.routes = routesDelta;
  }

  return isTravelDataDeltaEmpty(delta) ? null : delta;
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

export const applyTravelDataDelta = (
  base: TravelData,
  delta: TravelDataDelta
): TravelData => {
  const next: TravelData = {
    ...cloneSerializable(base),
    locations: applyCollectionDelta(base.locations || [], delta.locations),
    routes: applyCollectionDelta(base.routes || [], delta.routes)
  };

  if (Object.prototype.hasOwnProperty.call(delta, 'title')) {
    next.title = delta.title || '';
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'description')) {
    next.description = delta.description || '';
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'startDate') && delta.startDate !== undefined) {
    next.startDate = delta.startDate as TravelData['startDate'];
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'endDate') && delta.endDate !== undefined) {
    next.endDate = delta.endDate as TravelData['endDate'];
  }

  if (Object.prototype.hasOwnProperty.call(delta, 'instagramUsername')) {
    next.instagramUsername = delta.instagramUsername;
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

export const isTravelDataDelta = (value: unknown): value is TravelDataDelta => {
  if (!isRecord(value)) return false;

  if (value.locations !== undefined && !isCollectionDeltaShape(value.locations)) {
    return false;
  }

  if (value.routes !== undefined && !isCollectionDeltaShape(value.routes)) {
    return false;
  }

  return true;
};

export const snapshotTravelData = (data: TravelData): TravelData => cloneSerializable(data);
