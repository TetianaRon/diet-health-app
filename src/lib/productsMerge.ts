// The one-time merge of the Ingredients and Dishes tabs into Products
// (release 2.1, spec → "One product list (2.1)" → "Storage: one tab"). Runs at
// the start of the sheet check, before anything else reads the sheet:
//   - first time: a copy of the whole sheet to Drive, a new Products tab, and
//     the old tabs renamed to archives — nothing overwritten or deleted;
//   - later, if an older app version saved rows into a re-created Ingredients
//     or Dishes tab: those rows are moved into Products (same IDs) and removed.
// Changes waiting on this device for an old tab are moved to Products too.
import { addSheetTabs, batchUpdateRanges, deleteSheetRows, fetchTabsLive, getTabGrids, listSheetTitles, openDeviceDatabase, structuralBatchUpdate } from "./sheets";
import { listLocalChanges, removeLocalChanges, addLocalChange } from "./localDb";
import { makeBackupCopy } from "./backups";
import { BACKUP_NAME_PREFIX } from "./backupTag";
import { newRecordId } from "./itemIds";
import { columnLetter, buildRow, cell, parseTab } from "./sheetRow";
import { labelFor } from "./sheetLabels";
import { absorbLeftovers, ARCHIVE_TITLES, OLD_PRODUCT_TABS, planProductsMerge, PRODUCTS_COLUMN_INDEX, PRODUCTS_HEADERS, PRODUCTS_TAB } from "./products";
import { writeSheetFormat } from "./sheetFormat";
import { INGREDIENTS_HEADERS } from "./ingredients";
import { DISHES_HEADERS } from "./dishes";

export interface ProductsMergeResult {
  /** The first-time merge ran (the notice says so). */
  merged: boolean;
  /** Items in Products after the first-time merge. */
  items: number;
  /** Rows an older app version saved in an old tab, moved into Products. */
  absorbed: number;
}

function stamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A tab title not used yet: the archive name, or with « 2», « 3»… */
function freeTitle(wanted: string, taken: ReadonlySet<string>): string {
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!taken.has(`${wanted} ${n}`)) return `${wanted} ${n}`;
}

/**
 * Changes waiting on this device for Ingredients or Dishes rows go to the same
 * IDs in Products (2.1). Also run before each sync, for saves made on this
 * device by the previous version that hadn't synced yet.
 */
export async function movePendingProductChanges(): Promise<void> {
  await openDeviceDatabase();
  const pending = await listLocalChanges();
  const old = pending.filter((c) => (OLD_PRODUCT_TABS as readonly string[]).includes(c.tab));
  if (old.length === 0) return;
  for (const change of old) {
    const { seq: _seq, ...rest } = change;
    await addLocalChange({ ...rest, tab: PRODUCTS_TAB });
  }
  await removeLocalChanges(old.map((c) => c.seq));
}

/**
 * Brings the sheet to one Products tab when it still has the old tabs.
 * Returns null when there was nothing to do. `onStart` is called before the
 * first write («Оновлюємо таблицю…»).
 */
export async function mergeProductsIfNeeded(onStart?: () => void): Promise<ProductsMergeResult | null> {
  const titles = await listSheetTitles();
  const oldTabs = OLD_PRODUCT_TABS.filter((tab) => titles.includes(tab));
  if (oldTabs.length === 0) {
    await movePendingProductChanges();
    return null;
  }
  const hasProducts = titles.includes(PRODUCTS_TAB);
  const grids = await fetchTabsLive(hasProducts ? [...oldTabs, PRODUCTS_TAB] : titles);
  const plan = planProductsMerge(grids.get("Ingredients"), grids.get("Dishes"), (kind) => newRecordId(kind));

  if (!hasProducts) {
    onStart?.();
    await makeBackupCopy("products-merge", `${BACKUP_NAME_PREFIX} ${stamp()} (перед об'єднанням вкладок)`, grids);
    await addSheetTabs([PRODUCTS_TAB]);
    const values = [[...PRODUCTS_HEADERS], PRODUCTS_HEADERS.map((h) => labelFor(h)), ...plan.rows.map((r) => PRODUCTS_HEADERS.map((_, i) => r[i] ?? ""))];
    await batchUpdateRanges([{ range: `${PRODUCTS_TAB}!A1:${columnLetter(PRODUCTS_HEADERS.length - 1)}${values.length}`, values }]);
    const tabGrids = await getTabGrids();
    const taken = new Set(tabGrids.keys());
    const renames = oldTabs.map((tab) => {
      const title = freeTitle(ARCHIVE_TITLES[tab], taken);
      taken.add(title);
      return { updateSheetProperties: { properties: { sheetId: tabGrids.get(tab)!.sheetId, title }, fields: "title" } };
    });
    await structuralBatchUpdate(renames);
    await writeSheetFormat();
    await movePendingProductChanges();
    return { merged: true, items: plan.rows.length, absorbed: 0 };
  }

  // Products exists: an older app version re-created an old tab and saved rows there.
  if (plan.rows.length > 0) {
    onStart?.();
    const productsGrid = grids.get(PRODUCTS_TAB) ?? [];
    const parsed = parseTab(PRODUCTS_TAB, productsGrid, PRODUCTS_HEADERS);
    const liveIndex = parsed.columnIndex;
    // Canonical order for the merge, then back to the tab's own column order.
    const toCanonical = (row: unknown[]) => buildRow(Object.fromEntries(PRODUCTS_HEADERS.map((h) => [h, cell(row, liveIndex, h) ?? ""])), PRODUCTS_COLUMN_INDEX);
    const result = absorbLeftovers(parsed.dataRows.map(toCanonical), plan.rows);
    const firstDataRow = productsGrid.length - parsed.dataRows.length + 1;
    const lastCol = columnLetter(Math.max(...liveIndex.values()));
    const rows = result.rows.map((r) => {
      const fields = Object.fromEntries(PRODUCTS_HEADERS.map((h) => [h, r[PRODUCTS_COLUMN_INDEX.get(h)!] ?? ""]));
      const built = buildRow(fields, liveIndex);
      return Array.from({ length: Math.max(...liveIndex.values()) + 1 }, (_, i) => built[i] ?? "");
    });
    await batchUpdateRanges([{ range: `${PRODUCTS_TAB}!A${firstDataRow}:${lastCol}${firstDataRow + rows.length - 1}`, values: rows }]);
    for (const tab of oldTabs) {
      const grid = grids.get(tab) ?? [];
      const { dataRows } = parseTab(tab, grid, tab === "Ingredients" ? INGREDIENTS_HEADERS : DISHES_HEADERS);
      const first = grid.length - dataRows.length + 1;
      if (dataRows.length > 0) await deleteSheetRows(tab, dataRows.map((_, i) => first + i));
    }
    await movePendingProductChanges();
    return { merged: false, items: result.rows.length, absorbed: result.added + result.replaced };
  }
  await movePendingProductChanges();
  return null;
}
