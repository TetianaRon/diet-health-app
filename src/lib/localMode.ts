// Working without Google, on the phone (release 2.0, checkpoint C). The data
// lives only in the device database; it starts with the same tabs a new
// spreadsheet gets (headers, readable names, Settings defaults). Saves apply
// to it directly (recordStore.ts) — there's nothing to sync with. «Синхронізувати
// з Google Таблицею» opens the usual connect window; the chosen sheet (new or
// existing) gets the phone's data, with same-name items decided by the person
// (localAttach.ts).
import { Capacitor } from "@capacitor/core";
import { addLocalChange, getLocalMeta, getLocalTab, openLocalDb, putLocalTabs, setLocalMeta } from "./localDb";
import { fetchTabsLive, getSpreadsheetId, setSpreadsheetId } from "./sheets";
import { findDuplicates, planAttach, type Decision, type Duplicate } from "./localAttach";
import { syncNow } from "./sync";
import { buildInitUpdates } from "./spreadsheetInit";
import { REQUIRED_TABS } from "./tabs";
import { isLocalSheetId, LOCAL_SHEET_ID } from "./localModeId";
import { parseA1Range } from "./localDb/a1";
import { planProductsMerge, PRODUCTS_HEADERS, PRODUCTS_TAB } from "./products";
import { labelFor } from "./sheetLabels";
import { newRecordId } from "./itemIds";

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
  await upgradeLocalData();
}

/**
 * Brings the phone's own data (working without Google) to the current tabs:
 * since 2.1 its Ingredients and Dishes become one Products tab (same IDs, as
 * on a sheet — products.ts), and any tab still missing is created. Safe to run
 * on every start; does nothing when everything is current.
 */
export async function upgradeLocalData(): Promise<void> {
  await openLocalDb(LOCAL_SHEET_ID);
  const pulledAt = new Date().toISOString();
  if (!(await getLocalTab(PRODUCTS_TAB))) {
    const ingredients = await getLocalTab("Ingredients");
    const dishes = await getLocalTab("Dishes");
    if (ingredients || dishes) {
      const plan = planProductsMerge(ingredients?.rows, dishes?.rows, (kind) => newRecordId(kind));
      const rows = [[...PRODUCTS_HEADERS], PRODUCTS_HEADERS.map((h) => labelFor(h)), ...plan.rows];
      await putLocalTabs([{ tab: PRODUCTS_TAB, rows, pulledAt }]);
    }
  }
  const missing = [];
  for (const tab of REQUIRED_TABS) if (!(await getLocalTab(tab))) missing.push(tab);
  if (missing.length === 0) return;
  const grids = initialGrids();
  await putLocalTabs(missing.map((tab) => ({ tab, rows: grids.get(tab) ?? [], pulledAt })));
}

/** Everything on the phone, tab by tab (working without Google). */
export async function readLocalGrids(): Promise<Map<string, unknown[][]>> {
  await openLocalDb(LOCAL_SHEET_ID);
  const grids = new Map<string, unknown[][]>();
  for (const tab of REQUIRED_TABS) grids.set(tab, (await getLocalTab(tab))?.rows ?? []);
  return grids;
}

export interface AttachPreparation {
  local: Map<string, unknown[][]>;
  sheet: Map<string, unknown[][]>;
  duplicates: Duplicate[];
}

/** Reads the phone's data and the connected sheet's (which must be connected and checked already) and finds duplicates. */
export async function prepareAttach(): Promise<AttachPreparation> {
  const local = await readLocalGrids();
  const sheet = await fetchTabsLive(REQUIRED_TABS);
  return { local, sheet, duplicates: findDuplicates(local, sheet) };
}

/**
 * Adds the phone's data to the connected sheet as pending changes and syncs
 * (the first sync makes the backup copy of the sheet first). Then the phone's
 * own copy is cleared, so starting without Google again begins empty.
 */
export async function attachLocalData(prep: AttachPreparation, decisions: ReadonlyMap<string, Decision>, includeSettings: boolean): Promise<void> {
  const changes = planAttach(prep.local, prep.duplicates, decisions, { includeSettings, now: new Date().toISOString() });
  const target = getSpreadsheetId();
  await openLocalDb(target);
  for (const change of changes) await addLocalChange(change);
  await syncNow();
  await openLocalDb(LOCAL_SHEET_ID);
  const grids = initialGrids();
  const pulledAt = new Date().toISOString();
  await putLocalTabs([...grids].map(([tab, rows]) => ({ tab, rows, pulledAt })));
  await openLocalDb(target);
}
