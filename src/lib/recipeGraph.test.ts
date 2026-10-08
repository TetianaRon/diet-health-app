import { describe, expect, it } from "vitest";
import { carryUpward, containsItem, dishAsIngredient, recipeCandidates } from "./recipeGraph";
import type { Dish } from "./dishes";
import type { Ingredient } from "./ingredients";

function ingredient(id: string, carbsG: number, caloriesKcal: number, gi = 50): Ingredient {
  return {
    id, basedOn: "", nameUk: id, nameEn: "", carbsG, gi, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 0, caloriesKcal, sodiumMg: 0,
    source: "manual", dateAdded: "", favorite: false, glycemicFlag: "none", giVerified: false, unknownFields: [], giFrom: "",
    basis: "100g", valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [], labels: [],
  };
}

function dish(id: string, lines: [string, number][], yieldGrams: number, values: Partial<Dish> = {}): Dish {
  return {
    id, basedOn: "", nameUk: id, nameEn: "", ingredients: lines.map(([ref, grams]) => ({ id: ref, nameUk: ref, grams })),
    yieldGrams, basis: "100g", yieldPieces: null, weighedPieces: null, weighedGrams: null, portionSizes: [], labels: ["dish"],
    carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 0, caloriesKcal: 0, sodiumMg: 0,
    source: "manual", dateAdded: "", glycemicFlag: "none", giVerified: false, unknownFields: [], ...values,
  };
}

const oil = ingredient("I1", 0, 900, 0);
const egg = ingredient("I2", 1, 150, 0);
const potato = ingredient("I3", 17, 80, 80);
// Homemade mayonnaise (oil + egg), a potato salad with it, and a lunch with the salad.
const mayo = dish("D1", [["I1", 80], ["I2", 20]], 100, { caloriesKcal: 750, carbsG: 0.2 });
const salad = dish("D2", [["I3", 400], ["D1", 50]], 450, { caloriesKcal: 154.44, carbsG: 15.13 });
const lunch = dish("D3", [["D2", 200]], 200, { caloriesKcal: 154.44, carbsG: 15.13 });
const dishes = [mayo, salad, lunch];

describe("items inside recipes (2.1)", () => {
  it("finds an item through other recipes", () => {
    const byId = new Map(dishes.map((d) => [d.id, d]));
    expect(containsItem(lunch, "D1", byId)).toBe(true);
    expect(containsItem(mayo, "D3", byId)).toBe(false);
  });

  it("never offers a loop: not the item itself, nor anything already made with it", () => {
    expect(recipeCandidates("D1", dishes).map((d) => d.id)).toEqual([]);
    expect(recipeCandidates("D3", dishes).map((d) => d.id)).toEqual(["D1", "D2"]);
    expect(recipeCandidates(null, dishes)).toHaveLength(3);
  });

  it("uses a composed item as a recipe line with its own values", () => {
    expect(dishAsIngredient(mayo)).toMatchObject({ id: "D1", caloriesKcal: 750, basis: "100g", weighedPieces: null });
  });

  it("carries a change upward, inner items first, and only what changed", () => {
    // Lighter mayonnaise: 600 kcal per 100 g.
    const lighter = { ...mayo, caloriesKcal: 600 };
    const updated = carryUpward("D1", [lighter, salad, lunch], [oil, egg, potato]);
    expect(updated.map((d) => d.id)).toEqual(["D2", "D3"]);
    const newSalad = updated[0];
    expect(newSalad.caloriesKcal).toBeCloseTo((400 * 0.8 + 50 * 6) / 4.5, 2);
    expect(updated[1].caloriesKcal).toBeCloseTo(newSalad.caloriesKcal, 2);
    // Saving it again with the same values: nothing left to recalculate.
    const settled = [lighter, ...updated];
    expect(carryUpward("D1", settled, [oil, egg, potato])).toEqual([]);
  });

  it("also carries a typed item's change into the recipes that use it", () => {
    const settledSalad = carryUpward("D1", dishes, [oil, egg, potato]);
    const base = [mayo, ...settledSalad];
    const sweeterPotato = { ...potato, carbsG: 20 };
    const updated = carryUpward("I3", base, [oil, egg, sweeterPotato]);
    expect(updated.map((d) => d.id)).toEqual(["D2", "D3"]);
    expect(updated[0].carbsG).toBeGreaterThan(settledSalad[0].carbsG);
  });

  it("carries a piece weight only as a full pair (a batch weight alone isn't one)", () => {
    expect(dishAsIngredient({ ...mayo, yieldGrams: 80 })).toMatchObject({ weighedPieces: null, weighedGrams: null });
    expect(dishAsIngredient({ ...mayo, basis: "piece", yieldGrams: 400, yieldPieces: 10 })).toMatchObject({ weighedPieces: 10, weighedGrams: 400 });
  });
});
