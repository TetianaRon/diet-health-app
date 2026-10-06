// IO around itemIds.ts: hands out the next `I…` / `D…` ID and keeps the
// never-reuse counter in the Settings tab (a key row like the settings,
// but not a setting — parseSettingsRows ignores keys it doesn't know, and
// the Settings screen never writes it). No unit tests by design, same as
// the other Sheets IO; the numbering rule itself is tested in itemIds.ts.
import { batchUpdateRanges, readRangeLive, writeRange } from "./sheets";
import { formatItemId, ID_COUNTER_KEYS, nextItemNumber, type SheetItemKind } from "./itemIds";

const SETTINGS_RANGE = "A1:C200";

async function readCounterRow(kind: SheetItemKind): Promise<{ rowNumber: number | null; value: number }> {
  const rows = await readRangeLive("Settings", SETTINGS_RANGE);
  const index = rows.findIndex((row) => String(row[0] ?? "").trim() === ID_COUNTER_KEYS[kind]);
  return index === -1 ? { rowNumber: null, value: 0 } : { rowNumber: index + 1, value: Number(rows[index][1]) || 0 };
}

async function writeCounter(kind: SheetItemKind, rowNumber: number | null, value: number): Promise<void> {
  if (rowNumber === null) {
    await writeRange("Settings", "A:C", [[ID_COUNTER_KEYS[kind], value, ""]]);
  } else {
    await batchUpdateRanges([{ range: `Settings!B${rowNumber}`, values: [[value]] }]);
  }
}

/**
 * Reserves the next ID for a new row: one more than the highest number in
 * `existingIds` (the tab's Id column, as just read) and the counter, and
 * records it in the counter before the caller writes the row — so a number
 * is never handed out twice, even if that row is later deleted by hand.
 */
export async function reserveItemId(kind: SheetItemKind, existingIds: readonly unknown[]): Promise<string> {
  const counter = await readCounterRow(kind);
  const number = nextItemNumber(existingIds, kind, counter.value);
  await writeCounter(kind, counter.rowNumber, number);
  return formatItemId(kind, number);
}

/**
 * Sets the counter (after the sheet upgrade numbered existing rows), using
 * Settings rows already read from A1 — no extra read request.
 */
export async function writeItemCounter(kind: SheetItemKind, value: number, settingsRows: readonly unknown[][]): Promise<void> {
  const index = settingsRows.findIndex((row) => String(row[0] ?? "").trim() === ID_COUNTER_KEYS[kind]);
  await writeCounter(kind, index === -1 ? null : index + 1, value);
}
