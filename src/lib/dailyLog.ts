// Typed data-access layer over the DailyLog tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Each row is one logged meal item — an
// Ingredient or Dish portion, scaled from its per-100g values at log time
// (a later edit to the Ingredients/Dishes bundle shouldn't retroactively
// change what was actually eaten).
import { readRange, writeRange } from "./sheets";
import { calcGlycemicLoad } from "./health";
import type { IngredientNutrition } from "./dishes";

export const MEAL_TYPES = ["Сніданок", "Обід", "Вечеря", "Перекус"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface DailyLogEntry extends IngredientNutrition {
  timestamp: string; // ISO
  mealType: MealType;
  itemName: string;
  portionGrams: number;
  gl: number;
  notes: string;
}

const LOG_RANGE = "A2:N5000"; // header row is A1:N1
const LOG_APPEND_RANGE = "A:N";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toMealType(value: unknown): MealType {
  return (MEAL_TYPES as readonly string[]).includes(String(value)) ? (value as MealType) : "Перекус";
}

/** Scales an item's per-100g nutrition to a logged portion; GI itself doesn't scale. */
export function computePortionNutrition(per100g: IngredientNutrition, portionGrams: number): IngredientNutrition {
  const factor = portionGrams / 100;
  return {
    carbsG: round2(per100g.carbsG * factor),
    gi: per100g.gi,
    fiberG: round2(per100g.fiberG * factor),
    sugarsG: round2(per100g.sugarsG * factor),
    proteinG: round2(per100g.proteinG * factor),
    fatG: round2(per100g.fatG * factor),
    caloriesKcal: round2(per100g.caloriesKcal * factor),
    sodiumMg: round2(per100g.sodiumMg * factor),
  };
}

/** Builds a full log entry (including GL) from an item's per-100g nutrition and a logged portion. */
export function buildLogEntry(
  mealType: MealType,
  itemName: string,
  portionGrams: number,
  per100g: IngredientNutrition,
  notes: string,
  timestamp: string = new Date().toISOString(),
): DailyLogEntry {
  const portion = computePortionNutrition(per100g, portionGrams);
  return {
    timestamp,
    mealType,
    itemName,
    portionGrams,
    ...portion,
    gl: round2(calcGlycemicLoad(portion.gi, portion.carbsG)),
    notes,
  };
}

/** Reasonable default meal type for a quick-add, based on time of day. */
export function suggestMealType(now: Date): MealType {
  const hour = now.getHours();
  if (hour < 11) return "Сніданок";
  if (hour < 16) return "Обід";
  if (hour < 20) return "Вечеря";
  return "Перекус";
}

/** True if an ISO timestamp falls on the given local calendar date (yyyy-mm-dd). */
export function isSameLocalDate(isoTimestamp: string, dateKey: string): boolean {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return false;
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return key === dateKey;
}

/** yyyy-mm-dd for a Date, in local time — the key isSameLocalDate expects. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Last `limit` DailyLog entries at or before a given ISO timestamp,
 * most-recent-first — powers the Blood Sugar screen's "meals before this
 * reading" review. ISO strings already sort correctly lexically, so no
 * date-parsing logic is needed. Pure timestamp filter/sort, no correlation
 * or statistics — mom reviews the list herself.
 */
export function mealsBeforeTimestamp(entries: DailyLogEntry[], timestamp: string, limit = 6): DailyLogEntry[] {
  return entries
    .filter((e) => e.timestamp <= timestamp)
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);
}

export interface DayGroup {
  dateKey: string; // yyyy-mm-dd
  entries: DailyLogEntry[]; // most-recent-first
}

/**
 * Groups entries from the `days` calendar days immediately before
 * `referenceDate` (today itself is deliberately excluded — the Today screen
 * already shows it separately), most-recent-day-first, each day's entries
 * most-recent-first. Powers Today's lightweight "last 3 days" history —
 * a stopgap ahead of a proper History tab, per docs/build-log.md.
 */
export function recentDayGroups(entries: DailyLogEntry[], referenceDate: Date, days: number): DayGroup[] {
  const todayKey = localDateKey(referenceDate);
  const cutoffKeys = new Set<string>();
  for (let i = 1; i <= days; i++) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    cutoffKeys.add(localDateKey(d));
  }

  const byDate = new Map<string, DailyLogEntry[]>();
  for (const entry of entries) {
    const key = localDateKey(new Date(entry.timestamp));
    if (key === todayKey || !cutoffKeys.has(key)) continue;
    const bucket = byDate.get(key);
    if (bucket) bucket.push(entry);
    else byDate.set(key, [entry]);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      entries: [...dayEntries].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)),
    }));
}

// Column order: Timestamp, MealType, ItemName, PortionGrams, Carbs_g, GI,
// Fiber_g, Sugars_g, Protein_g, Fat_g, Calories_kcal, Sodium_mg, GL, Notes (A-N).
export function rowToLogEntry(row: unknown[]): DailyLogEntry {
  return {
    timestamp: String(row[0] ?? ""),
    mealType: toMealType(row[1]),
    itemName: String(row[2] ?? ""),
    portionGrams: toNumber(row[3]),
    carbsG: toNumber(row[4]),
    gi: toNumber(row[5]),
    fiberG: toNumber(row[6]),
    sugarsG: toNumber(row[7]),
    proteinG: toNumber(row[8]),
    fatG: toNumber(row[9]),
    caloriesKcal: toNumber(row[10]),
    sodiumMg: toNumber(row[11]),
    gl: toNumber(row[12]),
    notes: String(row[13] ?? ""),
  };
}

export function logEntryToRow(entry: DailyLogEntry): unknown[] {
  return [
    entry.timestamp,
    entry.mealType,
    entry.itemName,
    entry.portionGrams,
    entry.carbsG,
    entry.gi,
    entry.fiberG,
    entry.sugarsG,
    entry.proteinG,
    entry.fatG,
    entry.caloriesKcal,
    entry.sodiumMg,
    entry.gl,
    entry.notes,
  ];
}

export async function listLogEntries(): Promise<DailyLogEntry[]> {
  const rows = await readRange("DailyLog", LOG_RANGE);
  return rows.filter((row) => row.length > 0).map(rowToLogEntry);
}

export async function addLogEntry(entry: DailyLogEntry): Promise<void> {
  await writeRange("DailyLog", LOG_APPEND_RANGE, [logEntryToRow(entry)]);
}
