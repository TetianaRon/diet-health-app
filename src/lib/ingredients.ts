// Typed data-access layer over the Ingredients tab (see docs/technical-spec.md
// -> "Google Sheets structure" for the column order this maps to).
import { readRange, writeRange } from "./sheets";

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
}

const INGREDIENTS_RANGE = "A2:L1000"; // header row is A1:L1
const INGREDIENTS_APPEND_RANGE = "A:L";

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toSource(value: unknown): IngredientSource {
  return value === "starter" || value === "usda" || value === "manual" ? value : "manual";
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
  ];
}

export async function listIngredients(): Promise<Ingredient[]> {
  const rows = await readRange("Ingredients", INGREDIENTS_RANGE);
  return rows.filter((row) => row.length > 0).map(rowToIngredient);
}

export async function addIngredient(ingredient: Omit<Ingredient, "dateAdded">): Promise<void> {
  const withDate: Ingredient = { ...ingredient, dateAdded: new Date().toISOString().slice(0, 10) };
  await writeRange("Ingredients", INGREDIENTS_APPEND_RANGE, [ingredientToRow(withDate)]);
}
