/**
 * App Update Utility
 * Handles manual cache clearing, service worker updates,
 * and forceful reloading to guarantee the latest build is running.
 */
export async function forceAppUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        try {
          await reg.update();
        } catch {
          // Ignore
        }
      }
    }

    // Clear stale browser caches so new chunk assets take immediate effect
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    }
  } catch (err) {
    console.warn('Update clear notice:', err);
  } finally {
    // Hard reload the application window
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
  }
}
