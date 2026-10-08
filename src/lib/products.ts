// One «Продукти» list (release 2.1, spec → "One product list (2.1)"). Every
// item — what used to be a product (Ingredients tab) or a dish (Dishes tab) —
// is one row of the `Products` tab, and its ID never changes. `Values` says
// where its values come from (typed, or composed by a recipe); `Labels` are for
// finding and filtering only. This file holds the tab's columns and the pure
// merge of the two old tabs; the IO is in productsMerge.ts.
import { buildColumnIndex, buildRow, cell, parseTab, type ColumnIndex } from "./sheetRow";
import { ingredientFields, INGREDIENTS_HEADERS, rowToIngredient } from "./ingredients";
import { dishFields, DISHES_HEADERS, rowToDish } from "./dishes";

export const PRODUCTS_TAB = "Products";
/** The tabs 2.0.4 and earlier used; after the merge they're renamed to these archives and no longer read. */
export const OLD_PRODUCT_TABS = ["Ingredients", "Dishes"] as const;
export const ARCHIVE_TITLES: Record<(typeof OLD_PRODUCT_TABS)[number], string> = {
  Ingredients: "Інгредієнти (архів)",
  Dishes: "Страви (архів)",
};

export const PRODUCTS_HEADERS = [
  "NameUk",
  "NameEn",
  "Values",
  "Labels",
  "Carbs_g",
  "GI",
  "Fiber_g",
  "Sugars_g",
  "Protein_g",
  "Fat_g",
  "Calories_kcal",
  "Sodium_mg",
  "Basis",
  "ValuesPer",
  "WeighedPieces",
  "WeighedGrams",
  "IngredientsJson",
  "YieldGrams",
  "YieldPieces",
  "PortionSizes",
  "Source",
  "DateAdded",
  "Favorite",
  "GlycemicFlag",
  "GiVerified",
  "UnknownFields",
  "GiFrom",
  "Id",
  "BasedOn",
  "UpdatedAt",
] as const;

export const PRODUCTS_COLUMN_INDEX: ColumnIndex = buildColumnIndex(PRODUCTS_HEADERS);

/** Where an item's values come from: typed (a label, the database, her own numbers) or composed by a recipe. */
export type ValuesKind = "typed" | "recipe";

/** Labels for finding and filtering (never part of the maths); stored as these keys. */
export const LABEL_KEYS = ["ingredient", "dish", "drink", "sauce", "snack"] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

export function parseLabels(value: unknown): LabelKey[] {
  const wanted = new Set(String(value ?? "").split(",").map((s) => s.trim()));
  return LABEL_KEYS.filter((key) => wanted.has(key));
}

export function serializeLabels(labels: readonly LabelKey[]): string {
  return LABEL_KEYS.filter((key) => labels.includes(key)).join(",");
}

export function parseValuesKind(value: unknown): ValuesKind | null {
  const v = String(value ?? "").trim();
  return v === "typed" || v === "recipe" ? v : null;
}

/**
 * Whether a Products row is shown as a dish in 2.1's first checkpoint, while
 * the screens are still split (checkpoint 2 makes one list): composed by a
 * recipe, labelled страва, or — a row whose Values cell is blank, e.g. saved by
 * an older version — an old `D…` ID.
 */
export function isDishRow(row: readonly unknown[], columnIndex: ColumnIndex): boolean {
  const kind = parseValuesKind(cell(row, columnIndex, "Values"));
  if (kind === "recipe") return true;
  if (parseLabels(cell(row, columnIndex, "Labels")).includes("dish")) return true;
  return kind === null && String(cell(row, columnIndex, "Id") ?? "").trim().startsWith("D");
}

/** A Products row's fields for an Ingredients row (typed values, no label). */
function fromIngredientRow(row: unknown[], columnIndex: ColumnIndex): Record<string, unknown> {
  return {
    ...ingredientFields(rowToIngredient(row, columnIndex)),
    Values: "typed",
    Labels: "",
    UpdatedAt: cell(row, columnIndex, "UpdatedAt") ?? "",
  };
}

/** A Products row's fields for a Dishes row: composed when it has a recipe, typed for a fixed-value dish; labelled страва. */
function fromDishRow(row: unknown[], columnIndex: ColumnIndex): Record<string, unknown> {
  const dish = rowToDish(row, columnIndex);
  return {
    ...dishFields(dish),
    Values: dish.ingredients.length > 0 ? "recipe" : "typed",
    Labels: serializeLabels(["dish"]),
    Favorite: false,
    UpdatedAt: cell(row, columnIndex, "UpdatedAt") ?? "",
  };
}

export interface ProductsMergePlan {
  /** Data rows for the Products tab, in Products column order. */
  rows: unknown[][];
  /** Old rows that had no ID; they get one from `newId`. */
  idsAdded: number;
}

/**
 * Pure: the Products rows for the old tabs' grids (each grid as read, header
 * row first). Products rows come first, then dishes, each in sheet order. A
 * row without an ID gets one (`newId(kind)`), so nothing is lost.
 */
export function planProductsMerge(
  ingredientsGrid: unknown[][] | undefined,
  dishesGrid: unknown[][] | undefined,
  newId: (kind: "ingredient" | "dish") => string,
): ProductsMergePlan {
  const rows: unknown[][] = [];
  let idsAdded = 0;
  const take = (grid: unknown[][] | undefined, tab: string, headers: readonly string[], kind: "ingredient" | "dish") => {
    if (!grid || grid.length === 0) return;
    const { columnIndex, dataRows } = parseTab(tab, grid, headers);
    for (const row of dataRows) {
      if (row.every((v) => String(v ?? "").trim() === "")) continue;
      const fields = kind === "ingredient" ? fromIngredientRow(row, columnIndex) : fromDishRow(row, columnIndex);
      if (!String(fields.Id ?? "").trim()) {
        fields.Id = newId(kind);
        idsAdded++;
      }
      rows.push(buildRow(fields, PRODUCTS_COLUMN_INDEX));
    }
  };
  take(ingredientsGrid, "Ingredients", INGREDIENTS_HEADERS, "ingredient");
  take(dishesGrid, "Dishes", DISHES_HEADERS, "dish");
  return { rows, idsAdded };
}

/**
 * Pure: rows found in an old tab after the merge (an older app version saved
 * there) folded into the Products rows. A row whose ID is new is added; one
 * already in Products replaces it only when its UpdatedAt is newer.
 */
export function absorbLeftovers(productRows: readonly unknown[][], leftovers: readonly unknown[][]): { rows: unknown[][]; added: number; replaced: number } {
  const idCol = PRODUCTS_COLUMN_INDEX.get("Id")!;
  const updatedCol = PRODUCTS_COLUMN_INDEX.get("UpdatedAt")!;
  const rows = productRows.map((r) => [...r]);
  const byId = new Map(rows.map((r, i) => [String(r[idCol] ?? "").trim(), i]));
  let added = 0;
  let replaced = 0;
  for (const row of leftovers) {
    const id = String(row[idCol] ?? "").trim();
    const at = byId.get(id);
    if (at === undefined) {
      rows.push([...row]);
      byId.set(id, rows.length - 1);
      added++;
    } else if (String(row[updatedCol] ?? "") > String(rows[at][updatedCol] ?? "")) {
      rows[at] = [...row];
      replaced++;
    }
  }
  return { rows, added, replaced };
}
