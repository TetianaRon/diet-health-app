import { describe, expect, it } from "vitest";
import { parseA1Range, sliceGrid, tabsOfRanges } from "./a1";

const grid = [
  ["Id", "Name", "Carbs", ""],
  ["ID", "Назва", "Вуглеводи"],
  ["I1", "Гречка", 20],
  ["I2", "Рис", 28, "extra"],
  [],
  ["I3", "", ""],
];

describe("parseA1Range", () => {
  it("reads closed, open-ended and single-cell ranges", () => {
    expect(parseA1Range("A1:L200")).toEqual({ firstCol: 0, firstRow: 0, lastCol: 11, lastRow: 199 });
    expect(parseA1Range("A:J")).toEqual({ firstCol: 0, firstRow: 0, lastCol: 9, lastRow: Infinity });
    expect(parseA1Range("Settings!B5")).toEqual({ firstCol: 1, firstRow: 4, lastCol: 1, lastRow: 4 });
    expect(parseA1Range("A2:C")).toEqual({ firstCol: 0, firstRow: 1, lastCol: 2, lastRow: Infinity });
    expect(parseA1Range("AA1:ZZ1").lastCol).toBe(701);
  });
});

describe("sliceGrid", () => {
  it("returns the range from its top-left cell, trimmed like the values API", () => {
    expect(sliceGrid(grid, "A1:C")).toEqual([
      ["Id", "Name", "Carbs"],
      ["ID", "Назва", "Вуглеводи"],
      ["I1", "Гречка", 20],
      ["I2", "Рис", 28],
      [],
      ["I3"],
    ]);
    expect(sliceGrid(grid, "A1:ZZ1")).toEqual([["Id", "Name", "Carbs"]]);
    expect(sliceGrid(grid, "B3:C4")).toEqual([["Гречка", 20], ["Рис", 28]]);
    expect(sliceGrid(grid, "A10:C20")).toEqual([]);
  });
});

describe("tabsOfRanges", () => {
  it("collects tab names, including quoted ones", () => {
    expect(tabsOfRanges(["Ingredients!A2:B2", "Ingredients!C3", "'Mom''s tab'!A1", "B5"])).toEqual(["Ingredients", "Mom's tab"]);
  });
});
