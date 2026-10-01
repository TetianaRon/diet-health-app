import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";

/**
 * The PWA service worker (offline use, installable web app) is for the web
 * version only. Inside the Android app the files already ship with the app,
 * and the worker's cache kept showing the previous version's screens after
 * an update (2026-09-29, docs/roadmap.md 1.5.1) — so there it's removed, not
 * registered. The Android build also ships a self-removing worker
 * (`selfDestroying` in vite.config.ts) for phones whose old worker would
 * otherwise keep serving the old code that never reaches this function.
 */
export function setUpServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  if (Capacitor.isNativePlatform()) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .catch(() => undefined);
    return;
  }

  registerSW({ immediate: true });
}
