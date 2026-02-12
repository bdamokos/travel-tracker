'use client';

import { useEffect } from 'react';
import { formatOfflineConflictMessage, syncOfflineDeltaQueue } from '@/app/lib/offlineDeltaSync';

const SERVICE_WORKER_PATH = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_AVAILABLE_EVENT = 'travel-tracker-service-worker-update-available';
const APPLY_UPDATE_EVENT = 'travel-tracker-service-worker-apply-update';

type DirtyWindow = Window & {
  __TRAVEL_TRACKER_IS_DIRTY__?: boolean;
};

const isDocumentDirty = (): boolean => {
  return Boolean((window as DirtyWindow).__TRAVEL_TRACKER_IS_DIRTY__);
};

const notifyUpdateAvailable = (): void => {
  window.dispatchEvent(new CustomEvent(UPDATE_AVAILABLE_EVENT));
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
      window.addEventListener(APPLY_UPDATE_EVENT, onApplyUpdate);

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
      window.removeEventListener(APPLY_UPDATE_EVENT, onApplyUpdate);
      window.clearInterval(updateInterval);
    };
  }, []);

  return null;
}
