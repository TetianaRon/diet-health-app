// Typed data-access layer over the Ingredients tab (see docs/technical-spec.md
// -> "Google Sheets structure" for the column order this maps to). Rows are
// read/written by column HEADER NAME (see sheetRow.ts), not fixed position,
// so a reordered sheet — deliberately or by someone dragging a column in the
// Sheets UI — still parses correctly.
import { batchUpdateRanges, deleteSheetRow, readRange, readRangeLive, writeRange } from "./sheets";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex, type ParsedTab } from "./sheetRow";
import { BUILT_IN_ALIASES, BUILT_IN_FOODS } from "../data/builtInFoods";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";
import { parseUnknownNutritionFields, type NutritionKey } from "./dishes";
import { mergeBuiltInsById } from "./itemIds";
import { reserveItemId } from "./itemIdStore";

export type IngredientSource = "starter" | "usda" | "manual";

export interface Ingredient {
  // `I12` for the user's ingredients, `B0001…` for built-in ones (see
  // itemIds.ts). Links go by ID since 1.6; the name is only a label.
  id: string;
  // The built-in ID this sheet row is a saved copy of (a favourite or
  // edited built-in item), else "".
  basedOn: string;
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
  // Nutrition fields left blank on purpose ("I don't know / don't care") —
  // stored as 0 in the sheet but never treated as a real zero downstream:
  // logging this ingredient carries the gap into the meal entry, and a dish
  // built from it inherits it (see computeDishUnknownFields). Additive
  // UnknownFields column; a blank cell means nothing is unknown.
  unknownFields: NutritionKey[];
  // The verified-database entry her GI was taken from (a GI suggestion,
  // release 1.9), else "" — typing a GI by hand empties it. Lets her own
  // item show ⓘ for its GI while its nutrients stay «неперевірено».
  giFrom: string;
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
  "UnknownFields",
  "Id",
  "BasedOn",
  "GiFrom",
  "UpdatedAt",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(INGREDIENTS_HEADERS);

const INGREDIENTS_RANGE = `A1:${SCAN_LAST_COLUMN}1000`; // includes the header row (row 1), needed to resolve columns by name
const INGREDIENTS_APPEND_RANGE = `A:${SCAN_LAST_COLUMN}`;

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
    id: String(cell(row, columnIndex, "Id") ?? "").trim(),
    basedOn: String(cell(row, columnIndex, "BasedOn") ?? "").trim(),
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
    unknownFields: parseUnknownNutritionFields(cell(row, columnIndex, "UnknownFields")),
    giFrom: String(cell(row, columnIndex, "GiFrom") ?? "").trim(),
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
      UnknownFields: ingredient.unknownFields.join(","),
      Id: ingredient.id,
      BasedOn: ingredient.basedOn,
      GiFrom: ingredient.giFrom,
    },
    columnIndex,
  );
}

/** Stable sort, favorites first — used wherever ingredients are browsed or picked from. */
export function sortFavoritesFirst<T extends { favorite: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

/**
 * Merges the built-in products (the verified food database, see
 * data/builtInFoods.ts) with the personal Ingredients sheet, so the whole
 * database is browsable/pickable (main list, dish composition, meal
 * logging) without first requiring each one to be individually saved —
 * "saving" an ingredient is only needed to customize its values, add
 * something outside the bundle, or mark it favorite (which saves a copy,
 * see FoodsScreen). A sheet row that is a copy of a built-in item
 * (`basedOn`) takes its place — see mergeBuiltInsById. A bundle entry not
 * (yet) in the sheet has dateAdded: "" — a signal, not a schema field of its
 * own, that it isn't a real saved row.
 */
export function mergeWithBuiltInFoods(sheetIngredients: Ingredient[]): Ingredient[] {
  return mergeBuiltInsById(BUILT_IN_FOODS, sheetIngredients, BUILT_IN_ALIASES);
}

/** live: read the sheet itself (before a write decides which row to change). */
async function readIngredientsSheet(live = false): Promise<ParsedTab> {
  return parseTab("Ingredients", await (live ? readRangeLive : readRange)("Ingredients", INGREDIENTS_RANGE), INGREDIENTS_HEADERS);
}

export async function listIngredients(): Promise<Ingredient[]> {
  const { columnIndex, dataRows } = await readIngredientsSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToIngredient(row, columnIndex));
}

/** Appends a new ingredient with the next free `I…` ID and returns it as saved. */
export async function addIngredient(
  ingredient: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag" | "id" | "basedOn" | "giFrom"> & { basedOn?: string; giFrom?: string },
  favorite = false,
  glycemicFlag: GlycemicFlag = "none",
): Promise<Ingredient> {
  const { columnIndex, dataRows } = await readIngredientsSheet(true);
  const id = await reserveItemId("ingredient", dataRows.map((row) => cell(row, columnIndex, "Id")));
  const saved: Ingredient = {
    ...ingredient,
    id,
    basedOn: ingredient.basedOn ?? "",
    giFrom: ingredient.giFrom ?? "",
    dateAdded: new Date().toISOString().slice(0, 10),
    favorite,
    glycemicFlag,
  };
  await writeRange("Ingredients", INGREDIENTS_APPEND_RANGE, [ingredientToRow(saved, columnIndex)]);
  return saved;
}

async function findIngredientRow(id: string): Promise<{ rowNumber: number; columnIndex: ColumnIndex }> {
  const { columnIndex, dataRows, firstDataRow } = await readIngredientsSheet(true);
  const rowIndex = dataRows.findIndex((row) => String(cell(row, columnIndex, "Id") ?? "").trim() === id);
  if (rowIndex === -1) {
    throw new Error(`Ingredient ${id} not found in Ingredients`);
  }
  return { rowNumber: rowIndex + firstDataRow, columnIndex };
}

function requireColumn(columnIndex: ColumnIndex, headerName: string, tab: string): number {
  const i = columnIndex.get(headerName);
  if (i === undefined) throw new Error(`${tab} sheet has no "${headerName}" column`);
  return i;
}

/** Toggles the Favorite column for an existing Ingredients row, found by its ID. */
export async function setIngredientFavorite(id: string, favorite: boolean): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(id);
  const col = requireColumn(columnIndex, "Favorite", "Ingredients");
  await batchUpdateRanges([{ range: `Ingredients!${columnLetter(col)}${rowNumber}`, values: [[favorite]] }]);
}

/** Sets the GlycemicFlag column for an existing Ingredients row, found by its ID. */
export async function setIngredientGlycemicFlag(id: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(id);
  const col = requireColumn(columnIndex, "GlycemicFlag", "Ingredients");
  await batchUpdateRanges([{ range: `Ingredients!${columnLetter(col)}${rowNumber}`, values: [[glycemicFlag]] }]);
}

/**
 * Overwrites an existing Ingredients row in place, found by its ID — the
 * edit flow's counterpart to addIngredient's always-append behavior.
 * Rewrites every known column, so a rename is just part of the same write
 * (safe since 1.6: nothing refers to an ingredient by name any more).
 */
/** Rewrites several saved rows in one read and one write (stays clear of Google's per-minute read limit). */
export async function updateIngredients(items: readonly Ingredient[]): Promise<void> {
  if (items.length === 0) return;
  const { columnIndex, dataRows, firstDataRow } = await readIngredientsSheet(true);
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  const updates = items.map((item) => {
    const i = dataRows.findIndex((row) => String(cell(row, columnIndex, "Id") ?? "").trim() === item.id);
    if (i < 0) throw new Error(`Ingredient ${item.id} not found`);
    const rowNumber = firstDataRow + i;
    return { range: `Ingredients!A${rowNumber}:${lastCol}${rowNumber}`, values: [ingredientToRow(item, columnIndex)] };
  });
  await batchUpdateRanges(updates);
}

export async function updateIngredient(ingredient: Ingredient): Promise<void> {
  const { rowNumber, columnIndex } = await findIngredientRow(ingredient.id);
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  await batchUpdateRanges([
    { range: `Ingredients!A${rowNumber}:${lastCol}${rowNumber}`, values: [ingredientToRow(ingredient, columnIndex)] },
  ]);
}

/** Removes her saved product's row from the sheet (by ID). Final — the app can't bring it back. */
export async function deleteIngredient(id: string): Promise<void> {
  const { rowNumber } = await findIngredientRow(id);
  await deleteSheetRow("Ingredients", rowNumber);
}
