'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_PATH = '/sw.js';
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

export default function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let hasRefreshedForNewWorker = false;
    let registration: ServiceWorkerRegistration | null = null;

    const onControllerChange = (): void => {
      if (hasRefreshedForNewWorker) {
        return;
      }

      hasRefreshedForNewWorker = true;
      window.location.reload();
    };

    const onOnline = (): void => {
      if (!registration) {
        return;
      }

      void registration.update();
    };

    const registerServiceWorker = async (): Promise<void> => {
      try {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: '/',
        });
      } catch (error: unknown) {
        console.warn('Service worker registration failed:', error);
        return;
      }

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration?.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      window.addEventListener('online', onOnline);
    };

    void registerServiceWorker();

    const updateInterval = window.setInterval(() => {
      if (!registration || !navigator.onLine) {
        return;
      }

      void registration.update();
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.removeEventListener('online', onOnline);
      window.clearInterval(updateInterval);
    };
  }, []);

  return null;
}
