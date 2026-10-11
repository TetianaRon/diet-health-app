// A custom meal entry (release 2.3.2, roadmap → "Meal entry, one editor"):
// food that isn't in her list — a restaurant sandwich, a café hot chocolate.
// It follows the same conventions as her own items:
//   • values for the whole portion, per 100 g or per 100 ml («Значення на»);
//   • the amount in г, мл and/or шт. — optional for a whole portion (a cup of
//     hot chocolate needn't be weighed), required in the values' unit otherwise.
// Recent custom entries (the last 14 days of her meal rows) come back in the
// meal search, and either can be saved to «мої продукти» keeping its basis.
import { calcGlycemicLoad } from "./health";
import { normalizeItemName } from "./itemIds";
import type { DailyLogEntry, MealType } from "./dailyLog";
import type { IngredientNutrition, NutritionKey } from "./dishes";
import type { Measure } from "./measure";
import { addIngredient, type Ingredient } from "./ingredients";

/** The size a saved whole-portion entry is logged by («1 порція»). */
export const PORTION_LABEL = "порція";

export type CustomBasis = "portion" | "100g" | "100ml";
export type CustomField = "name" | "grams" | "ml" | "pieces" | "values" | NutritionKey;

export const NUTRITION_FIELDS: readonly NutritionKey[] = ["caloriesKcal", "carbsG", "fatG", "proteinG", "fiberG", "sugarsG", "sodiumMg", "gi"];

export interface CustomInput {
  name: string;
  basis: CustomBasis;
  /** Already parsed: null when the field is empty, NaN when it isn't a number. */
  grams: number | null;
  ml: number | null;
  pieces: number | null;
  /** Per the basis; null = unknown (left empty), NaN = not a number. */
  values: Record<NutritionKey, number | null>;
}

/** Each field that stops saving, with why (shown next to that field). */
export type CustomProblems = Partial<Record<CustomField, "missing" | "notNumber" | "needOneValue" | "needAmount">>;

export function checkCustom(input: CustomInput): CustomProblems {
  const problems: CustomProblems = {};
  if (!input.name.trim()) problems.name = "missing";
  for (const field of ["grams", "ml", "pieces"] as const) {
    const v = input[field];
    if (v !== null && !(Number.isFinite(v) && v > 0)) problems[field] = "notNumber";
  }
  if (input.basis === "100g" && input.grams === null) problems.grams = "needAmount";
  if (input.basis === "100ml" && input.ml === null) problems.ml = "needAmount";
  let known = 0;
  for (const field of NUTRITION_FIELDS) {
    const v = input.values[field];
    if (v === null) continue;
    if (!Number.isFinite(v) || v < 0) problems[field] = "notNumber";
    else known++;
  }
  if (known === 0 && !NUTRITION_FIELDS.some((f) => problems[f])) problems.values = "needOneValue";
  return problems;
}

/** The meal row for a checked custom entry: the values for what was eaten. */
export function customLogEntry(input: CustomInput, mealType: MealType, notes: string, mealId: string, timestamp: string): DailyLogEntry {
  const factor = input.basis === "100g" ? (input.grams ?? 0) / 100 : input.basis === "100ml" ? (input.ml ?? 0) / 100 : 1;
  const portion = {} as IngredientNutrition;
  const unknownFields: string[] = [];
  for (const field of NUTRITION_FIELDS) {
    const v = input.values[field];
    if (v === null) {
      unknownFields.push(field);
      portion[field] = 0;
    } else {
      portion[field] = field === "gi" ? v : Math.round(v * factor * 100) / 100;
    }
  }
  const glUnknown = unknownFields.includes("gi") || unknownFields.includes("carbsG");
  if (glUnknown) unknownFields.push("gl");
  if (input.grams === null) unknownFields.push("portionGrams");
  return {
    timestamp,
    mealType,
    itemId: "",
    itemName: input.name.trim(),
    portionGrams: input.grams ?? 0,
    portionPieces: input.pieces,
    portionMl: input.ml,
    portionSize: "",
    ...portion,
    gl: glUnknown ? 0 : Math.round(calcGlycemicLoad(portion.gi, portion.carbsG) * 100) / 100,
    notes,
    mealId,
    unknownFields: unknownFields as DailyLogEntry["unknownFields"],
  };
}

export const RECENT_DAYS = 14;
export const RECENT_PREFIX = "recent:";

/** A recent custom entry as a pickable food: the values of the portion she logged, as 1 «порція». */
export interface RecentFood {
  id: string;
  nameUk: string;
  values: IngredientNutrition;
  unknownFields: NutritionKey[];
  measure: Measure;
  /** When she last logged it. */
  at: string;
}

/**
 * Her custom entries from the last 14 days, newest first, once per name — not
 * the ones whose name is now one of her items. Each is 1 «порція» with that
 * portion's values; its weight and volume, when she gave them, still link g and ml.
 */
export function recentCustomFoods(entries: readonly DailyLogEntry[], ownNames: readonly string[], now: Date, days = RECENT_DAYS): RecentFood[] {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;
  const own = new Set(ownNames.map(normalizeItemName));
  const seen = new Set<string>();
  const sorted = [...entries].filter((e) => !e.itemId && new Date(e.timestamp).getTime() >= since).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const out: RecentFood[] = [];
  for (const e of sorted) {
    const key = normalizeItemName(e.itemName);
    if (!key || seen.has(key) || own.has(key)) continue;
    seen.add(key);
    const grams = e.unknownFields.includes("portionGrams") || !(e.portionGrams > 0) ? null : e.portionGrams;
    const ml = e.portionMl && e.portionMl > 0 ? e.portionMl : null;
    out.push({
      id: RECENT_PREFIX + key,
      nameUk: e.itemName,
      values: { carbsG: e.carbsG, gi: e.gi, fiberG: e.fiberG, sugarsG: e.sugarsG, proteinG: e.proteinG, fatG: e.fatG, caloriesKcal: e.caloriesKcal, sodiumMg: e.sodiumMg },
      unknownFields: NUTRITION_FIELDS.filter((f) => e.unknownFields.includes(f)),
      measure: {
        basis: "piece",
        valuesPer: null,
        weighedPieces: grams ? 1 : null,
        weighedGrams: grams,
        densityMl: grams && ml ? ml : null,
        densityGrams: grams && ml ? grams : null,
      },
      at: e.timestamp,
    });
  }
  return out;
}

export function isRecentId(id: string): boolean {
  return id.startsWith(RECENT_PREFIX);
}

/**
 * Saves a custom entry to her «Продукти», keeping its basis (developer,
 * 2026-10-10): values for a whole portion → an item per portion (labelled
 * страва, «порція» as its size, with the portion's weight when known); per
 * 100 g or 100 ml → a product per 100 g or 100 ml. A weight and a volume
 * given together link g and ml.
 */
export async function saveCustomAsItem(input: CustomInput): Promise<Ingredient> {
  const unknownFields = NUTRITION_FIELDS.filter((f) => input.values[f] === null);
  const value = (f: NutritionKey) => input.values[f] ?? 0;
  const grams = input.grams && input.grams > 0 ? input.grams : null;
  const ml = input.ml && input.ml > 0 ? input.ml : null;
  const density = grams && ml ? { densityMl: ml, densityGrams: grams } : { densityMl: null, densityGrams: null };
  const portion = input.basis === "portion";
  return addIngredient({
    nameUk: input.name.trim(),
    nameEn: "",
    carbsG: value("carbsG"),
    gi: value("gi"),
    fiberG: value("fiberG"),
    sugarsG: value("sugarsG"),
    proteinG: value("proteinG"),
    fatG: value("fatG"),
    caloriesKcal: value("caloriesKcal"),
    sodiumMg: value("sodiumMg"),
    unknownFields,
    source: "manual",
    giVerified: false,
    basis: input.basis === "portion" ? "piece" : input.basis,
    weighedPieces: portion && grams ? 1 : null,
    weighedGrams: portion && grams ? grams : null,
    ...density,
    portionSizes: portion ? [{ label: PORTION_LABEL, pieces: 1 }] : [],
    labels: portion ? ["dish"] : [],
  });
}

/** A recent entry, or a logged custom row, as the input it was: its values for one whole portion. */
export function portionInput(name: string, values: IngredientNutrition, unknownFields: readonly string[], grams: number | null, ml: number | null): CustomInput {
  return {
    name,
    basis: "portion",
    grams,
    ml,
    pieces: null,
    values: Object.fromEntries(NUTRITION_FIELDS.map((f) => [f, unknownFields.includes(f) ? null : values[f]])) as Record<NutritionKey, number | null>,
  };
}
