import { describe, expect, it } from "vitest";
import { calcGlycemicLoad, checkFatLimit, mealGapWarning } from "./health";

describe("calcGlycemicLoad", () => {
  it("computes GI × carbs / 100", () => {
    expect(calcGlycemicLoad(50, 30)).toBe(15);
  });

  it("returns 0 for 0 carbs", () => {
    expect(calcGlycemicLoad(70, 0)).toBe(0);
  });
});

describe("checkFatLimit", () => {
  it("does not flag a meal within the limit", () => {
    expect(checkFatLimit(12, 18)).toEqual({ exceeded: false, overByGrams: 0 });
  });

  it("flags and reports the overage above the limit", () => {
    expect(checkFatLimit(25, 18)).toEqual({ exceeded: true, overByGrams: 7 });
  });
});

describe("mealGapWarning", () => {
  it("does not warn before the max gap", () => {
    const lastMeal = new Date("2026-08-12T12:00:00Z");
    const now = new Date("2026-08-12T13:30:00Z");
    const result = mealGapWarning(lastMeal, now, 3);
    expect(result.shouldWarn).toBe(false);
    expect(result.hoursSinceLastMeal).toBeCloseTo(1.5);
  });

  it("warns once the gap reaches the max", () => {
    const lastMeal = new Date("2026-08-12T12:00:00Z");
    const now = new Date("2026-08-12T15:00:00Z");
    const result = mealGapWarning(lastMeal, now, 3);
    expect(result.shouldWarn).toBe(true);
    expect(result.hoursSinceLastMeal).toBeCloseTo(3);
  });
});
