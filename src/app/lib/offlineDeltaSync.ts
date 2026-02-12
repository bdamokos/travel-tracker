import {
  createCostDataDelta,
  isCostDataDelta,
  isCostDataDeltaEmpty,
  snapshotCostData,
  type CostDataDelta
} from '@/app/lib/costDataDelta';
import { cloneSerializable, isRecord } from '@/app/lib/collectionDelta';
import { dateReviver } from '@/app/lib/jsonDateReviver';
import {
  createTravelDataDelta,
  isTravelDataDelta,
  isTravelDataDeltaEmpty,
  snapshotTravelData,
  type TravelDataDelta
} from '@/app/lib/travelDataDelta';
import type { CostTrackingData, TravelData } from '@/app/types';

const STORAGE_KEY = 'travel-tracker-offline-delta-queue-v1';
export const OFFLINE_DELTA_QUEUE_EVENT = 'travel-tracker-offline-delta-queue-changed';

type OfflineQueueStatus = 'pending' | 'conflict';

type OfflineQueueEntryBase = {
  kind: 'travel' | 'cost';
  id: string;
  queuedAt: string;
  updatedAt: string;
  status: OfflineQueueStatus;
  conflictDetectedAt?: string;
};

export type OfflineTravelQueueEntry = OfflineQueueEntryBase & {
  kind: 'travel';
  baseSnapshot: TravelData;
  pendingSnapshot: TravelData;
  delta: TravelDataDelta;
  lastServerDelta?: TravelDataDelta;
};

export type OfflineCostQueueEntry = OfflineQueueEntryBase & {
  kind: 'cost';
  baseSnapshot: CostTrackingData;
  pendingSnapshot: CostTrackingData;
  delta: CostDataDelta;
  lastServerDelta?: CostDataDelta;
};

export type OfflineQueueEntry = OfflineTravelQueueEntry | OfflineCostQueueEntry;

export type OfflineDeltaConflict =
  | {
      kind: 'travel';
      id: string;
      queuedAt: string;
      pendingDelta: TravelDataDelta;
      serverDelta: TravelDataDelta | null;
    }
  | {
      kind: 'cost';
      id: string;
      queuedAt: string;
      pendingDelta: CostDataDelta;
      serverDelta: CostDataDelta | null;
    };

export type OfflineDeltaSyncSummary = {
  synced: number;
  conflicts: number;
  failed: number;
  remainingPending: number;
  remainingConflicts: number;
};

export type OfflineQueueSummary = {
  total: number;
  pending: number;
  conflicts: number;
};

type QueueTravelDeltaInput = {
  id: string;
  baseSnapshot: TravelData;
  pendingSnapshot: TravelData;
};

type QueueCostDeltaInput = {
  id: string;
  baseSnapshot: CostTrackingData;
  pendingSnapshot: CostTrackingData;
};

type QueueDeltaResult = {
  queued: boolean;
  pendingCount: number;
};

type SyncOfflineDeltaQueueOptions = {
  onConflict?: (conflict: OfflineDeltaConflict) => void;
  onSynced?: (entry: OfflineQueueEntry) => void;
  onError?: (entry: OfflineQueueEntry, error: unknown) => void;
};

let inFlightSync: Promise<OfflineDeltaSyncSummary> | null = null;
let syncSubscribers: SyncOfflineDeltaQueueOptions[] = [];

const canUseStorage = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const isOfflineQueueStatus = (value: unknown): value is OfflineQueueStatus =>
  value === 'pending' || value === 'conflict';

const normalizeTimestampField = (value: unknown): string | null => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const summarizeQueue = (entries: OfflineQueueEntry[]): OfflineQueueSummary => {
  const pending = entries.filter((entry) => entry.status === 'pending').length;
  const conflicts = entries.filter((entry) => entry.status === 'conflict').length;
  return {
    total: entries.length,
    pending,
    conflicts
  };
};

const emitQueueChanged = (entries: OfflineQueueEntry[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(OFFLINE_DELTA_QUEUE_EVENT, {
      detail: summarizeQueue(entries)
    })
  );
};

const parseStoredEntries = (raw: unknown): OfflineQueueEntry[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((entry): entry is OfflineQueueEntry => {
    if (!isRecord(entry)) return false;
    if ((entry.kind !== 'travel' && entry.kind !== 'cost') || typeof entry.id !== 'string' || entry.id.length === 0) {
      return false;
    }
    if (!isOfflineQueueStatus(entry.status)) {
      return false;
    }

    const queuedAt = normalizeTimestampField(entry.queuedAt);
    const updatedAt = normalizeTimestampField(entry.updatedAt);
    if (!queuedAt || !updatedAt) {
      return false;
    }
    entry.queuedAt = queuedAt;
    entry.updatedAt = updatedAt;

    if (entry.conflictDetectedAt !== undefined) {
      const normalizedConflictDetectedAt = normalizeTimestampField(entry.conflictDetectedAt);
      if (!normalizedConflictDetectedAt) {
        return false;
      }
      entry.conflictDetectedAt = normalizedConflictDetectedAt;
    }

    if (!isRecord(entry.baseSnapshot) || !isRecord(entry.pendingSnapshot)) {
      return false;
    }

    if (!isRecord(entry.delta)) {
      return false;
    }

    if (entry.kind === 'travel') {
      return isTravelDataDelta(entry.delta);
    }

    return isCostDataDelta(entry.delta);
  });
};

const readQueue = (): OfflineQueueEntry[] => {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw, dateReviver);
    return parseStoredEntries(parsed);
  } catch (error) {
    console.error('Failed to read offline delta queue:', error);
    return [];
  }
};

const writeQueue = (entries: OfflineQueueEntry[]): void => {
  if (!canUseStorage()) {
    return;
  }

  try {
    if (entries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      emitQueueChanged(entries);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    emitQueueChanged(entries);
  } catch (error) {
    console.error('Failed to write offline delta queue:', error);
  }
};

const toTravelDeltaComparable = (
  candidate: Partial<TravelData>,
  fallback: TravelData
): TravelData => {
  return {
    id: candidate.id || fallback.id,
    title: candidate.title ?? fallback.title,
    description: candidate.description ?? fallback.description,
    startDate: (candidate.startDate ?? fallback.startDate) as TravelData['startDate'],
    endDate: (candidate.endDate ?? fallback.endDate) as TravelData['endDate'],
    instagramUsername: candidate.instagramUsername ?? fallback.instagramUsername,
    locations: Array.isArray(candidate.locations) ? candidate.locations : fallback.locations,
    routes: Array.isArray(candidate.routes) ? candidate.routes : fallback.routes,
    accommodations: Array.isArray(candidate.accommodations)
      ? candidate.accommodations
      : fallback.accommodations
  };
};

const toCostDeltaComparable = (
  candidate: Partial<CostTrackingData>,
  fallback: CostTrackingData
): CostTrackingData => {
  return {
    id: candidate.id ?? fallback.id,
    tripId: candidate.tripId ?? fallback.tripId,
    tripTitle: candidate.tripTitle ?? fallback.tripTitle,
    tripStartDate: (candidate.tripStartDate ?? fallback.tripStartDate) as CostTrackingData['tripStartDate'],
    tripEndDate: (candidate.tripEndDate ?? fallback.tripEndDate) as CostTrackingData['tripEndDate'],
    overallBudget: candidate.overallBudget ?? fallback.overallBudget,
    reservedBudget: candidate.reservedBudget ?? fallback.reservedBudget,
    currency: candidate.currency ?? fallback.currency,
    countryBudgets: Array.isArray(candidate.countryBudgets) ? candidate.countryBudgets : fallback.countryBudgets,
    expenses: Array.isArray(candidate.expenses) ? candidate.expenses : fallback.expenses,
    customCategories: Array.isArray(candidate.customCategories)
      ? candidate.customCategories
      : fallback.customCategories,
    ynabImportData: candidate.ynabImportData ?? fallback.ynabImportData,
    ynabConfig: candidate.ynabConfig ?? fallback.ynabConfig,
    createdAt: candidate.createdAt ?? fallback.createdAt,
    updatedAt: candidate.updatedAt ?? fallback.updatedAt
  };
};

const getPendingCount = (entries: OfflineQueueEntry[]): number =>
  entries.filter((entry) => entry.status === 'pending').length;

export const normalizeCostEntryId = (id: string): string => id.replace(/^(cost-)+/, '');

export const getOfflineQueueEntries = (): OfflineQueueEntry[] => {
  return readQueue().map((entry) => cloneSerializable(entry));
};

export const getOfflineQueueSummary = (): OfflineQueueSummary => summarizeQueue(readQueue());

export const queueTravelDelta = ({ id, baseSnapshot, pendingSnapshot }: QueueTravelDeltaInput): QueueDeltaResult => {
  if (!id) {
    return { queued: false, pendingCount: 0 };
  }

  const queue = readQueue();
  const existingIndex = queue.findIndex((entry) => entry.kind === 'travel' && entry.id === id);
  const now = new Date().toISOString();

  const canonicalBase = existingIndex >= 0 && queue[existingIndex].kind === 'travel'
    ? snapshotTravelData(queue[existingIndex].baseSnapshot)
    : snapshotTravelData(baseSnapshot);
  const canonicalPending = snapshotTravelData(pendingSnapshot);
  const mergedDelta = createTravelDataDelta(canonicalBase, canonicalPending);

  if (!mergedDelta || isTravelDataDeltaEmpty(mergedDelta)) {
    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
      writeQueue(queue);
    }
    return { queued: false, pendingCount: getPendingCount(queue) };
  }

  const nextEntry: OfflineTravelQueueEntry = {
    kind: 'travel',
    id,
    baseSnapshot: canonicalBase,
    pendingSnapshot: canonicalPending,
    delta: mergedDelta,
    queuedAt: existingIndex >= 0 ? queue[existingIndex].queuedAt : now,
    updatedAt: now,
    status: 'pending'
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = nextEntry;
  } else {
    queue.push(nextEntry);
  }

  writeQueue(queue);
  return { queued: true, pendingCount: getPendingCount(queue) };
};

export const queueCostDelta = ({ id, baseSnapshot, pendingSnapshot }: QueueCostDeltaInput): QueueDeltaResult => {
  if (!id) {
    return { queued: false, pendingCount: 0 };
  }

  const normalizedId = normalizeCostEntryId(id);
  const queue = readQueue();
  const existingIndex = queue.findIndex(
    (entry) => entry.kind === 'cost' && normalizeCostEntryId(entry.id) === normalizedId
  );
  const now = new Date().toISOString();

  const canonicalBase = existingIndex >= 0 && queue[existingIndex].kind === 'cost'
    ? snapshotCostData(queue[existingIndex].baseSnapshot)
    : snapshotCostData(baseSnapshot);
  const canonicalPending = snapshotCostData(pendingSnapshot);
  const mergedDelta = createCostDataDelta(canonicalBase, canonicalPending);

  if (!mergedDelta || isCostDataDeltaEmpty(mergedDelta)) {
    if (existingIndex >= 0) {
      queue.splice(existingIndex, 1);
      writeQueue(queue);
    }
    return { queued: false, pendingCount: getPendingCount(queue) };
  }

  const nextEntry: OfflineCostQueueEntry = {
    kind: 'cost',
    id: normalizedId,
    baseSnapshot: canonicalBase,
    pendingSnapshot: canonicalPending,
    delta: mergedDelta,
    queuedAt: existingIndex >= 0 ? queue[existingIndex].queuedAt : now,
    updatedAt: now,
    status: 'pending'
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = nextEntry;
  } else {
    queue.push(nextEntry);
  }

  writeQueue(queue);
  return { queued: true, pendingCount: getPendingCount(queue) };
};

export const formatOfflineConflictMessage = (conflict: OfflineDeltaConflict): string => {
  const entityLabel = conflict.kind === 'travel' ? 'travel map' : 'cost tracker';
  const serverDeltaText = conflict.serverDelta
    ? JSON.stringify(conflict.serverDelta, null, 2)
    : '{}';

  return (
    `Offline sync conflict for ${entityLabel} "${conflict.id}".\n\n` +
    'Your queued local delta cannot be applied because server data changed while you were offline.\n\n' +
    'Queued local delta (changes that would be lost):\n' +
    `${JSON.stringify(conflict.pendingDelta, null, 2)}\n\n` +
    'Server-side changes since your offline base snapshot:\n' +
    `${serverDeltaText}`
  );
};

const syncTravelEntry = async (
  entry: OfflineTravelQueueEntry
): Promise<{ status: 'synced' | 'conflict' | 'failed'; conflict?: OfflineDeltaConflict }> => {
  const coreResult = await syncEntryCore({
    id: entry.id,
    fetchUrl: `/api/travel-data?id=${encodeURIComponent(entry.id)}`,
    patchUrl: `/api/travel-data?id=${encodeURIComponent(entry.id)}`,
    baseSnapshot: entry.baseSnapshot,
    pendingDelta: entry.delta,
    toComparable: toTravelDeltaComparable,
    createDelta: createTravelDataDelta,
    isDeltaEmpty: isTravelDataDeltaEmpty
  });

  if (coreResult.status === 'conflict') {
    return {
      status: 'conflict',
      conflict: {
        kind: 'travel',
        id: entry.id,
        queuedAt: entry.queuedAt,
        pendingDelta: cloneSerializable(entry.delta),
        serverDelta: coreResult.serverDelta as TravelDataDelta | null
      }
    };
  }

  return coreResult;
};

const syncCostEntry = async (
  entry: OfflineCostQueueEntry
): Promise<{ status: 'synced' | 'conflict' | 'failed'; conflict?: OfflineDeltaConflict }> => {
  const coreResult = await syncEntryCore({
    id: entry.id,
    fetchUrl: `/api/cost-tracking?id=${encodeURIComponent(entry.id)}`,
    patchUrl: `/api/cost-tracking?id=${encodeURIComponent(entry.id)}`,
    baseSnapshot: entry.baseSnapshot,
    pendingDelta: entry.delta,
    toComparable: toCostDeltaComparable,
    createDelta: createCostDataDelta,
    isDeltaEmpty: isCostDataDeltaEmpty
  });

  if (coreResult.status === 'conflict') {
    return {
      status: 'conflict',
      conflict: {
        kind: 'cost',
        id: entry.id,
        queuedAt: entry.queuedAt,
        pendingDelta: cloneSerializable(entry.delta),
        serverDelta: coreResult.serverDelta as CostDataDelta | null
      }
    };
  }

  return coreResult;
};

type SyncEntryCoreParams<TSnapshot, TDelta> = {
  id: string;
  fetchUrl: string;
  patchUrl: string;
  baseSnapshot: TSnapshot;
  pendingDelta: TDelta;
  toComparable: (candidate: Partial<TSnapshot>, fallback: TSnapshot) => TSnapshot;
  createDelta: (previous: TSnapshot, current: TSnapshot) => TDelta | null;
  isDeltaEmpty: (delta: TDelta | null | undefined) => boolean;
};

const syncEntryCore = async <TSnapshot, TDelta>({
  fetchUrl,
  patchUrl,
  baseSnapshot,
  pendingDelta,
  toComparable,
  createDelta,
  isDeltaEmpty
}: SyncEntryCoreParams<TSnapshot, TDelta>): Promise<{
  status: 'synced' | 'conflict' | 'failed';
  serverDelta?: TDelta | null;
}> => {
  const response = await fetch(fetchUrl, { cache: 'no-store' });
  if (!response.ok) {
    return { status: 'failed' };
  }

  const serverRaw = (await response.json()) as Partial<TSnapshot>;
  const baseComparable = toComparable(baseSnapshot, baseSnapshot);
  const serverComparable = toComparable(serverRaw, baseSnapshot);
  const serverDelta = createDelta(baseComparable, serverComparable);

  if (serverDelta && !isDeltaEmpty(serverDelta)) {
    return {
      status: 'conflict',
      serverDelta
    };
  }

  const patchResponse = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ deltaUpdate: pendingDelta })
  });

  if (!patchResponse.ok) {
    return { status: 'failed' };
  }

  return { status: 'synced' };
};

const runSyncOfflineDeltaQueue = async (
  options: SyncOfflineDeltaQueueOptions
): Promise<OfflineDeltaSyncSummary> => {
  const queue = readQueue();
  if (queue.length === 0) {
    return {
      synced: 0,
      conflicts: 0,
      failed: 0,
      remainingPending: 0,
      remainingConflicts: 0
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const pendingCount = getPendingCount(queue);
    return {
      synced: 0,
      conflicts: 0,
      failed: pendingCount,
      remainingPending: pendingCount,
      remainingConflicts: queue.length - pendingCount
    };
  }

  let synced = 0;
  let conflicts = 0;
  let failed = 0;
  let changed = false;

  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index];
    if (entry.status === 'conflict') {
      continue;
    }

    try {
      const result = entry.kind === 'travel'
        ? await syncTravelEntry(entry)
        : await syncCostEntry(entry);

      if (result.status === 'synced') {
        synced += 1;
        changed = true;
        options.onSynced?.(entry);
        queue.splice(index, 1);
        index -= 1;
        continue;
      }

      if (result.status === 'conflict') {
        conflicts += 1;
        changed = true;
        const now = new Date().toISOString();
        const conflictDelta = result.conflict?.serverDelta;

        queue[index] = entry.kind === 'travel'
          ? {
              ...entry,
              status: 'conflict',
              conflictDetectedAt: now,
              updatedAt: now,
              lastServerDelta: (conflictDelta as TravelDataDelta | null) || undefined
            }
          : {
              ...entry,
              status: 'conflict',
              conflictDetectedAt: now,
              updatedAt: now,
              lastServerDelta: (conflictDelta as CostDataDelta | null) || undefined
            };

        if (result.conflict) {
          options.onConflict?.(result.conflict);
        }
        continue;
      }

      failed += 1;
    } catch (error) {
      failed += 1;
      options.onError?.(entry, error);
    }
  }

  if (changed) {
    writeQueue(queue);
  }

  const remainingPending = queue.filter((entry) => entry.status === 'pending').length;
  const remainingConflicts = queue.filter((entry) => entry.status === 'conflict').length;

  return {
    synced,
    conflicts,
    failed,
    remainingPending,
    remainingConflicts
  };
};

export const syncOfflineDeltaQueue = async (
  options: SyncOfflineDeltaQueueOptions = {}
): Promise<OfflineDeltaSyncSummary> => {
  if (inFlightSync) {
    syncSubscribers.push(options);
    return inFlightSync;
  }

  syncSubscribers = [options];

  const mergedOptions: SyncOfflineDeltaQueueOptions = {
    onConflict: (conflict) => {
      syncSubscribers.forEach((subscriber) => {
        subscriber.onConflict?.(conflict);
      });
    },
    onSynced: (entry) => {
      syncSubscribers.forEach((subscriber) => {
        subscriber.onSynced?.(entry);
      });
    },
    onError: (entry, error) => {
      syncSubscribers.forEach((subscriber) => {
        subscriber.onError?.(entry, error);
      });
    }
  };

  inFlightSync = runSyncOfflineDeltaQueue(mergedOptions);
  try {
    return await inFlightSync;
  } finally {
    inFlightSync = null;
    syncSubscribers = [];
  }
};

export const hasPendingOfflineDeltaForTravelId = (id: string): boolean => {
  if (!id) return false;
  return readQueue().some((entry) => entry.kind === 'travel' && entry.id === id && entry.status === 'pending');
};

export const hasPendingOfflineDeltaForCostId = (id: string): boolean => {
  if (!id) return false;
  const normalized = normalizeCostEntryId(id);
  return readQueue().some(
    (entry) => entry.kind === 'cost' && normalizeCostEntryId(entry.id) === normalized && entry.status === 'pending'
  );
};
