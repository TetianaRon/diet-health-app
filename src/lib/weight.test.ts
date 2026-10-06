import { describe, expect, it } from "vitest";
import { normalizeDateCell, parseWeightEntries, planWeightSave, rowToWeightEntry, weightEntryToRow, weightTrend, type WeightEntry } from "./weight";
import { buildColumnIndex } from "./sheetRow";

const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;
const w = (d: number, weightKg: number): WeightEntry => ({ date: day(d), weightKg, notes: "" });

describe("weightTrend", () => {
  it("is null with no entries", () => {
    expect(weightTrend([])).toBeNull();
  });

  it("compares with the average of the other measurements in the last 30 days (at least 3)", () => {
    const trend = weightTrend([w(30, 72.4), w(25, 73.2), w(20, 73.0), w(15, 72.8)]);
    expect(trend?.latest.weightKg).toBe(72.4);
    expect(trend?.comparison).toEqual({ kind: "average", average: 73, count: 3, diff: -0.6 });
  });

  it("falls back to the previous measurement with fewer than 3 in the window", () => {
    const trend = weightTrend([w(31, 72.4), w(28, 72.6), { date: "2026-08-01", weightKg: 80, notes: "" }]);
    expect(trend?.comparison).toEqual({ kind: "previous", previous: 72.6, daysAgo: 3, diff: -0.2 });
  });

  it("uses the latest day, whatever the order given", () => {
    expect(weightTrend([w(10, 70), w(12, 71)])?.latest.weightKg).toBe(71);
  });

  it("has no comparison for a single measurement", () => {
    expect(weightTrend([w(10, 70)])?.comparison).toBeNull();
  });
});

describe("normalizeDateCell", () => {
  it("reads the app's text date and a date typed in a Ukrainian sheet", () => {
    expect(normalizeDateCell("2026-10-05")).toBe("2026-10-05");
    expect(normalizeDateCell("05.10.2026")).toBe("2026-10-05");
    expect(normalizeDateCell("5.10.2026")).toBe("2026-10-05");
    expect(normalizeDateCell("")).toBe("");
    expect(normalizeDateCell("вчора")).toBe("");
  });
});

describe("weight rows", () => {
  it("writes the date as text (apostrophe) and reads it back", () => {
    const row = weightEntryToRow(w(5, 72.4));
    expect(row[0]).toBe("'2026-10-05");
    expect(rowToWeightEntry(["2026-10-05", "72,4", ""])).toEqual(w(5, 72.4));
  });

  it("keeps one entry per day (the later row wins) and skips blank rows", () => {
    const rows = [["Date", "WeightKg", "Notes", "Id", "UpdatedAt"], ["Дата", "Вага, кг", "Примітки", "Ідентифікатор", "Змінено"], [day(5), 72.4, ""], ["", "", ""], [day(5), 72.1, "ввечері"], [day(6), 0, ""]];
    expect(parseWeightEntries(rows)).toEqual([{ date: day(5), weightKg: 72.1, notes: "ввечері" }]);
  });

  it("overwrites the day's row when there is one, else appends", () => {
    const index = buildColumnIndex(["Date", "WeightKg", "Notes"]);
    const rows = [[day(4), 73, ""], [day(5), 72.4, ""]];
    expect(planWeightSave(w(5, 72.0), rows, index, 3)?.range).toBe("Weight!A4:C4");
    expect(planWeightSave(w(6, 72.0), rows, index, 3)).toBeNull();
  });
});
