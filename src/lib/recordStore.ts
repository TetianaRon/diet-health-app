// Saving records (release 2.0): every save goes to the device first and reaches
// the sheet with the next sync (sync.ts). A save is recorded as the fields it
// writes plus what those fields held before, which lets sync tell this
// device's changes from edits made elsewhere (sync/merge.ts).
//
// Records are identified by their Id (Settings rows by Key). Saving works the
// same with or without a connection.
import { addLocalChange } from "./localDb";
import { openDeviceDatabase, readRange } from "./sheets";
import { SCAN_LAST_COLUMN } from "./sheetRow";
import { idColumnFor, layoutOf, sameCell } from "./sync/merge";
import { scheduleSync } from "./sync";

async function currentRow(tab: string, id: string): Promise<{ row: unknown[] | null; columnIndex: Map<string, number> }> {
  const grid = await readRange(tab, `A1:${SCAN_LAST_COLUMN}`);
  const layout = layoutOf(tab, grid);
  if (layout.idCol === undefined) throw new Error(`${tab}: no ${idColumnFor(tab)} column`);
  for (let i = layout.firstDataIndex; i < grid.length; i++) {
    if (String(grid[i]?.[layout.idCol] ?? "").trim() === id) return { row: grid[i], columnIndex: layout.columnIndex };
  }
  return { row: null, columnIndex: layout.columnIndex };
}

/**
 * Saves a record's fields (header → value). Only fields that differ from what
 * the device shows are recorded; UpdatedAt is stamped where the tab has it.
 * Fields with a null/undefined value are left as they are.
 */
export async function upsertRecord(tab: string, id: string, fields: Record<string, unknown>): Promise<void> {
  if (!id) throw new Error(`${tab}: a record needs an ID to be saved`);
  await openDeviceDatabase();
  const { row, columnIndex } = await currentRow(tab, id);
  const changed: Record<string, unknown> = {};
  const base: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(fields)) {
    if (header === idColumnFor(tab) || header === "UpdatedAt" || value === null || value === undefined) continue;
    const col = columnIndex.get(header);
    if (col === undefined) continue;
    const before = row ? row[col] : undefined;
    if (row && sameCell(before, value)) continue;
    changed[header] = value;
    if (row) base[header] = before ?? "";
  }
  if (Object.keys(changed).length === 0) return;
  const changedAt = new Date().toISOString();
  const updatedCol = columnIndex.get("UpdatedAt");
  if (updatedCol !== undefined) {
    changed.UpdatedAt = changedAt;
    if (row) base.UpdatedAt = row[updatedCol] ?? "";
  }
  await addLocalChange({ tab, id, op: "upsert", fields: changed, base, changedAt });
  scheduleSync();
}

/** Deletes a record (the row disappears from the sheet at the next sync, and is logged in Deleted). */
export async function deleteRecord(tab: string, id: string): Promise<void> {
  if (!id) throw new Error(`${tab}: a record needs an ID to be deleted`);
  await openDeviceDatabase();
  const { row, columnIndex } = await currentRow(tab, id);
  if (!row) return;
  const updatedCol = columnIndex.get("UpdatedAt");
  const base: Record<string, unknown> = updatedCol !== undefined ? { UpdatedAt: row[updatedCol] ?? "" } : { [idColumnFor(tab)]: id };
  await addLocalChange({ tab, id, op: "delete", fields: {}, base, changedAt: new Date().toISOString() });
  scheduleSync();
}
