import { describe, expect, it } from "vitest";
import { calcGlycemicLoad, checkBloodSugarRange, checkFatLimit, classifyGi, classifyGl, mealGapWarning } from "./health";

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

describe("classifyGi", () => {
  it("classifies the low/medium/high bands and their boundaries", () => {
    expect(classifyGi(0)).toBe("low");
    expect(classifyGi(55)).toBe("low");
    expect(classifyGi(56)).toBe("medium");
    expect(classifyGi(69)).toBe("medium");
    expect(classifyGi(70)).toBe("high");
    expect(classifyGi(100)).toBe("high");
  });
});

describe("classifyGl", () => {
  it("classifies the low/moderate/high bands and their boundaries", () => {
    expect(classifyGl(0)).toBe("low");
    expect(classifyGl(10)).toBe("low");
    expect(classifyGl(11)).toBe("moderate");
    expect(classifyGl(19)).toBe("moderate");
    expect(classifyGl(20)).toBe("high");
    expect(classifyGl(40)).toBe("high");
  });
});
