import { describe, expect, it } from "vitest";
import { ingredientToRow, mergeWithStarterFoods, rowToIngredient, sortFavoritesFirst, type Ingredient } from "./ingredients";
import { buildColumnIndex } from "./sheetRow";
import { STARTER_FOODS } from "../data/starter-foods";

describe("rowToIngredient", () => {
  it("maps a full row in column order", () => {
    const row = [
      "Гречка",
      "buckwheat, cooked",
      "19.9",
      "54",
      "2.7",
      "0.9",
      "3.4",
      "0.6",
      "92",
      "4",
      "starter",
      "2026-08-13",
      "TRUE",
      "watch",
      "TRUE",
    ];

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
      favorite: true,
      glycemicFlag: "watch",
      giVerified: true,
    });
  });

  it("defaults unparseable numbers to 0, unknown source to manual, and missing favorite to false", () => {
    const row = ["Тест", "test", "", undefined, "n/a", "0.9", "3.4", "0.6", "92", "4", "weird", "2026-08-13"];

    const result = rowToIngredient(row);

    expect(result.carbsG).toBe(0);
    expect(result.gi).toBe(0);
    expect(result.fiberG).toBe(0);
    expect(result.source).toBe("manual");
    expect(result.favorite).toBe(false);
    expect(result.glycemicFlag).toBe("none");
    expect(result.giVerified).toBe(false);
  });
});

describe("ingredientToRow", () => {
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
    favorite: false,
    glycemicFlag: "none",
    giVerified: false,
  };

  it("round-trips through rowToIngredient", () => {
    expect(rowToIngredient(ingredientToRow(ingredient))).toEqual(ingredient);
  });

  it("still round-trips correctly when the sheet's own columns are reordered", () => {
    // Mirrors a sheet where GI and Carbs_g got swapped, e.g. by someone
    // manually dragging a column in the Google Sheets UI.
    const reordered = buildColumnIndex([
      "NameUk",
      "NameEn",
      "GI",
      "Carbs_g",
      "Fiber_g",
      "Sugars_g",
      "Protein_g",
      "Fat_g",
      "Calories_kcal",
      "Sodium_mg",
      "Source",
      "DateAdded",
      "Favorite",
      "GlycemicFlag",
      "GiVerified",
    ]);
    const row = ingredientToRow(ingredient, reordered);
    expect(row[2]).toBe(32); // GI now in column C
    expect(row[3]).toBe(4.0); // Carbs_g now in column D
    expect(rowToIngredient(row, reordered)).toEqual(ingredient);
  });
});

describe("sortFavoritesFirst", () => {
  const base = {
    nameEn: "",
    carbsG: 0,
    gi: 0,
    fiberG: 0,
    sugarsG: 0,
    proteinG: 0,
    fatG: 0,
    caloriesKcal: 0,
    sodiumMg: 0,
    source: "manual" as const,
    dateAdded: "2026-08-13",
    glycemicFlag: "none" as const,
    giVerified: false,
  };

  it("moves favorites to the front, preserving relative order within each group", () => {
    const items: Ingredient[] = [
      { ...base, nameUk: "A", favorite: false },
      { ...base, nameUk: "B", favorite: true },
      { ...base, nameUk: "C", favorite: false },
      { ...base, nameUk: "D", favorite: true },
    ];

    expect(sortFavoritesFirst(items).map((i) => i.nameUk)).toEqual(["B", "D", "A", "C"]);
  });

  it("does not mutate the input array", () => {
    const items: Ingredient[] = [
      { ...base, nameUk: "A", favorite: false },
      { ...base, nameUk: "B", favorite: true },
    ];
    sortFavoritesFirst(items);
    expect(items.map((i) => i.nameUk)).toEqual(["A", "B"]);
  });
});

describe("mergeWithStarterFoods", () => {
  it("includes the whole bundle when the personal sheet is empty", () => {
    const merged = mergeWithStarterFoods([]);
    expect(merged).toHaveLength(STARTER_FOODS.length);
    expect(merged.every((i) => i.source === "starter" && i.dateAdded === "" && i.favorite === false)).toBe(true);
  });

  it("lets a sheet row override the bundle default for the same name (e.g. a favorited or edited entry)", () => {
    const bundleEntry = STARTER_FOODS[0];
    const savedVersion: Ingredient = {
      nameUk: bundleEntry.nameUk,
      nameEn: bundleEntry.nameEn,
      carbsG: bundleEntry.carbsG,
      gi: bundleEntry.gi,
      fiberG: bundleEntry.fiberG,
      sugarsG: bundleEntry.sugarsG,
      proteinG: bundleEntry.proteinG,
      fatG: bundleEntry.fatG,
      caloriesKcal: bundleEntry.caloriesKcal,
      sodiumMg: bundleEntry.sodiumMg,
      source: "starter",
      dateAdded: "2026-08-13",
      favorite: true,
      glycemicFlag: "none",
      giVerified: false,
    };

    const merged = mergeWithStarterFoods([savedVersion]);
    const result = merged.find((i) => i.nameUk === bundleEntry.nameUk);
    expect(result?.favorite).toBe(true);
    expect(result?.dateAdded).toBe("2026-08-13");
    expect(merged).toHaveLength(STARTER_FOODS.length);
  });

  it("includes sheet-only ingredients not in the bundle", () => {
    const custom: Ingredient = {
      nameUk: "Дуже рідкісний продукт",
      nameEn: "rare food",
      carbsG: 1,
      gi: 1,
      fiberG: 1,
      sugarsG: 1,
      proteinG: 1,
      fatG: 1,
      caloriesKcal: 1,
      sodiumMg: 1,
      source: "manual",
      dateAdded: "2026-08-13",
      favorite: false,
      glycemicFlag: "none",
      giVerified: false,
    };
    const merged = mergeWithStarterFoods([custom]);
    expect(merged).toHaveLength(STARTER_FOODS.length + 1);
    expect(merged.some((i) => i.nameUk === "Дуже рідкісний продукт")).toBe(true);
  });
});
