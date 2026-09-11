import { describe, expect, it } from "vitest";
import { buildColumnIndex, buildRow, cell, columnLetter } from "./sheetRow";

describe("buildColumnIndex / cell", () => {
  it("resolves a value by header name regardless of column order", () => {
    const columnIndex = buildColumnIndex(["NameUk", "Carbs_g", "GI"]);
    const row = ["Гречка", "19.9", "54"];
    expect(cell(row, columnIndex, "GI")).toBe("54");
    expect(cell(row, columnIndex, "NameUk")).toBe("Гречка");
  });

  it("still resolves correctly when the header row is reordered", () => {
    // Same data, but GI and Carbs_g have swapped columns.
    const columnIndex = buildColumnIndex(["NameUk", "GI", "Carbs_g"]);
    const row = ["Гречка", "54", "19.9"];
    expect(cell(row, columnIndex, "Carbs_g")).toBe("19.9");
    expect(cell(row, columnIndex, "GI")).toBe("54");
  });

  it("returns undefined for a header the sheet doesn't have", () => {
    const columnIndex = buildColumnIndex(["NameUk"]);
    expect(cell(["Гречка"], columnIndex, "GiVerified")).toBeUndefined();
  });

  it("ignores blank header cells", () => {
    const columnIndex = buildColumnIndex(["NameUk", "", "GI"]);
    expect(columnIndex.has("")).toBe(false);
    expect(columnIndex.get("GI")).toBe(2);
  });
});

describe("buildRow", () => {
  it("places each field at its header's actual column position", () => {
    const columnIndex = buildColumnIndex(["NameUk", "GI", "Carbs_g"]);
    const row = buildRow({ NameUk: "Гречка", Carbs_g: 19.9, GI: 54 }, columnIndex);
    expect(row).toEqual(["Гречка", 54, 19.9]);
  });

  it("leaves a field out entirely when its header isn't in the sheet yet", () => {
    const columnIndex = buildColumnIndex(["NameUk", "Carbs_g"]);
    const row = buildRow({ NameUk: "Гречка", Carbs_g: 19.9, GiVerified: true }, columnIndex);
    expect(row).toEqual(["Гречка", 19.9]);
  });
});

describe("columnLetter", () => {
  it("converts single-letter columns", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(14)).toBe("O");
    expect(columnLetter(25)).toBe("Z");
  });

  it("converts double-letter columns", () => {
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
  });
});
