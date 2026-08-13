import { describe, expect, it } from "vitest";
import { ingredientToRow, rowToIngredient, type Ingredient } from "./ingredients";

describe("rowToIngredient", () => {
  it("maps a full row in column order", () => {
    const row = ["Гречка", "buckwheat, cooked", "19.9", "54", "2.7", "0.9", "3.4", "0.6", "92", "4", "starter", "2026-08-13"];

    expect(rowToIngredient(row)).toEqual({
      nameUk: "Гречка",
      nameEn: "buckwheat, cooked",
      carbsG: 19.9,
      gi: 54,
      fiberG: 2.7,
      sugarsG: 0.9,
      proteinG: 3.4,
      fatG: 0.6,
      caloriesKcal: 92,
      sodiumMg: 4,
      source: "starter",
      dateAdded: "2026-08-13",
    });
  });

  it("defaults unparseable numbers to 0 and unknown source to manual", () => {
    const row = ["Тест", "test", "", undefined, "n/a", "0.9", "3.4", "0.6", "92", "4", "weird", "2026-08-13"];

    const result = rowToIngredient(row);

    expect(result.carbsG).toBe(0);
    expect(result.gi).toBe(0);
    expect(result.fiberG).toBe(0);
    expect(result.source).toBe("manual");
  });
});

describe("ingredientToRow", () => {
  it("round-trips through rowToIngredient", () => {
    const ingredient: Ingredient = {
      nameUk: "Кефір",
      nameEn: "kefir, low-fat",
      carbsG: 4.0,
      gi: 32,
      fiberG: 0,
      sugarsG: 4.0,
      proteinG: 3.4,
      fatG: 1.0,
      caloriesKcal: 41,
      sodiumMg: 40,
      source: "starter",
      dateAdded: "2026-08-13",
    };

    expect(rowToIngredient(ingredientToRow(ingredient))).toEqual(ingredient);
  });
});
