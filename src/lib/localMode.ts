// Working without Google, on the phone (release 2.0, checkpoint C). The data
// lives only in the device database; it starts with the same tabs a new
// spreadsheet gets (headers, readable names, Settings defaults). Saves apply
// to it directly (recordStore.ts) — there's nothing to sync with. Backups are
// .xlsx files the person keeps (localBackup.ts); connecting Google later moves
// everything into a new spreadsheet (moveLocalDataToSheet).
import { Capacitor } from "@capacitor/core";
import { getLocalMeta, getLocalTab, openLocalDb, putLocalTabs, setLocalMeta } from "./localDb";
import { createSpreadsheetFromGrids, getSpreadsheetId, setSpreadsheetId } from "./sheets";
import { buildInitUpdates } from "./spreadsheetInit";
import { REQUIRED_TABS } from "./tabs";
import { isLocalSheetId, LOCAL_SHEET_ID } from "./localModeId";
import { parseA1Range } from "./localDb/a1";
import { uk } from "../i18n/uk";

export function isLocalMode(): boolean {
  return isLocalSheetId(getSpreadsheetId());
}

/** «Почати без Google» is offered in the Android app (and on the local dev server, for testing). */
export function canOfferLocalMode(): boolean {
  return Capacitor.isNativePlatform() || import.meta.env.DEV;
}

/** The tabs a brand-new data set starts with, as grids (row 1 keys, row 2 readable names, Settings defaults). */
export function initialGrids(): Map<string, unknown[][]> {
  const grids = new Map<string, unknown[][]>(REQUIRED_TABS.map((tab) => [tab, []]));
  for (const update of buildInitUpdates([...REQUIRED_TABS])) {
    const [tab, range] = update.range.split("!");
    const startRow = parseA1Range(range).firstRow;
    const grid = grids.get(tab) ?? [];
    update.values.forEach((row, i) => (grid[startRow + i] = [...row]));
    grids.set(tab, grid);
  }
  return grids;
}

/** Switches this device to working without Google; creates the starting tabs the first time. */
export async function startLocalMode(): Promise<void> {
  setSpreadsheetId(LOCAL_SHEET_ID);
  await openLocalDb(LOCAL_SHEET_ID);
  if (!(await getLocalMeta("localSince"))) await setLocalMeta("localSince", new Date().toISOString());
  const missing = [];
  for (const tab of REQUIRED_TABS) if (!(await getLocalTab(tab))) missing.push(tab);
  if (missing.length === 0) return;
  const grids = initialGrids();
  const pulledAt = new Date().toISOString();
  await putLocalTabs(missing.map((tab) => ({ tab, rows: grids.get(tab) ?? [], pulledAt })));
}

/**
 * «Перенести дані в Google Таблицю»: creates a new spreadsheet in the app's
 * Drive folder with everything on the phone, and connects it. Only into a new
 * spreadsheet — merging into one that already holds data is not offered.
 * Needs Google sign-in first. Returns the new spreadsheet's ID.
 */
export async function moveLocalDataToSheet(name: string = uk.connectSheet.newNameDefault): Promise<string> {
  await openLocalDb(LOCAL_SHEET_ID);
  const grids = new Map<string, unknown[][]>();
  for (const tab of REQUIRED_TABS) grids.set(tab, (await getLocalTab(tab))?.rows ?? initialGrids().get(tab) ?? []);
  // Text marked with a leading apostrophe ("keep as text") is written as the text itself.
  for (const [tab, rows] of grids) grids.set(tab, rows.map((row) => row.map((v) => (typeof v === "string" && v.startsWith("'") ? v.slice(1) : v))));
  const id = await createSpreadsheetFromGrids(name, grids);
  setSpreadsheetId(id);
  await openLocalDb(id);
  const pulledAt = new Date().toISOString();
  await putLocalTabs([...grids].map(([tab, rows]) => ({ tab, rows, pulledAt })));
  return id;
}
