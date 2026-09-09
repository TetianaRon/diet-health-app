import { describe, expect, it } from "vitest";
import { STARTER_DISHES, mergeWithStarterDishes } from "./starter-dishes";
import type { Dish } from "../lib/dishes";

function find(nameUk: string) {
  const dish = STARTER_DISHES.find((d) => d.nameUk === nameUk);
  if (!dish) throw new Error(`missing starter dish: ${nameUk}`);
  return dish;
}

describe("STARTER_DISHES", () => {
  it("has one entry per spec, all resolving their ingredient reference", () => {
    expect(STARTER_DISHES).toHaveLength(12);
    for (const dish of STARTER_DISHES) {
      // caloriesKcal > 0 confirms lookupStarterFood actually found the raw
      // ingredient — a broken name reference would silently compute to 0.
      expect(dish.caloriesKcal).toBeGreaterThan(0);
      expect(dish.nameEn).not.toBe("");
      expect(dish.source).toBe("starter");
    }
  });

  it("computes cooked buckwheat close to the real published reference (~92 kcal, ~20g carbs per 100g)", () => {
    const dish = find("Гречка варена");
    expect(dish.caloriesKcal).toBeCloseTo(95, -1);
    expect(dish.carbsG).toBeCloseTo(19.9, 0);
    expect(dish.gi).toBe(54);
  });

  it("computes cooked white rice close to the real published reference (~130 kcal, ~28g carbs per 100g)", () => {
    const dish = find("Рис білий варений");
    expect(dish.caloriesKcal).toBeCloseTo(130, -1);
    expect(dish.carbsG).toBeCloseTo(28, 0);
  });

  it("gives every dish a positive yield and non-negative nutrients", () => {
    for (const dish of STARTER_DISHES) {
      expect(dish.yieldGrams).toBeGreaterThan(0);
      expect(dish.carbsG).toBeGreaterThanOrEqual(0);
      expect(dish.caloriesKcal).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("mergeWithStarterDishes", () => {
  it("includes the whole bundle when the personal sheet is empty", () => {
    const merged = mergeWithStarterDishes([]);
    expect(merged).toHaveLength(STARTER_DISHES.length);
    expect(merged.every((d) => d.dateAdded === "")).toBe(true);
  });

  it("lets a sheet row override the bundle default for the same name", () => {
    const customized: Dish = {
      ...find("Гречка варена"),
      caloriesKcal: 999,
      source: "manual",
      dateAdded: "2026-08-13",
    };
    const merged = mergeWithStarterDishes([customized]);
    const result = merged.find((d) => d.nameUk === "Гречка варена");
    expect(result?.caloriesKcal).toBe(999);
    expect(result?.dateAdded).toBe("2026-08-13");
  });

  it("includes sheet-only dishes not in the bundle", () => {
    const custom: Dish = {
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
    };
    const merged = mergeWithStarterDishes([custom]);
    expect(merged).toHaveLength(STARTER_DISHES.length + 1);
    expect(merged.some((d) => d.nameUk === "Борщ")).toBe(true);
  });
});
