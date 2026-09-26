// Typed data-access layer over the DailyLog tab (see docs/technical-spec.md
// -> "Google Sheets structure"). Each row is one logged meal item — an
// Ingredient or Dish portion, scaled from its per-100g values at log time
// (a later edit to the Ingredients/Dishes bundle shouldn't retroactively
// change what was actually eaten) — or a custom/estimated entry (restaurant
// food, etc.) with some values entered directly and possibly left unknown.
import { batchUpdateRanges, readRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex, type ParsedTab } from "./sheetRow";
import { calcGlycemicLoad } from "./health";
import type { IngredientNutrition, NutritionKey } from "./dishes";

export const MEAL_TYPES = ["Сніданок", "Обід", "Вечеря", "Перекус"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

// The nutrition fields a custom entry can individually mark "unknown" — the
// 7 IngredientNutrition fields (GI included) plus the derived GL, which is
// treated as unknown whenever GI or Carbs_g is (see buildCustomLogEntry) —
// a glycemic load can't be meaningfully computed without both.
export type NutritionField = keyof IngredientNutrition | "gl";

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
  // Which of this entry's own numeric fields are estimates the person
  // explicitly didn't know, rather than a real (even if zero) value — set
  // by buildCustomLogEntry for a custom/restaurant entry, or inherited by
  // buildLogEntry from a database item that itself has unknown values
  // (Ingredient/Dish.unknownFields). The field itself still stores 0
  // for an unknown value (writable to Sheets, safe default), but totals
  // computations (sumKnownField, groupIntoMeals) exclude it from sums
  // rather than silently letting it read as "definitely zero" — see the
  // 2026-09-11 build-log entry for why a wrong number here would be worse
  // than an honestly-flagged gap.
  unknownFields: NutritionField[];
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
  "UnknownFields",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(DAILY_LOG_HEADERS);

const LOG_RANGE = `A1:${SCAN_LAST_COLUMN}5000`; // includes the header row (row 1), needed to resolve columns by name

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

const NUTRITION_FIELD_SET: ReadonlySet<string> = new Set<NutritionField>([
  "carbsG",
  "gi",
  "fiberG",
  "sugarsG",
  "proteinG",
  "fatG",
  "caloriesKcal",
  "sodiumMg",
  "gl",
]);

/** Parses the UnknownFields cell (comma-separated field names) back into a typed list, dropping anything unrecognized. */
function toUnknownFields(value: unknown): NutritionField[] {
  const raw = String(value ?? "").trim();
  if (raw === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is NutritionField => NUTRITION_FIELD_SET.has(s));
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
 * and a logged portion. `itemUnknownFields` are the picked Ingredient/Dish's
 * own unknown fields (see Ingredient.unknownFields) — carried into the entry
 * so its totals exclude them rather than reading the stored 0 as real; GL is
 * additionally unknown whenever GI or carbs is, same rule as a custom entry.
 * `mealId` ties this item to whichever other items were logged in the same sitting (see groupIntoMeals) — callers adding
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
  itemUnknownFields: NutritionKey[] = [],
): DailyLogEntry {
  const portion = computePortionNutrition(per100g, portionGrams);
  const unknownFields: NutritionField[] = [...itemUnknownFields];
  const glUnknown = itemUnknownFields.includes("gi") || itemUnknownFields.includes("carbsG");
  if (glUnknown) unknownFields.push("gl");
  return {
    timestamp,
    mealType,
    itemName,
    portionGrams,
    ...portion,
    gl: glUnknown ? 0 : round2(calcGlycemicLoad(portion.gi, portion.carbsG)),
    notes,
    mealId,
    unknownFields,
  };
}

/**
 * Builds a custom/estimated log entry — restaurant food, a homemade dish
 * with no exact recipe, etc. Unlike buildLogEntry, `values` are the actual
 * totals as eaten, not a per-100g figure scaled by portion (there's no
 * database row to scale from). Any of the 8 IngredientNutrition fields left
 * out of `values` is treated as unknown: stored as 0 (a safe, writable
 * default) but listed in the returned entry's `unknownFields`, so totals
 * computed from it (sumKnownField, groupIntoMeals) exclude it rather than
 * letting a real gap read as "definitely zero." GL is additionally marked
 * unknown whenever GI or carbs is, since it can't be meaningfully computed
 * without both — callers never set "gl" in `values` directly.
 */
export function buildCustomLogEntry(
  mealType: MealType,
  itemName: string,
  portionGrams: number,
  values: Partial<IngredientNutrition>,
  notes: string,
  mealId: string,
  timestamp: string = new Date().toISOString(),
): DailyLogEntry {
  const fields: (keyof IngredientNutrition)[] = [
    "carbsG",
    "gi",
    "fiberG",
    "sugarsG",
    "proteinG",
    "fatG",
    "caloriesKcal",
    "sodiumMg",
  ];
  const unknownFields: NutritionField[] = [];
  const portion = {} as IngredientNutrition;
  for (const field of fields) {
    const value = values[field];
    if (value === undefined) {
      unknownFields.push(field);
      portion[field] = 0;
    } else {
      portion[field] = value;
    }
  }

  const glUnknown = unknownFields.includes("gi") || unknownFields.includes("carbsG");
  if (glUnknown) unknownFields.push("gl");

  return {
    timestamp,
    mealType,
    itemName,
    portionGrams,
    ...portion,
    gl: glUnknown ? 0 : round2(calcGlycemicLoad(portion.gi, portion.carbsG)),
    notes,
    mealId,
    unknownFields,
  };
}

/**
 * Sums one nutrition field across entries, skipping any entry where that
 * specific field is unknown (see DailyLogEntry.unknownFields) rather than
 * letting its stored-as-0 value silently understate the total. Returns how
 * many entries were skipped too, so callers can show a caveat.
 */
export function sumKnownField(entries: DailyLogEntry[], field: NutritionField): { total: number; unknownCount: number } {
  let total = 0;
  let unknownCount = 0;
  for (const entry of entries) {
    if (entry.unknownFields.includes(field)) {
      unknownCount++;
      continue;
    }
    total += entry[field];
  }
  return { total: round2(total), unknownCount };
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
  // Sum of the items' portions — the portion is always a real, known number
  // (unlike the nutrition fields), so this needs no unknown-handling.
  totalGrams: number;
  // True if any item in this meal has an unknown field — a UI caveat hook,
  // not per-field detail (see sumKnownField for the actual per-field
  // exclusion that keeps `totals` correct regardless of this flag).
  hasUnknownValues: boolean;
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
    const totals = {
      carbsG: sumKnownField(sorted, "carbsG").total,
      gi: 0, // not meaningful summed across items — GL is the per-meal figure that matters
      fiberG: sumKnownField(sorted, "fiberG").total,
      sugarsG: sumKnownField(sorted, "sugarsG").total,
      proteinG: sumKnownField(sorted, "proteinG").total,
      fatG: sumKnownField(sorted, "fatG").total,
      caloriesKcal: sumKnownField(sorted, "caloriesKcal").total,
      sodiumMg: sumKnownField(sorted, "sodiumMg").total,
      gl: sumKnownField(sorted, "gl").total,
    };
    return {
      mealId: sorted[0].mealId,
      mealType: sorted[0].mealType,
      timestamp: sorted[0].timestamp,
      entries: sorted,
      totals,
      totalGrams: round2(sorted.reduce((sum, e) => sum + e.portionGrams, 0)),
      hasUnknownValues: sorted.some((e) => e.unknownFields.length > 0),
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
 * most-recent-first. Not used by the app at the moment: Today's "last 3
 * days" list was removed on 2026-09-20 — kept (and tested) for the planned
 * History screen.
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

// MealId/UnknownFields appended additively — see toMealId's fallback for
// rows logged before MealId existed; a blank UnknownFields cell parses to
// an empty array, same treatment.
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
    unknownFields: toUnknownFields(cell(row, columnIndex, "UnknownFields")),
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
      UnknownFields: entry.unknownFields.join(","),
    },
    columnIndex,
  );
}

async function readLogSheet(): Promise<ParsedTab> {
  return parseTab("DailyLog", await readRange("DailyLog", LOG_RANGE), DAILY_LOG_HEADERS);
}

export async function listLogEntries(): Promise<DailyLogEntry[]> {
  const { columnIndex, dataRows } = await readLogSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToLogEntry(row, columnIndex));
}

// --- Whole-meal save/delete (the meal editor) ---
//
// The meal editor works on a whole meal at a time (add dishes, edit dishes,
// remove dishes, change type/time) and applies everything on Save, so this
// computes ONE batch of row writes from "what the meal was" vs "what it is
// now" instead of a request per dish:
//   - a draft dish that came from an existing row overwrites that row in place;
//   - an existing row no dish claims any more is blanked — a blank row reads
//     as never there, since every listX() filters `row.length > 0`, and it's
//     simpler and safer than shifting the rows below it up;
//   - a brand-new dish takes a freed row first, else goes after the last row.
// All of it is a single values:batchUpdate, so a failure can't leave the meal
// half-saved (an append + separate update would).

export interface MealDraftItem {
  entry: DailyLogEntry;
  /** The saved row this dish came from, exactly as it was loaded — null for a dish added in this session. */
  original: DailyLogEntry | null;
}

function sameLogRow(a: DailyLogEntry, b: DailyLogEntry): boolean {
  return a.timestamp === b.timestamp && a.itemName === b.itemName && a.mealId === b.mealId;
}

/**
 * Pure planner behind saveMeal — see the block comment above. `dataRows` are
 * the sheet's data rows in order, dataRows[0] being sheet row `firstDataRow`
 * (3 when row 2 holds readable column names, 2 on a sheet not yet upgraded). Throws if an original can't be found (changed on another
 * device since it was loaded) rather than guessing at a different row.
 */
export function planMealSave(
  originals: DailyLogEntry[],
  drafts: MealDraftItem[],
  dataRows: unknown[][],
  columnIndex: ColumnIndex,
  firstDataRow = 2,
): { range: string; values: unknown[][] }[] {
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  const width = Math.max(...columnIndex.values()) + 1;
  const rangeFor = (rowNumber: number) => `DailyLog!A${rowNumber}:${lastCol}${rowNumber}`;

  const claimed = new Set<number>();
  const rowNumberFor = new Map<DailyLogEntry, number>();
  for (const original of originals) {
    const rowIndex = dataRows.findIndex(
      (row, i) => !claimed.has(i) && sameLogRow(rowToLogEntry(row, columnIndex), original),
    );
    if (rowIndex === -1) throw new Error(`Log entry "${original.itemName}" at ${original.timestamp} not found`);
    claimed.add(rowIndex);
    rowNumberFor.set(original, rowIndex + firstDataRow);
  }

  const updates: { range: string; values: unknown[][] }[] = [];
  const keptOriginals = new Set(drafts.map((d) => d.original).filter((o): o is DailyLogEntry => o !== null));
  const freedRows: number[] = [];
  for (const original of originals) {
    if (!keptOriginals.has(original)) {
      const rowNumber = rowNumberFor.get(original)!;
      freedRows.push(rowNumber);
    }
  }

  let nextFreshRow = dataRows.length + firstDataRow;
  for (const draft of drafts) {
    const row = logEntryToRow(draft.entry, columnIndex);
    if (draft.original) {
      updates.push({ range: rangeFor(rowNumberFor.get(draft.original)!), values: [row] });
    } else {
      const rowNumber = freedRows.shift() ?? nextFreshRow++;
      updates.push({ range: rangeFor(rowNumber), values: [row] });
    }
  }
  for (const rowNumber of freedRows) {
    updates.push({ range: rangeFor(rowNumber), values: [new Array(width).fill("")] });
  }
  return updates;
}

/** Saves a whole meal in one batch — see planMealSave. `originals` is empty for a brand-new meal. */
export async function saveMeal(originals: DailyLogEntry[], drafts: MealDraftItem[]): Promise<void> {
  const { columnIndex, dataRows, firstDataRow } = await readLogSheet();
  const updates = planMealSave(originals, drafts, dataRows, columnIndex, firstDataRow);
  if (updates.length > 0) await batchUpdateRanges(updates);
}

/** Deletes every row of a meal in one batch. Irreversible; callers must confirm with the user first. */
export async function deleteMeal(originals: DailyLogEntry[]): Promise<void> {
  await saveMeal(originals, []);
}
