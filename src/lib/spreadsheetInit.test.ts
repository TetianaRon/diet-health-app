import { describe, expect, it } from "vitest";
import { buildInitUpdates, missingTabs, REQUIRED_TABS } from "./spreadsheetInit";

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
