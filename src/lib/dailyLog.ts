// Typed data-access layer over the DailyLog tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Each row is one logged meal item — an
// Ingredient or Dish portion, scaled from its per-100g values at log time
// (a later edit to the Ingredients/Dishes bundle shouldn't retroactively
// change what was actually eaten).
import { readRange, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, readColumnIndex, type ColumnIndex } from "./sheetRow";
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
  // Ties multiple items eaten in one sitting together as a single meal
  // occasion, distinct from mealType (a label that can repeat several times
  // a day — e.g. three separate snacks). See buildLogEntry/groupIntoMeals.
  mealId: string;
}

// Canonical column order — what a brand-new sheet gets initialized with (see
// spreadsheetInit.ts, which imports this) and the default columnIndex used
// below when none is given (tests, or before a live sheet's own header row
// has been read). Rows are read/written by column HEADER NAME (see
// sheetRow.ts), not fixed position, so a reordered sheet still parses
// correctly.
export const DAILY_LOG_HEADERS = [
  "Timestamp",
  "MealType",
  "ItemName",
  "PortionGrams",
  "Carbs_g",
  "GI",
  "Fiber_g",
  "Sugars_g",
  "Protein_g",
  "Fat_g",
  "Calories_kcal",
  "Sodium_mg",
  "GL",
  "Notes",
  "MealId",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(DAILY_LOG_HEADERS);

const LOG_RANGE = "A1:O5000"; // includes the header row (row 1), needed to resolve columns by name
const LOG_APPEND_RANGE = "A:O";
const LOG_WIDTH = "O";

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

// Rows logged before MealId existed (additive column, per this project's
// schema convention) have a blank cell — falling back to the row's own
// timestamp makes each of those a singleton meal of its own, exactly
// matching how they already behaved (and displayed) before this existed, no
// backfill required.
function toMealId(value: unknown, timestamp: string): string {
  const s = String(value ?? "").trim();
  return s !== "" ? s : timestamp;
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

/**
 * Builds a full log entry (including GL) from an item's per-100g nutrition
 * and a logged portion. `mealId` ties this item to whichever other items
 * were logged in the same sitting (see groupIntoMeals) — callers adding
 * several items to one meal should generate it once and reuse it across
 * every item in that meal, not per-item.
 */
export function buildLogEntry(
  mealType: MealType,
  itemName: string,
  portionGrams: number,
  per100g: IngredientNutrition,
  notes: string,
  mealId: string,
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
    mealId,
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

export interface MealGroup {
  mealId: string;
  mealType: MealType;
  timestamp: string; // earliest item's timestamp in the meal
  entries: DailyLogEntry[]; // chronological (oldest item first)
  totals: IngredientNutrition & { gl: number };
}

/**
 * Groups log entries into meal occasions by mealId (see DailyLogEntry) —
 * several items logged in one sitting become one group with summed totals,
 * instead of being treated as separate meals. Order within a group is
 * chronological; groups themselves are returned in whatever order `entries`
 * came in (callers sort as needed — Today wants chronological, "meals
 * before a reading" wants most-recent-first).
 */
export function groupIntoMeals(entries: DailyLogEntry[]): MealGroup[] {
  const byMealId = new Map<string, DailyLogEntry[]>();
  for (const entry of entries) {
    const bucket = byMealId.get(entry.mealId);
    if (bucket) bucket.push(entry);
    else byMealId.set(entry.mealId, [entry]);
  }

  return [...byMealId.values()].map((groupEntries) => {
    const sorted = [...groupEntries].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    const totals = sorted.reduce(
      (sum, e) => ({
        carbsG: round2(sum.carbsG + e.carbsG),
        gi: 0, // not meaningful summed across items — GL is the per-meal figure that matters
        fiberG: round2(sum.fiberG + e.fiberG),
        sugarsG: round2(sum.sugarsG + e.sugarsG),
        proteinG: round2(sum.proteinG + e.proteinG),
        fatG: round2(sum.fatG + e.fatG),
        caloriesKcal: round2(sum.caloriesKcal + e.caloriesKcal),
        sodiumMg: round2(sum.sodiumMg + e.sodiumMg),
        gl: round2(sum.gl + e.gl),
      }),
      { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 0, caloriesKcal: 0, sodiumMg: 0, gl: 0 },
    );
    return {
      mealId: sorted[0].mealId,
      mealType: sorted[0].mealType,
      timestamp: sorted[0].timestamp,
      entries: sorted,
      totals,
    };
  });
}

/**
 * Last `limit` meal occasions at or before a given ISO timestamp,
 * most-recent-first — powers the Blood Sugar screen's "meals before this
 * reading" review. Groups by meal first (see groupIntoMeals) so a 6-item
 * lunch counts as one meal, not six — otherwise a single big meal could
 * fill the whole list and hide everything eaten before it.
 */
export function mealsBeforeTimestamp(entries: DailyLogEntry[], timestamp: string, limit = 6): MealGroup[] {
  const priorEntries = entries.filter((e) => e.timestamp <= timestamp);
  return groupIntoMeals(priorEntries)
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

// MealId appended additively — see toMealId's fallback for rows logged
// before it existed.
export function rowToLogEntry(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): DailyLogEntry {
  const timestamp = String(cell(row, columnIndex, "Timestamp") ?? "");
  return {
    timestamp,
    mealType: toMealType(cell(row, columnIndex, "MealType")),
    itemName: String(cell(row, columnIndex, "ItemName") ?? ""),
    portionGrams: toNumber(cell(row, columnIndex, "PortionGrams")),
    carbsG: toNumber(cell(row, columnIndex, "Carbs_g")),
    gi: toNumber(cell(row, columnIndex, "GI")),
    fiberG: toNumber(cell(row, columnIndex, "Fiber_g")),
    sugarsG: toNumber(cell(row, columnIndex, "Sugars_g")),
    proteinG: toNumber(cell(row, columnIndex, "Protein_g")),
    fatG: toNumber(cell(row, columnIndex, "Fat_g")),
    caloriesKcal: toNumber(cell(row, columnIndex, "Calories_kcal")),
    sodiumMg: toNumber(cell(row, columnIndex, "Sodium_mg")),
    gl: toNumber(cell(row, columnIndex, "GL")),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
    mealId: toMealId(cell(row, columnIndex, "MealId"), timestamp),
  };
}

export function logEntryToRow(entry: DailyLogEntry, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(
    {
      Timestamp: entry.timestamp,
      MealType: entry.mealType,
      ItemName: entry.itemName,
      PortionGrams: entry.portionGrams,
      Carbs_g: entry.carbsG,
      GI: entry.gi,
      Fiber_g: entry.fiberG,
      Sugars_g: entry.sugarsG,
      Protein_g: entry.proteinG,
      Fat_g: entry.fatG,
      Calories_kcal: entry.caloriesKcal,
      Sodium_mg: entry.sodiumMg,
      GL: entry.gl,
      Notes: entry.notes,
      MealId: entry.mealId,
    },
    columnIndex,
  );
}

export async function listLogEntries(): Promise<DailyLogEntry[]> {
  const rows = await readRange("DailyLog", LOG_RANGE);
  const [header, ...dataRows] = rows;
  const columnIndex = header ? buildColumnIndex(header) : DEFAULT_COLUMN_INDEX;
  return dataRows.filter((row) => row.length > 0).map((row) => rowToLogEntry(row, columnIndex));
}

export async function addLogEntry(entry: DailyLogEntry): Promise<void> {
  const columnIndex = await readColumnIndex("DailyLog", LOG_WIDTH);
  await writeRange("DailyLog", LOG_APPEND_RANGE, [logEntryToRow(entry, columnIndex)]);
}
