// The day's body records shown together on Сьогодні and in Історія (release
// 1.7): blood sugar readings and medicine intakes in one timeline. Pure.
import type { BloodSugarEntry } from "./bloodSugar";
import { localDateKey } from "./dailyLog";
import type { MedicationIntake } from "./medications";

export type DayRecord =
  | { kind: "sugar"; timestamp: string; entry: BloodSugarEntry }
  | { kind: "medication"; timestamp: string; intake: MedicationIntake };

export type DisplayOrder = "newest" | "oldest";

function time(timestamp: string): number {
  const t = new Date(timestamp).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** The local date key of the day before `dateKey` ("2026-10-05" → "2026-10-04"). */
export function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return localDateKey(new Date(y, m - 1, d - 1));
}

function onDay(timestamp: string, dateKey: string): boolean {
  const t = new Date(timestamp);
  return !Number.isNaN(t.getTime()) && localDateKey(t) === dateKey;
}

/** Sorts newest or oldest first by `timestamp` (stable, never mutates). */
export function inOrder<T extends { timestamp: string }>(items: readonly T[], order: DisplayOrder): T[] {
  const sorted = [...items].sort((a, b) => time(a.timestamp) - time(b.timestamp));
  return order === "newest" ? sorted.reverse() : sorted;
}

/** A day's sugar readings and medicine intakes merged into one timeline, in the given order. */
export function dayRecords(
  sugar: readonly BloodSugarEntry[],
  intakes: readonly MedicationIntake[],
  dateKey: string,
  order: DisplayOrder,
): DayRecord[] {
  const records: DayRecord[] = [
    ...sugar.filter((e) => onDay(e.timestamp, dateKey)).map((entry) => ({ kind: "sugar" as const, timestamp: entry.timestamp, entry })),
    ...intakes
      .filter((i) => onDay(i.timestamp, dateKey))
      .map((intake) => ({ kind: "medication" as const, timestamp: intake.timestamp, intake })),
  ];
  return inOrder(records, order);
}

/** The last medicine taken on a given day (yesterday's affects today's sugar), or null. */
export function lastIntakeOfDay(intakes: readonly MedicationIntake[], dateKey: string): MedicationIntake | null {
  const ofDay = inOrder(intakes.filter((i) => onDay(i.timestamp, dateKey)), "newest");
  return ofDay[0] ?? null;
}

/** The local date keys that have any of the given records, newest first. */
export function datesWithRecords(timestamps: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const ts of timestamps) {
    const t = new Date(ts);
    if (!Number.isNaN(t.getTime())) keys.add(localDateKey(t));
  }
  return [...keys].sort().reverse();
}
