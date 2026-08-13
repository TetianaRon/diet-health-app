import { describe, expect, it } from "vitest";
import { computeSettingsUpdates, DEFAULT_SETTINGS, parseSettingsRows, type Settings } from "./settings";

describe("parseSettingsRows", () => {
  it("maps known keys and falls back to defaults for missing ones", () => {
    const rows = [
      ["DailyCarbsTarget", "150"],
      ["MealsPerDay", "6"],
    ];

    const result = parseSettingsRows(rows);

    expect(result.dailyCarbsTarget).toBe(150);
    expect(result.mealsPerDay).toBe(6);
    expect(result.fatPerMealLimit).toBe(DEFAULT_SETTINGS.fatPerMealLimit);
  });

  it("ignores rows with non-numeric values", () => {
    const rows = [["DailyCarbsTarget", "not a number"]];
    expect(parseSettingsRows(rows).dailyCarbsTarget).toBe(DEFAULT_SETTINGS.dailyCarbsTarget);
  });

  it("returns all defaults for an empty sheet", () => {
    expect(parseSettingsRows([])).toEqual(DEFAULT_SETTINGS);
  });
});

describe("computeSettingsUpdates", () => {
  const existingRows = [
    ["DailyCarbsTarget", "140"],
    ["FatPerMealLimit", "18"],
    ["DailyCaloriesTarget", "1500"],
    ["MealsPerDay", "5"],
    ["MaxGapHours", "3"],
    ["BloodSugarMin", "4"],
    ["BloodSugarMax", "7.8"],
  ];

  it("targets each key's actual row number, accounting for the header row", () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, dailyCarbsTarget: 145, mealsPerDay: 6 };

    const updates = computeSettingsUpdates(settings, existingRows);

    expect(updates).toContainEqual({ range: "Settings!B2", values: [[145]] });
    expect(updates).toContainEqual({ range: "Settings!B5", values: [[6]] });
    expect(updates).toHaveLength(7);
  });

  it("skips keys that don't exist in the sheet yet", () => {
    const partialRows = [["DailyCarbsTarget", "140"]];
    const updates = computeSettingsUpdates(DEFAULT_SETTINGS, partialRows);
    expect(updates).toEqual([{ range: "Settings!B2", values: [[DEFAULT_SETTINGS.dailyCarbsTarget]] }]);
  });
});
