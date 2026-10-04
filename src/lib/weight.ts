// Weight diary (release 1.7, spec → "Daily records and the new Today").
// Weight tab: Timestamp, WeightKg, Notes. The trend (weightTrend) is pure.
import { batchUpdateRanges, readRange, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex } from "./sheetRow";

export interface WeightEntry {
  timestamp: string; // ISO — when she weighed herself (editable)
  weightKg: number;
  notes: string;
}

export const WEIGHT_HEADERS = ["Timestamp", "WeightKg", "Notes"] as const;
const DEFAULT_INDEX = buildColumnIndex(WEIGHT_HEADERS);
export const WEIGHT_RANGE = `A1:${SCAN_LAST_COLUMN}5000`;
const APPEND_RANGE = `A:${SCAN_LAST_COLUMN}`;

function toNumber(value: unknown): number {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function rowToWeightEntry(row: unknown[], columnIndex: ColumnIndex = DEFAULT_INDEX): WeightEntry {
  return {
    timestamp: String(cell(row, columnIndex, "Timestamp") ?? ""),
    weightKg: toNumber(cell(row, columnIndex, "WeightKg")),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
  };
}

export function weightEntryToRow(e: WeightEntry, columnIndex: ColumnIndex = DEFAULT_INDEX): unknown[] {
  return buildRow({ Timestamp: e.timestamp, WeightKg: e.weightKg, Notes: e.notes }, columnIndex);
}

/** Weight entries from the tab as read (header row first). */
export function parseWeightEntries(rows: unknown[][]): WeightEntry[] {
  const { columnIndex, dataRows } = parseTab("Weight", rows, WEIGHT_HEADERS);
  return dataRows
    .filter((r) => r.length > 0)
    .map((r) => rowToWeightEntry(r, columnIndex))
    .filter((e) => e.timestamp !== "" && e.weightKg > 0);
}

export async function addWeightEntry(entry: WeightEntry): Promise<WeightEntry> {
  const { columnIndex } = parseTab("Weight", await readRange("Weight", WEIGHT_RANGE), WEIGHT_HEADERS);
  await writeRange("Weight", APPEND_RANGE, [weightEntryToRow(entry, columnIndex)]);
  return entry;
}

/** The write replacing `original` (found by time + weight — no row ID) with `updated`, or null if it's gone. */
export function planWeightUpdate(
  original: WeightEntry,
  updated: WeightEntry,
  dataRows: unknown[][],
  columnIndex: ColumnIndex,
  firstDataRow = 2,
): { range: string; values: unknown[][] } | null {
  const rowIndex = dataRows.findIndex((row) => {
    const e = rowToWeightEntry(row, columnIndex);
    return e.timestamp === original.timestamp && e.weightKg === original.weightKg;
  });
  if (rowIndex < 0) return null;
  const rowNumber = rowIndex + firstDataRow;
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  return { range: `Weight!A${rowNumber}:${lastCol}${rowNumber}`, values: [weightEntryToRow(updated, columnIndex)] };
}

export async function updateWeightEntry(original: WeightEntry, updated: WeightEntry): Promise<void> {
  const { columnIndex, dataRows, firstDataRow } = parseTab("Weight", await readRange("Weight", WEIGHT_RANGE), WEIGHT_HEADERS);
  const update = planWeightUpdate(original, updated, dataRows, columnIndex, firstDataRow);
  if (!update) throw new Error("Weight entry not found");
  await batchUpdateRanges([update]);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Fewer measurements than this in the window → compare with the previous one instead of an average. */
export const MIN_ENTRIES_FOR_AVERAGE = 3;
export const TREND_WINDOW_DAYS = 30;

export type WeightComparison =
  | { kind: "average"; average: number; count: number; diff: number }
  | { kind: "previous"; previous: number; daysAgo: number; diff: number };

export interface WeightTrend {
  latest: WeightEntry;
  comparison: WeightComparison | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The latest weight and how it compares: with the average of the OTHER
 * measurements from the 30 days before it (day-to-day water swings of
 * 0.5–1.5 kg average out, so this shows the direction), or — with fewer than
 * MIN_ENTRIES_FOR_AVERAGE such measurements — with the previous measurement.
 * `diff` = latest − reference, rounded to 0.1 kg. Null when there's no entry.
 */
export function weightTrend(entries: readonly WeightEntry[]): WeightTrend | null {
  const sorted = entries
    .filter((e) => !Number.isNaN(new Date(e.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const [latest, ...older] = sorted;
  if (!latest) return null;

  const latestTime = new Date(latest.timestamp).getTime();
  const inWindow = older.filter((e) => latestTime - new Date(e.timestamp).getTime() <= TREND_WINDOW_DAYS * DAY_MS);
  if (inWindow.length >= MIN_ENTRIES_FOR_AVERAGE) {
    const average = round1(inWindow.reduce((sum, e) => sum + e.weightKg, 0) / inWindow.length);
    return { latest, comparison: { kind: "average", average, count: inWindow.length, diff: round1(latest.weightKg - average) } };
  }
  const previous = older[0];
  if (!previous) return { latest, comparison: null };
  const daysAgo = Math.max(0, Math.round((latestTime - new Date(previous.timestamp).getTime()) / DAY_MS));
  return {
    latest,
    comparison: { kind: "previous", previous: previous.weightKg, daysAgo, diff: round1(latest.weightKg - previous.weightKg) },
  };
}
