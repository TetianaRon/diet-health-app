import { describe, expect, it } from "vitest";
import { databaseLabels, parseLabels, serializeLabels } from "./labels";
import { BUILT_IN_FOODS } from "../data/builtInFoods";

describe("labels (2.1)", () => {
  it("keeps known keys in a fixed order", () => {
    expect(parseLabels("sauce, ingredient,unknown")).toEqual(["ingredient", "sauce"]);
    expect(serializeLabels(["sauce", "ingredient"])).toBe("ingredient,sauce");
  });

  it("gives database items labels from category and state", () => {
    expect(databaseLabels("drinks", "brewed")).toEqual(["drink"]);
    expect(databaseLabels("grains", "boiled")).toEqual(["dish"]);
    expect(databaseLabels("bread", "baked")).toEqual(["ingredient"]);
    expect(databaseLabels("grains", "dry")).toEqual(["ingredient"]);
    const buckwheat = BUILT_IN_FOODS.find((f) => f.nameUk.startsWith("Гречка") && f.nameUk.includes("варен"));
    expect(buckwheat?.labels).toEqual(["dish"]);
  });
});
