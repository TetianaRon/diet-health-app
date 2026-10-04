// Weight diary (release 1.7, spec → "Daily records and the new Today").
// Weight tab: Date, WeightKg, Notes — ONE record per day, no time of day
// (developer, 2026-10-05). The trend (weightTrend) is pure.
import { batchUpdateRanges, readRange, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex } from "./sheetRow";

export interface WeightEntry {
  date: string; // local "YYYY-MM-DD"
  weightKg: number;
  notes: string;
}

export const WEIGHT_HEADERS = ["Date", "WeightKg", "Notes"] as const;
const DEFAULT_INDEX = buildColumnIndex(WEIGHT_HEADERS);
export const WEIGHT_RANGE = `A1:${SCAN_LAST_COLUMN}5000`;
const APPEND_RANGE = `A:${SCAN_LAST_COLUMN}`;

function toNumber(value: unknown): number {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * A Date cell as "YYYY-MM-DD", or "" if it isn't a date. The app writes the
 * date as plain text (see weightEntryToRow), but a date typed in the sheet by
 * hand comes back in the sheet's own format — "05.10.2026" in a Ukrainian
 * sheet — so that form is understood too.
 */
export function normalizeDateCell(value: unknown): string {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dotted = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotted) return `${dotted[3]}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  return "";
}

export function rowToWeightEntry(row: unknown[], columnIndex: ColumnIndex = DEFAULT_INDEX): WeightEntry {
  return {
    date: normalizeDateCell(cell(row, columnIndex, "Date")),
    weightKg: toNumber(cell(row, columnIndex, "WeightKg")),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
  };
}

export function weightEntryToRow(e: WeightEntry, columnIndex: ColumnIndex = DEFAULT_INDEX): unknown[] {
  // The leading apostrophe keeps "2026-10-05" as text: otherwise Sheets turns
  // it into a date shown in the sheet's own locale format.
  return buildRow({ Date: `'${e.date}`, WeightKg: e.weightKg, Notes: e.notes }, columnIndex);
}

/** Weight entries from the tab as read (header row first); one per day — a later row for the same day wins. */
export function parseWeightEntries(rows: unknown[][]): WeightEntry[] {
  const { columnIndex, dataRows } = parseTab("Weight", rows, WEIGHT_HEADERS);
  const byDate = new Map<string, WeightEntry>();
  for (const row of dataRows) {
    if (row.length === 0) continue;
    const entry = rowToWeightEntry(row, columnIndex);
    if (entry.date !== "" && entry.weightKg > 0) byDate.set(entry.date, entry);
  }
  return [...byDate.values()];
}

/**
 * The write that saves `entry` for its day: overwrites that day's row if
 * there is one (one record per day), else appends. Returns the range to
 * update, or null to append.
 */
export function planWeightSave(
  entry: WeightEntry,
  dataRows: unknown[][],
  columnIndex: ColumnIndex,
  firstDataRow = 2,
): { range: string; values: unknown[][] } | null {
  const rowIndex = dataRows.findIndex((row) => rowToWeightEntry(row, columnIndex).date === entry.date);
  if (rowIndex < 0) return null;
  const rowNumber = rowIndex + firstDataRow;
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  return { range: `Weight!A${rowNumber}:${lastCol}${rowNumber}`, values: [weightEntryToRow(entry, columnIndex)] };
}

/**
 * Saves the day's weight. When editing moves it to another day (`previousDate`),
 * the old day's row is overwritten with the new day — so it never duplicates.
 */
export async function saveWeightEntry(entry: WeightEntry, previousDate?: string): Promise<WeightEntry> {
  const { columnIndex, dataRows, firstDataRow } = parseTab("Weight", await readRange("Weight", WEIGHT_RANGE), WEIGHT_HEADERS);
  const sameDay = planWeightSave(entry, dataRows, columnIndex, firstDataRow);
  const movedFrom =
    previousDate && previousDate !== entry.date ? planWeightSave({ ...entry, date: previousDate }, dataRows, columnIndex, firstDataRow) : null;
  if (sameDay) {
    await batchUpdateRanges([sameDay]);
  } else if (movedFrom) {
    await batchUpdateRanges([{ range: movedFrom.range, values: [weightEntryToRow(entry, columnIndex)] }]);
  } else {
    await writeRange("Weight", APPEND_RANGE, [weightEntryToRow(entry, columnIndex)]);
  }
  return entry;
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

/** Days since the epoch for a "YYYY-MM-DD" (local calendar), for whole-day differences. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

/**
 * The latest weight and how it compares: with the average of the OTHER
 * measurements from the 30 days before it (day-to-day water swings of
 * 0.5–1.5 kg average out, so this shows the direction), or — with fewer than
 * MIN_ENTRIES_FOR_AVERAGE such measurements — with the previous measurement.
 * `diff` = latest − reference, rounded to 0.1 kg. Null when there's no entry.
 */
export function weightTrend(entries: readonly WeightEntry[]): WeightTrend | null {
  const sorted = entries.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const [latest, ...older] = sorted;
  if (!latest) return null;

  const latestDay = dayNumber(latest.date);
  const inWindow = older.filter((e) => latestDay - dayNumber(e.date) <= TREND_WINDOW_DAYS);
  if (inWindow.length >= MIN_ENTRIES_FOR_AVERAGE) {
    const average = round1(inWindow.reduce((sum, e) => sum + e.weightKg, 0) / inWindow.length);
    return { latest, comparison: { kind: "average", average, count: inWindow.length, diff: round1(latest.weightKg - average) } };
  }
  const previous = older[0];
  if (!previous) return { latest, comparison: null };
  return {
    latest,
    comparison: {
      kind: "previous",
      previous: previous.weightKg,
      daysAgo: latestDay - dayNumber(previous.date),
      diff: round1(latest.weightKg - previous.weightKg),
    },
  };
}
