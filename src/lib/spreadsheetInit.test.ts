import { describe, expect, it } from "vitest";
import {
  buildInitUpdates,
  isSilentlyRepairable,
  analyzeSettingsTab,
  buildSettingsKeyTopUpUpdate,
  planSettingsLabelRepair,
  missingSettingsKeysFor,
  missingTabs,
  REQUIRED_TABS,
} from "./spreadsheetInit";

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
    expect(updates).toEqual([
      {
        range: "BloodSugar!A1:D2",
        values: [
          ["Timestamp", "ValueMmolL", "Context", "Notes"],
          ["Час", "Цукор, ммоль/л", "Контекст", "Примітки"],
        ],
      },
    ]);
  });

  it("gives Settings keys + a names row, then default data rows (from row 3) each with its readable name", () => {
    const updates = buildInitUpdates(["Settings"]);
    expect(updates).toEqual([
      { range: "Settings!A1:C2", values: [["Key", "Value", "Label"], ["Ключ", "Значення", "Назва"]] },
      expect.objectContaining({ range: expect.stringMatching(/^Settings!A3:C\d+$/) as unknown as string }),
    ]);
    const dataUpdate = updates[1];
    expect(dataUpdate.values).toContainEqual(["DailyCarbsTarget", 140, "Денна норма вуглеводів (г)"]);
    expect(dataUpdate.values).toContainEqual(["ShowCarbsProgress", "FALSE", "Показувати вуглеводи на екрані «Сьогодні»"]);
  });

  it("produces one update per non-Settings tab, plus two for Settings, when everything is missing", () => {
    const updates = buildInitUpdates([...REQUIRED_TABS]);
    // Ingredients, Dishes, DailyLog, BloodSugar (1 each) + Settings (header + data)
    expect(updates).toHaveLength(6);
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

describe("buildSettingsKeyTopUpUpdate", () => {
  it("appends default rows, with readable names, right after the tab's last row", () => {
    const update = buildSettingsKeyTopUpUpdate(8, ["DailyGlycemicLoadTarget"]);
    expect(update).toEqual({
      range: "Settings!A9:C9",
      values: [["DailyGlycemicLoadTarget", 80, "Денна норма глікемічного навантаження"]],
    });
  });

  it("writes multiple missing keys as consecutive rows", () => {
    const update = buildSettingsKeyTopUpUpdate(2, ["ShowFatTotal", "ShowSugarsTotal"]);
    expect(update.range).toBe("Settings!A3:C4");
    expect(update.values.map((row) => row[0])).toEqual(["ShowFatTotal", "ShowSugarsTotal"]);
  });
});

describe("Settings tab names", () => {
  // Mom's Settings tab as of 2026-09-26 (abridged): bilingual header, no names row, no Label column.
  const momSettings = [
    ["Key (Ключ)", "Value (Значення)"],
    ["DailyCarbsTarget", "140"],
    ["MealsPerDay", "6"],
  ];

  it("proposes the names row and Label column for an older Settings tab", () => {
    expect(analyzeSettingsTab(momSettings)).toContainEqual({ kind: "missingLabelRow" });
  });

  it("plans the Label header, the names row, and each key's name — shifted down by the inserted row", () => {
    expect(planSettingsLabelRepair(momSettings)).toEqual({
      insertLabelRow: true,
      valueUpdates: [
        { range: "Settings!A1:C1", values: [["Key", "Value", "Label"]] },
        { range: "Settings!A2:C2", values: [["Ключ", "Значення", "Назва"]] },
        { range: "Settings!C3", values: [["Денна норма вуглеводів (г)"]] },
        { range: "Settings!C4", values: [["Прийомів їжі на день"]] },
      ],
    });
  });

  it("reports nothing extra for an up-to-date Settings tab", () => {
    const rows = buildInitUpdates(["Settings"]).flatMap((u) => u.values);
    expect(analyzeSettingsTab(rows)).toEqual([]);
  });
});

describe("isSilentlyRepairable", () => {
  it("is true when every structural issue is additive (new columns, tab, settings keys)", () => {
    expect(
      isSilentlyRepairable({
        tab: "Ingredients",
        issues: [{ kind: "missingColumns", headers: ["Id", "BasedOn"], startColumn: 16 }, { kind: "staleLabels", columns: [16, 17] }],
      }),
    ).toBe(true);
    expect(isSilentlyRepairable({ tab: "Settings", issues: [{ kind: "missingSettingsKeys", keys: ["X"] }] })).toBe(true);
  });

  it("is false when columns would be merged/deleted or the layout is someone else's", () => {
    expect(
      isSilentlyRepairable({
        tab: "Ingredients",
        issues: [
          { kind: "missingColumns", headers: ["Id"], startColumn: 16 },
          { kind: "duplicateColumns", header: "GI", columns: [3, 9], keep: 3, conflictRows: [] },
        ],
      }),
    ).toBe(false);
    expect(isSilentlyRepairable({ tab: "Dishes", issues: [{ kind: "notAppLayout" }] })).toBe(false);
  });
});
