import { describe, expect, it } from "vitest";
import { analyzeDataTab, isBlocking, isTabRepairable, lastUsedColumn, planLabelRepair, planTabRepair, type TabReport } from "./sheetSchema";
import { BLOOD_SUGAR_HEADERS } from "./bloodSugar";
import { DAILY_LOG_HEADERS } from "./dailyLog";
import { INGREDIENTS_HEADERS } from "./ingredients";

// Mom's real sheet as of 2026-09-26: bilingual headers from the template she
// was set up with, then a full second set of plain headers appended by the
// old header-only "Оновити структуру" top-up.
const MOM_BLOOD_SUGAR = [
  ["Timestamp (Час)", "ValueMmolL (Цукор, ммоль/л)", "Context (Контекст)", "Notes (Примітки)", "Timestamp", "ValueMmolL", "Context", "Notes"],
  ["2026-09-11T12:02:53.425Z", "6.5", "fasting"],
  ["2026-09-22T15:17:32.685Z", "7.1", "fasting", "Зранку"],
];

const bilingualIngredients = [
  "NameUk (Назва укр.)", "NameEn (Назва англ.)", "Carbs_g (Вуглеводи, г)", "GI (Глікемічний індекс)",
  "Fiber_g (Клітковина, г)", "Sugars_g (Цукри, г)", "Protein_g (Білки, г)", "Fat_g (Жири, г)",
  "Calories_kcal (Калорії, ккал)", "Sodium_mg (Натрій, мг)", "Source (Джерело)", "DateAdded (Дата додавання)",
  "Favorite (Улюблене)", "GlycemicFlag (Глікемічна позначка)", "GiVerified (ГІ перевірено)",
];
const MOM_INGREDIENTS = [
  [...bilingualIngredients, ...INGREDIENTS_HEADERS],
  ["Кефір знежирений", "kefir, low-fat", "4", "32", "0", "4", "3.4", "1", "41", "40", "starter", "2026-09-22", "FALSE", "watch", "FALSE"],
  // A save made after the top-up: only NameUk landed, in the duplicate column P.
  [...new Array(15).fill(""), "Кріп"],
];

const blockingIssues = (report: TabReport) => report.issues.filter(isBlocking);

describe("analyzeDataTab", () => {
  it("reports nothing for a current-format tab: keys in row 1, readable names in row 2", () => {
    const rows = [[...BLOOD_SUGAR_HEADERS], ["Час", "Цукор, ммоль/л", "Контекст", "Примітки"], ["2026-09-11", "6.5", "fasting", ""]];
    expect(analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS).issues).toEqual([]);
  });

  it("reads old bilingual headers fine, but proposes the key + names-row format (non-blocking)", () => {
    const rows = [["Timestamp (Час)", "ValueMmolL (Цукор)", "Context", "Notes (Примітки)"], ["2026-09-11", "6.5", "fasting", ""]];
    const report = analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS);
    expect(report.issues).toEqual([{ kind: "headerFormat", columns: [0, 1, 3] }, { kind: "missingLabelRow" }]);
    expect(blockingIssues(report)).toEqual([]);
  });

  it("flags blank names-row cells (e.g. a column added later) as stale, but leaves a reworded name alone", () => {
    const rows = [[...BLOOD_SUGAR_HEADERS], ["Час", "Мій цукор", "Контекст", ""]];
    expect(analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS).issues).toEqual([{ kind: "staleLabels", columns: [3] }]);
  });

  it("finds mom's doubled BloodSugar headers and keeps the columns that hold her data", () => {
    const report = analyzeDataTab("BloodSugar", MOM_BLOOD_SUGAR, BLOOD_SUGAR_HEADERS);
    expect(blockingIssues(report)).toEqual([
      { kind: "duplicateColumns", header: "Timestamp", columns: [0, 4], keep: 0, conflictRows: [] },
      { kind: "duplicateColumns", header: "ValueMmolL", columns: [1, 5], keep: 1, conflictRows: [] },
      { kind: "duplicateColumns", header: "Context", columns: [2, 6], keep: 2, conflictRows: [] },
      { kind: "duplicateColumns", header: "Notes", columns: [3, 7], keep: 3, conflictRows: [] },
    ]);
    expect(isTabRepairable(report)).toBe(true);
  });

  it("flags a row with two different values across duplicate columns as a conflict", () => {
    const rows = [["GL", "Timestamp", "Timestamp"], ["1", "2026-09-01", "2026-09-02"]];
    const report = analyzeDataTab("DailyLog", rows, ["Timestamp", "GL"]);
    expect(blockingIssues(report)).toEqual([{ kind: "duplicateColumns", header: "Timestamp", columns: [1, 2], keep: 1, conflictRows: [2] }]);
    expect(isTabRepairable(report)).toBe(false);
  });

  it("keeps the duplicate with more data even when it's not the leftmost", () => {
    const rows = [["Timestamp", "Timestamp"], ["", "a"], ["", "b"]];
    const [issue] = blockingIssues(analyzeDataTab("BloodSugar", rows, ["Timestamp"]));
    expect(issue).toMatchObject({ kind: "duplicateColumns", keep: 1 });
  });

  it("reports a tab with none of this app's headers as someone else's layout, not as missing columns", () => {
    const rows = [["Дата", "Цукор", "Примітка"], ["01.09", "6.1", ""]];
    expect(analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS).issues).toEqual([{ kind: "notAppLayout" }]);
  });

  it("gives an empty tab its headers from column A", () => {
    expect(analyzeDataTab("BloodSugar", [], BLOOD_SUGAR_HEADERS).issues).toEqual([
      { kind: "missingColumns", headers: [...BLOOD_SUGAR_HEADERS], startColumn: 0 },
      { kind: "missingLabelRow" },
    ]);
  });

  it("refuses data sitting under a blank header row", () => {
    expect(analyzeDataTab("BloodSugar", [[], ["2026-09-11", "6.5"]], BLOOD_SUGAR_HEADERS).issues).toEqual([{ kind: "notAppLayout" }]);
  });

  it("places missing columns after the last column holding anything, including unlabeled data and the user's own columns", () => {
    const header = DAILY_LOG_HEADERS.filter((h) => h !== "UnknownFields" && h !== "MealId");
    const rows = [[...header, "Мої нотатки"], [...new Array(header.length + 2).fill(""), "stray"]];
    const [issue] = blockingIssues(analyzeDataTab("DailyLog", rows, DAILY_LOG_HEADERS));
    expect(issue).toEqual({ kind: "missingColumns", headers: ["MealId", "UnknownFields"], startColumn: header.length + 3 });
  });
});

describe("planTabRepair", () => {
  it("deletes mom's empty duplicate BloodSugar columns without writing anything", () => {
    const report = analyzeDataTab("BloodSugar", MOM_BLOOD_SUGAR, BLOOD_SUGAR_HEADERS);
    expect(planTabRepair(report, MOM_BLOOD_SUGAR)).toEqual({ valueUpdates: [], deleteColumns: [7, 6, 5, 4], requiredColumnCount: 0 });
  });

  it("moves a value stranded in a duplicate column into the kept one before deleting it", () => {
    const report = analyzeDataTab("Ingredients", MOM_INGREDIENTS, INGREDIENTS_HEADERS);
    // Only UnknownFields (col AE, index 30) is unique among the appended set.
    expect(blockingIssues(report).filter((i) => i.kind === "duplicateColumns")).toHaveLength(15);
    expect(report.issues.some((i) => i.kind === "missingColumns")).toBe(false);

    const plan = planTabRepair(report, MOM_INGREDIENTS);
    expect(plan.valueUpdates).toEqual([{ range: "Ingredients!A3", values: [["Кріп"]] }]);
    expect(plan.deleteColumns).toEqual([29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
  });

  it("writes missing headers and reports the grid width they need", () => {
    const rows = [["Timestamp", "ValueMmolL"]];
    const report = analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS);
    expect(planTabRepair(report, rows)).toEqual({
      valueUpdates: [{ range: "BloodSugar!C1:D1", values: [["Context", "Notes"]] }],
      deleteColumns: [],
      requiredColumnCount: 4,
    });
  });

  it("refuses to plan for a tab with an unfixable issue", () => {
    const rows = [["Дата"], ["01.09"]];
    expect(() => planTabRepair(analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS), rows)).toThrow();
  });
});

describe("names row (row 2) and data offsets", () => {
  it("counts conflict rows from row 3 when row 2 is the names row", () => {
    const rows = [["Timestamp", "Timestamp", "GL"], ["Час", "Час", "Глікемічне навантаження"], ["a", "b", "1"]];
    const [issue] = blockingIssues(analyzeDataTab("DailyLog", rows, ["Timestamp", "GL"]));
    expect(issue).toMatchObject({ kind: "duplicateColumns", conflictRows: [3] });
  });

  it("never mistakes a data row for the names row", () => {
    const rows = [[...BLOOD_SUGAR_HEADERS], ["2026-09-11T12:02:53.425Z", "6.5", "fasting", "Час"]];
    expect(analyzeDataTab("BloodSugar", rows, BLOOD_SUGAR_HEADERS).issues).toEqual([{ kind: "missingLabelRow" }]);
  });
});

describe("planLabelRepair", () => {
  it("turns mom's repaired BloodSugar (bilingual row 1, data from row 2) into keys + an inserted names row", () => {
    const afterPass1 = MOM_BLOOD_SUGAR.map((row) => row.slice(0, 4));
    expect(planLabelRepair("BloodSugar", afterPass1, BLOOD_SUGAR_HEADERS)).toEqual({
      insertLabelRow: true,
      valueUpdates: [
        { range: "BloodSugar!A1", values: [["Timestamp"]] },
        { range: "BloodSugar!B1", values: [["ValueMmolL"]] },
        { range: "BloodSugar!C1", values: [["Context"]] },
        { range: "BloodSugar!D1", values: [["Notes"]] },
        { range: "BloodSugar!A2", values: [["Час"]] },
        { range: "BloodSugar!B2", values: [["Цукор, ммоль/л"]] },
        { range: "BloodSugar!C2", values: [["Контекст"]] },
        { range: "BloodSugar!D2", values: [["Примітки"]] },
      ],
    });
  });

  it("only fills stale names when the names row already exists", () => {
    const rows = [[...BLOOD_SUGAR_HEADERS], ["Час", "Цукор, ммоль/л", "", "Примітки"]];
    expect(planLabelRepair("BloodSugar", rows, BLOOD_SUGAR_HEADERS)).toEqual({
      insertLabelRow: false,
      valueUpdates: [{ range: "BloodSugar!C2", values: [["Контекст"]] }],
    });
  });

  it("puts names under each key's actual column, leaving the user's own columns alone", () => {
    const rows = [["Мої нотатки", "Notes", "Timestamp", "ValueMmolL", "Context"], ["x", "", "2026-09-11", "6.5", "fasting"]];
    const plan = planLabelRepair("BloodSugar", rows, BLOOD_SUGAR_HEADERS);
    expect(plan.insertLabelRow).toBe(true);
    expect(plan.valueUpdates.map((u) => u.range)).toEqual(["BloodSugar!C2", "BloodSugar!D2", "BloodSugar!E2", "BloodSugar!B2"]);
  });
});

describe("lastUsedColumn", () => {
  it("is -1 for an empty tab and ignores trailing blank cells", () => {
    expect(lastUsedColumn([])).toBe(-1);
    expect(lastUsedColumn([["a", "", " "], ["", "b", ""]])).toBe(1);
  });
});

describe("the broken-table test copy's DailyLog (2026-09-26)", () => {
  const bilingual = DAILY_LOG_HEADERS.slice(0, 14).map((h) => `${h} (…)`);
  const header = [...bilingual, ...DAILY_LOG_HEADERS];
  const entry = (name: string) => ["2026-09-11T12:04:32.213Z", "Обід", name, "100", "19.86", "50", "2.78", "0", "3.67", "0.94", "95.28", "0.28", "9.93"];
  // A meal saved after the old top-up: only Timestamp + MealType landed, in the duplicate columns O and P.
  const fragment = [...new Array(14).fill(""), "2026-09-26T19:47:00.000Z", "Перекус"];
  const rows = [header, entry("Гречка варена"), entry("Яблуко"), fragment, fragment];

  it("keeps A–N (where the data is), rescues the fragments' two values into A/B, and deletes O–AB", () => {
    const report = analyzeDataTab("DailyLog", rows, DAILY_LOG_HEADERS);
    expect(isTabRepairable(report)).toBe(true);
    const plan = planTabRepair(report, rows);
    expect(plan.valueUpdates).toEqual([
      { range: "DailyLog!A4", values: [["2026-09-26T19:47:00.000Z"]] },
      { range: "DailyLog!A5", values: [["2026-09-26T19:47:00.000Z"]] },
      { range: "DailyLog!B4", values: [["Перекус"]] },
      { range: "DailyLog!B5", values: [["Перекус"]] },
    ]);
    // O (14) … AB (27); MealId (AC) and UnknownFields (AD) are unique and stay.
    expect(plan.deleteColumns).toEqual([27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14]);
  });
});
