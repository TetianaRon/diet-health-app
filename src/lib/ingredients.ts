// Typed data-access layer over the Ingredients tab (see docs/technical-spec.md
// -> "Google Sheets structure" for the column order this maps to). Rows are
// read/written by column HEADER NAME (see sheetRow.ts), not fixed position,
// so a reordered sheet — deliberately or by someone dragging a column in the
// Sheets UI — still parses correctly.
import { readRange } from "./sheets";
import { deleteRecord, upsertRecord } from "./recordStore";
import { buildColumnIndex, buildRow, cell, parseTab, SCAN_LAST_COLUMN, type ColumnIndex, type ParsedTab } from "./sheetRow";
import { BUILT_IN_ALIASES, BUILT_IN_FOODS } from "../data/builtInFoods";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";
import { parseUnknownNutritionFields, type NutritionKey } from "./dishes";
import { mergeBuiltInsById, newRecordId } from "./itemIds";
import { positiveOrNull, toBasis, type Basis } from "./measure";
import { parsePortionSizes, serializePortionSizes, type PortionSize } from "./portionSizes";

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
  // How the values are measured (2.0.1, measure.ts): per 100 g (as before)
  // or per 1 piece; the amount they were typed for («на 30 г», «на 12 шт.»);
  // and a weighed count of pieces («12 шт. = 300 г»). Blank cells read as per
  // 100 g with no piece weight.
  basis: Basis;
  valuesPer: number | null;
  weighedPieces: number | null;
  weighedGrams: number | null;
  // Her named portion sizes (2.0.2, portionSizes.ts); database sizes are added when shown.
  portionSizes: PortionSize[];
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
  "Basis",
  "ValuesPer",
  "WeighedPieces",
  "WeighedGrams",
  "PortionSizes",
  "UpdatedAt",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(INGREDIENTS_HEADERS);

const INGREDIENTS_RANGE = `A1:${SCAN_LAST_COLUMN}1000`; // includes the header row (row 1), needed to resolve columns by name

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
    basis: toBasis(cell(row, columnIndex, "Basis")),
    valuesPer: positiveOrNull(cell(row, columnIndex, "ValuesPer")),
    weighedPieces: positiveOrNull(cell(row, columnIndex, "WeighedPieces")),
    weighedGrams: positiveOrNull(cell(row, columnIndex, "WeighedGrams")),
    portionSizes: parsePortionSizes(cell(row, columnIndex, "PortionSizes")),
  };
}

/** Maps a typed Ingredient back to a raw Sheets row, placing each field at its header's actual column position. */
/** The tab's fields for a ingredient (header → value) — what a save writes. */
export function ingredientFields(ingredient: Ingredient): Record<string, unknown> {
  return {
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
      Basis: ingredient.basis === "piece" ? "piece" : "",
      ValuesPer: ingredient.valuesPer ?? "",
      WeighedPieces: ingredient.weighedPieces ?? "",
      WeighedGrams: ingredient.weighedGrams ?? "",
      PortionSizes: serializePortionSizes(ingredient.portionSizes),
  };
}

export function ingredientToRow(ingredient: Ingredient, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(ingredientFields(ingredient), columnIndex);
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

async function readIngredientsSheet(): Promise<ParsedTab> {
  return parseTab("Ingredients", await readRange("Ingredients", INGREDIENTS_RANGE), INGREDIENTS_HEADERS);
}

export async function listIngredients(): Promise<Ingredient[]> {
  const { columnIndex, dataRows } = await readIngredientsSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToIngredient(row, columnIndex));
}

// Saves go to the device first and reach the sheet with the next sync
// (recordStore.ts, release 2.0) — they work the same offline.

/** Adds a new ingredient with a new `I…` ID and returns it as saved. */
export async function addIngredient(
  ingredient: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag" | "id" | "basedOn" | "giFrom" | "basis" | "valuesPer" | "weighedPieces" | "weighedGrams" | "portionSizes"> &
    Partial<Pick<Ingredient, "basedOn" | "giFrom" | "basis" | "valuesPer" | "weighedPieces" | "weighedGrams" | "portionSizes">>,
  favorite = false,
  glycemicFlag: GlycemicFlag = "none",
): Promise<Ingredient> {
  const saved: Ingredient = {
    ...ingredient,
    id: newRecordId("ingredient"),
    basedOn: ingredient.basedOn ?? "",
    giFrom: ingredient.giFrom ?? "",
    basis: ingredient.basis ?? "100g",
    valuesPer: ingredient.valuesPer ?? null,
    weighedPieces: ingredient.weighedPieces ?? null,
    weighedGrams: ingredient.weighedGrams ?? null,
    portionSizes: ingredient.portionSizes ?? [],
    dateAdded: new Date().toISOString().slice(0, 10),
    favorite,
    glycemicFlag,
  };
  await upsertRecord("Ingredients", saved.id, ingredientFields(saved));
  return saved;
}

/** Sets an ingredient's Favorite mark. */
export async function setIngredientFavorite(id: string, favorite: boolean): Promise<void> {
  await upsertRecord("Ingredients", id, { Favorite: favorite });
}

/** Sets an ingredient's GlycemicFlag. */
export async function setIngredientGlycemicFlag(id: string, glycemicFlag: GlycemicFlag): Promise<void> {
  await upsertRecord("Ingredients", id, { GlycemicFlag: glycemicFlag });
}

/** Saves several edited ingredients. */
export async function updateIngredients(items: readonly Ingredient[]): Promise<void> {
  for (const item of items) await upsertRecord("Ingredients", item.id, ingredientFields(item));
}

/** Saves an edited ingredient (a rename is part of the same save: links go by ID since 1.6). */
export async function updateIngredient(ingredient: Ingredient): Promise<void> {
  await upsertRecord("Ingredients", ingredient.id, ingredientFields(ingredient));
}

/** Deletes her saved product (its row leaves the sheet at the next sync). Final — the app can't bring it back. */
export async function deleteIngredient(id: string): Promise<void> {
  await deleteRecord("Ingredients", id);
}
