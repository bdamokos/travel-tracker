'use client';

import { useEffect } from 'react';
import { formatOfflineConflictMessage, syncOfflineDeltaQueue } from '@/app/lib/offlineDeltaSync';
import {
  SERVICE_WORKER_APPLY_UPDATE_EVENT,
  SERVICE_WORKER_OFFLINE_READY_DETAIL_STORAGE_KEY,
  SERVICE_WORKER_OFFLINE_READY_EVENT,
  SERVICE_WORKER_UPDATE_AVAILABLE_EVENT,
  type ServiceWorkerOfflineReadyDetail
} from '@/app/lib/serviceWorkerEvents';

const SERVICE_WORKER_PATH = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const OFFLINE_CACHE_WARMUP_SESSION_KEY = 'travel-tracker-offline-cache-warmup-v1';
const OFFLINE_CACHE_WARMUP_HEADER = 'x-travel-tracker-precache';
const OFFLINE_CACHE_WARMUP_CONCURRENCY = 6;
const OFFLINE_CACHE_WARMUP_MAX_TRIPS = 30;
const OFFLINE_CACHE_WARMUP_MAX_COST_ENTRIES = 30;
const OFFLINE_CACHE_WARMUP_MAX_ROUTE_URLS = 320;
const OFFLINE_CACHE_WARMUP_MAX_DATA_URLS = 320;

type GenericRecord = Record<string, unknown>;

type DirtyWindow = Window & {
  __TRAVEL_TRACKER_IS_DIRTY__?: boolean;
};

const isRecord = (value: unknown): value is GenericRecord => {
  return typeof value === 'object' && value !== null;
};

const getNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  return normalizedValue;
};

const normalizeCostEntryId = (id: string): string => {
  return id.replace(/^(cost-)+/, '');
};

const buildEditorSectionUrls = (basePath: string): string[] => {
  return [
    `${basePath}?section=trip`,
    `${basePath}?section=locations`,
    `${basePath}?section=routes`,
    `${basePath}?section=accommodations`,
    `${basePath}?section=updates`,
  ];
};

const parseTripIdsFromList = (entries: unknown[]): string[] => {
  const tripIds = new Set<string>();

  entries.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const id = getNonEmptyString(entry.id);
    if (id) {
      tripIds.add(id);
    }
  });

  return Array.from(tripIds).slice(0, OFFLINE_CACHE_WARMUP_MAX_TRIPS);
};

const parseCostIdsFromList = (entries: unknown[]): { tripIds: string[]; costEntryIds: string[] } => {
  const tripIds = new Set<string>();
  const costEntryIds = new Set<string>();

  entries.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const tripId = getNonEmptyString(entry.tripId);
    if (tripId) {
      tripIds.add(tripId);
    }

    const rawCostId = getNonEmptyString(entry.id);
    if (!rawCostId) {
      return;
    }

    costEntryIds.add(rawCostId);
    costEntryIds.add(normalizeCostEntryId(rawCostId));

    if (!tripId) {
      tripIds.add(normalizeCostEntryId(rawCostId));
    }
  });

  return {
    tripIds: Array.from(tripIds).slice(0, OFFLINE_CACHE_WARMUP_MAX_COST_ENTRIES),
    costEntryIds: Array.from(costEntryIds).slice(0, OFFLINE_CACHE_WARMUP_MAX_COST_ENTRIES * 2),
  };
};

const buildWarmupTargets = (tripIds: string[], costEntryIds: string[]): { routeUrls: string[]; dataUrls: string[] } => {
  const routeUrls = new Set<string>([
    '/maps',
    '/admin',
    '/admin?tab=travel',
    '/admin?tab=cost',
    '/admin/edit/new',
    '/admin/cost-tracking/new',
  ]);
  const dataUrls = new Set<string>([
    '/api/travel-data/list',
    '/api/cost-tracking/list',
  ]);

  tripIds.forEach((tripId) => {
    const encodedTripId = encodeURIComponent(tripId);
    const mapPath = `/map/${encodedTripId}`;
    const embedPath = `/embed/${encodedTripId}`;
    const calendarPath = `/calendars/${encodedTripId}`;
    const editorBasePath = `/admin/edit/${encodedTripId}`;

    routeUrls.add(mapPath);
    routeUrls.add(embedPath);
    routeUrls.add(calendarPath);
    routeUrls.add(editorBasePath);
    buildEditorSectionUrls(editorBasePath).forEach((sectionUrl) => routeUrls.add(sectionUrl));

    dataUrls.add(`/api/travel-data?id=${encodedTripId}`);
    dataUrls.add(`/api/travel-data/${encodedTripId}/expense-links`);
    dataUrls.add(`/admin/api/accommodations?tripId=${encodedTripId}`);
    dataUrls.add(`/api/cost-tracking?id=${encodedTripId}`);
  });

  costEntryIds.forEach((costEntryId) => {
    const encodedCostEntryId = encodeURIComponent(costEntryId);
    routeUrls.add(`/admin/cost-tracking/${encodedCostEntryId}`);
    dataUrls.add(`/api/cost-tracking?id=${encodedCostEntryId}`);
  });

  return {
    routeUrls: Array.from(routeUrls).slice(0, OFFLINE_CACHE_WARMUP_MAX_ROUTE_URLS),
    dataUrls: Array.from(dataUrls).slice(0, OFFLINE_CACHE_WARMUP_MAX_DATA_URLS),
  };
};

const fetchJsonArray = async (url: string): Promise<unknown[]> => {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload;
  } catch {
    return [];
  }
};

const warmUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        [OFFLINE_CACHE_WARMUP_HEADER]: '1',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
};

const warmUrlsWithConcurrency = async (urls: string[]): Promise<{ warmed: number; failed: number }> => {
  if (urls.length === 0) {
    return { warmed: 0, failed: 0 };
  }

  const workerCount = Math.min(OFFLINE_CACHE_WARMUP_CONCURRENCY, urls.length);
  let cursor = 0;

  const workerResults = await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      let warmed = 0;
      let failed = 0;

      while (true) {
        const index = cursor;
        cursor += 1;

        if (index >= urls.length) {
          break;
        }

        const cached = await warmUrl(urls[index]);
        if (cached) {
          warmed += 1;
        } else {
          failed += 1;
        }
      }

      return { warmed, failed };
    })
  );

  return workerResults.reduce(
    (accumulator, workerResult) => {
      return {
        warmed: accumulator.warmed + workerResult.warmed,
        failed: accumulator.failed + workerResult.failed,
      };
    },
    { warmed: 0, failed: 0 }
  );
};

const isDocumentDirty = (): boolean => {
  return Boolean((window as DirtyWindow).__TRAVEL_TRACKER_IS_DIRTY__);
};

const notifyUpdateAvailable = (): void => {
  window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_AVAILABLE_EVENT));
};

const notifyOfflineReady = (detail: ServiceWorkerOfflineReadyDetail): void => {
  try {
    window.sessionStorage.setItem(SERVICE_WORKER_OFFLINE_READY_DETAIL_STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Ignore storage write failures (for example in private browsing modes).
  }

  window.dispatchEvent(
    new CustomEvent<ServiceWorkerOfflineReadyDetail>(SERVICE_WORKER_OFFLINE_READY_EVENT, {
      detail,
    })
  );
};

export default function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let hasRefreshedForNewWorker = false;
    let registration: ServiceWorkerRegistration | null = null;
    let waitingWorker: ServiceWorker | null = null;
    let currentInstallingWorker: ServiceWorker | null = null;
    let installingStateChangeHandler: (() => void) | null = null;
    let offlineWarmupInFlight: Promise<void> | null = null;
    let isUnmounted = false;

    const activateWaitingWorker = (): void => {
      if (!waitingWorker) {
        return;
      }

      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    };

    const requestUpdateActivation = (): void => {
      if (!waitingWorker) {
        return;
      }

      if (isDocumentDirty()) {
        notifyUpdateAvailable();
        return;
      }

      activateWaitingWorker();
    };

    const runOfflineCacheWarmup = async (): Promise<void> => {
      if (isUnmounted) {
        return;
      }

      if (!navigator.onLine) {
        return;
      }

      if (!navigator.serviceWorker.controller) {
        return;
      }

      if (window.sessionStorage.getItem(OFFLINE_CACHE_WARMUP_SESSION_KEY) === 'done') {
        return;
      }

      if (offlineWarmupInFlight) {
        await offlineWarmupInFlight;
        return;
      }

      offlineWarmupInFlight = (async () => {
        const travelListEntries = await fetchJsonArray('/api/travel-data/list');
        const costListEntries = await fetchJsonArray('/api/cost-tracking/list');

        const tripIds = new Set<string>(parseTripIdsFromList(travelListEntries));
        const costListParsed = parseCostIdsFromList(costListEntries);
        costListParsed.tripIds.forEach((tripId) => tripIds.add(tripId));

        const warmupTargets = buildWarmupTargets(Array.from(tripIds), costListParsed.costEntryIds);
        const routeWarmupResult = await warmUrlsWithConcurrency(warmupTargets.routeUrls);
        const dataWarmupResult = await warmUrlsWithConcurrency(warmupTargets.dataUrls);
        const totalWarmedCount = routeWarmupResult.warmed + dataWarmupResult.warmed;
        const totalFailedCount = routeWarmupResult.failed + dataWarmupResult.failed;

        if (totalWarmedCount === 0) {
          return;
        }

        const warmupDetail: ServiceWorkerOfflineReadyDetail = {
          warmedRouteCount: routeWarmupResult.warmed,
          warmedDataCount: dataWarmupResult.warmed,
          failedRouteCount: routeWarmupResult.failed,
          failedDataCount: dataWarmupResult.failed,
          tripCount: tripIds.size,
          costEntryCount: costListParsed.costEntryIds.length,
          timestamp: new Date().toISOString(),
        };

        notifyOfflineReady(warmupDetail);

        if (totalFailedCount === 0) {
          window.sessionStorage.setItem(OFFLINE_CACHE_WARMUP_SESSION_KEY, 'done');
        }
      })()
        .catch((error: unknown) => {
          console.warn('Service worker offline cache warmup failed:', error);
        })
        .finally(() => {
          offlineWarmupInFlight = null;
        });

      await offlineWarmupInFlight;
    };

    const onControllerChange = (): void => {
      if (hasRefreshedForNewWorker) {
        return;
      }

      hasRefreshedForNewWorker = true;

      if (isDocumentDirty()) {
        notifyUpdateAvailable();
        return;
      }

      window.location.reload();
    };

    const onOnline = (): void => {
      if (!registration) {
        return;
      }

      void registration.update();
      void runOfflineCacheWarmup();
    };

    const onFocus = (): void => {
      void runOfflineCacheWarmup();
    };

    const onApplyUpdate = (): void => {
      activateWaitingWorker();
    };

    const onUpdateFound = (): void => {
      const installingWorker = registration?.installing;

      if (!installingWorker) {
        return;
      }

      if (currentInstallingWorker && installingStateChangeHandler) {
        currentInstallingWorker.removeEventListener('statechange', installingStateChangeHandler);
      }

      currentInstallingWorker = installingWorker;

      const handleStateChange = (): void => {
        if (installingWorker.state !== 'installed') {
          return;
        }

        installingWorker.removeEventListener('statechange', handleStateChange);

        if (currentInstallingWorker === installingWorker) {
          currentInstallingWorker = null;
          installingStateChangeHandler = null;
        }

        if (!navigator.serviceWorker.controller) {
          return;
        }

        waitingWorker = installingWorker;
        notifyUpdateAvailable();
        requestUpdateActivation();
      };

      installingStateChangeHandler = handleStateChange;
      installingWorker.addEventListener('statechange', handleStateChange);
    };

    const registerServiceWorker = async (): Promise<void> => {
      try {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: '/',
        });
      } catch (error: unknown) {
        console.error('Service worker registration failed:', error);
        return;
      }

      registration.addEventListener('updatefound', onUpdateFound);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      window.addEventListener('online', onOnline);
      window.addEventListener('focus', onFocus);
      window.addEventListener(SERVICE_WORKER_APPLY_UPDATE_EVENT, onApplyUpdate);

      if (registration.waiting) {
        waitingWorker = registration.waiting;
        notifyUpdateAvailable();
        requestUpdateActivation();
      }

      void syncOfflineDeltaQueue({
        onConflict: (conflict) => {
          window.alert(formatOfflineConflictMessage(conflict));
        }
      });

      void runOfflineCacheWarmup();
    };

    void registerServiceWorker();

    const updateInterval = window.setInterval(() => {
      if (!registration || !navigator.onLine) {
        return;
      }

      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      if (currentInstallingWorker && installingStateChangeHandler) {
        currentInstallingWorker.removeEventListener('statechange', installingStateChangeHandler);
      }

      if (registration) {
        registration.removeEventListener('updatefound', onUpdateFound);
      }

      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SERVICE_WORKER_APPLY_UPDATE_EVENT, onApplyUpdate);
      window.clearInterval(updateInterval);
      isUnmounted = true;
    };
  }, []);

  return null;
}
