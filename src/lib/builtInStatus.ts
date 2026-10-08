// Where a product's values stand against the verified food database
// (release 1.8). Pure, unit-tested.
//   • builtInMatch — the database entry whose values the product carries
//     exactly (a built-in item, or her saved copy that still matches it):
//     these show ⓘ; everything else is «неперевірено».
//   • copyUpdates — her saved copies (BasedOn = B…) that still hold the
//     pre-1.8 built-in values, i.e. she never changed them: these are offered
//     the verified values once («Для N продуктів є уточнені значення»).
//     Copies she edited are never offered or touched. The same goes for her
//     copies of the pre-1.8 built-in *dishes* (B0058–B0069, «Гречка варена»…),
//     whose IDs are products since 1.8 (dishCopyUpdates).
import type { Ingredient } from "./ingredients";
import type { Dish } from "./dishes";
import type { NutritionKey } from "./dishes";
import type { VerifiedFoodEntry } from "../data/verifiedFoods";
import { entryToIngredient, verifiedEntry } from "../data/builtInFoods";
import { LEGACY_BUILT_INS, type LegacyBuiltIn } from "../data/legacyBuiltIns";

const VALUE_FIELDS = ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "caloriesKcal", "sodiumMg"] as const;
const LEGACY_BY_ID = new Map(LEGACY_BUILT_INS.map((l) => [l.id, l]));

function sameValues(a: Pick<Ingredient, (typeof VALUE_FIELDS)[number]>, b: Pick<Ingredient, (typeof VALUE_FIELDS)[number]>): boolean {
  return VALUE_FIELDS.every((field) => Math.abs(a[field] - b[field]) < 0.01);
}

function sameUnknown(a: readonly NutritionKey[], b: readonly NutritionKey[]): boolean {
  return a.length === b.length && a.every((k) => b.includes(k));
}

/** The database entry this product's values come from unchanged, or null («неперевірено»). */
export function builtInMatch(item: Ingredient, lookup: (id: string) => VerifiedFoodEntry | null = verifiedEntry): VerifiedFoodEntry | null {
  const entry = lookup(item.basedOn || item.id);
  if (!entry) return null;
  const reference = entryToIngredient(entry);
  return sameValues(item, reference) && sameUnknown(item.unknownFields, reference.unknownFields) ? entry : null;
}

export interface CopyUpdate {
  copy: Ingredient;
  entry: VerifiedFoodEntry;
  /** The copy with the verified values — her ID, favourite and flag kept. */
  updated: Ingredient;
}

/** Her unchanged pre-1.8 copies that differ from the verified values now. */
export function copyUpdates(
  sheetIngredients: readonly Ingredient[],
  lookup: (id: string) => VerifiedFoodEntry | null = verifiedEntry,
  legacy: ReadonlyMap<string, LegacyBuiltIn> = LEGACY_BY_ID,
): CopyUpdate[] {
  const updates: CopyUpdate[] = [];
  for (const copy of sheetIngredients) {
    if (!copy.basedOn) continue;
    const old = legacy.get(copy.basedOn);
    const entry = lookup(copy.basedOn);
    if (!old || !entry || old.kind !== "food") continue;
    if (!sameValues(copy, old.values) || copy.unknownFields.length > 0) continue; // she changed it — hers to keep
    const fresh = entryToIngredient(entry);
    if (sameValues(copy, fresh) && sameUnknown(copy.unknownFields, fresh.unknownFields)) continue; // already current
    const renamed = copy.nameUk === old.nameUk; // a name she chose herself stays
    updates.push({
      copy,
      entry,
      updated: {
        ...copy,
        nameUk: renamed ? fresh.nameUk : copy.nameUk,
        nameEn: renamed ? fresh.nameEn : copy.nameEn,
        ...Object.fromEntries(VALUE_FIELDS.map((f) => [f, fresh[f]])),
        unknownFields: fresh.unknownFields,
        // Her "I checked this GI" was about the old value.
        giVerified: copy.giVerified && copy.gi === fresh.gi,
      } as Ingredient,
    });
  }
  return updates;
}

export interface DishCopyUpdate {
  copy: Dish;
  entry: VerifiedFoodEntry;
  /** The copy as "100 g of the verified product, 100 g finished" — values and recipe agree if it's ever recalculated. */
  updated: Dish;
}

/** Her unchanged copies of the pre-1.8 built-in dishes, brought to the verified cooked product. */
export function dishCopyUpdates(
  sheetDishes: readonly Dish[],
  lookup: (id: string) => VerifiedFoodEntry | null = verifiedEntry,
  legacy: ReadonlyMap<string, LegacyBuiltIn> = LEGACY_BY_ID,
): DishCopyUpdate[] {
  const updates: DishCopyUpdate[] = [];
  for (const copy of sheetDishes) {
    if (!copy.basedOn) continue;
    const old = legacy.get(copy.basedOn);
    const entry = lookup(copy.basedOn);
    if (!old || !entry || old.kind !== "dish") continue;
    if (!sameValues(copy, old.values) || copy.unknownFields.length > 0) continue; // she changed it — hers to keep
    const fresh = entryToIngredient(entry);
    const renamed = copy.nameUk === old.nameUk;
    updates.push({
      copy,
      entry,
      updated: {
        ...copy,
        nameUk: renamed ? fresh.nameUk : copy.nameUk,
        nameEn: renamed ? fresh.nameEn : copy.nameEn,
        ingredients: [{ id: fresh.id, nameUk: fresh.nameUk, grams: 100 }],
        yieldGrams: 100,
        basis: "100g",
        yieldPieces: null,
        portionSizes: copy.portionSizes ?? [],
        ...Object.fromEntries(VALUE_FIELDS.map((f) => [f, fresh[f]])),
        unknownFields: fresh.unknownFields,
        giVerified: copy.giVerified && copy.gi === fresh.gi,
      } as Dish,
    });
  }
  return updates;
}

/**
 * The database entry her item's GI was taken from (a GI suggestion, 1.9), if
 * the GI still equals that entry's — a GI she changed afterwards has no source.
 */
export function giSourceEntry(item: Ingredient, lookup: (id: string) => VerifiedFoodEntry | null = verifiedEntry): VerifiedFoodEntry | null {
  if (!item.giFrom || item.unknownFields.includes("gi")) return null;
  const entry = lookup(item.giFrom);
  return entry && entry.gi.value !== null && entry.gi.value === item.gi ? entry : null;
}
