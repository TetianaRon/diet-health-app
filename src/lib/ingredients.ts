// Typed data-access layer over the Ingredients tab (see docs/technical-spec.md
// -> "Google Sheets structure" for the column order this maps to).
import { batchUpdateRanges, readRange, writeRange } from "./sheets";
import { STARTER_FOODS } from "../data/starter-foods";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";

export type IngredientSource = "starter" | "usda" | "manual";

export interface Ingredient {
  nameUk: string;
  nameEn: string;
  carbsG: number;
  gi: number;
  fiberG: number;
  sugarsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  sodiumMg: number;
  source: IngredientSource;
  dateAdded: string;
  favorite: boolean;
  glycemicFlag: GlycemicFlag;
}

const INGREDIENTS_RANGE = "A2:N1000"; // header row is A1:N1
const INGREDIENTS_APPEND_RANGE = "A:N";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toSource(value: unknown): IngredientSource {
  return value === "starter" || value === "usda" || value === "manual" ? value : "manual";
}

function toBoolean(value: unknown): boolean {
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

/** Maps a raw Sheets row (as returned by readRange) to a typed Ingredient. */
export function rowToIngredient(row: unknown[]): Ingredient {
  return {
    nameUk: String(row[0] ?? ""),
    nameEn: String(row[1] ?? ""),
    carbsG: toNumber(row[2]),
    gi: toNumber(row[3]),
    fiberG: toNumber(row[4]),
    sugarsG: toNumber(row[5]),
    proteinG: toNumber(row[6]),
    fatG: toNumber(row[7]),
    caloriesKcal: toNumber(row[8]),
    sodiumMg: toNumber(row[9]),
    source: toSource(row[10]),
    dateAdded: String(row[11] ?? ""),
    favorite: toBoolean(row[12]),
    glycemicFlag: toGlycemicFlag(row[13]),
  };
}

/** Maps a typed Ingredient back to a raw Sheets row, in column order. */
export function ingredientToRow(ingredient: Ingredient): unknown[] {
  return [
    ingredient.nameUk,
    ingredient.nameEn,
    ingredient.carbsG,
    ingredient.gi,
    ingredient.fiberG,
    ingredient.sugarsG,
    ingredient.proteinG,
    ingredient.fatG,
    ingredient.caloriesKcal,
    ingredient.sodiumMg,
    ingredient.source,
    ingredient.dateAdded,
    ingredient.favorite,
    ingredient.glycemicFlag,
  ];
}

/** Stable sort, favorites first — used wherever ingredients are browsed or picked from. */
export function sortFavoritesFirst<T extends { favorite: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

function starterFoodToIngredient(food: (typeof STARTER_FOODS)[number]): Ingredient {
  return { ...food, source: "starter", dateAdded: "", favorite: false, glycemicFlag: "none" };
}

/**
 * Merges the bundled starter foods with the personal Ingredients sheet, so
 * the whole bundle is browsable/pickable (main list, dish composition, meal
 * logging) without first requiring each one to be individually saved —
 * "saving" an ingredient is only needed to customize its values, add
 * something outside the bundle, or mark it favorite (which does save it,
 * see setIngredientFavorite). Sheet rows take precedence over the bundle
 * default for the same name, since they may hold edits or a favorite flag.
 * A bundle entry not (yet) in the sheet has dateAdded: "" — a signal, not
 * a schema field of its own, that it isn't a real saved row.
 */
export function mergeWithStarterFoods(sheetIngredients: Ingredient[]): Ingredient[] {
  const byKey = new Map<string, Ingredient>();
  for (const food of STARTER_FOODS) {
    byKey.set(food.nameUk.trim().toLowerCase(), starterFoodToIngredient(food));
  }
  for (const ingredient of sheetIngredients) {
    byKey.set(ingredient.nameUk.trim().toLowerCase(), ingredient);
  }
  return [...byKey.values()];
}

export async function listIngredients(): Promise<Ingredient[]> {
  const rows = await readRange("Ingredients", INGREDIENTS_RANGE);
  return rows.filter((row) => row.length > 0).map(rowToIngredient);
}

export async function addIngredient(
  ingredient: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag">,
  favorite = false,
  glycemicFlag: GlycemicFlag = "none",
): Promise<void> {
  const withDate: Ingredient = {
    ...ingredient,
    dateAdded: new Date().toISOString().slice(0, 10),
    favorite,
    glycemicFlag,
  };
  await writeRange("Ingredients", INGREDIENTS_APPEND_RANGE, [ingredientToRow(withDate)]);
}

async function findIngredientRowNumber(nameUk: string): Promise<number> {
  const rows = await readRange("Ingredients", INGREDIENTS_RANGE);
  const rowIndex = rows.findIndex((row) => String(row[0] ?? "").trim().toLowerCase() === nameUk.trim().toLowerCase());
  if (rowIndex === -1) {
    throw new Error(`"${nameUk}" not found in Ingredients`);
  }
  return rowIndex + 2; // +2: 1-based rows, plus the header row
}

/** Toggles the Favorite column for an existing Ingredients row, found by exact nameUk match. */
export async function setIngredientFavorite(nameUk: string, favorite: boolean): Promise<void> {
  const rowNumber = await findIngredientRowNumber(nameUk);
  await batchUpdateRanges([{ range: `Ingredients!M${rowNumber}`, values: [[favorite]] }]);
}

/** Sets the GlycemicFlag column for an existing Ingredients row, found by exact nameUk match. */
export async function setIngredientGlycemicFlag(nameUk: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const rowNumber = await findIngredientRowNumber(nameUk);
  await batchUpdateRanges([{ range: `Ingredients!N${rowNumber}`, values: [[glycemicFlag]] }]);
}
