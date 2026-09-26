// Typed data-access layer over the BloodSugar tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Same append-only, row-mapper pattern as
// ingredients.ts/dishes.ts/dailyLog.ts. Rows are read/written by column
// HEADER NAME (see sheetRow.ts), not fixed position, so a reordered sheet —
// deliberately or by someone dragging a column in the Sheets UI — still
// parses correctly.
import { readRange, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, parseTab, readColumnIndex, SCAN_LAST_COLUMN, type ColumnIndex } from "./sheetRow";

export const BLOOD_SUGAR_CONTEXTS = ["fasting", "after-meal", "other"] as const;
export type BloodSugarContext = (typeof BLOOD_SUGAR_CONTEXTS)[number];

export interface BloodSugarEntry {
  timestamp: string; // ISO
  valueMmolL: number;
  context: BloodSugarContext;
  notes: string;
}

// Canonical column order — what a brand-new sheet gets initialized with (see
// spreadsheetInit.ts, which imports this) and the default columnIndex used
// below when none is given (tests, or before a live sheet's own header row
// has been read).
export const BLOOD_SUGAR_HEADERS = ["Timestamp", "ValueMmolL", "Context", "Notes"] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(BLOOD_SUGAR_HEADERS);

const RANGE = `A1:${SCAN_LAST_COLUMN}5000`; // includes the header row (row 1), needed to resolve columns by name
const APPEND_RANGE = `A:${SCAN_LAST_COLUMN}`;

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toContext(value: unknown): BloodSugarContext {
  return (BLOOD_SUGAR_CONTEXTS as readonly string[]).includes(String(value)) ? (value as BloodSugarContext) : "other";
}

export function rowToBloodSugarEntry(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): BloodSugarEntry {
  return {
    timestamp: String(cell(row, columnIndex, "Timestamp") ?? ""),
    valueMmolL: toNumber(cell(row, columnIndex, "ValueMmolL")),
    context: toContext(cell(row, columnIndex, "Context")),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
  };
}

export function bloodSugarEntryToRow(entry: BloodSugarEntry, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(
    { Timestamp: entry.timestamp, ValueMmolL: entry.valueMmolL, Context: entry.context, Notes: entry.notes },
    columnIndex,
  );
}

export async function listBloodSugarEntries(): Promise<BloodSugarEntry[]> {
  const { columnIndex, dataRows } = parseTab("BloodSugar", await readRange("BloodSugar", RANGE), BLOOD_SUGAR_HEADERS);
  return dataRows.filter((row) => row.length > 0).map((row) => rowToBloodSugarEntry(row, columnIndex));
}

export async function addBloodSugarEntry(entry: Omit<BloodSugarEntry, "timestamp">): Promise<void> {
  const withTimestamp: BloodSugarEntry = { ...entry, timestamp: new Date().toISOString() };
  const columnIndex = await readColumnIndex("BloodSugar", BLOOD_SUGAR_HEADERS);
  await writeRange("BloodSugar", APPEND_RANGE, [bloodSugarEntryToRow(withTimestamp, columnIndex)]);
}

/** Most recent entry by timestamp, or null if there are none. */
export function latestBloodSugarEntry(entries: BloodSugarEntry[]): BloodSugarEntry | null {
  return entries.reduce<BloodSugarEntry | null>(
    (latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest),
    null,
  );
}
