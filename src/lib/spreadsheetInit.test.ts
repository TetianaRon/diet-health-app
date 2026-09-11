import { describe, expect, it } from "vitest";
import {
  buildColumnTopUpUpdate,
  buildInitUpdates,
  buildSettingsKeyTopUpUpdate,
  missingHeadersFor,
  missingSettingsKeysFor,
  missingTabs,
  REQUIRED_TABS,
} from "./spreadsheetInit";
import { buildColumnIndex } from "./sheetRow";

describe("missingTabs", () => {
  it("returns all 5 tabs for a genuinely blank spreadsheet", () => {
    expect(missingTabs(["Sheet1"])).toEqual([...REQUIRED_TABS]);
  });

  it("returns an empty array when every required tab is present", () => {
    expect(missingTabs([...REQUIRED_TABS, "Sheet1"])).toEqual([]);
  });

  it("returns only the tabs actually missing on a partially-set-up sheet", () => {
    expect(missingTabs(["Ingredients", "Dishes", "DailyLog", "Settings"])).toEqual(["BloodSugar"]);
  });
});

describe("buildInitUpdates", () => {
  it("returns nothing when no tabs are missing", () => {
    expect(buildInitUpdates([])).toEqual([]);
  });

  it("only touches the tabs actually missing, not ones that already exist", () => {
    const updates = buildInitUpdates(["BloodSugar"]);
    expect(updates).toEqual([{ range: "BloodSugar!A1:D1", values: [["Timestamp", "ValueMmolL", "Context", "Notes"]] }]);
  });

  it("gives Settings both a header row and a full set of default data rows", () => {
    const updates = buildInitUpdates(["Settings"]);
    expect(updates).toEqual([
      { range: "Settings!A1:B1", values: [["Key", "Value"]] },
      expect.objectContaining({ range: expect.stringMatching(/^Settings!A2:B\d+$/) as unknown as string }),
    ]);
    const dataUpdate = updates[1];
    expect(dataUpdate.values).toContainEqual(["DailyCarbsTarget", 140]);
    expect(dataUpdate.values).toContainEqual(["ShowCarbsProgress", "FALSE"]);
    expect(dataUpdate.values).toContainEqual(["ShowCaloriesProgress", "TRUE"]);
  });

  it("produces one update per non-Settings tab, plus two for Settings, when everything is missing", () => {
    const updates = buildInitUpdates([...REQUIRED_TABS]);
    // Ingredients, Dishes, DailyLog, BloodSugar (1 each) + Settings (header + data)
    expect(updates).toHaveLength(6);
  });
});

describe("missingHeadersFor", () => {
  it("returns headers not present in the live column index", () => {
    const columnIndex = buildColumnIndex(["NameUk", "NameEn", "Carbs_g", "GI"]);
    expect(missingHeadersFor(columnIndex, ["NameUk", "NameEn", "Carbs_g", "GI", "Favorite", "GiVerified"])).toEqual([
      "Favorite",
      "GiVerified",
    ]);
  });

  it("returns nothing when every canonical header is present, regardless of order", () => {
    const columnIndex = buildColumnIndex(["GI", "NameUk", "Carbs_g"]);
    expect(missingHeadersFor(columnIndex, ["NameUk", "Carbs_g", "GI"])).toEqual([]);
  });
});

describe("missingSettingsKeysFor", () => {
  it("returns keys not present in the sheet's Key column", () => {
    const rows = [
      ["DailyCarbsTarget", "140"],
      ["MealsPerDay", "6"],
    ];
    expect(missingSettingsKeysFor(rows, ["DailyCarbsTarget", "MealsPerDay", "DailyGlycemicLoadTarget"])).toEqual([
      "DailyGlycemicLoadTarget",
    ]);
  });

  it("returns nothing when every key is present", () => {
    const rows = [["DailyCarbsTarget", "140"]];
    expect(missingSettingsKeysFor(rows, ["DailyCarbsTarget"])).toEqual([]);
  });
});

describe("buildColumnTopUpUpdate", () => {
  it("appends missing headers right after the current last column", () => {
    const columnIndex = buildColumnIndex(["NameUk", "NameEn", "Carbs_g"]); // last used index = 2 (column C)
    const update = buildColumnTopUpUpdate("Ingredients", columnIndex, ["Favorite", "GiVerified"]);
    expect(update).toEqual({ range: "Ingredients!D1:E1", values: [["Favorite", "GiVerified"]] });
  });

  it("never touches an existing column, even one this app doesn't recognize", () => {
    // Mirrors mom adding her own note column at the end.
    const columnIndex = buildColumnIndex(["NameUk", "NameEn", "MyOwnNotes"]);
    const update = buildColumnTopUpUpdate("Ingredients", columnIndex, ["Favorite"]);
    expect(update.range).toBe("Ingredients!D1:D1");
  });
});

describe("buildSettingsKeyTopUpUpdate", () => {
  it("appends default rows for the missing keys after the existing rows", () => {
    const update = buildSettingsKeyTopUpUpdate(7, ["DailyGlycemicLoadTarget"]);
    expect(update.range).toBe("Settings!A9:B9");
    expect(update.values).toEqual([["DailyGlycemicLoadTarget", 80]]);
  });

  it("writes multiple missing keys as consecutive rows", () => {
    const update = buildSettingsKeyTopUpUpdate(0, ["ShowFatTotal", "ShowSugarsTotal"]);
    expect(update.range).toBe("Settings!A2:B3");
    expect(update.values).toEqual([
      ["ShowFatTotal", "FALSE"],
      ["ShowSugarsTotal", "FALSE"],
    ]);
  });
});
