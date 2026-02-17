'use client';

import { usePathname } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  SERVICE_WORKER_OFFLINE_READY_DETAIL_STORAGE_KEY,
  SERVICE_WORKER_OFFLINE_READY_EVENT,
  type ServiceWorkerOfflineReadyDetail
} from '@/app/lib/serviceWorkerEvents';

const AUTO_HIDE_MS = 6500;
const OFFLINE_READY_TOAST_SHOWN_KEY = 'travel-tracker-offline-ready-toast-shown-v1';

const isOfflineReadyDetail = (value: unknown): value is ServiceWorkerOfflineReadyDetail => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ServiceWorkerOfflineReadyDetail>;
  return (
    typeof candidate.warmedRouteCount === 'number' &&
    typeof candidate.warmedDataCount === 'number' &&
    typeof candidate.failedRouteCount === 'number' &&
    typeof candidate.failedDataCount === 'number' &&
    typeof candidate.tripCount === 'number' &&
    typeof candidate.costEntryCount === 'number' &&
    typeof candidate.timestamp === 'string'
  );
};

const formatToastMessage = (detail: ServiceWorkerOfflineReadyDetail): string => {
  const warmedCount = detail.warmedRouteCount + detail.warmedDataCount;
  const failedCount = detail.failedRouteCount + detail.failedDataCount;
  const tripSuffix = detail.tripCount === 1 ? '' : 's';
  const failureSuffix = failedCount === 1 ? '' : 's';

  const baseMessage = `Offline ready. Cached ${warmedCount} request${warmedCount === 1 ? '' : 's'} covering ${detail.tripCount} trip${tripSuffix}.`;
  if (failedCount === 0) {
    return baseMessage;
  }

  return `${baseMessage} ${failedCount} request${failureSuffix} could not be cached yet and will retry when online.`;
};

export default function OfflineReadyToast(): ReactElement | null {
  const pathname = usePathname();
  const isAdminPath = pathname?.startsWith('/admin') ?? false;
  const [detail, setDetail] = useState<ServiceWorkerOfflineReadyDetail | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isAdminPath || typeof window === 'undefined') {
      setIsVisible(false);
      return;
    }

    const showToast = (incomingDetail: ServiceWorkerOfflineReadyDetail): void => {
      setDetail(incomingDetail);
      setIsVisible(true);
      try {
        window.sessionStorage.setItem(OFFLINE_READY_TOAST_SHOWN_KEY, '1');
      } catch {
        // Ignore storage write failures.
      }
    };

    const hydrateFromStorage = (): void => {
      try {
        if (window.sessionStorage.getItem(OFFLINE_READY_TOAST_SHOWN_KEY) === '1') {
          return;
        }

        const rawValue = window.sessionStorage.getItem(SERVICE_WORKER_OFFLINE_READY_DETAIL_STORAGE_KEY);
        if (!rawValue) {
          return;
        }

        const parsedValue: unknown = JSON.parse(rawValue);
        if (!isOfflineReadyDetail(parsedValue)) {
          return;
        }

        showToast(parsedValue);
      } catch {
        // Ignore parsing/storage errors.
      }
    };

    const handleOfflineReady = (event: Event): void => {
      const customEvent = event as CustomEvent<unknown>;
      if (!isOfflineReadyDetail(customEvent.detail)) {
        return;
      }

      showToast(customEvent.detail);
    };

    hydrateFromStorage();
    window.addEventListener(SERVICE_WORKER_OFFLINE_READY_EVENT, handleOfflineReady as EventListener);

    return () => {
      window.removeEventListener(SERVICE_WORKER_OFFLINE_READY_EVENT, handleOfflineReady as EventListener);
    };
  }, [isAdminPath]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, AUTO_HIDE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isVisible]);

  const message = useMemo(() => {
    if (!detail) {
      return '';
    }

    return formatToastMessage(detail);
  }, [detail]);

  if (!isAdminPath || !isVisible || !detail) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 max-w-xs sm:max-w-sm">
      <div
        className="pointer-events-auto rounded-md border border-emerald-200 bg-white/95 px-3 py-2 text-xs text-emerald-900 shadow-lg backdrop-blur dark:border-emerald-700 dark:bg-gray-900/95 dark:text-emerald-100"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 leading-relaxed">{message}</div>
          <button
            type="button"
            onClick={() => setIsVisible(false)}
            className="rounded px-1 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-100"
            aria-label="Dismiss offline ready notification"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
