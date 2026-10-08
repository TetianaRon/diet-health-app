// The sheet's format number (release 2.1): a `SheetFormat` key row in the
// Settings tab, like the ID counters (not a setting; parseSettingsRows ignores
// it). 1 = the Ingredients and Dishes tabs (no key), 2 = one Products tab. An
// app that finds a higher number than it knows doesn't write to the sheet and
// says to update the app, so a later structure change can't be undone by an
// older version.
import { readRangeLive, batchUpdateRanges, writeRange } from "./sheets";

export const SHEET_FORMAT_KEY = "SheetFormat";
/** The highest format this version of the app reads and writes. */
export const SUPPORTED_SHEET_FORMAT = 2;

/** Pure: the format written in Settings rows (1 when there's none). */
export function sheetFormatOf(settingsRows: readonly (readonly unknown[])[]): number {
  const row = settingsRows.find((r) => String(r[0] ?? "").trim() === SHEET_FORMAT_KEY);
  const n = Number(row?.[1]);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Pure: whether these Settings rows belong to a sheet a newer app version has changed. */
export function isSheetTooNew(settingsRows: readonly (readonly unknown[])[]): boolean {
  return sheetFormatOf(settingsRows) > SUPPORTED_SHEET_FORMAT;
}

export class SheetTooNewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetTooNewError";
  }
}

/** Records this app's format in the Settings tab (after the products merge). */
export async function writeSheetFormat(): Promise<void> {
  const rows = await readRangeLive("Settings", "A1:C200");
  const index = rows.findIndex((r) => String(r[0] ?? "").trim() === SHEET_FORMAT_KEY);
  if (index === -1) await writeRange("Settings", "A:C", [[SHEET_FORMAT_KEY, SUPPORTED_SHEET_FORMAT, ""]]);
  else if (sheetFormatOf(rows) < SUPPORTED_SHEET_FORMAT) await batchUpdateRanges([{ range: `Settings!B${index + 1}`, values: [[SUPPORTED_SHEET_FORMAT]] }]);
}
