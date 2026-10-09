// The verified database as something she adds from (release 2.2, spec →
// "Sets and the clean start"). Her «Продукти» list holds only her own rows;
// a database item becomes one — a copy with BasedOn = its B… ID — when she
// adds it from a set, picks it in a search (meal or recipe), or, moving over
// from before 2.2, when she has already used it.
//   • valuesFingerprint — the values a copy was made from, kept on the copy
//     (BasedOnValues) so a later database correction can be offered to it
//     while she hasn't changed it (builtInStatus.copyUpdates);
//   • usedDatabaseIds / fingerprintFills — the one-time move (pure);
//   • copyFromDatabase — writes the copies.
import { BUILT_IN_ALIASES, BUILT_IN_FOODS, entryToIngredient, verifiedEntry } from "../data/builtInFoods";
import type { DailyLogEntry } from "./dailyLog";
import type { Dish } from "./dishes";
import { addIngredient, mergeWithBuiltInFoods, type Ingredient } from "./ingredients";
import { isBuiltInId, normalizeItemName } from "./itemIds";

const VALUE_FIELDS = ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "caloriesKcal", "sodiumMg"] as const;

/** «79|73|1.3|0.1|7.1|0.7|365|5|» plus the unknown fields — what a copy's values were. */
export function valuesFingerprint(item: Pick<Ingredient, (typeof VALUE_FIELDS)[number] | "unknownFields">): string {
  const values = VALUE_FIELDS.map((f) => String(Math.round(item[f] * 100) / 100));
  return [...values, [...item.unknownFields].sort().join(",")].join("|");
}

/** The database item as her new row's fields (no ID yet), with the values it was made from. */
export function databaseCopyFields(entryId: string): Omit<Ingredient, "id" | "dateAdded" | "favorite" | "glycemicFlag"> | null {
  const entry = verifiedEntry(entryId);
  if (!entry) return null;
  const { id, dateAdded: _dateAdded, favorite: _favorite, glycemicFlag: _flag, ...fields } = entryToIngredient(entry);
  // The database's portion sizes are added when shown (mergeWithBuiltInFoods), so the copy keeps only hers.
  return { ...fields, basedOn: id, portionSizes: [], basedOnValues: valuesFingerprint(fields) };
}

/** Adds database items to her «Продукти» (one row each), in the given order. Unknown IDs are skipped. */
export async function copyFromDatabase(entryIds: readonly string[]): Promise<Ingredient[]> {
  const saved: Ingredient[] = [];
  for (const id of entryIds) {
    const fields = databaseCopyFields(id);
    if (fields) saved.push(await addIngredient(fields));
  }
  return saved;
}

/** The database items that already have her row: a copy (BasedOn), or a row under the item's name from before 1.6. */
export function coveredDatabaseIds(sheetIngredients: readonly Ingredient[]): Set<string> {
  const merged = mergeWithBuiltInFoods([...sheetIngredients]);
  const covered = new Set<string>();
  BUILT_IN_FOODS.forEach((item, i) => {
    if (merged[i] && merged[i].id !== item.id) covered.add(item.id);
  });
  return covered;
}

const DATABASE_ID_BY_NAME: ReadonlyMap<string, string> = new Map(
  BUILT_IN_FOODS.flatMap((item) => [item.nameUk, ...(BUILT_IN_ALIASES.get(item.id) ?? [])].map((name) => [normalizeItemName(name), item.id] as const)),
);

/**
 * The database items she has used — in a meal (by ID, or by name on rows from
 * before IDs) or in a recipe — that have no row of hers yet, in first-use
 * order. These become her rows when she moves to 2.2.
 */
export function usedDatabaseIds(
  logEntries: readonly Pick<DailyLogEntry, "itemId" | "itemName">[],
  dishes: readonly Pick<Dish, "ingredients">[],
  sheetIngredients: readonly Ingredient[],
): string[] {
  const covered = coveredDatabaseIds(sheetIngredients);
  const used: string[] = [];
  const add = (id: string | undefined) => {
    if (id && isBuiltInId(id) && verifiedEntry(id) && !covered.has(id) && !used.includes(id)) used.push(id);
  };
  for (const entry of logEntries) add(entry.itemId ? entry.itemId : DATABASE_ID_BY_NAME.get(normalizeItemName(entry.itemName)));
  for (const dish of dishes) for (const ref of dish.ingredients) add(ref.id ? ref.id : DATABASE_ID_BY_NAME.get(normalizeItemName(ref.nameUk)));
  return used;
}

/**
 * Her copies made before 2.2 that still hold today's database values: they get
 * the fingerprint, so later corrections can be offered. A copy that differs was
 * changed by her (or holds older values the 1.8 offer handles) and is left alone.
 */
export function fingerprintFills(sheetIngredients: readonly Ingredient[]): Ingredient[] {
  return sheetIngredients.flatMap((copy) => {
    if (!copy.basedOn || copy.basedOnValues) return [];
    const entry = verifiedEntry(copy.basedOn);
    if (!entry) return [];
    const current = valuesFingerprint(entryToIngredient(entry));
    return valuesFingerprint(copy) === current ? [{ ...copy, basedOnValues: current }] : [];
  });
}

/**
 * Database items picked in a search (a meal, a recipe line) that aren't hers
 * yet — a `B…` ID still listed as itself among the merged items — so saving
 * adds them to «Продукти» (2.2, "add on pick"). Links keep the `B…` ID: it
 * resolves to her copy through BasedOn.
 */
export function idsNeedingCopies(pickedIds: readonly string[], mergedItems: readonly { id: string }[]): string[] {
  const listedAsDatabase = new Set(mergedItems.filter((item) => isBuiltInId(item.id)).map((item) => item.id));
  return [...new Set(pickedIds.filter((id) => listedAsDatabase.has(id)))];
}
