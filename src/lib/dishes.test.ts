import { describe, expect, it } from "vitest";
import { computeDishNutrition, dishContainsFlaggedIngredient, dishToRow, rowToDish, type Dish, type IngredientNutrition } from "./dishes";
import { buildColumnIndex } from "./sheetRow";

const BUCKWHEAT_RAW: IngredientNutrition = {
  carbsG: 71.5,
  gi: 54,
  fiberG: 10,
  sugarsG: 0,
  proteinG: 13.2,
  fatG: 3.4,
  caloriesKcal: 343,
  sodiumMg: 1,
};

describe("computeDishNutrition", () => {
  it("dilutes a single ingredient's per-100g values by the cooking yield", () => {
    // 100g raw buckwheat -> 360g cooked: per-100g-cooked should be raw / 3.6
    const result = computeDishNutrition([{ nameUk: "Гречка суха", grams: 100 }], 360, () => BUCKWHEAT_RAW);

    expect(result.carbsG).toBeCloseTo(71.5 / 3.6, 1);
    expect(result.caloriesKcal).toBeCloseTo(343 / 3.6, 0);
    // Single ingredient: GI passes through unchanged regardless of yield.
    expect(result.gi).toBe(54);
  });

  it("reduces to the raw ingredient's values when yield equals input weight (no dilution)", () => {
    const result = computeDishNutrition([{ nameUk: "Гречка суха", grams: 100 }], 100, () => BUCKWHEAT_RAW);
    expect(result.carbsG).toBe(71.5);
    expect(result.caloriesKcal).toBe(343);
  });

  it("computes a carb-contribution-weighted average GI across multiple ingredients", () => {
    const highCarbHighGi: IngredientNutrition = {
      carbsG: 80,
      gi: 90,
      fiberG: 0,
      sugarsG: 0,
      proteinG: 0,
      fatG: 0,
      caloriesKcal: 300,
      sodiumMg: 0,
    };
    const lowCarbLowGi: IngredientNutrition = {
      carbsG: 5,
      gi: 15,
      fiberG: 0,
      sugarsG: 0,
      proteinG: 0,
      fatG: 0,
      caloriesKcal: 20,
      sodiumMg: 0,
    };

    const lookup = (name: string) => (name === "A" ? highCarbHighGi : lowCarbLowGi);
    // 100g of A (80g carbs) + 100g of B (5g carbs) -> GI should be heavily weighted toward A's 90.
    const result = computeDishNutrition(
      [
        { nameUk: "A", grams: 100 },
        { nameUk: "B", grams: 100 },
      ],
      200,
      lookup,
    );

    const expectedGi = (80 * 90 + 5 * 15) / (80 + 5);
    expect(result.gi).toBe(Math.round(expectedGi));
  });

  it("skips ingredients that don't resolve, rather than throwing", () => {
    const result = computeDishNutrition(
      [
        { nameUk: "Гречка суха", grams: 100 },
        { nameUk: "Невідомий інгредієнт", grams: 50 },
      ],
      360,
      (name) => (name === "Гречка суха" ? BUCKWHEAT_RAW : null),
    );
    expect(result.carbsG).toBeCloseTo(71.5 / 3.6, 1);
  });

  it("returns all zeros for an empty ingredient list", () => {
    const result = computeDishNutrition([], 100, () => null);
    expect(result).toEqual({
      carbsG: 0,
      fiberG: 0,
      sugarsG: 0,
      proteinG: 0,
      fatG: 0,
      caloriesKcal: 0,
      sodiumMg: 0,
      gi: 0,
    });
  });
});

describe("rowToDish / dishToRow", () => {
  it("round-trips through JSON-encoded ingredients", () => {
    const dish: Dish = {
      nameUk: "Гречка варена",
      nameEn: "buckwheat, cooked",
      ingredients: [{ nameUk: "Гречка суха", grams: 100 }],
      yieldGrams: 360,
      carbsG: 19.86,
      gi: 54,
      fiberG: 2.78,
      sugarsG: 0,
      proteinG: 3.67,
      fatG: 0.94,
      caloriesKcal: 95.28,
      sodiumMg: 0.28,
      source: "starter",
      dateAdded: "2026-08-13",
      glycemicFlag: "watch",
      giVerified: true,
    };

    expect(rowToDish(dishToRow(dish))).toEqual(dish);
  });

  it("still round-trips correctly when the sheet's own columns are reordered", () => {
    const dish: Dish = {
      nameUk: "Гречка варена",
      nameEn: "buckwheat, cooked",
      ingredients: [{ nameUk: "Гречка суха", grams: 100 }],
      yieldGrams: 360,
      carbsG: 19.86,
      gi: 54,
      fiberG: 2.78,
      sugarsG: 0,
      proteinG: 3.67,
      fatG: 0.94,
      caloriesKcal: 95.28,
      sodiumMg: 0.28,
      source: "starter",
      dateAdded: "2026-08-13",
      glycemicFlag: "watch",
      giVerified: true,
    };
    // Mirrors a sheet where GI and YieldGrams got swapped.
    const reordered = buildColumnIndex([
      "NameUk",
      "NameEn",
      "IngredientsJson",
      "GI",
      "Carbs_g",
      "YieldGrams",
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
    ]);
    expect(rowToDish(dishToRow(dish, reordered), reordered)).toEqual(dish);
  });

  it("defaults an unrecognized Source to manual", () => {
    const dish: Dish = {
      nameUk: "Борщ",
      nameEn: "borscht",
      ingredients: [],
      yieldGrams: 1000,
      carbsG: 5,
      gi: 40,
      fiberG: 1,
      sugarsG: 1,
      proteinG: 1,
      fatG: 1,
      caloriesKcal: 50,
      sodiumMg: 100,
      source: "manual",
      dateAdded: "2026-08-13",
      glycemicFlag: "none",
      giVerified: false,
    };
    expect(rowToDish(dishToRow(dish)).source).toBe("manual");
  });

  it("tolerates malformed IngredientsJson", () => {
    const row = [
      "Зіпсована страва",
      "broken dish",
      "not json",
      "100",
      "10",
      "50",
      "1",
      "1",
      "1",
      "1",
      "50",
      "5",
      "starter",
      "2026-08-13",
    ];
    expect(rowToDish(row).ingredients).toEqual([]);
  });
});

describe("dishContainsFlaggedIngredient", () => {
  const baseDish: Dish = {
    nameUk: "Борщ",
    nameEn: "borscht",
    ingredients: [
      { nameUk: "Буряк", grams: 100 },
      { nameUk: "Картопля", grams: 100 },
    ],
    yieldGrams: 500,
    carbsG: 5,
    gi: 40,
    fiberG: 1,
    sugarsG: 1,
    proteinG: 1,
    fatG: 1,
    caloriesKcal: 50,
    sodiumMg: 100,
    source: "manual",
    dateAdded: "2026-08-13",
    glycemicFlag: "none",
    giVerified: false,
  };

  it("is true when any referenced ingredient currently resolves to watch or avoid", () => {
    const lookup = (name: string) => (name === "Картопля" ? "avoid" : "none");
    expect(dishContainsFlaggedIngredient(baseDish, lookup)).toBe(true);
  });

  it("is false when no referenced ingredient is flagged", () => {
    expect(dishContainsFlaggedIngredient(baseDish, () => "none")).toBe(false);
  });

  it("is false when a referenced ingredient no longer resolves at all", () => {
    expect(dishContainsFlaggedIngredient(baseDish, () => null)).toBe(false);
  });

  it("does not depend on the dish's own explicit glycemicFlag", () => {
    const flaggedDish: Dish = { ...baseDish, glycemicFlag: "avoid" };
    expect(dishContainsFlaggedIngredient(flaggedDish, () => "none")).toBe(false);
  });
});
