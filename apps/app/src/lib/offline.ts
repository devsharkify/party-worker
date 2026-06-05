import { Platform } from 'react-native';
import { useState, useEffect } from 'react';

/**
 * Register the service worker (/sw.js) for web builds.
 * Safe to call on native — it becomes a no-op.
 */
export function registerServiceWorker(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered, scope:', registration.scope);
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
}

/**
 * React hook that returns whether the device currently has a network connection.
 * On native it always returns `true` (rely on native networking instead).
 * On web it tracks the browser's `online` / `offline` events.
 */
export function useIsOnline(): boolean {
  if (Platform.OS !== 'web') return true;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
