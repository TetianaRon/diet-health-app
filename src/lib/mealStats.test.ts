import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import { buildLogEntry, groupIntoMeals } from "./dailyLog";
import { entryStatItems, mealStatItems } from "./mealStats";

const per100g = { carbsG: 20, gi: 50, fiberG: 2, sugarsG: 3, proteinG: 4, fatG: 5, caloriesKcal: 100, sodiumMg: 60 };
const [meal] = groupIntoMeals([
  buildLogEntry("Обід", "A", 200, per100g, "", "m", "2026-08-13T12:00:00.000Z"),
  buildLogEntry("Обід", "B", 100, per100g, "", "m", "2026-08-13T12:01:00.000Z"),
]);

describe("mealStatItems", () => {
  it("shows only the weight before settings have loaded", () => {
    expect(mealStatItems(meal, null)).toEqual([{ key: "weight", value: 300 }]);
  });

  it("mirrors the daily status: weight plus exactly the stats toggled on, in the daily order", () => {
    const settings = { ...DEFAULT_SETTINGS, showCaloriesProgress: true, showGlycemicLoadProgress: true, showCarbsProgress: false };
    expect(mealStatItems(meal, settings).map((s) => s.key)).toEqual(["weight", "calories", "gl"]);
    expect(mealStatItems(meal, settings).find((s) => s.key === "calories")?.value).toBe(300);
  });

  it("includes the plain-total stats when they are toggled on", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      showCarbsProgress: true,
      showCaloriesProgress: false,
      showGlycemicLoadProgress: false,
      showFatTotal: true,
      showSugarsTotal: true,
      showProteinTotal: true,
      showSodiumTotal: true,
    };
    expect(mealStatItems(meal, settings)).toEqual([
      { key: "weight", value: 300 },
      { key: "carbs", value: 60 },
      { key: "fat", value: 15 },
      { key: "sugars", value: 9 },
      { key: "protein", value: 12 },
      { key: "sodium", value: 180 },
    ]);
  });
});

describe("entryStatItems", () => {
  const settings = { ...DEFAULT_SETTINGS, showCaloriesProgress: true, showGlycemicLoadProgress: true, showCarbsProgress: false };

  it("shows the dish's weight plus the same toggled stats as the meal", () => {
    const stats = entryStatItems(meal.entries[0], settings);
    expect(stats.map((s) => s.key)).toEqual(["weight", "calories", "gl"]);
    expect(stats[0].value).toBe(200);
    expect(stats.find((s) => s.key === "calories")?.value).toBe(200);
  });

  it("reports a stat the dish has unknown as null, never as a number", () => {
    const unknownKcal = { ...meal.entries[0], unknownFields: ["caloriesKcal" as const, "gl" as const] };
    const stats = entryStatItems(unknownKcal, settings);
    expect(stats.find((s) => s.key === "calories")?.value).toBeNull();
    expect(stats.find((s) => s.key === "gl")?.value).toBeNull();
    expect(stats[0].value).toBe(200);
  });

  it("shows only the weight before settings have loaded", () => {
    expect(entryStatItems(meal.entries[0], null)).toEqual([{ key: "weight", value: 200 }]);
  });
});
