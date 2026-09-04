// Typed data-access layer over the BloodSugar tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Same append-only, row-mapper pattern as
// ingredients.ts/dishes.ts/dailyLog.ts.
import { readRange, writeRange } from "./sheets";

export const BLOOD_SUGAR_CONTEXTS = ["fasting", "after-meal", "other"] as const;
export type BloodSugarContext = (typeof BLOOD_SUGAR_CONTEXTS)[number];

export interface BloodSugarEntry {
  timestamp: string; // ISO
  valueMmolL: number;
  context: BloodSugarContext;
  notes: string;
}

const RANGE = "A2:D5000"; // header row is A1:D1
const APPEND_RANGE = "A:D";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toContext(value: unknown): BloodSugarContext {
  return (BLOOD_SUGAR_CONTEXTS as readonly string[]).includes(String(value)) ? (value as BloodSugarContext) : "other";
}

// Column order: Timestamp, ValueMmolL, Context, Notes (A-D).
export function rowToBloodSugarEntry(row: unknown[]): BloodSugarEntry {
  return {
    timestamp: String(row[0] ?? ""),
    valueMmolL: toNumber(row[1]),
    context: toContext(row[2]),
    notes: String(row[3] ?? ""),
  };
}

export function bloodSugarEntryToRow(entry: BloodSugarEntry): unknown[] {
  return [entry.timestamp, entry.valueMmolL, entry.context, entry.notes];
}

export async function listBloodSugarEntries(): Promise<BloodSugarEntry[]> {
  const rows = await readRange("BloodSugar", RANGE);
  return rows.filter((row) => row.length > 0).map(rowToBloodSugarEntry);
}

export async function addBloodSugarEntry(entry: Omit<BloodSugarEntry, "timestamp">): Promise<void> {
  const withTimestamp: BloodSugarEntry = { ...entry, timestamp: new Date().toISOString() };
  await writeRange("BloodSugar", APPEND_RANGE, [bloodSugarEntryToRow(withTimestamp)]);
}

/** Most recent entry by timestamp, or null if there are none. */
export function latestBloodSugarEntry(entries: BloodSugarEntry[]): BloodSugarEntry | null {
  return entries.reduce<BloodSugarEntry | null>(
    (latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest),
    null,
  );
}
