// A prepared import of someone's own food records (release 2.3.1, spec →
// "The developer import"): a developer tool, not a feature. The file is built
// by us (e.g. from mom's old spreadsheet and its review) and run by the
// developer from a hidden screen; a public import needs its own design.
//   • databaseItems — database entries she used: they become her rows (copies);
//   • items — her own typed items (branded, unverified, dishes kept at her
//     values with «скласти рецепт»), keyed so recipes can name them;
//   • recipes — composed from database entries (`B…`) and her items (keys),
//     their values calculated now from those.
// planImport is pure (tested); runImport writes, after a copy of the sheet.
import { verifiedEntry } from "../data/builtInFoods";
import { copyFromDatabase, idsNeedingCopies } from "./databaseItems";
import {
  addDish,
  computeDishNutrition,
  computeDishUnknownFields,
  NUTRITION_KEYS,
  resolveItemRef,
  updateDishes,
  type Dish,
  type DishIngredientRef,
  type NutritionKey,
} from "./dishes";
import { addIngredient, mergeWithBuiltInFoods, updateIngredients, type Ingredient } from "./ingredients";
import { isBuiltInId, normalizeItemName } from "./itemIds";
import type { LabelKey } from "./labels";

export const IMPORT_FORMAT = "trackmymeals-import";

export interface ImportItem {
  key: string;
  nameUk: string;
  nameEn?: string;
  /** Per 100 g; a field listed in unknownFields holds 0. */
  values: Record<NutritionKey, number>;
  unknownFields: NutritionKey[];
  /** The database entry her GI comes from, when proposed from one (shows ⓘ for GI). */
  giFrom?: string;
  labels?: LabelKey[];
  recipeNeeded?: boolean;
  checkNote?: string;
  /** Where the values come from — shown in the preview only. */
  origin?: string;
}

export interface ImportRecipe {
  key: string;
  nameUk: string;
  /** `ref` is a database ID (`B…`) or an item's key. */
  lines: { ref: string; grams: number }[];
  yieldGrams: number;
  labels?: LabelKey[];
  origin?: string;
}

export interface ImportFile {
  format: typeof IMPORT_FORMAT;
  version: 1;
  title: string;
  /** Shown once on each of her devices after the import, e.g. «Додано ваші продукти зі старої таблиці». */
  notice: string;
  databaseItems: string[];
  items: ImportItem[];
  recipes: ImportRecipe[];
}

/** What's wrong with a file (empty = it can be imported). */
export function validateImportFile(value: unknown): string[] {
  const problems: string[] = [];
  const file = value as Partial<ImportFile> | null;
  if (!file || typeof file !== "object") return ["not a JSON object"];
  if (file.format !== IMPORT_FORMAT || file.version !== 1) problems.push(`format must be "${IMPORT_FORMAT}", version 1`);
  if (!file.title || !file.notice) problems.push("title and notice are required");
  const keys = new Set<string>();
  for (const id of file.databaseItems ?? []) if (!verifiedEntry(id)) problems.push(`database item ${id} isn't in the database`);
  for (const item of file.items ?? []) {
    if (!item.key || keys.has(item.key)) problems.push(`item ${item.nameUk || "?"}: a unique key is required`);
    keys.add(item.key);
    if (!item.nameUk?.trim()) problems.push(`item ${item.key}: a name is required`);
    for (const k of NUTRITION_KEYS) if (typeof item.values?.[k] !== "number" || item.values[k] < 0) problems.push(`item ${item.key}: ${k} must be a number ≥ 0`);
    for (const k of item.unknownFields ?? []) if (item.values?.[k] !== 0) problems.push(`item ${item.key}: ${k} is unknown, so it must hold 0`);
  }
  for (const recipe of file.recipes ?? []) {
    if (!recipe.key || keys.has(recipe.key)) problems.push(`recipe ${recipe.nameUk || "?"}: a unique key is required`);
    keys.add(recipe.key);
    if (!(recipe.yieldGrams > 0)) problems.push(`recipe ${recipe.key}: yieldGrams must be > 0`);
    for (const line of recipe.lines ?? []) {
      if (!(isBuiltInId(line.ref) ? verifiedEntry(line.ref) : (file.items ?? []).some((i) => i.key === line.ref))) problems.push(`recipe ${recipe.key}: unknown line ${line.ref}`);
      if (!(line.grams > 0)) problems.push(`recipe ${recipe.key}: line ${line.ref} needs grams > 0`);
    }
  }
  return problems;
}

export interface ImportDuplicate {
  key: string;
  nameUk: string;
  kind: "item" | "recipe";
  /** Her row with the same name. */
  existing: { id: string; nameUk: string; kind: "ingredient" | "dish" };
}

export interface ImportPlan {
  /** Database entries to copy into her «Продукти» (not hers yet). */
  databaseCopies: string[];
  newItems: ImportItem[];
  newRecipes: ImportRecipe[];
  /** Same name as one of her rows: kept by default, or replaced if she chooses. */
  duplicates: ImportDuplicate[];
}

/** What the import would do with her current rows (her own sheet rows only). */
export function planImport(file: ImportFile, ingredients: readonly Ingredient[], dishes: readonly Dish[]): ImportPlan {
  const own = [
    ...ingredients.map((i) => ({ id: i.id, nameUk: i.nameUk, kind: "ingredient" as const })),
    ...dishes.map((d) => ({ id: d.id, nameUk: d.nameUk, kind: "dish" as const })),
  ];
  const byName = new Map(own.map((o) => [normalizeItemName(o.nameUk), o]));
  const duplicates: ImportDuplicate[] = [];
  const newItems = file.items.filter((item) => {
    const existing = byName.get(normalizeItemName(item.nameUk));
    if (existing) duplicates.push({ key: item.key, nameUk: item.nameUk, kind: "item", existing });
    return !existing;
  });
  const newRecipes = file.recipes.filter((recipe) => {
    const existing = byName.get(normalizeItemName(recipe.nameUk));
    if (existing) duplicates.push({ key: recipe.key, nameUk: recipe.nameUk, kind: "recipe", existing });
    return !existing;
  });
  const fromRecipes = file.recipes.flatMap((r) => r.lines.map((l) => l.ref)).filter(isBuiltInId);
  const databaseCopies = idsNeedingCopies([...file.databaseItems, ...fromRecipes], mergeWithBuiltInFoods([...ingredients]));
  return { databaseCopies, newItems, newRecipes, duplicates };
}

function itemFields(item: ImportItem) {
  return {
    nameUk: item.nameUk.trim(),
    nameEn: item.nameEn ?? "",
    ...item.values,
    unknownFields: [...item.unknownFields],
    source: "manual" as const,
    giVerified: false,
    giFrom: item.giFrom ?? "",
    labels: item.labels ?? [],
    recipeNeeded: item.recipeNeeded ?? false,
    checkNote: item.checkNote ?? "",
  };
}

export interface ImportResult {
  copies: number;
  added: number;
  replaced: number;
  recipes: number;
}

/**
 * Writes the plan: database copies, her new items, the duplicates she chose to
 * replace (same ID, the file's values), then the recipes calculated from their
 * lines. `replace` holds the keys of duplicates to replace; the rest are kept.
 */
export async function runImport(
  file: ImportFile,
  plan: ImportPlan,
  replace: ReadonlySet<string>,
  ingredients: readonly Ingredient[],
  dishes: readonly Dish[],
): Promise<ImportResult> {
  const copies = await copyFromDatabase(plan.databaseCopies);
  const idByKey = new Map<string, string>();
  const added: Ingredient[] = [];
  for (const item of plan.newItems) {
    const saved = await addIngredient(itemFields(item));
    added.push(saved);
    idByKey.set(item.key, saved.id);
  }
  const replacedIngredients: Ingredient[] = [];
  for (const dup of plan.duplicates) {
    idByKey.set(dup.key, dup.existing.id);
    if (dup.kind !== "item" || !replace.has(dup.key) || dup.existing.kind !== "ingredient") continue;
    const item = file.items.find((i) => i.key === dup.key)!;
    const current = ingredients.find((i) => i.id === dup.existing.id)!;
    replacedIngredients.push({ ...current, ...itemFields(item), nameUk: current.nameUk });
  }
  if (replacedIngredients.length > 0) await updateIngredients(replacedIngredients);

  // Recipes are calculated from everything she has now, the new rows included.
  const all = mergeWithBuiltInFoods([...ingredients.filter((i) => !replacedIngredients.some((r) => r.id === i.id)), ...replacedIngredients, ...copies, ...added]);
  const lookup = (ref: DishIngredientRef) => resolveItemRef(ref, all);
  const recipeOf = (recipe: ImportRecipe) => {
    const refs: DishIngredientRef[] = recipe.lines.map((line) => {
      const id = isBuiltInId(line.ref) ? line.ref : idByKey.get(line.ref)!;
      return { id, nameUk: lookup({ id, nameUk: "", grams: 0 })?.nameUk ?? line.ref, grams: line.grams };
    });
    return {
      nameUk: recipe.nameUk.trim(),
      nameEn: "",
      ingredients: refs,
      yieldGrams: recipe.yieldGrams,
      basis: "100g" as const,
      yieldPieces: null,
      yieldMl: null,
      weighedPieces: null,
      weighedGrams: null,
      portionSizes: [],
      labels: recipe.labels ?? (["dish"] as LabelKey[]),
      ...computeDishNutrition(refs, recipe.yieldGrams, lookup),
      unknownFields: computeDishUnknownFields(refs, lookup),
      source: "manual" as const,
      giVerified: false,
      recipeNeeded: false,
      checkNote: "",
    };
  };
  for (const recipe of plan.newRecipes) await addDish(recipeOf(recipe));
  const replacedDishes = plan.duplicates
    .filter((d) => d.kind === "recipe" && replace.has(d.key) && d.existing.kind === "dish")
    .map((d) => {
      const current = dishes.find((x) => x.id === d.existing.id)!;
      return { ...current, ...recipeOf(file.recipes.find((r) => r.key === d.key)!), nameUk: current.nameUk };
    });
  if (replacedDishes.length > 0) await updateDishes(replacedDishes);

  return { copies: copies.length, added: added.length, replaced: replacedIngredients.length + replacedDishes.length, recipes: plan.newRecipes.length };
}
