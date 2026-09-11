import { describe, expect, it } from "vitest";
import { computeSettingsUpdates, DEFAULT_SETTINGS, parseSettingsRows, settingsToRows, type Settings } from "./settings";

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

  it("parses string fields (wakeTime/sleepTime) and falls back to defaults for missing ones", () => {
    const result = parseSettingsRows([["WakeTime", "07:00"]]);
    expect(result.wakeTime).toBe("07:00");
    expect(result.sleepTime).toBe(DEFAULT_SETTINGS.sleepTime);
  });

  it("parses boolean fields (show*Progress) and falls back to defaults for missing ones", () => {
    const result = parseSettingsRows([["ShowCaloriesProgress", "FALSE"]]);
    expect(result.showCaloriesProgress).toBe(false);
    expect(result.showCarbsProgress).toBe(DEFAULT_SETTINGS.showCarbsProgress);
  });

  it("defaults to Calories + Glycemic Load visible, Carbs hidden", () => {
    expect(DEFAULT_SETTINGS.showCarbsProgress).toBe(false);
    expect(DEFAULT_SETTINGS.showCaloriesProgress).toBe(true);
    expect(DEFAULT_SETTINGS.showGlycemicLoadProgress).toBe(true);
  });

  it("parses the boolean total-only fields (fat/sugars/protein/sodium)", () => {
    const result = parseSettingsRows([
      ["ShowFatTotal", "TRUE"],
      ["ShowSugarsTotal", "true"],
    ]);
    expect(result.showFatTotal).toBe(true);
    expect(result.showSugarsTotal).toBe(true);
    expect(result.showProteinTotal).toBe(DEFAULT_SETTINGS.showProteinTotal);
    expect(result.showSodiumTotal).toBe(DEFAULT_SETTINGS.showSodiumTotal);
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

describe("settingsToRows", () => {
  it("emits one Key/Value row per setting, round-tripping cleanly through parseSettingsRows", () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    expect(rows).toHaveLength(17);
    expect(rows).toContainEqual(["DailyCarbsTarget", 140]);
    expect(parseSettingsRows(rows)).toEqual(DEFAULT_SETTINGS);
  });

  it("writes booleans as TRUE/FALSE strings, not JS booleans", () => {
    const rows = settingsToRows(DEFAULT_SETTINGS);
    expect(rows).toContainEqual(["ShowCarbsProgress", "FALSE"]);
    expect(rows).toContainEqual(["ShowCaloriesProgress", "TRUE"]);
  });
});
