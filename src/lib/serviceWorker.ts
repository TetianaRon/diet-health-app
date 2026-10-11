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

  // Look for a new release on start, when she comes back to the tab, and hourly (2.3.2): a
  // browser checks on its own only now and then, so an open or installed app could stay on an
  // old version for weeks. The new worker takes over at once (skipWaiting, vite.config.ts);
  // when it does, the page reloads to the new version — once.
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, 60 * 60 * 1000);
    },
  });
  const startedAt = Date.now();
  const hadController = navigator.serviceWorker.controller !== null;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The first worker taking control isn't an update.
    if (!hadController || newVersionReady) return;
    // Right after opening, nothing is in progress yet: reload to the new version at once.
    // Later, a reload could drop a meal being entered (and, on the web, the sign-in), so
    // the app offers «Оновити зараз» instead (AppNotifications).
    if (Date.now() - startedAt < QUIET_START_MS) {
      window.location.reload();
      return;
    }
    newVersionReady = true;
    for (const listener of listeners) listener();
  });
}

const QUIET_START_MS = 8000;
let newVersionReady = false;
const listeners = new Set<() => void>();

/** Calls `listener` when a new release has taken over while the app was in use. */
export function onNewVersion(listener: () => void): () => void {
  listeners.add(listener);
  if (newVersionReady) listener();
  return () => listeners.delete(listener);
}
