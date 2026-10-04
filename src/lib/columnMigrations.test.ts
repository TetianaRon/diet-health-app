import { describe, expect, it } from "vitest";
import { planColumnMigrations, timestampToDateKey, type ColumnMigration } from "./columnMigrations";
import { labelFor } from "./sheetLabels";

const local = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h).toISOString();

describe("timestampToDateKey", () => {
  it("turns a timestamp into its local day", () => {
    expect(timestampToDateKey(local(2026, 10, 4, 19))).toBe("2026-10-04");
    expect(timestampToDateKey("")).toBeNull();
    expect(timestampToDateKey("not a date")).toBeNull();
  });
});

describe("planColumnMigrations (Weight: Timestamp → Date)", () => {
  const headers = ["Timestamp", "WeightKg", "Notes", "Date"];
  const tab = (rows: unknown[][]) => new Map([["Weight", [headers, headers.map((h) => labelFor(h)), ...rows]]]);

  it("fills empty Date cells from Timestamp, as text, and keeps the old column", () => {
    const result = planColumnMigrations(tab([[local(2026, 10, 4, 19), 90.2, "", ""]]));
    expect(result.valueUpdates).toEqual([{ range: "Weight!D3", values: [["'2026-10-04"]] }]);
    expect(result.applied).toEqual([{ tab: "Weight", from: "Timestamp", to: "Date", cells: 1 }]);
  });

  it("never overwrites a filled Date cell and skips rows without a timestamp", () => {
    const result = planColumnMigrations(tab([[local(2026, 10, 4, 19), 90.2, "", "2026-10-03"], ["", 80, "", ""]]));
    expect(result.valueUpdates).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("does nothing until the new column exists, or when there's no old column", () => {
    expect(planColumnMigrations(new Map([["Weight", [["Timestamp", "WeightKg"], [local(2026, 10, 4, 19), 90]]]])).valueUpdates).toEqual([]);
    expect(planColumnMigrations(new Map([["Weight", [["Date", "WeightKg"], ["2026-10-04", 90]]]])).valueUpdates).toEqual([]);
  });

  it("works with any declared migration (non-text values too)", () => {
    const double: ColumnMigration = { tab: "X", from: "A", to: "B", convert: (v) => Number(v) * 2 };
    const result = planColumnMigrations(new Map([["X", [["A", "B"], [2, ""], [3, 9]]]]), [double]);
    expect(result.valueUpdates).toEqual([{ range: "X!B2", values: [[4]] }]);
  });
});
