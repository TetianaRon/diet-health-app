// Typed data-access layer over the Dishes tab (see docs/technical-spec.md ->
// "Google Sheets structure"). A Dish is anything requiring preparation —
// from a single cooked ingredient to a real multi-ingredient recipe —
// auto-computed from Ingredients per 100g of the finished product, never
// hand-typed. Counterpart to Ingredients being always-raw.
import { readRange, writeRange } from "./sheets";

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
  dishName: string;
  ingredients: DishIngredientRef[];
  yieldGrams: number;
  dateAdded: string;
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

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

export function rowToDish(row: unknown[]): Dish {
  return {
    dishName: String(row[0] ?? ""),
    ingredients: parseIngredientsJson(row[1]),
    yieldGrams: toNumber(row[2]),
    carbsG: toNumber(row[3]),
    gi: toNumber(row[4]),
    fiberG: toNumber(row[5]),
    sugarsG: toNumber(row[6]),
    proteinG: toNumber(row[7]),
    fatG: toNumber(row[8]),
    caloriesKcal: toNumber(row[9]),
    sodiumMg: toNumber(row[10]),
    dateAdded: String(row[11] ?? ""),
  };
}

export function dishToRow(dish: Dish): unknown[] {
  return [
    dish.dishName,
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
    dish.dateAdded,
  ];
}

export async function listDishes(): Promise<Dish[]> {
  const rows = await readRange("Dishes", "A2:L1000");
  return rows.filter((row) => row.length > 0).map(rowToDish);
}

export async function addDish(dish: Omit<Dish, "dateAdded">): Promise<void> {
  const withDate: Dish = { ...dish, dateAdded: new Date().toISOString().slice(0, 10) };
  await writeRange("Dishes", "A:L", [dishToRow(withDate)]);
}
