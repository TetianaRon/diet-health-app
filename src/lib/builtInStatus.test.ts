import { describe, expect, it } from "vitest";
import { builtInMatch, copyUpdates, dishCopyUpdates } from "./builtInStatus";
import type { Dish } from "./dishes";
import { BUILT_IN_FOODS, entryToIngredient, verifiedEntry } from "../data/builtInFoods";
import { LEGACY_BUILT_INS } from "../data/legacyBuiltIns";
import type { Ingredient } from "./ingredients";

const buckwheat = BUILT_IN_FOODS.find((f) => f.id === "B0001") as Ingredient;
const oldBuckwheat = LEGACY_BUILT_INS.find((l) => l.id === "B0001")!;

function copyOf(base: Ingredient, overrides: Partial<Ingredient> = {}): Ingredient {
  return { ...base, id: "I3", basedOn: "B0001", dateAdded: "2026-09-20", favorite: true, ...overrides };
}

describe("builtInMatch", () => {
  it("finds the entry for a built-in item and for a copy that still matches it", () => {
    expect(builtInMatch(buckwheat)?.id).toBe("B0001");
    expect(builtInMatch(copyOf(buckwheat))?.id).toBe("B0001");
  });

  it("is null for an edited copy and for her own items", () => {
    expect(builtInMatch(copyOf(buckwheat, { carbsG: buckwheat.carbsG + 1 }))).toBeNull();
    expect(builtInMatch({ ...buckwheat, id: "I9", basedOn: "", source: "manual" })).toBeNull();
  });

  it("maps GI statuses: notApplicable is a real 0, unknown is marked unknown", () => {
    const oil = entryToIngredient(verifiedEntry("B0056")!);
    expect(oil.gi).toBe(0);
    expect(oil.unknownFields).not.toContain("gi");
    const garlic = entryToIngredient(verifiedEntry("B0037")!);
    expect(garlic.unknownFields).toContain("gi");
  });
});

describe("copyUpdates", () => {
  const oldCopy = copyOf(buckwheat, { nameUk: oldBuckwheat.nameUk, ...oldBuckwheat.values, unknownFields: [] });

  it("offers the verified values for an unchanged pre-1.8 copy, keeping her ID and favourite", () => {
    const [update] = copyUpdates([oldCopy]);
    expect(update.copy).toBe(oldCopy);
    expect(update.updated.id).toBe("I3");
    expect(update.updated.favorite).toBe(true);
    expect(update.updated.nameUk).toBe(buckwheat.nameUk);
    expect(update.updated.carbsG).toBe(buckwheat.carbsG);
    expect(update.updated.gi).toBe(buckwheat.gi);
  });

  it("never offers a copy she changed, and keeps a name she chose", () => {
    expect(copyUpdates([{ ...oldCopy, carbsG: 60 }])).toEqual([]);
    const [renamed] = copyUpdates([{ ...oldCopy, nameUk: "Гречка моя" }]);
    expect(renamed.updated.nameUk).toBe("Гречка моя");
  });

  it("skips copies that already match, and items that aren't copies", () => {
    expect(copyUpdates([copyOf(buckwheat)])).toEqual([]);
    expect(copyUpdates([{ ...oldCopy, basedOn: "" }])).toEqual([]);
  });

  it("drops her GI confirmation when the GI changed", () => {
    const [update] = copyUpdates([{ ...oldCopy, giVerified: true }]);
    expect(update.updated.giVerified).toBe(oldBuckwheat.values.gi === buckwheat.gi);
  });
});

describe("dishCopyUpdates", () => {
  const oldDish = LEGACY_BUILT_INS.find((l) => l.id === "B0059")!; // «Рис білий варений», a built-in dish before 1.8
  const copy: Dish = {
    id: "D2", basedOn: "B0059", nameUk: oldDish.nameUk, nameEn: "white rice, cooked", ingredients: [{ id: "B0002", nameUk: "Рис білий сирий", grams: 100 }],
    yieldGrams: 280, source: "starter", dateAdded: "2026-09-20", glycemicFlag: "none", giVerified: false, unknownFields: [], ...oldDish.values,
  };

  it("brings an unchanged old dish copy to the verified cooked product, as 100 g of it", () => {
    const [update] = dishCopyUpdates([copy]);
    const product = BUILT_IN_FOODS.find((f) => f.id === "B0059")!;
    expect(update.updated.id).toBe("D2");
    expect(update.updated.nameUk).toBe(product.nameUk);
    expect(update.updated.gi).toBe(product.gi);
    expect(update.updated.ingredients).toEqual([{ id: "B0059", nameUk: product.nameUk, grams: 100 }]);
    expect(update.updated.yieldGrams).toBe(100);
  });

  it("leaves a dish copy she changed alone", () => {
    expect(dishCopyUpdates([{ ...copy, carbsG: copy.carbsG + 2 }])).toEqual([]);
  });
});
