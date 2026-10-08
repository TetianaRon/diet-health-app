// The app's built-in products, read from the verified food database
// (verified-foods.json, release 1.8). Each database entry becomes an
// Ingredient the lists, pickers and dish composer already understand; the
// entry itself stays available (verifiedEntry) for the ⓘ details — source,
// reliability, reason and date per part.
//
// GI status → app values (spec → "Verified food database"):
//   measured, conventional («умовне») → the value (conventional is 15);
//   notApplicable («не застосовується») → 0, a real zero: no carbohydrate, GL 0;
//   unknown («немає даних») → 0 marked unknown, so GL leaves it out with the
//   usual missing-values warning.
import file from "./verified-foods.json";
import type { Ingredient } from "../lib/ingredients";
import type { NutritionKey } from "../lib/dishes";
import type { VerifiedFoodEntry, VerifiedFoodsFile } from "./verifiedFoods";
import { LEGACY_BUILT_INS } from "./legacyBuiltIns";
import type { PortionSize } from "../lib/portionSizes";

const DATABASE = file as VerifiedFoodsFile;

export const VERIFIED_SOURCES = DATABASE.sources;

/** Pure: one database entry as a built-in Ingredient. */
export function entryToIngredient(entry: VerifiedFoodEntry): Ingredient {
  const n = entry.nutrients.per100g;
  const unknownFields: NutritionKey[] = [...(entry.nutrients.unknown ?? [])];
  if (entry.gi.status === "unknown") unknownFields.push("gi");
  return {
    id: entry.id,
    basedOn: "",
    nameUk: entry.nameUk,
    nameEn: entry.nameEn,
    carbsG: n.carbsG,
    gi: entry.gi.value ?? 0,
    fiberG: n.fiberG,
    sugarsG: n.sugarsG,
    proteinG: n.proteinG,
    fatG: n.fatG,
    caloriesKcal: n.caloriesKcal,
    sodiumMg: n.sodiumMg,
    source: "starter",
    dateAdded: "",
    favorite: false,
    glycemicFlag: "none",
    giVerified: false,
    unknownFields,
    giFrom: "",
    basis: "100g",
    valuesPer: null,
    weighedPieces: null,
    weighedGrams: null,
    portionSizes: databasePortionSizes(entry),
  };
}

/** The database's portion sizes for an entry (2.0.2), marked as database sizes (ⓘ). */
export function databasePortionSizes(entry: VerifiedFoodEntry | null): PortionSize[] {
  return (entry?.portions ?? []).map((p) => ({ label: p.labelUk, grams: p.grams, fromDatabase: true }));
}

const ACTIVE = DATABASE.entries.filter((e) => e.status === "active");
const BY_ID = new Map(DATABASE.entries.map((e) => [e.id, e]));

/** Every active built-in product, in database order. */
export const BUILT_IN_FOODS: readonly Ingredient[] = ACTIVE.map(entryToIngredient);

/** The database entry behind a built-in ID (for ⓘ), or null for the user's own items. */
export function verifiedEntry(id: string): VerifiedFoodEntry | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Earlier names of built-in items (before 1.8 they had other names), so a
 * sheet row saved under an old name is still recognised as that item.
 */
export const BUILT_IN_ALIASES: ReadonlyMap<string, readonly string[]> = new Map(
  LEGACY_BUILT_INS.map((legacy) => [legacy.id, [legacy.nameUk]]),
);
