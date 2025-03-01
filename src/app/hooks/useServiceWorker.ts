import { useState, useEffect } from 'react';

export const useServiceWorker = () => {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        setRegistration(reg);

        // Check if there's a waiting worker
        if (reg.waiting) {
          setIsWaiting(true);
          setUpdateAvailable(true);
        }

        // Monitor for the installing state
        if (reg.installing) {
          setIsInstalling(true);
          reg.installing.addEventListener('statechange', (event) => {
            const sw = event.target as ServiceWorker;
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              setIsWaiting(true);
              setIsInstalling(false);
              setUpdateAvailable(true);
            }
          });
        }

        // When a new service worker is found
        reg.addEventListener('updatefound', () => {
          setIsInstalling(true);
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setIsWaiting(true);
              setIsInstalling(false);
              setUpdateAvailable(true);
            }
          });
        });
      } catch (error) {
        console.error('Service worker registration failed:', error);
      }
    };

    // Listen for controller change, reload the page to use updated assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    registerServiceWorker();
  }, []);

  // Function to update the service worker
  const updateServiceWorker = () => {
    if (!registration || !registration.waiting) return;

    // Send a message to the waiting service worker
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    setUpdateAvailable(false);
  };

  return {
    registration,
    isWaiting,
    isInstalling,
    updateAvailable,
    updateServiceWorker,
  };
}; 