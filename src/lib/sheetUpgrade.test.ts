import { describe, expect, it } from "vitest";
import { planItemIdUpgrade } from "./sheetUpgrade";
import { labelFor } from "./sheetLabels";

const ING_HEADERS = ["NameUk", "NameEn", "Carbs_g", "Id", "BasedOn"];
const DISH_HEADERS = ["NameUk", "IngredientsJson", "YieldGrams", "Id", "BasedOn"];
const labels = (headers: string[]) => headers.map((h) => labelFor(h));

const builtInFoods = [
  { id: "B0001", nameUk: "Гречка суха" },
  { id: "B0057", nameUk: "Олія оливкова" },
];
const builtInDishes = [{ id: "B0058", nameUk: "Гречка варена" }];

function plan(ingredientsData: unknown[][], dishesData: unknown[][] = [], counters = {}) {
  return planItemIdUpgrade({
    ingredientsRows: [ING_HEADERS, labels(ING_HEADERS), ...ingredientsData],
    dishesRows: [DISH_HEADERS, labels(DISH_HEADERS), ...dishesData],
    builtInFoods,
    builtInDishes,
    counters,
  });
}

describe("planItemIdUpgrade — IDs and links", () => {
  it("numbers rows without an ID in order, below the readable-names row", () => {
    const result = plan([
      ["Хліб", "bread", 49, "", ""],
      ["Кефір", "kefir", 4, "", ""],
    ]);
    expect(result.valueUpdates).toEqual([
      { range: "Ingredients!D3", values: [["I1"]] },
      { range: "Ingredients!D4", values: [["I2"]] },
    ]);
    expect(result.highestNumber.ingredient).toBe(2);
    expect(result.idsFilled).toBe(2);
    expect(result.idsRenumbered).toBe(0);
  });

  it("links a row named like a built-in item to it (how copies were stored before 1.6)", () => {
    const result = plan([["гречка  суха", "buckwheat", 71.5, "", ""]]);
    expect(result.valueUpdates).toContainEqual({ range: "Ingredients!E3", values: [["B0001"]] });
  });

  it("keeps existing IDs and numbers new rows after the highest one and the counter", () => {
    const result = plan(
      [
        ["Хліб", "bread", 49, "I4", ""],
        ["Кефір", "kefir", 4, "", ""],
      ],
      [],
      { ingredient: 9 },
    );
    expect(result.valueUpdates).toEqual([{ range: "Ingredients!D4", values: [["I10"]] }]);
    expect(result.highestNumber.ingredient).toBe(10);
  });

  it("gives the later of two rows with the same ID a new number", () => {
    const result = plan([
      ["Хліб", "bread", 49, "I1", ""],
      ["Кефір", "kefir", 4, "I1", ""],
    ]);
    expect(result.valueUpdates).toEqual([{ range: "Ingredients!D4", values: [["I2"]] }]);
    expect(result.idsRenumbered).toBe(1);
  });

  it("never touches a filled BasedOn cell or blank rows", () => {
    const result = plan([
      ["Гречка суха", "buckwheat", 71.5, "I1", "B0001"],
      ["", "", "", "", ""],
    ]);
    expect(result.valueUpdates).toEqual([]);
  });

  it("does nothing until the Id column exists", () => {
    const result = planItemIdUpgrade({
      ingredientsRows: [["NameUk", "Carbs_g"], ["Хліб", 49]],
      dishesRows: [["NameUk", "IngredientsJson"]],
      builtInFoods,
      builtInDishes,
      counters: {},
    });
    expect(result.valueUpdates).toEqual([]);
  });

  it("is idempotent: an upgraded sheet needs nothing more", () => {
    const result = plan(
      [["Хліб", "bread", 49, "I1", ""]],
      [["Мій суп", JSON.stringify([{ id: "I1", name: "Хліб", grams: 50 }]), 300, "D1", ""]],
    );
    expect(result.valueUpdates).toEqual([]);
  });
});

describe("planItemIdUpgrade — recipe ingredient IDs", () => {
  it("resolves names to her own ingredient first, else the built-in item, and reports the rest", () => {
    const result = plan(
      [
        ["Хліб", "bread", 49, "", ""],
        ["Олія оливкова", "olive oil (mine)", 0, "I7", ""],
      ],
      [
        [
          "Мій суп",
          JSON.stringify([
            { name: "Хліб", grams: 50 },
            { name: "Олія оливкова", grams: 10 },
            { name: "Гречка суха", grams: 60 },
            { name: "Щось невідоме", grams: 5 },
          ]),
          300,
          "",
          "",
        ],
      ],
    );

    const recipeWrite = result.valueUpdates.find((u) => u.range === "Dishes!B3");
    expect(JSON.parse(String(recipeWrite?.values[0][0]))).toEqual([
      { id: "I8", name: "Хліб", grams: 50 },
      { id: "I7", name: "Олія оливкова", grams: 10 },
      { id: "B0001", name: "Гречка суха", grams: 60 },
      { name: "Щось невідоме", grams: 5 },
    ]);
    expect(result.unresolved).toEqual([{ dishRow: 3, dishName: "Мій суп", ingredientName: "Щось невідоме" }]);
    // the dish itself gets its ID too
    expect(result.valueUpdates).toContainEqual({ range: "Dishes!D3", values: [["D1"]] });
  });

  it("leaves a recipe alone when nothing in it can be resolved", () => {
    const result = plan([], [["Суп", JSON.stringify([{ name: "Невідоме", grams: 5 }]), 300, "D1", ""]]);
    expect(result.valueUpdates).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
  });
});
