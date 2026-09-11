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
import { buildColumnIndex, buildRow, cell, columnLetter, readColumnIndex, type ColumnIndex } from "./sheetRow";
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

// Canonical column order — what a brand-new sheet gets initialized with (see
// spreadsheetInit.ts, which imports this) and the default columnIndex used
// below when none is given (tests, or before a live sheet's own header row
// has been read). A real sheet's actual current order always wins over this
// default once read — see readDishesSheet/readColumnIndex below. Rows are
// read/written by column HEADER NAME, not fixed position (see sheetRow.ts),
// so a reordered sheet still parses correctly.
export const DISHES_HEADERS = [
  "NameUk",
  "NameEn",
  "IngredientsJson",
  "YieldGrams",
  "Carbs_g",
  "GI",
  "Fiber_g",
  "Sugars_g",
  "Protein_g",
  "Fat_g",
  "Calories_kcal",
  "Sodium_mg",
  "Source",
  "DateAdded",
  "GlycemicFlag",
  "GiVerified",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(DISHES_HEADERS);

const DISHES_RANGE = "A1:P1000"; // includes the header row (row 1), needed to resolve columns by name
const DISHES_APPEND_RANGE = "A:P";
const DISHES_WIDTH = "P";

export function rowToDish(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): Dish {
  return {
    nameUk: String(cell(row, columnIndex, "NameUk") ?? ""),
    nameEn: String(cell(row, columnIndex, "NameEn") ?? ""),
    ingredients: parseIngredientsJson(cell(row, columnIndex, "IngredientsJson")),
    yieldGrams: toNumber(cell(row, columnIndex, "YieldGrams")),
    carbsG: toNumber(cell(row, columnIndex, "Carbs_g")),
    gi: toNumber(cell(row, columnIndex, "GI")),
    fiberG: toNumber(cell(row, columnIndex, "Fiber_g")),
    sugarsG: toNumber(cell(row, columnIndex, "Sugars_g")),
    proteinG: toNumber(cell(row, columnIndex, "Protein_g")),
    fatG: toNumber(cell(row, columnIndex, "Fat_g")),
    caloriesKcal: toNumber(cell(row, columnIndex, "Calories_kcal")),
    sodiumMg: toNumber(cell(row, columnIndex, "Sodium_mg")),
    source: toDishSource(cell(row, columnIndex, "Source")),
    dateAdded: String(cell(row, columnIndex, "DateAdded") ?? ""),
    glycemicFlag: toGlycemicFlag(cell(row, columnIndex, "GlycemicFlag")),
    giVerified: toBoolean(cell(row, columnIndex, "GiVerified")),
  };
}

export function dishToRow(dish: Dish, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(
    {
      NameUk: dish.nameUk,
      NameEn: dish.nameEn,
      IngredientsJson: JSON.stringify(dish.ingredients.map((i) => ({ name: i.nameUk, grams: i.grams }))),
      YieldGrams: dish.yieldGrams,
      Carbs_g: dish.carbsG,
      GI: dish.gi,
      Fiber_g: dish.fiberG,
      Sugars_g: dish.sugarsG,
      Protein_g: dish.proteinG,
      Fat_g: dish.fatG,
      Calories_kcal: dish.caloriesKcal,
      Sodium_mg: dish.sodiumMg,
      Source: dish.source,
      DateAdded: dish.dateAdded,
      GlycemicFlag: dish.glycemicFlag,
      GiVerified: dish.giVerified,
    },
    columnIndex,
  );
}

async function readDishesSheet(): Promise<{ columnIndex: ColumnIndex; dataRows: unknown[][] }> {
  const rows = await readRange("Dishes", DISHES_RANGE);
  const [header, ...dataRows] = rows;
  return { columnIndex: header ? buildColumnIndex(header) : DEFAULT_COLUMN_INDEX, dataRows };
}

export async function listDishes(): Promise<Dish[]> {
  const { columnIndex, dataRows } = await readDishesSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToDish(row, columnIndex));
}

export async function addDish(
  dish: Omit<Dish, "dateAdded" | "glycemicFlag">,
  glycemicFlag: GlycemicFlag = "none",
): Promise<void> {
  const withDate: Dish = { ...dish, dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag };
  const columnIndex = await readColumnIndex("Dishes", DISHES_WIDTH);
  await writeRange("Dishes", DISHES_APPEND_RANGE, [dishToRow(withDate, columnIndex)]);
}

async function findDishRow(nameUk: string): Promise<{ rowNumber: number; columnIndex: ColumnIndex }> {
  const { columnIndex, dataRows } = await readDishesSheet();
  const rowIndex = dataRows.findIndex(
    (row) => String(cell(row, columnIndex, "NameUk") ?? "").trim().toLowerCase() === nameUk.trim().toLowerCase(),
  );
  if (rowIndex === -1) {
    throw new Error(`"${nameUk}" not found in Dishes`);
  }
  return { rowNumber: rowIndex + 2, columnIndex }; // +2: 1-based rows, plus the header row
}

/** Sets the GlycemicFlag column for an existing Dishes row, found by exact nameUk match. */
export async function setDishGlycemicFlag(nameUk: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const { rowNumber, columnIndex } = await findDishRow(nameUk);
  const col = columnIndex.get("GlycemicFlag");
  if (col === undefined) throw new Error('Dishes sheet has no "GlycemicFlag" column');
  await batchUpdateRanges([{ range: `Dishes!${columnLetter(col)}${rowNumber}`, values: [[glycemicFlag]] }]);
}

/**
 * Overwrites an existing Dishes row in place, found by its *current* nameUk
 * (i.e. before any rename in `dish`) — the edit flow's counterpart to
 * addDish's always-append behavior. Same principle as updateIngredient.
 */
export async function updateDish(currentNameUk: string, dish: Dish): Promise<void> {
  const { rowNumber, columnIndex } = await findDishRow(currentNameUk);
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  await batchUpdateRanges([{ range: `Dishes!A${rowNumber}:${lastCol}${rowNumber}`, values: [dishToRow(dish, columnIndex)] }]);
}
