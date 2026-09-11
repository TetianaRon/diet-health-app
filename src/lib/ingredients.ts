// Typed data-access layer over the Ingredients tab (see docs/technical-spec.md
// -> "Google Sheets structure" for the column order this maps to). Rows are
// read/written by column HEADER NAME (see sheetRow.ts), not fixed position,
// so a reordered sheet — deliberately or by someone dragging a column in the
// Sheets UI — still parses correctly.
import { batchUpdateRanges, readRange, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, columnLetter, readColumnIndex, type ColumnIndex } from "./sheetRow";
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
  // True only once a person has explicitly confirmed this GI against a
  // source they trust — never set automatically, regardless of how the GI
  // value itself was sourced (bundle research, USDA+static table, manual
  // entry). Defaults false for every new entry, including bundle items — see
  // the 2026-09-10 build-log entry for why "we researched it" still isn't
  // the same as "a person confirmed it."
  giVerified: boolean;
}

// Canonical column order — what a brand-new sheet gets initialized with (see
// spreadsheetInit.ts, which imports this) and the default columnIndex used
// below when none is given (tests, or before a live sheet's own header row
// has been read). A real sheet's actual current order always wins over this
// default once read — see readIngredientsSheet/readColumnIndex below.
export const INGREDIENTS_HEADERS = [
  "NameUk",
  "NameEn",
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
  "Favorite",
  "GlycemicFlag",
  "GiVerified",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(INGREDIENTS_HEADERS);

const INGREDIENTS_RANGE = "A1:O1000"; // includes the header row (row 1), needed to resolve columns by name
const INGREDIENTS_APPEND_RANGE = "A:O";
const INGREDIENTS_WIDTH = "O";

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

/** Maps a raw Sheets row (as returned by readRange) to a typed Ingredient, resolving columns by header name. */
export function rowToIngredient(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): Ingredient {
  return {
    nameUk: String(cell(row, columnIndex, "NameUk") ?? ""),
    nameEn: String(cell(row, columnIndex, "NameEn") ?? ""),
    carbsG: toNumber(cell(row, columnIndex, "Carbs_g")),
    gi: toNumber(cell(row, columnIndex, "GI")),
    fiberG: toNumber(cell(row, columnIndex, "Fiber_g")),
    sugarsG: toNumber(cell(row, columnIndex, "Sugars_g")),
    proteinG: toNumber(cell(row, columnIndex, "Protein_g")),
    fatG: toNumber(cell(row, columnIndex, "Fat_g")),
    caloriesKcal: toNumber(cell(row, columnIndex, "Calories_kcal")),
    sodiumMg: toNumber(cell(row, columnIndex, "Sodium_mg")),
    source: toSource(cell(row, columnIndex, "Source")),
    dateAdded: String(cell(row, columnIndex, "DateAdded") ?? ""),
    favorite: toBoolean(cell(row, columnIndex, "Favorite")),
    glycemicFlag: toGlycemicFlag(cell(row, columnIndex, "GlycemicFlag")),
    giVerified: toBoolean(cell(row, columnIndex, "GiVerified")),
  };
}

/** Maps a typed Ingredient back to a raw Sheets row, placing each field at its header's actual column position. */
export function ingredientToRow(ingredient: Ingredient, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(
    {
      NameUk: ingredient.nameUk,
      NameEn: ingredient.nameEn,
      Carbs_g: ingredient.carbsG,
      GI: ingredient.gi,
      Fiber_g: ingredient.fiberG,
      Sugars_g: ingredient.sugarsG,
      Protein_g: ingredient.proteinG,
      Fat_g: ingredient.fatG,
      Calories_kcal: ingredient.caloriesKcal,
      Sodium_mg: ingredient.sodiumMg,
      Source: ingredient.source,
      DateAdded: ingredient.dateAdded,
      Favorite: ingredient.favorite,
      GlycemicFlag: ingredient.glycemicFlag,
      GiVerified: ingredient.giVerified,
    },
    columnIndex,
  );
}

/** Stable sort, favorites first — used wherever ingredients are browsed or picked from. */
export function sortFavoritesFirst<T extends { favorite: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

function starterFoodToIngredient(food: (typeof STARTER_FOODS)[number]): Ingredient {
  return { ...food, source: "starter", dateAdded: "", favorite: false, glycemicFlag: "none", giVerified: false };
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

async function readIngredientsSheet(): Promise<{ columnIndex: ColumnIndex; dataRows: unknown[][] }> {
  const rows = await readRange("Ingredients", INGREDIENTS_RANGE);
  const [header, ...dataRows] = rows;
  return { columnIndex: header ? buildColumnIndex(header) : DEFAULT_COLUMN_INDEX, dataRows };
}

export async function listIngredients(): Promise<Ingredient[]> {
  const { columnIndex, dataRows } = await readIngredientsSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToIngredient(row, columnIndex));
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
  const columnIndex = await readColumnIndex("Ingredients", INGREDIENTS_WIDTH);
  await writeRange("Ingredients", INGREDIENTS_APPEND_RANGE, [ingredientToRow(withDate, columnIndex)]);
}

async function findIngredientRow(nameUk: string): Promise<{ rowNumber: number; columnIndex: ColumnIndex }> {
  const { columnIndex, dataRows } = await readIngredientsSheet();
  const rowIndex = dataRows.findIndex(
    (row) => String(cell(row, columnIndex, "NameUk") ?? "").trim().toLowerCase() === nameUk.trim().toLowerCase(),
  );
  if (rowIndex === -1) {
    throw new Error(`"${nameUk}" not found in Ingredients`);
  }
  return { rowNumber: rowIndex + 2, columnIndex }; // +2: 1-based rows, plus the header row
}

function requireColumn(columnIndex: ColumnIndex, headerName: string, tab: string): number {
  const i = columnIndex.get(headerName);
  if (i === undefined) throw new Error(`${tab} sheet has no "${headerName}" column`);
  return i;
}

/** Toggles the Favorite column for an existing Ingredients row, found by exact nameUk match. */
export async function setIngredientFavorite(nameUk: string, favorite: boolean): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(nameUk);
  const col = requireColumn(columnIndex, "Favorite", "Ingredients");
  await batchUpdateRanges([{ range: `Ingredients!${columnLetter(col)}${rowNumber}`, values: [[favorite]] }]);
}

/** Sets the GlycemicFlag column for an existing Ingredients row, found by exact nameUk match. */
export async function setIngredientGlycemicFlag(nameUk: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(nameUk);
  const col = requireColumn(columnIndex, "GlycemicFlag", "Ingredients");
  await batchUpdateRanges([{ range: `Ingredients!${columnLetter(col)}${rowNumber}`, values: [[glycemicFlag]] }]);
}

/**
 * Overwrites an existing Ingredients row in place, found by its *current*
 * nameUk (i.e. before any rename in `ingredient`) — the edit flow's
 * counterpart to addIngredient's always-append behavior. Rewrites every
 * known column (A through the highest column this app recognizes), so a
 * rename is just part of the same write, not a separate step.
 */
export async function updateIngredient(currentNameUk: string, ingredient: Ingredient): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(currentNameUk);
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  await batchUpdateRanges([
    { range: `Ingredients!A${rowNumber}:${lastCol}${rowNumber}`, values: [ingredientToRow(ingredient, columnIndex)] },
  ]);
}
