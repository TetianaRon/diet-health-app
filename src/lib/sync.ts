// When the device copy is refreshed from the sheet (release 2.0, checkpoint A):
// on returning to the app after a while, and from «Синхронізувати». Every
// refresh is ONE request for all tabs (sheets.ts → pullAllTabs). Reads between
// refreshes come from the device; see sheets.ts → "Reading: from the device first".
import { getLastPullAt, pullAllTabs } from "./sheets";
import { REQUIRED_TABS } from "./spreadsheetInit";

/** A copy older than this is refreshed when the app comes back to the foreground. */
export const STALE_AFTER_MS = 5 * 60 * 1000;

let inFlight: Promise<void> | null = null;

/** Refreshes every tab on the device from the sheet (one request). Concurrent calls share one refresh. */
export function syncNow(): Promise<void> {
  if (!inFlight) inFlight = pullAllTabs(REQUIRED_TABS).finally(() => (inFlight = null));
  return inFlight;
}

/** Whether a copy pulled at `lastPullAt` (ISO time, or null for never) is due for a refresh at `now`. */
export function isStale(lastPullAt: string | null, now: Date, staleAfterMs = STALE_AFTER_MS): boolean {
  if (!lastPullAt) return true;
  const pulled = Date.parse(lastPullAt);
  return Number.isNaN(pulled) || now.getTime() - pulled >= staleAfterMs;
}

/** Refreshes only if the device copy is older than STALE_AFTER_MS. Resolves true when it refreshed. */
export async function syncIfStale(now = new Date()): Promise<boolean> {
  if (!isStale(await getLastPullAt(), now)) return false;
  await syncNow();
  return true;
}
