// Typed data-access layer over the Dishes tab (see docs/technical-spec.md ->
// "Google Sheets structure"). A Dish is anything requiring preparation —
// from a single cooked ingredient to a real multi-ingredient recipe —
// auto-computed from Ingredients per 100g of the finished product, never
// hand-typed. Counterpart to Ingredients being always-raw.
//
// Schema is deliberately kept consistent with Ingredient: NameUk/NameEn
// first, Source/DateAdded last, same nutrient column names in between —
// only IngredientsJson/YieldGrams are Dish-specific, inserted in the middle.
import { parseLabels, serializeLabels, type LabelKey } from "./labels";
import { isDishRow, PRODUCTS_HEADERS, PRODUCTS_TAB } from "./products";
import { readRange } from "./sheets";
import { deleteRecord, upsertRecord } from "./recordStore";
import { newRecordId } from "./itemIds";
import { buildColumnIndex, buildRow, cell, parseTab, SCAN_LAST_COLUMN, type ColumnIndex, type ParsedTab } from "./sheetRow";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";
import { positiveOrNull, resolveAmount, toBasis, PER_100G, type Basis, type Measure } from "./measure";
import { parsePortionSizes, serializePortionSizes, type PortionSize } from "./portionSizes";

export type DishSource = "starter" | "manual";

export interface DishIngredientRef {
  // The ingredient's ID (`I12`, or a built-in `B0001`) — the link, since
  // 1.6. Missing only on recipes saved before 1.6 that the sheet upgrade
  // couldn't resolve (the name matched nothing); those fall back to the name.
  id?: string;
  // Readable snapshot of the ingredient's name when the recipe was saved
  // (and the pre-1.6 link).
  nameUk: string;
  /** Grams in the recipe (0 when given by count only). */
  grams: number;
  /** Pieces in the recipe, for an item measured per piece (2.0.1), else absent. */
  pieces?: number;
  /** Millilitres in the recipe (2.1.1), else absent. */
  ml?: number;
}

/** A recipe line's amount as the factor on the ingredient's stored values (per 100 g or per piece); null if it can't be used. */
export function refFactor(ref: DishIngredientRef, measure: Measure | undefined): number | null {
  return resolveAmount(measure ?? PER_100G, { grams: ref.grams, pieces: ref.pieces ?? null, ml: ref.ml ?? null })?.factor ?? null;
}

/** What a recipe ingredient points at: anything with an ID, the built-in ID it copies (if any), and a name. */
export interface ItemRefTarget {
  id: string;
  basedOn: string;
  nameUk: string;
}

/**
 * Finds the item a recipe ingredient (or other reference) points at: by ID —
 * a saved copy answers for the built-in ID it copies (`basedOn`), since it
 * replaces that built-in item in lists — else, for a reference without an
 * ID, by exact name (the pre-1.6 behaviour).
 */
export function resolveItemRef<T extends ItemRefTarget>(ref: { id?: string; nameUk: string }, items: readonly T[]): T | null {
  if (ref.id) {
    return items.find((item) => item.id === ref.id) ?? items.find((item) => item.basedOn !== "" && item.basedOn === ref.id) ?? null;
  }
  const name = ref.nameUk.trim().toLowerCase();
  return items.find((item) => item.nameUk.trim().toLowerCase() === name) ?? null;
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

export type NutritionKey = keyof IngredientNutrition;

// Canonical order — also the order unknown fields are serialized in.
export const NUTRITION_KEYS: readonly NutritionKey[] = [
  "carbsG",
  "gi",
  "fiberG",
  "sugarsG",
  "proteinG",
  "fatG",
  "caloriesKcal",
  "sodiumMg",
];

/**
 * Parses an UnknownFields cell (comma-separated field names) into a typed
 * list, dropping anything unrecognized. A blank cell (every row saved before
 * this column existed) is "nothing unknown" — the additive-column default.
 */
export function parseUnknownNutritionFields(value: unknown): NutritionKey[] {
  const raw = String(value ?? "").trim();
  if (raw === "") return [];
  const wanted = new Set(raw.split(",").map((s) => s.trim()));
  return NUTRITION_KEYS.filter((key) => wanted.has(key));
}

export interface Dish extends IngredientNutrition {
  // `D12` for the user's dishes, `B0058…` for built-in ones (see itemIds.ts).
  id: string;
  // The built-in ID this sheet row is a saved copy of, else "".
  basedOn: string;
  nameUk: string;
  nameEn: string;
  ingredients: DishIngredientRef[];
  yieldGrams: number;
  // Measured per 100 g (as before) or per 1 piece (2.0.1); a count yield
  // («Вийшло 10 млинців») is YieldPieces. A per-piece dish's yield weight
  // may be 0 (unknown).
  basis: Basis;
  yieldPieces: number | null;
  // A weighed handful of pieces («10 млинців = 400 г», 2.0.2), so the whole
  // batch never has to be counted; both null when not given.
  weighedPieces: number | null;
  weighedGrams: number | null;
  // Her named portion sizes (2.0.2, portionSizes.ts).
  portionSizes: PortionSize[];
  // For finding and filtering only (2.1, labels.ts); undefined = not read (nothing is written).
  labels?: LabelKey[];
  source: DishSource;
  dateAdded: string;
  glycemicFlag: GlycemicFlag;
  // Same meaning as Ingredient.giVerified — true only once a person has
  // explicitly confirmed this GI against a trusted source. Defaults false
  // even for starter dishes, since a computed carb-weighted average (see
  // computeDishNutrition) is never itself a confirmation.
  giVerified: boolean;
  // Nutrition fields the person explicitly left blank rather than entered —
  // stored as 0 in the sheet (a safe, writable default) but never treated as
  // a real zero: logging this dish carries the gap into the meal entry (see
  // buildLogEntry) so totals exclude it instead of silently understating.
  // Also set automatically by computeDishUnknownFields when an ingredient
  // it's built from has an unknown value.
  unknownFields: NutritionKey[];
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
 * An ingredient whose GI is unknown (unknownFields has "gi") is left out of
 * the GI average — its stored 0 is not a real GI and would pull the average
 * down; its carbohydrate still counts in the totals. Whether the dish GI can
 * still be trusted is computeDishUnknownFields' call (the small-share rule).
 *
 * `lookupIngredient` returning null for a reference it can't resolve skips
 * that ingredient's contribution — callers should validate all references
 * resolve before treating the result as final.
 *
 * A dish measured per piece (2.0.1) passes `yieldPieces`: its values are then
 * per 1 piece (the totals ÷ pieces), and `yieldGrams` isn't needed. A recipe
 * line given by count uses the ingredient's measure (see refFactor).
 */
export function computeDishNutrition(
  ingredients: DishIngredientRef[],
  yieldGrams: number,
  lookupIngredient: (ref: DishIngredientRef) => (IngredientNutrition & { unknownFields?: NutritionKey[] } & Partial<Measure>) | null,
  yieldPieces: number | null = null,
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
    const nutrition = lookupIngredient(ref);
    if (!nutrition) continue;

    const factor = refFactor(ref, measureOf(nutrition));
    if (factor === null) continue;
    const carbsContribution = nutrition.carbsG * factor;

    totalCarbs += carbsContribution;
    totalFiber += nutrition.fiberG * factor;
    totalSugars += nutrition.sugarsG * factor;
    totalProtein += nutrition.proteinG * factor;
    totalFat += nutrition.fatG * factor;
    totalCalories += nutrition.caloriesKcal * factor;
    totalSodium += nutrition.sodiumMg * factor;

    if (!nutrition.unknownFields?.includes("gi")) {
      giWeightedSum += carbsContribution * nutrition.gi;
      giWeightBase += carbsContribution;
    }
  }

  const scale = yieldPieces ? 1 / yieldPieces : yieldGrams > 0 ? 100 / yieldGrams : 0;

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
 * Ingredients whose GI is unknown may bring at most this share of a dish's
 * carbohydrate and the dish GI still counts (developer, 2026-10-05: «agree,
 * and that should apply to any unknown products») — e.g. 5 g of garlic in a
 * pot of soup no longer makes the soup's GI unknown. The GI then comes from
 * the rest of the carbohydrate (see unknownGiCarbShare for the note).
 */
export const SMALL_UNKNOWN_GI_SHARE = 0.05;

type WithUnknown = IngredientNutrition & { unknownFields: NutritionKey[] } & Partial<Measure>;

/**
 * A product's or dish's measure. A dish's piece weight comes from its weighed
 * pieces («10 млинців = 400 г») when given, else from its yield when both the
 * weight and the count of the whole batch are known.
 */
export function itemMeasure(item: Partial<Measure> & { yieldGrams?: number; yieldPieces?: number | null }): Measure {
  if (item.yieldGrams !== undefined) {
    const basis = item.basis ?? "100g";
    if (item.weighedPieces && item.weighedGrams) return { basis, valuesPer: null, weighedPieces: item.weighedPieces, weighedGrams: item.weighedGrams };
    return { basis, valuesPer: null, weighedPieces: item.yieldPieces ?? null, weighedGrams: item.yieldGrams || null };
  }
  return measureOf(item);
}

/** An item's measure, when it carries one (built-in and older items are per 100 g). */
export function measureOf(item: Partial<Measure>): Measure {
  return {
    basis: item.basis ?? "100g",
    valuesPer: item.valuesPer ?? null,
    weighedPieces: item.weighedPieces ?? null,
    weighedGrams: item.weighedGrams ?? null,
    densityMl: item.densityMl ?? null,
    densityGrams: item.densityGrams ?? null,
  };
}

/** Share (0–1) of the dish's carbohydrate that comes from ingredients with an unknown GI. */
export function unknownGiCarbShare(ingredients: DishIngredientRef[], lookupIngredient: (ref: DishIngredientRef) => WithUnknown | null): number {
  let total = 0;
  let unknownGi = 0;
  for (const ref of ingredients) {
    const ingredient = lookupIngredient(ref);
    if (!ingredient || ingredient.unknownFields.includes("carbsG")) continue;
    const factor = refFactor(ref, measureOf(ingredient));
    if (factor === null) continue;
    const carbs = ingredient.carbsG * factor;
    total += carbs;
    if (ingredient.unknownFields.includes("gi")) unknownGi += carbs;
  }
  return total > 0 ? unknownGi / total : 0;
}

/**
 * Which of a dish's fields can't be trusted because an ingredient it's built
 * from has that field unknown (see Ingredient.unknownFields) — the dish
 * total for such a field would silently omit that ingredient's real
 * contribution, so it's marked unknown instead. GI is weighted by carbs, so
 * it's unknown when an ingredient's carbs are unknown, or when ingredients
 * with an unknown GI bring more than SMALL_UNKNOWN_GI_SHARE of the carbs.
 */
export function computeDishUnknownFields(ingredients: DishIngredientRef[], lookupIngredient: (ref: DishIngredientRef) => WithUnknown | null): NutritionKey[] {
  const unknown = new Set<NutritionKey>();
  for (const ref of ingredients) {
    const ingredient = lookupIngredient(ref);
    if (!ingredient) continue;
    for (const key of ingredient.unknownFields) if (key !== "gi") unknown.add(key);
    if (ingredient.unknownFields.includes("carbsG")) unknown.add("gi");
  }
  if (unknownGiCarbShare(ingredients, lookupIngredient) > SMALL_UNKNOWN_GI_SHARE) unknown.add("gi");
  return NUTRITION_KEYS.filter((key) => unknown.has(key));
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
  lookupIngredientFlag: (ref: DishIngredientRef) => GlycemicFlag | null,
): boolean {
  return dish.ingredients.some((ref) => {
    const flag = lookupIngredientFlag(ref);
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

// Stored as [{"id":"I12","name":"Гречка суха","grams":100}] — `id` since
// 1.6 (absent on older rows until the sheet upgrade fills it in).
export function parseIngredientsJson(value: unknown): DishIngredientRef[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { id?: unknown; name: string; grams: number; pieces?: unknown; ml?: unknown } => typeof item?.name === "string")
      .map((item) => {
        const id = typeof item.id === "string" && item.id.trim() !== "" ? item.id.trim() : undefined;
        const pieces = positiveOrNull(item.pieces);
        const ml = positiveOrNull(item.ml);
        return { ...(id ? { id } : {}), nameUk: item.name, grams: toNumber(item.grams), ...(pieces ? { pieces } : {}), ...(ml ? { ml } : {}) };
      });
  } catch {
    return [];
  }
}

export function serializeIngredientsJson(ingredients: readonly DishIngredientRef[]): string {
  return JSON.stringify(
    ingredients.map((i) => ({ ...(i.id ? { id: i.id } : {}), name: i.nameUk, grams: i.grams, ...(i.pieces ? { pieces: i.pieces } : {}), ...(i.ml ? { ml: i.ml } : {}) })),
  );
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
  "Basis",
  "YieldPieces",
  "WeighedPieces",
  "WeighedGrams",
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
  "UnknownFields",
  "Id",
  "BasedOn",
  "PortionSizes",
  "UpdatedAt",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(DISHES_HEADERS);

const DISHES_RANGE = `A1:${SCAN_LAST_COLUMN}1000`; // includes the header row (row 1), needed to resolve columns by name

export function rowToDish(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): Dish {
  return {
    id: String(cell(row, columnIndex, "Id") ?? "").trim(),
    basedOn: String(cell(row, columnIndex, "BasedOn") ?? "").trim(),
    nameUk: String(cell(row, columnIndex, "NameUk") ?? ""),
    nameEn: String(cell(row, columnIndex, "NameEn") ?? ""),
    ingredients: parseIngredientsJson(cell(row, columnIndex, "IngredientsJson")),
    yieldGrams: toNumber(cell(row, columnIndex, "YieldGrams")),
    basis: toBasis(cell(row, columnIndex, "Basis")),
    yieldPieces: positiveOrNull(cell(row, columnIndex, "YieldPieces")),
    weighedPieces: positiveOrNull(cell(row, columnIndex, "WeighedPieces")),
    weighedGrams: positiveOrNull(cell(row, columnIndex, "WeighedGrams")),
    portionSizes: parsePortionSizes(cell(row, columnIndex, "PortionSizes")),
    labels: parseLabels(cell(row, columnIndex, "Labels")),
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
    unknownFields: parseUnknownNutritionFields(cell(row, columnIndex, "UnknownFields")),
  };
}

/** The tab's fields for a dish (header → value) — what a save writes. */
export function dishFields(dish: Dish): Record<string, unknown> {
  return {
      NameUk: dish.nameUk,
      NameEn: dish.nameEn,
      IngredientsJson: serializeIngredientsJson(dish.ingredients),
      YieldGrams: dish.yieldGrams || "",
      Basis: dish.basis === "piece" ? "piece" : "",
      YieldPieces: dish.yieldPieces ?? "",
      WeighedPieces: dish.weighedPieces ?? "",
      WeighedGrams: dish.weighedGrams ?? "",
      PortionSizes: serializePortionSizes(dish.portionSizes),
      Labels: dish.labels ? serializeLabels(dish.labels) : undefined,
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
      UnknownFields: dish.unknownFields.join(","),
      Id: dish.id,
      BasedOn: dish.basedOn,
  };
}

export function dishToRow(dish: Dish, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(dishFields(dish), columnIndex);
}

// Since 2.1 dishes share the Products tab with products (products.ts).
async function readProductsSheet(): Promise<ParsedTab> {
  return parseTab(PRODUCTS_TAB, await readRange(PRODUCTS_TAB, DISHES_RANGE), PRODUCTS_HEADERS);
}

export async function listDishes(): Promise<Dish[]> {
  const { columnIndex, dataRows } = await readProductsSheet();
  return dataRows.filter((row) => row.length > 0 && isDishRow(row, columnIndex)).map((row) => rowToDish(row, columnIndex));
}

/** A dish's fields in the Products tab: composed when it has a recipe, typed for a fixed-value dish. */
function productFields(dish: Dish): Record<string, unknown> {
  return { ...dishFields(dish), Values: dish.ingredients.length > 0 ? "recipe" : "typed" };
}

// Saves go to the device first and reach the sheet with the next sync
// (recordStore.ts, release 2.0) — they work the same offline.

/** Adds a new dish with a new `D…` ID and returns it as saved. */
export async function addDish(
  dish: Omit<Dish, "dateAdded" | "glycemicFlag" | "id" | "basedOn"> & { basedOn?: string },
  glycemicFlag: GlycemicFlag = "none",
): Promise<Dish> {
  const saved: Dish = {
    ...dish,
    labels: dish.labels ?? ["dish"],
    id: newRecordId("dish"),
    basedOn: dish.basedOn ?? "",
    dateAdded: new Date().toISOString().slice(0, 10),
    glycemicFlag,
  };
  await upsertRecord(PRODUCTS_TAB, saved.id, productFields(saved));
  return saved;
}

/** Sets a dish's GlycemicFlag. */
export async function setDishGlycemicFlag(id: string, glycemicFlag: GlycemicFlag): Promise<void> {
  await upsertRecord(PRODUCTS_TAB, id, { GlycemicFlag: glycemicFlag });
}

/** Saves several edited dishes. */
export async function updateDishes(dishes: readonly Dish[]): Promise<void> {
  for (const dish of dishes) await upsertRecord(PRODUCTS_TAB, dish.id, productFields(dish));
}

/** Saves an edited dish (a rename is part of the same save: nothing refers to a dish by name since 1.6). */
export async function updateDish(dish: Dish): Promise<void> {
  await upsertRecord(PRODUCTS_TAB, dish.id, productFields(dish));
}

/** Deletes her saved dish (its row leaves the sheet at the next sync). Past meals keep their own values. */
export async function deleteDish(id: string): Promise<void> {
  await deleteRecord(PRODUCTS_TAB, id);
}

/**
 * Her dishes whose recipe uses this product — it can't be deleted while they
 * do (they'd lose an ingredient). A recipe line pointing at a built-in ID
 * doesn't count for her copy of it: after deleting the copy, that line uses
 * the built-in product again.
 */
export function dishesUsingIngredient(ingredient: { id: string; nameUk: string }, dishes: readonly Dish[]): Dish[] {
  const name = ingredient.nameUk.trim().toLowerCase();
  return dishes.filter((dish) => dish.ingredients.some((ref) => (ref.id ? ref.id === ingredient.id : ref.nameUk.trim().toLowerCase() === name)));
}
