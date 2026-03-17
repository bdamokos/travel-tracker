'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  discardOfflineConflictEntries,
  OFFLINE_DELTA_QUEUE_EVENT,
  getOfflineQueueEntries,
  getOfflineQueueSummary,
  type OfflineQueueEntry,
  type OfflineQueueSummary
} from '@/app/lib/offlineDeltaSync';

const ZERO_SUMMARY: OfflineQueueSummary = {
  total: 0,
  pending: 0,
  conflicts: 0
};

const isQueueSummary = (value: unknown): value is OfflineQueueSummary => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<OfflineQueueSummary>;
  return (
    typeof candidate.total === 'number' &&
    typeof candidate.pending === 'number' &&
    typeof candidate.conflicts === 'number'
  );
};

export default function OfflineDeltaBanner() {
  const [summary, setSummary] = useState<OfflineQueueSummary>(ZERO_SUMMARY);
  const [entries, setEntries] = useState<OfflineQueueEntry[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [showConflictDetails, setShowConflictDetails] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setSummary(getOfflineQueueSummary());
      setEntries(getOfflineQueueEntries());
    };

    const handleQueueChanged = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (isQueueSummary(customEvent.detail)) {
        setSummary(customEvent.detail);
        return;
      }
      refresh();
    };

    const handleOnline = () => {
      setIsOnline(true);
      refresh();
    };

    const handleOffline = () => {
      setIsOnline(false);
      refresh();
    };

    refresh();
    window.addEventListener(OFFLINE_DELTA_QUEUE_EVENT, handleQueueChanged as EventListener);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', refresh);

    return () => {
      window.removeEventListener(OFFLINE_DELTA_QUEUE_EVENT, handleQueueChanged as EventListener);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const bannerState = useMemo(() => {
    const conflictEntries = entries.filter((entry) => entry.status === 'conflict');

    if (summary.conflicts > 0) {
      return {
        visible: true,
        tone: 'conflict' as const,
        className: 'bg-red-100 border-red-300 text-red-900 dark:bg-red-900/30 dark:border-red-700 dark:text-red-200',
        message:
          `${summary.conflicts} offline change set(s) could not be synced because server data changed. ` +
          'Review the conflicted items below or discard the queued offline change to clear this warning.',
        conflictEntries
      };
    }

    if (summary.pending > 0) {
      const offlinePrefix = isOnline ? '' : 'You are offline. ';
      return {
        visible: true,
        tone: 'pending' as const,
        className: 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200',
        message:
          `${offlinePrefix}${summary.pending} offline change set(s) are pending. ` +
          'An automatic sync will run when connectivity is available; if server data changed, conflicts will be shown.',
        conflictEntries: []
      };
    }

    return {
      visible: false,
      tone: 'idle' as const,
      className: '',
      message: '',
      conflictEntries: []
    };
  }, [entries, isOnline, summary.conflicts, summary.pending]);

  useEffect(() => {
    if (summary.conflicts === 0) {
      setShowConflictDetails(false);
    }
  }, [summary.conflicts]);

  const handleDiscardConflicts = (targetEntry?: OfflineQueueEntry) => {
    const conflictCount = targetEntry ? 1 : summary.conflicts;
    const confirmed = window.confirm(
      targetEntry
        ? `Discard the queued offline change for ${targetEntry.kind} "${targetEntry.id}"? This cannot be undone.`
        : `Discard ${conflictCount} conflicted offline change set(s)? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    discardOfflineConflictEntries((entry) => {
      if (!targetEntry) {
        return true;
      }

      return entry.kind === targetEntry.kind && entry.id === targetEntry.id;
    });
  };

  if (!bannerState.visible) {
    return null;
  }

  return (
    <div className={`sticky top-0 z-50 border-b px-4 py-3 text-sm font-medium ${bannerState.className}`} role="status" aria-live="polite">
      <div className="mx-auto flex max-w-7xl flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="leading-6">{bannerState.message}</p>
          {bannerState.tone === 'conflict' && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowConflictDetails((current) => !current)}
                className="rounded-md border border-current px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10"
              >
                {showConflictDetails ? 'Hide details' : 'Review conflicts'}
              </button>
              <button
                type="button"
                onClick={() => handleDiscardConflicts()}
                className="rounded-md bg-red-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-950 dark:bg-red-200 dark:text-red-950 dark:hover:bg-red-100"
              >
                {summary.conflicts === 1 ? 'Discard queued change' : 'Discard all conflicted changes'}
              </button>
            </div>
          )}
        </div>

        {bannerState.tone === 'conflict' && showConflictDetails && bannerState.conflictEntries.length > 0 && (
          <div className="grid gap-2">
            {bannerState.conflictEntries.map((entry) => (
              <div
                key={`${entry.kind}-${entry.id}`}
                className="flex flex-col gap-2 rounded-md border border-current/20 bg-white/30 px-3 py-2 dark:bg-black/10 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {entry.kind === 'travel' ? 'Travel map' : 'Cost tracker'}: {entry.id}
                  </p>
                  <p className="text-xs opacity-80">
                    Queued {new Date(entry.queuedAt).toLocaleString()}.
                    {' '}
                    Discard the offline-only change once you have reviewed it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDiscardConflicts(entry)}
                  className="self-start rounded-md border border-current px-3 py-1.5 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10 sm:self-center"
                >
                  Dismiss warning
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
