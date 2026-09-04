import { describe, expect, it } from "vitest";
import { calcGlycemicLoad, checkBloodSugarRange, checkFatLimit, mealGapWarning } from "./health";

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

describe("checkBloodSugarRange", () => {
  it("flags a value within the range as in range", () => {
    expect(checkBloodSugarRange(6.0, 4.0, 7.8)).toEqual({ tooLow: false, tooHigh: false, inRange: true });
  });

  it("flags a value below the minimum", () => {
    expect(checkBloodSugarRange(3.5, 4.0, 7.8)).toEqual({ tooLow: true, tooHigh: false, inRange: false });
  });

  it("flags a value above the maximum", () => {
    expect(checkBloodSugarRange(8.2, 4.0, 7.8)).toEqual({ tooLow: false, tooHigh: true, inRange: false });
  });

  it("treats the exact boundary values as in range", () => {
    expect(checkBloodSugarRange(4.0, 4.0, 7.8).inRange).toBe(true);
    expect(checkBloodSugarRange(7.8, 4.0, 7.8).inRange).toBe(true);
  });
});
