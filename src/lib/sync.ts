// Sync between the device and the sheet (release 2.0). Every save is recorded
// on the device first (recordStore.ts); sync then, in this order:
//   1. downloads every tab (one request);
//   2. gives an ID to rows typed into the sheet by hand;
//   3. decides each pending save field by field (sync/merge.ts → planPush) and
//      writes the result: row updates, appended rows, the Deleted log, deletions;
//   4. downloads again and stores that as the device copy.
// Before the first sync that writes anything to a sheet, a full copy of it is
// saved to the app's Drive folder (once per sheet per device).
// Runs a few seconds after a save, on return to the app after 5 minutes, when
// the connection comes back, and from «Синхронізувати».
import {
  batchUpdateRanges,
  createBackupSpreadsheet,
  deleteSheetRows,
  fetchTabsLive,
  getLastPullAt,
  getSpreadsheetId,
  pullAllTabs,
  writeRange,
} from "./sheets";
import { REQUIRED_TABS } from "./tabs";
import { getLocalMeta, listLocalChanges, removeLocalChanges, setLocalMeta } from "./localDb";
import { layoutOf, planPush, type RecordChange } from "./sync/merge";
import { columnLetter } from "./sheetRow";
import { planRecordIds } from "./recordIdPlan";
import { newRecordId, type RecordKind } from "./itemIds";
import { DELETED_TAB } from "./deletions";

/** A copy older than this is refreshed when the app comes back to the foreground. */
export const STALE_AFTER_MS = 5 * 60 * 1000;
/** How long after a save the sync starts (several quick saves share one sync). */
export const SYNC_DELAY_MS = 3000;

/** Tabs whose hand-typed rows get an ID during sync, and the kind of ID. */
const ID_KINDS: Record<string, RecordKind> = {
  DailyLog: "log",
  BloodSugar: "sugar",
  MedicationLog: "intake",
  Weight: "weight",
  Ingredients: "ingredient",
  Dishes: "dish",
  Medications: "medication",
};

let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/** Called after every successful sync (screens can re-read). */
export function onSynced(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function backupBeforeFirstPush(remote: Map<string, unknown[][]>): Promise<void> {
  if (await getLocalMeta("backupDone")) return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  await createBackupSpreadsheet(`Трекер харчування — копія перед синхронізацією ${stamp}`, remote);
  await setLocalMeta("backupDone", new Date().toISOString());
}

async function runSync(): Promise<void> {
  if (!getSpreadsheetId()) return;
  const pending = (await listLocalChanges()) as RecordChange[];
  if (pending.length > 0) {
    const remote = await fetchTabsLive(REQUIRED_TABS);
    await backupBeforeFirstPush(remote);

    // Rows typed into the sheet by hand get an ID first, so they can be matched.
    const idUpdates: { range: string; values: unknown[][] }[] = [];
    for (const [tab, kind] of Object.entries(ID_KINDS)) {
      const grid = remote.get(tab);
      if (!grid) continue;
      const plan = planRecordIds(tab, grid, () => newRecordId(kind));
      idUpdates.push(...plan.valueUpdates);
    }
    if (idUpdates.length > 0) await batchUpdateRanges(idUpdates);

    const deletedGrid = remote.get(DELETED_TAB) ?? [];
    const deletedLayout = layoutOf(DELETED_TAB, deletedGrid);
    const tabCol = deletedLayout.columnIndex.get("Tab");
    const atCol = deletedLayout.columnIndex.get("DeletedAt");
    const deletedAt = new Map<string, string>();
    for (const row of deletedGrid.slice(deletedLayout.firstDataIndex)) {
      if (deletedLayout.idCol === undefined || atCol === undefined) break;
      deletedAt.set(String(row[deletedLayout.idCol] ?? ""), String(row[atCol] ?? ""));
    }

    const cellUpdates: { range: string; values: unknown[][] }[] = [];
    const appends: { tab: string; rows: unknown[][]; lastCol: string }[] = [];
    const deletions: { tab: string; rows: number[] }[] = [];
    const deletedLog: unknown[][] = [];
    const done: number[] = [];
    for (const tab of new Set(pending.map((c) => c.tab))) {
      const grid = remote.get(tab);
      if (!grid) continue; // tab missing in the sheet — the structure check reports it; keep the saves
      const plan = planPush(tab, grid, pending, deletedAt);
      cellUpdates.push(...plan.cellUpdates);
      if (plan.appendRows.length > 0) appends.push({ tab, rows: plan.appendRows, lastCol: columnLetter(Math.max(...layoutOf(tab, grid).columnIndex.values())) });
      if (plan.deleteRows.length > 0) deletions.push({ tab, rows: plan.deleteRows });
      for (const d of plan.deletedLog) {
        const row: unknown[] = [];
        row[deletedLayout.idCol ?? 0] = d.id;
        row[tabCol ?? 1] = d.tab;
        row[atCol ?? 2] = d.deletedAt;
        deletedLog.push(Array.from(row, (v) => v ?? ""));
      }
      done.push(...plan.doneSeqs);
    }

    // Order keeps row numbers valid: rewrites, then appends (at the end), then
    // the Deleted log, then removing rows (bottom-up, per tab).
    if (cellUpdates.length > 0) await batchUpdateRanges(cellUpdates);
    for (const a of appends) await writeRange(a.tab, `A:${a.lastCol}`, a.rows);
    if (deletedLog.length > 0) await writeRange(DELETED_TAB, "A:C", deletedLog);
    for (const d of deletions) await deleteSheetRows(d.tab, d.rows);
    await removeLocalChanges(done);
  }
  await pullAllTabs(REQUIRED_TABS);
  listeners.forEach((l) => l());
}

/** Syncs now. Concurrent calls share one run; saves made during a run go in the next one. */
export function syncNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!inFlight) inFlight = runSync().finally(() => (inFlight = null));
  return inFlight;
}

/** Syncs a few seconds from now; a failure (e.g. offline) leaves the saves for the next try. */
export function scheduleSync(delayMs = SYNC_DELAY_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow().catch((err) => console.warn("[sync] will retry later:", err));
  }, delayMs);
}

/** Saves waiting to reach the sheet. */
export async function pendingCount(): Promise<number> {
  return (await listLocalChanges()).length;
}

/** Whether a copy pulled at `lastPullAt` (ISO time, or null for never) is due for a refresh at `now`. */
export function isStale(lastPullAt: string | null, now: Date, staleAfterMs = STALE_AFTER_MS): boolean {
  if (!lastPullAt) return true;
  const pulled = Date.parse(lastPullAt);
  return Number.isNaN(pulled) || now.getTime() - pulled >= staleAfterMs;
}

/** Syncs if the device copy is older than STALE_AFTER_MS, or saves are waiting. Resolves true when it synced. */
export async function syncIfStale(now = new Date()): Promise<boolean> {
  if (!isStale(await getLastPullAt(), now) && (await pendingCount()) === 0) return false;
  await syncNow();
  return true;
}

// The connection coming back pushes whatever was saved offline.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => scheduleSync(500));
}
