// Import and call registerSW() from _layout.tsx to activate the service worker
import { registerServiceWorker } from './offline';

export function registerSW(): void {
  registerServiceWorker();
}
