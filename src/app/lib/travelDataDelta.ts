import { Location, TravelData, TravelRoute } from '@/app/types';
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

export type TravelDataDelta = {
  title?: string;
  description?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  instagramUsername?: string;
  locations?: CollectionDelta<Location>;
  routes?: CollectionDelta<TravelRoute>;
};

const isDateLike = (value: unknown): value is Date | string =>
  value instanceof Date || typeof value === 'string';

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

export const isTravelDataDelta = (value: unknown): value is TravelDataDelta => {
  if (!isRecord(value)) return false;

  if (value.title !== undefined && typeof value.title !== 'string') return false;
  if (value.description !== undefined && typeof value.description !== 'string') return false;
  if (value.startDate !== undefined && !isDateLike(value.startDate)) return false;
  if (value.endDate !== undefined && !isDateLike(value.endDate)) return false;
  if (value.instagramUsername !== undefined && typeof value.instagramUsername !== 'string') return false;

  if (value.locations !== undefined && !isCollectionDeltaShape(value.locations)) {
    return false;
  }

  if (value.routes !== undefined && !isCollectionDeltaShape(value.routes)) {
    return false;
  }

  return true;
};

export const snapshotTravelData = (data: TravelData): TravelData => cloneSerializable(data);
