import { describe, expect, it } from "vitest";
import { STARTER_DISHES } from "./starter-dishes";

function find(dishName: string) {
  const dish = STARTER_DISHES.find((d) => d.dishName === dishName);
  if (!dish) throw new Error(`missing starter dish: ${dishName}`);
  return dish;
}

describe("STARTER_DISHES", () => {
  it("has one entry per spec, all resolving their ingredient reference", () => {
    expect(STARTER_DISHES).toHaveLength(12);
    for (const dish of STARTER_DISHES) {
      // caloriesKcal > 0 confirms lookupStarterFood actually found the raw
      // ingredient — a broken name reference would silently compute to 0.
      expect(dish.caloriesKcal).toBeGreaterThan(0);
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
