// Items inside recipes (release 2.1, spec → "One product list (2.1)"): any
// item can be a recipe line, composed ones included (homemade mayonnaise in a
// salad). Two rules come with that:
//   - no loops: an item can't contain itself, directly or through another recipe;
//   - changes carry upward: saving a composed item recalculates every item
//     made with it, and those made with them, inner ones first.
// Pure, so it's unit-tested.
import type { Ingredient } from "./ingredients";
import { computeDishNutrition, computeDishUnknownFields, itemMeasure, type Dish, type DishIngredientRef } from "./dishes";

/**
 * A composed item seen as a recipe line or as a typed item (same ID): its
 * current values, with the measure its yield gives it (per 100 g, or per piece
 * with the piece weight when known).
 */
export function dishAsIngredient(dish: Dish): Ingredient {
  const measure = itemMeasure(dish);
  return {
    id: dish.id,
    basedOn: dish.basedOn,
    nameUk: dish.nameUk,
    nameEn: dish.nameEn,
    carbsG: dish.carbsG,
    gi: dish.gi,
    fiberG: dish.fiberG,
    sugarsG: dish.sugarsG,
    proteinG: dish.proteinG,
    fatG: dish.fatG,
    caloriesKcal: dish.caloriesKcal,
    sodiumMg: dish.sodiumMg,
    source: "manual",
    dateAdded: dish.dateAdded,
    favorite: false,
    glycemicFlag: dish.glycemicFlag,
    giVerified: false,
    unknownFields: dish.unknownFields,
    giFrom: "",
    basis: measure.basis,
    valuesPer: null,
    // Only a full pair: a batch weight without a count isn't a piece weight.
    weighedPieces: measure.weighedPieces && measure.weighedGrams ? measure.weighedPieces : null,
    weighedGrams: measure.weighedPieces && measure.weighedGrams ? measure.weighedGrams : null,
    portionSizes: dish.portionSizes,
    labels: dish.labels,
  };
}

/** Whether `dish` contains the item `targetId`, directly or through other composed items. */
export function containsItem(dish: Dish, targetId: string, dishesById: ReadonlyMap<string, Dish>, seen: Set<string> = new Set()): boolean {
  if (seen.has(dish.id)) return false;
  seen.add(dish.id);
  for (const ref of dish.ingredients) {
    if (!ref.id) continue;
    if (ref.id === targetId) return true;
    const inner = dishesById.get(ref.id);
    if (inner && containsItem(inner, targetId, dishesById, seen)) return true;
  }
  return false;
}

/**
 * The composed items that can go into the recipe of `editingId` (null for a
 * new item): every one except itself and those that already contain it — the
 * picker leaves those out, so a loop can't be made.
 */
export function recipeCandidates(editingId: string | null, dishes: readonly Dish[]): Dish[] {
  if (!editingId) return [...dishes];
  const byId = new Map(dishes.map((d) => [d.id, d]));
  return dishes.filter((d) => d.id !== editingId && !containsItem(d, editingId, byId));
}

/** Recalculates a composed item from its recipe (the composer's own maths). */
export function recomputeDish(dish: Dish, lookup: (ref: DishIngredientRef) => Ingredient | null): Dish {
  const nutrition = computeDishNutrition(dish.ingredients, dish.yieldGrams, lookup, dish.basis === "piece" ? dish.yieldPieces : null);
  return { ...dish, ...nutrition, unknownFields: computeDishUnknownFields(dish.ingredients, lookup) };
}

const VALUE_KEYS = ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "caloriesKcal", "sodiumMg"] as const;

/**
 * After the item `changedId` is saved (typed or composed): every composed item
 * made with it, recalculated, inner ones first — only those whose values
 * actually changed. `dishes` and `ingredients` (the typed items, database and
 * hers) already hold the saved item.
 */
export function carryUpward(changedId: string, dishes: readonly Dish[], ingredients: readonly Ingredient[]): Dish[] {
  const current = new Map(dishes.map((d) => [d.id, d]));
  const typedById = new Map(ingredients.map((i) => [i.id, i]));
  const lookup = (ref: DishIngredientRef): Ingredient | null => {
    if (!ref.id) return null;
    const dish = current.get(ref.id);
    return dish ? dishAsIngredient(dish) : (typedById.get(ref.id) ?? null);
  };
  const updated: Dish[] = [];
  let frontier = new Set([changedId]);
  // Breadth-first by distance from the change; a dish reached again later is recalculated again with the newer values.
  for (let depth = 0; frontier.size > 0 && depth < dishes.length + 1; depth++) {
    const next = new Set<string>();
    for (const dish of current.values()) {
      if (dish.id === changedId) continue;
      if (!dish.ingredients.some((ref) => ref.id && frontier.has(ref.id))) continue;
      const recalculated = recomputeDish(dish, lookup);
      if (VALUE_KEYS.some((k) => recalculated[k] !== dish[k]) || recalculated.unknownFields.join() !== dish.unknownFields.join()) {
        current.set(dish.id, recalculated);
        const i = updated.findIndex((d) => d.id === dish.id);
        if (i === -1) updated.push(recalculated);
        else updated[i] = recalculated;
        next.add(dish.id);
      }
    }
    frontier = next;
  }
  return updated;
}
