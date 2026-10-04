import { describe, expect, it } from "vitest";
import { parseWeightEntries, planWeightUpdate, weightEntryToRow, rowToWeightEntry, weightTrend, type WeightEntry } from "./weight";
import { buildColumnIndex } from "./sheetRow";

const day = (d: number) => new Date(2026, 9, d, 7, 0).toISOString(); // October 2026, local time
const w = (d: number, weightKg: number): WeightEntry => ({ timestamp: day(d), weightKg, notes: "" });

describe("weightTrend", () => {
  it("is null with no entries", () => {
    expect(weightTrend([])).toBeNull();
  });

  it("compares with the average of the other measurements in the last 30 days (at least 3)", () => {
    const trend = weightTrend([w(30, 72.4), w(25, 73.2), w(20, 73.0), w(15, 72.8)]);
    expect(trend?.latest.weightKg).toBe(72.4);
    expect(trend?.comparison).toEqual({ kind: "average", average: 73, count: 3, diff: -0.6 });
  });

  it("ignores measurements older than 30 days for the average", () => {
    // only one other measurement inside the window → falls back to the previous one
    const trend = weightTrend([w(31, 72.4), w(28, 72.6), w(1, 80)]);
    expect(trend?.comparison).toEqual({ kind: "previous", previous: 72.6, daysAgo: 3, diff: -0.2 });
  });

  it("uses the latest entry by time, whatever the order given", () => {
    expect(weightTrend([w(10, 70), w(12, 71)])?.latest.weightKg).toBe(71);
  });

  it("has no comparison for a single measurement", () => {
    expect(weightTrend([w(10, 70)])?.comparison).toBeNull();
  });
});

describe("weight rows", () => {
  it("round-trips and reads either decimal separator", () => {
    const entry = w(5, 72.4);
    expect(rowToWeightEntry(weightEntryToRow(entry))).toEqual(entry);
    expect(rowToWeightEntry([day(5), "72,4", ""]).weightKg).toBe(72.4);
  });

  it("parses a tab with a readable-names row and skips blank/zero rows", () => {
    const rows = [["Timestamp", "WeightKg", "Notes"], ["Час", "Вага, кг", "Примітки"], [day(5), 72.4, ""], ["", "", ""], [day(6), 0, ""]];
    expect(parseWeightEntries(rows)).toEqual([w(5, 72.4)]);
  });

  it("finds the row to update by time and weight", () => {
    const index = buildColumnIndex(["Timestamp", "WeightKg", "Notes"]);
    const update = planWeightUpdate(w(5, 72.4), w(5, 72.0), [weightEntryToRow(w(4, 73), index), weightEntryToRow(w(5, 72.4), index)], index, 3);
    expect(update?.range).toBe("Weight!A4:C4");
    expect(planWeightUpdate(w(9, 1), w(9, 2), [], index)).toBeNull();
  });
});
