// The one-time notice after a developer import (release 2.3.1): the import
// writes an `ImportNotice` key row in Settings (like `SheetFormat`, ignored
// by parseSettingsRows); each device shows its text once and remembers that it
// did, per sheet. Mom's phone gets the row with its next sync.
import { batchUpdateRanges, readRangeLive, writeRange } from "./sheets";

export const IMPORT_NOTICE_KEY = "ImportNotice";

export interface ImportNotice {
  /** When the import ran (ISO) — what a device remembers as seen. */
  at: string;
  text: string;
}

/** Pure: the notice in Settings rows («2026-10-10T…|Додано…»), or null. */
export function importNoticeOf(rows: readonly (readonly unknown[])[]): ImportNotice | null {
  const row = rows.find((r) => String(r[0] ?? "").trim() === IMPORT_NOTICE_KEY);
  const value = String(row?.[1] ?? "");
  const bar = value.indexOf("|");
  if (bar <= 0 || bar === value.length - 1) return null;
  return { at: value.slice(0, bar), text: value.slice(bar + 1) };
}

/** Writes (or replaces) the notice row in the sheet's Settings tab. */
export async function writeImportNotice(text: string, at = new Date().toISOString()): Promise<void> {
  const value = `${at}|${text}`;
  const rows = await readRangeLive("Settings", "A1:C200");
  const index = rows.findIndex((r) => String(r[0] ?? "").trim() === IMPORT_NOTICE_KEY);
  if (index === -1) await writeRange("Settings", "A:C", [[IMPORT_NOTICE_KEY, value, ""]]);
  else await batchUpdateRanges([{ range: `Settings!B${index + 1}`, values: [[value]] }]);
}
