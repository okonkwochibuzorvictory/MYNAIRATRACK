/** Register the MYNAIRATRACK service worker (production only). Safe to call in dev (no-op). */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Vite serves /sw.js from public/ in dev too, but registering during dev
  // causes stale-cache confusion — only register on real builds.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is best-effort; the app works fine without it.
    });
  });
}
