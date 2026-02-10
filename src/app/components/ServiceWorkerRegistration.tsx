'use client';

import { useEffect } from 'react';

const SERVICE_WORKER_PATH = '/sw.js';

export default function ServiceWorkerRegistration(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let hasRefreshedForNewWorker = false;
    let onlineHandler: (() => void) | null = null;

    const registerServiceWorker = async (): Promise<void> => {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
        scope: '/',
      });

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;

        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            installingWorker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      const onControllerChange = (): void => {
        if (hasRefreshedForNewWorker) {
          return;
        }

        hasRefreshedForNewWorker = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      onlineHandler = () => {
        void registration.update();
      };

      window.addEventListener('online', onlineHandler);
    };

    void registerServiceWorker();

    return () => {
      if (onlineHandler) {
        window.removeEventListener('online', onlineHandler);
      }
    };
  }, []);

  return null;
}
