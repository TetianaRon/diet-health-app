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
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex, type ParsedTab } from "./sheetRow";
import { toGlycemicFlag, type GlycemicFlag } from "./glycemicFlag";
import { reserveItemId } from "./itemIdStore";

export type DishSource = "starter" | "manual";

export interface DishIngredientRef {
  // The ingredient's ID (`I12`, or a built-in `B0001`) — the link, since
  // 1.6. Missing only on recipes saved before 1.6 that the sheet upgrade
  // couldn't resolve (the name matched nothing); those fall back to the name.
  id?: string;
  // Readable snapshot of the ingredient's name when the recipe was saved
  // (and the pre-1.6 link).
  nameUk: string;
  grams: number;
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
 * `lookupIngredient` returning null for a reference it can't resolve skips
 * that ingredient's contribution — callers should validate all references
 * resolve before treating the result as final.
 */
export function computeDishNutrition(
  ingredients: DishIngredientRef[],
  yieldGrams: number,
  lookupIngredient: (ref: DishIngredientRef) => IngredientNutrition | null,
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
 * Which of a dish's fields can't be trusted because an ingredient it's built
 * from has that field unknown (see Ingredient.unknownFields) — the dish
 * total for such a field would silently omit that ingredient's real
 * contribution, so it's marked unknown instead. GI is weighted by carbs, so
 * it's unknown whenever a contributing ingredient's GI is unknown (unless
 * that ingredient has no carbs to weight by) or its carbs are unknown.
 */
export function computeDishUnknownFields(
  ingredients: DishIngredientRef[],
  lookupIngredient: (ref: DishIngredientRef) => (IngredientNutrition & { unknownFields: NutritionKey[] }) | null,
): NutritionKey[] {
  const unknown = new Set<NutritionKey>();
  for (const ref of ingredients) {
    const ingredient = lookupIngredient(ref);
    if (!ingredient) continue;
    for (const key of ingredient.unknownFields) if (key !== "gi") unknown.add(key);
    const carbsUnknown = ingredient.unknownFields.includes("carbsG");
    const giUnknown = ingredient.unknownFields.includes("gi");
    if (carbsUnknown || (giUnknown && ingredient.carbsG > 0)) unknown.add("gi");
  }
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
      .filter((item): item is { id?: unknown; name: string; grams: number } => typeof item?.name === "string")
      .map((item) => {
        const id = typeof item.id === "string" && item.id.trim() !== "" ? item.id.trim() : undefined;
        return { ...(id ? { id } : {}), nameUk: item.name, grams: toNumber(item.grams) };
      });
  } catch {
    return [];
  }
}

export function serializeIngredientsJson(ingredients: readonly DishIngredientRef[]): string {
  return JSON.stringify(ingredients.map((i) => ({ ...(i.id ? { id: i.id } : {}), name: i.nameUk, grams: i.grams })));
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
  "UnknownFields",
  "Id",
  "BasedOn",
] as const;
const DEFAULT_COLUMN_INDEX = buildColumnIndex(DISHES_HEADERS);

const DISHES_RANGE = `A1:${SCAN_LAST_COLUMN}1000`; // includes the header row (row 1), needed to resolve columns by name
const DISHES_APPEND_RANGE = `A:${SCAN_LAST_COLUMN}`;

export function rowToDish(row: unknown[], columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): Dish {
  return {
    id: String(cell(row, columnIndex, "Id") ?? "").trim(),
    basedOn: String(cell(row, columnIndex, "BasedOn") ?? "").trim(),
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
    unknownFields: parseUnknownNutritionFields(cell(row, columnIndex, "UnknownFields")),
  };
}

export function dishToRow(dish: Dish, columnIndex: ColumnIndex = DEFAULT_COLUMN_INDEX): unknown[] {
  return buildRow(
    {
      NameUk: dish.nameUk,
      NameEn: dish.nameEn,
      IngredientsJson: serializeIngredientsJson(dish.ingredients),
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
      UnknownFields: dish.unknownFields.join(","),
      Id: dish.id,
      BasedOn: dish.basedOn,
    },
    columnIndex,
  );
}

async function readDishesSheet(): Promise<ParsedTab> {
  return parseTab("Dishes", await readRange("Dishes", DISHES_RANGE), DISHES_HEADERS);
}

export async function listDishes(): Promise<Dish[]> {
  const { columnIndex, dataRows } = await readDishesSheet();
  return dataRows.filter((row) => row.length > 0).map((row) => rowToDish(row, columnIndex));
}

/** Appends a new dish with the next free `D…` ID and returns it as saved. */
export async function addDish(
  dish: Omit<Dish, "dateAdded" | "glycemicFlag" | "id" | "basedOn"> & { basedOn?: string },
  glycemicFlag: GlycemicFlag = "none",
): Promise<Dish> {
  const { columnIndex, dataRows } = await readDishesSheet();
  const id = await reserveItemId("dish", dataRows.map((row) => cell(row, columnIndex, "Id")));
  const saved: Dish = { ...dish, id, basedOn: dish.basedOn ?? "", dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag };
  await writeRange("Dishes", DISHES_APPEND_RANGE, [dishToRow(saved, columnIndex)]);
  return saved;
}

async function findDishRow(id: string): Promise<{ rowNumber: number; columnIndex: ColumnIndex }> {
  const { columnIndex, dataRows, firstDataRow } = await readDishesSheet();
  const rowIndex = dataRows.findIndex((row) => String(cell(row, columnIndex, "Id") ?? "").trim() === id);
  if (rowIndex === -1) {
    throw new Error(`Dish ${id} not found in Dishes`);
  }
  return { rowNumber: rowIndex + firstDataRow, columnIndex };
}

/** Sets the GlycemicFlag column for an existing Dishes row, found by its ID. */
export async function setDishGlycemicFlag(id: string, glycemicFlag: GlycemicFlag): Promise<void> {
  const { rowNumber, columnIndex } = await findDishRow(id);
  const col = columnIndex.get("GlycemicFlag");
  if (col === undefined) throw new Error('Dishes sheet has no "GlycemicFlag" column');
  await batchUpdateRanges([{ range: `Dishes!${columnLetter(col)}${rowNumber}`, values: [[glycemicFlag]] }]);
}

/**
 * Overwrites an existing Dishes row in place, found by its ID — the edit
 * flow's counterpart to addDish's always-append behavior. A rename is just
 * part of the same write: nothing refers to a dish by name any more (1.6).
 */
export async function updateDish(dish: Dish): Promise<void> {
  const { rowNumber, columnIndex } = await findDishRow(dish.id);
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  await batchUpdateRanges([{ range: `Dishes!A${rowNumber}:${lastCol}${rowNumber}`, values: [dishToRow(dish, columnIndex)] }]);
}
