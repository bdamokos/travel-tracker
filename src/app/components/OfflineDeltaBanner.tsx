'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  OFFLINE_DELTA_QUEUE_EVENT,
  getOfflineQueueSummary,
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
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const refresh = () => {
      setSummary(getOfflineQueueSummary());
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
    if (summary.conflicts > 0) {
      return {
        visible: true,
        className: 'bg-red-100 border-red-300 text-red-900',
        message:
          `${summary.conflicts} offline change set(s) could not be synced because server data changed. ` +
          'Review the conflict popup(s); those local deltas will not auto-apply.'
      };
    }

    if (summary.pending > 0) {
      const offlinePrefix = isOnline ? '' : 'You are offline. ';
      return {
        visible: true,
        className: 'bg-amber-100 border-amber-300 text-amber-900',
        message:
          `${offlinePrefix}${summary.pending} offline change set(s) are pending. ` +
          'An automatic sync will run when connectivity is available; if server data changed, conflicts will be shown.'
      };
    }

    return {
      visible: false,
      className: '',
      message: ''
    };
  }, [isOnline, summary.conflicts, summary.pending]);

  if (!bannerState.visible) {
    return null;
  }

  return (
    <div className={`sticky top-0 z-50 border-b px-4 py-2 text-sm font-medium ${bannerState.className}`} role="status" aria-live="polite">
      {bannerState.message}
    </div>
  );
}
