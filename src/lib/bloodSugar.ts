// Typed data-access layer over the BloodSugar tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Same append-only, row-mapper pattern as
// ingredients.ts/dishes.ts/dailyLog.ts. Rows are read/written by column
// HEADER NAME (see sheetRow.ts), not fixed position, so a reordered sheet —
// deliberately or by someone dragging a column in the Sheets UI — still
// parses correctly.
import { newRecordId } from "./itemIds";
import { readRange } from "./sheets";
import { upsertRecord } from "./recordStore";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex } from "./sheetRow";
import { localDateKey } from "./dailyLog";

export const BLOOD_SUGAR_CONTEXTS = ["fasting", "after-meal", "other"] as const;
export type BloodSugarContext = (typeof BLOOD_SUGAR_CONTEXTS)[number];

export interface BloodSugarEntry {
  /** Row ID (release 2.0), shared across devices; absent only on a row not yet given one. */
  id?: string;
  timestamp: string; // ISO
  valueMmolL: number;
  context: BloodSugarContext;
  notes: string;
}

// Canonical column order — what a brand-new sheet gets initialized with (see
// spreadsheetInit.ts, which imports this) and the default columnIndex used
// below when none is given (tests, or before a live sheet's own header row
// has been read).
export const BLOOD_SUGAR_HEADERS = ["Timestamp", "ValueMmolL", "Context", "Notes", "Id", "UpdatedAt"] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(BLOOD_SUGAR_HEADERS);

const RANGE = `A1:${SCAN_LAST_COLUMN}5000`; // includes the header row (row 1), needed to resolve columns by name

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
    id: String(cell(row, columnIndex, "Id") ?? "").trim() || undefined,
  };
}

/** The BloodSugar fields of a reading (header → value). A missing id writes nothing (null). */
export function bloodSugarFields(entry: BloodSugarEntry): Record<string, unknown> {
  return { Timestamp: entry.timestamp, ValueMmolL: entry.valueMmolL, Context: entry.context, Notes: entry.notes, Id: entry.id || null };
}

export function bloodSugarEntryToRow(entry: BloodSugarEntry, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(bloodSugarFields(entry), columnIndex);
}

export async function listBloodSugarEntries(): Promise<BloodSugarEntry[]> {
  const { columnIndex, dataRows } = parseTab("BloodSugar", await readRange("BloodSugar", RANGE), BLOOD_SUGAR_HEADERS);
  return dataRows.filter((row) => row.length > 0).map((row) => rowToBloodSugarEntry(row, columnIndex));
}

/**
 * Appends a reading. `timestamp` is when the test was taken — it can differ
 * from when it's written down, so the form lets her set it (defaults to now).
 */
// Saves go to the device first and reach the sheet with the next sync (recordStore.ts, release 2.0).
export async function addBloodSugarEntry(
  entry: Omit<BloodSugarEntry, "timestamp">,
  timestamp: string = new Date().toISOString(),
): Promise<BloodSugarEntry> {
  const saved: BloodSugarEntry = { ...entry, timestamp, id: entry.id ?? newRecordId("sugar") };
  await upsertRecord("BloodSugar", saved.id!, bloodSugarFields(saved));
  return saved;
}

/**
 * The single range write that replaces `original` with `updated`, or null if
 * `original` isn't in the sheet any more. The BloodSugar tab has no row ID, so
 * the row is found by its content (timestamp + value), the same content-based
 * matching planMealSave uses for DailyLog. `dataRows[0]` is sheet row
 * `firstDataRow`.
 */
export function planBloodSugarUpdate(
  original: BloodSugarEntry,
  updated: BloodSugarEntry,
  dataRows: unknown[][],
  columnIndex: ColumnIndex,
  firstDataRow = 2,
): { range: string; values: unknown[][] } | null {
  const rowIndex = dataRows.findIndex((row) => {
    const e = rowToBloodSugarEntry(row, columnIndex);
    return e.timestamp === original.timestamp && e.valueMmolL === original.valueMmolL;
  });
  if (rowIndex < 0) return null;
  const rowNumber = rowIndex + firstDataRow;
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  return { range: `BloodSugar!A${rowNumber}:${lastCol}${rowNumber}`, values: [bloodSugarEntryToRow(updated, columnIndex)] };
}

/** Rewrites one reading in place. Throws if it can't be found (e.g. changed on another device meanwhile). */
export async function updateBloodSugarEntry(original: BloodSugarEntry, updated: BloodSugarEntry): Promise<void> {
  if (!original.id) throw new Error("BloodSugar entry has no ID yet — sync first");
  await upsertRecord("BloodSugar", original.id, bloodSugarFields({ ...updated, id: original.id }));
}

export interface BloodSugarDay {
  dateKey: string; // local yyyy-mm-dd
  entries: BloodSugarEntry[]; // newest first
}

/** Readings grouped by local calendar day, newest day first and newest reading first within a day. */
export function groupBloodSugarByDay(entries: BloodSugarEntry[]): BloodSugarDay[] {
  const sorted = [...entries]
    .filter((e) => !Number.isNaN(new Date(e.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const days: BloodSugarDay[] = [];
  for (const entry of sorted) {
    const key = localDateKey(new Date(entry.timestamp));
    const last = days[days.length - 1];
    if (last && last.dateKey === key) last.entries.push(entry);
    else days.push({ dateKey: key, entries: [entry] });
  }
  return days;
}

/** Most recent entry by timestamp, or null if there are none. */
export function latestBloodSugarEntry(entries: BloodSugarEntry[]): BloodSugarEntry | null {
  return entries.reduce<BloodSugarEntry | null>(
    (latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest),
    null,
  );
}
