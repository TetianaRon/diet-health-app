import { describe, expect, it } from "vitest";
import { BUILT_IN_FOODS } from "../data/builtInFoods";
import { planImport, validateImportFile, IMPORT_FORMAT, type ImportFile, type ImportItem } from "./importFile";
import type { Dish, NutritionKey } from "./dishes";
import type { Ingredient } from "./ingredients";

const zeros: Record<NutritionKey, number> = { carbsG: 0, gi: 0, fiberG: 0, sugarsG: 0, proteinG: 0, fatG: 0, caloriesKcal: 0, sodiumMg: 0 };
const item = (key: string, nameUk: string, extra: Partial<ImportItem> = {}): ImportItem => ({
  key,
  nameUk,
  values: { ...zeros, caloriesKcal: 100 },
  unknownFields: ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "sodiumMg"],
  ...extra,
});
const file = (over: Partial<ImportFile> = {}): ImportFile => ({
  format: IMPORT_FORMAT,
  version: 1,
  title: "Тест",
  notice: "Додано продукти",
  databaseItems: ["B0001", "B0002"],
  items: [item("u1", "Кефір 2,5% Органік"), item("u2", "Зелень разом", { recipeNeeded: true })],
  recipes: [{ key: "r1", nameUk: "Омлет", lines: [{ ref: "B0013", grams: 60 }, { ref: "u1", grams: 40 }], yieldGrams: 90 }],
  ...over,
});
const buckwheatCopy = { ...(BUILT_IN_FOODS.find((f) => f.id === "B0001") as Ingredient), id: "I3", basedOn: "B0001" };

describe("validateImportFile", () => {
  it("accepts a well-formed file", () => {
    expect(validateImportFile(file())).toEqual([]);
  });

  it("names what's wrong: format, unknown database items, repeated keys, unknown values that aren't 0, bad recipe lines", () => {
    const bad = file({
      databaseItems: ["B9999"],
      items: [item("u1", "А"), item("u1", "Б", { values: { ...zeros, carbsG: 5 } })],
      recipes: [{ key: "r1", nameUk: "Р", lines: [{ ref: "u9", grams: 10 }, { ref: "B0013", grams: 0 }], yieldGrams: 0 }],
    });
    const problems = validateImportFile({ ...bad, format: "other" });
    expect(problems.some((p) => p.includes("format"))).toBe(true);
    expect(problems.some((p) => p.includes("B9999"))).toBe(true);
    expect(problems.some((p) => p.includes("unique key"))).toBe(true);
    expect(problems.some((p) => p.includes("carbsG is unknown"))).toBe(true);
    expect(problems.some((p) => p.includes("unknown line u9"))).toBe(true);
    expect(problems.some((p) => p.includes("grams > 0"))).toBe(true);
    expect(problems.some((p) => p.includes("yieldGrams"))).toBe(true);
  });
});

describe("planImport", () => {
  it("copies the database items she doesn't have (recipes' too), adds new items and recipes", () => {
    const plan = planImport(file(), [buckwheatCopy], []);
    expect(plan.databaseCopies).toEqual(["B0002", "B0013"]);
    expect(plan.newItems.map((i) => i.key)).toEqual(["u1", "u2"]);
    expect(plan.newRecipes.map((r) => r.key)).toEqual(["r1"]);
    expect(plan.duplicates).toEqual([]);
  });

  it("finds her rows with the same name (any case or spacing) as duplicates", () => {
    const hers = { ...buckwheatCopy, id: "I7", basedOn: "", nameUk: "кефір 2,5%  органік" };
    const herDish = { id: "D2", nameUk: "Омлет" } as Dish;
    const plan = planImport(file(), [hers], [herDish]);
    expect(plan.duplicates.map((d) => [d.key, d.existing.id])).toEqual([
      ["u1", "I7"],
      ["r1", "D2"],
    ]);
    expect(plan.newItems.map((i) => i.key)).toEqual(["u2"]);
    expect(plan.newRecipes).toEqual([]);
  });
});
