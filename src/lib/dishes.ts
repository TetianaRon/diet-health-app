// Typed data-access layer over the Dishes tab (see docs/technical-spec.md ->
// "Google Sheets structure"). A Dish is anything requiring preparation —
// from a single cooked ingredient to a real multi-ingredient recipe —
// auto-computed from Ingredients per 100g of the finished product, never
// hand-typed. Counterpart to Ingredients being always-raw.
//
// Schema is deliberately kept consistent with Ingredient: NameUk/NameEn
// first, Source/DateAdded last, same nutrient column names in between —
// only IngredientsJson/YieldGrams are Dish-specific, inserted in the middle.
import { batchUpdateRanges, readRange, writeRange } from "./sheets";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";

export type DishSource = "starter" | "manual";

export interface DishIngredientRef {
  nameUk: string;
  grams: number;
}

export interface IngredientNutrition {
  carbsG: number;
  gi: number;
  fiberG: number;
  sugarsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  sodiumMg: number;
}

export interface Dish extends IngredientNutrition {
  nameUk: string;
  nameEn: string;
  ingredients: DishIngredientRef[];
  yieldGrams: number;
  source: DishSource;
  dateAdded: string;
  glycemicFlag: GlycemicFlag;
  // Same meaning as Ingredient.giVerified — true only once a person has
  // explicitly confirmed this GI against a trusted source. Defaults false
  // even for starter dishes, since a computed carb-weighted average (see
  // computeDishNutrition) is never itself a confirmation.
  giVerified: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes a dish's per-100g nutrition from its raw ingredients and the
 * finished (cooked) yield weight. Cooking water dilutes nutrients — a dish
 * with a bigger yield than its raw ingredient weight has lower per-100g
 * values than the raw ingredient, which is the whole point of this model.
 *
 * GI is approximated as a carb-contribution-weighted average across
 * ingredients (true GI isn't simply additive, but no better data exists
 * without lab-testing the specific dish). For a single-ingredient dish this
 * reduces to that ingredient's own GI.
 *
 * `lookupIngredient` returning null for a referenced name (not found) skips
 * that ingredient's contribution — callers should validate all references
 * resolve before treating the result as final.
 */
export function computeDishNutrition(
  ingredients: DishIngredientRef[],
  yieldGrams: number,
  lookupIngredient: (nameUk: string) => IngredientNutrition | null,
): IngredientNutrition {
  let totalCarbs = 0;
  let totalFiber = 0;
  let totalSugars = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCalories = 0;
  let totalSodium = 0;
  let giWeightedSum = 0;
  let giWeightBase = 0;

  for (const ref of ingredients) {
    const nutrition = lookupIngredient(ref.nameUk);
    if (!nutrition) continue;

    const factor = ref.grams / 100;
    const carbsContribution = nutrition.carbsG * factor;

    totalCarbs += carbsContribution;
    totalFiber += nutrition.fiberG * factor;
    totalSugars += nutrition.sugarsG * factor;
    totalProtein += nutrition.proteinG * factor;
    totalFat += nutrition.fatG * factor;
    totalCalories += nutrition.caloriesKcal * factor;
    totalSodium += nutrition.sodiumMg * factor;

    giWeightedSum += carbsContribution * nutrition.gi;
    giWeightBase += carbsContribution;
  }

  const scale = yieldGrams > 0 ? 100 / yieldGrams : 0;

  return {
    carbsG: round2(totalCarbs * scale),
    fiberG: round2(totalFiber * scale),
    sugarsG: round2(totalSugars * scale),
    proteinG: round2(totalProtein * scale),
    fatG: round2(totalFat * scale),
    caloriesKcal: round2(totalCalories * scale),
    sodiumMg: round2(totalSodium * scale),
    gi: giWeightBase > 0 ? Math.round(giWeightedSum / giWeightBase) : 0,
  };
}

/**
 * Derived, non-persisted hint: does this dish contain an ingredient
 * currently flagged watch/avoid? Computed live from the dish's stored
 * ingredient references cross-referenced against current ingredient flags —
 * never overrides the dish's own explicit `glycemicFlag`, since other
 * ingredients can compensate for one flagged one, or the dish's own
 * combination/cooking method can be the actual problem even when every
 * ingredient is individually fine.
 */
export function dishContainsFlaggedIngredient(
  dish: Dish,
  lookupIngredientFlag: (nameUk: string) => GlycemicFlag | null,
): boolean {
  return dish.ingredients.some((ref) => {
    const flag = lookupIngredientFlag(ref.nameUk);
    return flag === "watch" || flag === "avoid";
  });
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

function toDishSource(value: unknown): DishSource {
  return value === "starter" ? "starter" : "manual";
}

function parseIngredientsJson(value: unknown): DishIngredientRef[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { name: string; grams: number } => typeof item?.name === "string")
      .map((item) => ({ nameUk: item.name, grams: toNumber(item.grams) }));
  } catch {
    return [];
  }
}

// Column order: NameUk, NameEn, IngredientsJson, YieldGrams, Carbs_g, GI,
// Fiber_g, Sugars_g, Protein_g, Fat_g, Calories_kcal, Sodium_mg, Source,
// DateAdded, GlycemicFlag, GiVerified (A-P) — see docs/technical-spec.md "Dishes".
export function rowToDish(row: unknown[]): Dish {
  return {
    nameUk: String(row[0] ?? ""),
    nameEn: String(row[1] ?? ""),
    ingredients: parseIngredientsJson(row[2]),
    yieldGrams: toNumber(row[3]),
    carbsG: toNumber(row[4]),
    gi: toNumber(row[5]),
    fiberG: toNumber(row[6]),
    sugarsG: toNumber(row[7]),
    proteinG: toNumber(row[8]),
    fatG: toNumber(row[9]),
    caloriesKcal: toNumber(row[10]),
    sodiumMg: toNumber(row[11]),
    source: toDishSource(row[12]),
    dateAdded: String(row[13] ?? ""),
    glycemicFlag: toGlycemicFlag(row[14]),
    giVerified: toBoolean(row[15]),
  };
}

export function dishToRow(dish: Dish): unknown[] {
  return [
    dish.nameUk,
    dish.nameEn,
    JSON.stringify(dish.ingredients.map((i) => ({ name: i.nameUk, grams: i.grams }))),
    dish.yieldGrams,
    dish.carbsG,
    dish.gi,
    dish.fiberG,
    dish.sugarsG,
    dish.proteinG,
    dish.fatG,
    dish.caloriesKcal,
    dish.sodiumMg,
    dish.source,
    dish.dateAdded,
    dish.glycemicFlag,
    dish.giVerified,
  ];
}

export async function listDishes(): Promise<Dish[]> {
  const rows = await readRange("Dishes", "A2:P1000");
  return rows.filter((row) => row.length > 0).map(rowToDish);
}

export async function addDish(
  dish: Omit<Dish, "dateAdded" | "glycemicFlag">,
  glycemicFlag: GlycemicFlag = "none",
): Promise<void> {
  const withDate: Dish = { ...dish, dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag };
  await writeRange("Dishes", "A:P", [dishToRow(withDate)]);
}

async function findDishRowNumber(nameUk: string): Promise<number> {
  const rows = await readRange("Dishes", "A2:P1000");
  const rowIndex = rows.findIndex((row) => String(row[0] ?? "").trim().toLowerCase() === nameUk.trim().toLowerCase());
  if (rowIndex === -1) {
    throw new Error(`"${nameUk}" not found in Dishes`);
  }
  return rowIndex + 2; // +2: 1-based rows, plus the header row
}

/** Sets the GlycemicFlag column for an existing Dishes row, found by exact nameUk match. */
export async function setDishGlycemicFlag(nameUk: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const rowNumber = await findDishRowNumber(nameUk);
  await batchUpdateRanges([{ range: `Dishes!O${rowNumber}`, values: [[glycemicFlag]] }]);
}

/**
 * Overwrites an existing Dishes row in place, found by its *current* nameUk
 * (i.e. before any rename in `dish`) — the edit flow's counterpart to
 * addDish's always-append behavior. Same principle as updateIngredient.
 */
export async function updateDish(currentNameUk: string, dish: Dish): Promise<void> {
  const rowNumber = await findDishRowNumber(currentNameUk);
  await batchUpdateRanges([{ range: `Dishes!A${rowNumber}:P${rowNumber}`, values: [dishToRow(dish)] }]);
}
