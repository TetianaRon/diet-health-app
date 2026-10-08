import { describe, expect, it } from "vitest";
import { ingredientToRow, mergeWithBuiltInFoods, rowToIngredient, sortFavoritesFirst, type Ingredient } from "./ingredients";
import { buildColumnIndex } from "./sheetRow";
import { BUILT_IN_FOODS } from "../data/builtInFoods";

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
      id: "",
      basedOn: "",
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
      unknownFields: [],
      giFrom: "", basis: "100g" as const, valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [],
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

describe("rowToIngredient with stored values (not display text)", () => {
  it("reads real numbers and booleans as Sheets returns them", () => {
    const row = ["Гречка суха", "buckwheat, raw", 71.5, 50, 10, 0, 13.2, 3.4, 343, 1, "starter", "2026-10-01", true, "none", false, ""];
    const ingredient = rowToIngredient(row);
    expect(ingredient.carbsG).toBe(71.5);
    expect(ingredient.proteinG).toBe(13.2);
    expect(ingredient.favorite).toBe(true);
    expect(ingredient.giVerified).toBe(false);
  });
});

describe("ingredientToRow", () => {
  const ingredient: Ingredient = {
    id: "I1",
    basedOn: "",
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
    unknownFields: [],
    giFrom: "", basis: "100g" as const, valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [],
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
      "BasedOn",
      "Id",
    ]);
    const row = ingredientToRow(ingredient, reordered);
    expect(row[2]).toBe(32); // GI now in column C
    expect(row[3]).toBe(4.0); // Carbs_g now in column D
    expect(rowToIngredient(row, reordered)).toEqual(ingredient);
  });
});

describe("sortFavoritesFirst", () => {
  const base = {
    id: "I1",
    basedOn: "",
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
    unknownFields: [],
    giFrom: "", basis: "100g" as const, valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [],
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

describe("mergeWithBuiltInFoods", () => {
  it("includes the whole bundle when the personal sheet is empty", () => {
    const merged = mergeWithBuiltInFoods([]);
    expect(merged).toHaveLength(BUILT_IN_FOODS.length);
    expect(merged.every((i) => i.source === "starter" && i.dateAdded === "" && i.favorite === false)).toBe(true);
  });

  it("lets a sheet row override the bundle default for the same name (e.g. a favorited or edited entry)", () => {
    const bundleEntry = BUILT_IN_FOODS[0];
    const savedVersion: Ingredient = {
      id: "I1",
      basedOn: "",
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
      unknownFields: [],
      giFrom: "", basis: "100g" as const, valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [],
    };

    const merged = mergeWithBuiltInFoods([savedVersion]);
    const result = merged.find((i) => i.nameUk === bundleEntry.nameUk);
    expect(result?.favorite).toBe(true);
    expect(result?.dateAdded).toBe("2026-08-13");
    expect(merged).toHaveLength(BUILT_IN_FOODS.length);
  });

  it("includes sheet-only ingredients not in the bundle", () => {
    const custom: Ingredient = {
      id: "I1",
      basedOn: "",
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
      unknownFields: [],
      giFrom: "", basis: "100g" as const, valuesPer: null, weighedPieces: null, weighedGrams: null, portionSizes: [],
    };
    const merged = mergeWithBuiltInFoods([custom]);
    expect(merged).toHaveLength(BUILT_IN_FOODS.length + 1);
    expect(merged.some((i) => i.nameUk === "Дуже рідкісний продукт")).toBe(true);
  });

  it("recognises a row saved under a pre-1.8 built-in name (an alias) as that item", () => {
    // «Гречка суха» was B0001's name before the verified database renamed it.
    const oldCopy: Ingredient = { ...BUILT_IN_FOODS[0], id: "I7", nameUk: "Гречка суха", source: "starter", dateAdded: "2026-09-01", favorite: true };
    const merged = mergeWithBuiltInFoods([oldCopy]);
    expect(merged).toHaveLength(BUILT_IN_FOODS.length);
    expect(merged.find((i) => i.id === "I7")?.favorite).toBe(true);
    expect(merged.some((i) => i.id === "B0001")).toBe(false);
  });
});

describe("Ingredient unknownFields", () => {
  it("round-trips through a row", () => {
    const ingredient: Ingredient = { ...rowToIngredient([]), nameUk: "Щось", unknownFields: ["gi", "fiberG"] };
    expect(rowToIngredient(ingredientToRow(ingredient)).unknownFields).toEqual(["gi", "fiberG"]);
  });

  it("reads a row from before the column existed as nothing unknown", () => {
    const columnIndex = buildColumnIndex(["NameUk", "Carbs_g"]);
    expect(rowToIngredient(["Гречка", "20"], columnIndex).unknownFields).toEqual([]);
  });
});
