import { describe, expect, it } from "vitest";
import {
  computeDishNutrition,
  computeDishUnknownFields,
  unknownGiCarbShare,
  dishesUsingIngredient,
  dishContainsFlaggedIngredient,
  dishToRow,
  parseUnknownNutritionFields,
  rowToDish,
  type Dish,
  type IngredientNutrition,
  type NutritionKey,
} from "./dishes";
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

    const lookup = ({ nameUk: name }: { nameUk: string }) => (name === "A" ? highCarbHighGi : lowCarbLowGi);
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
      ({ nameUk: name }) => (name === "Гречка суха" ? BUCKWHEAT_RAW : null),
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
      id: "D1",
      basedOn: "",
      nameUk: "Гречка варена",
      nameEn: "buckwheat, cooked",
      ingredients: [{ nameUk: "Гречка суха", grams: 100 }],
      yieldGrams: 360, basis: "100g" as const, yieldPieces: null, portionSizes: [],
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
      unknownFields: [],
    };

    expect(rowToDish(dishToRow(dish))).toEqual(dish);
  });

  it("still round-trips correctly when the sheet's own columns are reordered", () => {
    const dish: Dish = {
      id: "D1",
      basedOn: "",
      nameUk: "Гречка варена",
      nameEn: "buckwheat, cooked",
      ingredients: [{ nameUk: "Гречка суха", grams: 100 }],
      yieldGrams: 360, basis: "100g" as const, yieldPieces: null, portionSizes: [],
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
      unknownFields: [],
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
      "BasedOn",
      "Id",
    ]);
    expect(rowToDish(dishToRow(dish, reordered), reordered)).toEqual(dish);
  });

  it("defaults an unrecognized Source to manual", () => {
    const dish: Dish = {
      id: "D1",
      basedOn: "",
      nameUk: "Борщ",
      nameEn: "borscht",
      ingredients: [],
      yieldGrams: 1000, basis: "100g" as const, yieldPieces: null, portionSizes: [],
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
      unknownFields: [],
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
    id: "D1",
    basedOn: "",
    nameUk: "Борщ",
    nameEn: "borscht",
    ingredients: [
      { nameUk: "Буряк", grams: 100 },
      { nameUk: "Картопля", grams: 100 },
    ],
    yieldGrams: 500, basis: "100g" as const, yieldPieces: null, portionSizes: [],
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
    unknownFields: [],
  };

  it("is true when any referenced ingredient currently resolves to watch or avoid", () => {
    const lookup = ({ nameUk: name }: { nameUk: string }) => (name === "Картопля" ? "avoid" : "none");
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

describe("parseUnknownNutritionFields", () => {
  it("treats a blank or missing cell as nothing unknown (old rows stay valid)", () => {
    expect(parseUnknownNutritionFields("")).toEqual([]);
    expect(parseUnknownNutritionFields(undefined)).toEqual([]);
  });

  it("parses known names in canonical order and drops anything unrecognized", () => {
    expect(parseUnknownNutritionFields("caloriesKcal, gi ,bogus,carbsG")).toEqual(["carbsG", "gi", "caloriesKcal"]);
  });
});

describe("unknownFields round-trip through a Dishes row", () => {
  it("persists which fields were left blank", () => {
    const dish: Dish = { ...rowToDish([]), nameUk: "Суп", unknownFields: ["gi", "sodiumMg"] };
    expect(rowToDish(dishToRow(dish)).unknownFields).toEqual(["gi", "sodiumMg"]);
  });
});

describe("computeDishUnknownFields", () => {
  type Ing = IngredientNutrition & { unknownFields: NutritionKey[] };
  const known: Ing = { ...BUCKWHEAT_RAW, unknownFields: [] };
  const lookup = (table: Record<string, Ing>) => ({ nameUk: name }: { nameUk: string }) => table[name] ?? null;

  it("is empty when every ingredient is fully known", () => {
    expect(computeDishUnknownFields([{ nameUk: "A", grams: 100 }], lookup({ A: known }))).toEqual([]);
  });

  it("inherits a field an ingredient left unknown", () => {
    const result = computeDishUnknownFields(
      [
        { nameUk: "A", grams: 100 },
        { nameUk: "B", grams: 50 },
      ],
      lookup({ A: known, B: { ...known, unknownFields: ["fatG"] } }),
    );
    expect(result).toEqual(["fatG"]);
  });

  it("keeps the dish GI when unknown-GI ingredients bring at most 5% of the carbs (e.g. garlic in soup)", () => {
    const garlic: Ing = { ...known, carbsG: 33, unknownFields: ["gi"] };
    // 100 g buckwheat (≈72 g carbs) + 5 g garlic (≈1.7 g carbs) → about 2% of the carbs
    const refs = [
      { nameUk: "A", grams: 100 },
      { nameUk: "G", grams: 5 },
    ];
    expect(computeDishUnknownFields(refs, lookup({ A: known, G: garlic }))).toEqual([]);
    expect(unknownGiCarbShare(refs, lookup({ A: known, G: garlic }))).toBeGreaterThan(0);
    // …but not when they bring more
    expect(computeDishUnknownFields([{ nameUk: "A", grams: 10 }, { nameUk: "G", grams: 50 }], lookup({ A: known, G: garlic }))).toEqual(["gi"]);
  });

  it("leaves an unknown GI out of the dish GI average instead of counting it as 0", () => {
    const garlic = { ...BUCKWHEAT_RAW, carbsG: 33, gi: 0, unknownFields: ["gi"] as NutritionKey[] };
    const result = computeDishNutrition(
      [
        { nameUk: "A", grams: 100 },
        { nameUk: "G", grams: 5 },
      ],
      100,
      ({ nameUk }) => (nameUk === "A" ? BUCKWHEAT_RAW : garlic),
    );
    expect(result.gi).toBe(BUCKWHEAT_RAW.gi);
  });

  it("makes the dish GI unknown when a carb-bearing ingredient's GI is unknown", () => {
    const result = computeDishUnknownFields([{ nameUk: "A", grams: 100 }], lookup({ A: { ...known, unknownFields: ["gi"] } }));
    expect(result).toEqual(["gi"]);
  });

  it("does not make GI unknown for a zero-carb ingredient with no GI (nothing to weight)", () => {
    const meat: Ing = { ...known, carbsG: 0, unknownFields: ["gi"] };
    expect(computeDishUnknownFields([{ nameUk: "M", grams: 100 }], lookup({ M: meat }))).toEqual([]);
  });

  it("makes GI unknown when an ingredient's carbs are unknown, since GI is carb-weighted", () => {
    const result = computeDishUnknownFields([{ nameUk: "A", grams: 100 }], lookup({ A: { ...known, unknownFields: ["carbsG"] } }));
    expect(result).toEqual(["carbsG", "gi"]);
  });
});

describe("dishesUsingIngredient", () => {
  const dish = (id: string, refs: { id?: string; nameUk: string }[]) =>
    ({ id, ingredients: refs.map((r) => ({ ...r, grams: 100 })) }) as unknown as Parameters<typeof dishesUsingIngredient>[1][number];

  it("finds dishes that use the product by ID, or by name for old lines without an ID", () => {
    const dishes = [dish("D1", [{ id: "I3", nameUk: "Гречка" }]), dish("D2", [{ nameUk: "гречка " }]), dish("D3", [{ id: "I4", nameUk: "Рис" }])];
    expect(dishesUsingIngredient({ id: "I3", nameUk: "Гречка" }, dishes).map((d) => d.id)).toEqual(["D1", "D2"]);
  });

  it("doesn't count a line that points at the built-in item her copy stands for", () => {
    expect(dishesUsingIngredient({ id: "I3", nameUk: "Гречка суха" }, [dish("D1", [{ id: "B0001", nameUk: "Гречка суха" }])])).toEqual([]);
  });
});
