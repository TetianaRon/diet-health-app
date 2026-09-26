import { describe, expect, it } from "vitest";
import { buildColumnIndex, buildRow, cell, columnLetter, normalizeHeader, parseTab, resolveColumnIndex, SheetStructureError } from "./sheetRow";

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

describe("normalizeHeader / bilingual headers", () => {
  it("drops a trailing parenthesized label and trims", () => {
    expect(normalizeHeader("Carbs_g (Вуглеводи, г)")).toBe("Carbs_g");
    expect(normalizeHeader("  GI  ")).toBe("GI");
    expect(normalizeHeader(undefined)).toBe("");
  });

  it("lets buildColumnIndex resolve bilingual headers", () => {
    const columnIndex = buildColumnIndex(["Timestamp (Час)", "ValueMmolL (Цукор, ммоль/л)"]);
    expect(columnIndex.get("ValueMmolL")).toBe(1);
  });

  it("keeps the leftmost column when a header repeats", () => {
    expect(buildColumnIndex(["Timestamp (Час)", "Timestamp"]).get("Timestamp")).toBe(0);
  });
});

describe("resolveColumnIndex", () => {
  const canonical = ["Timestamp", "ValueMmolL", "Context", "Notes"];

  it("returns the index for a sound header row", () => {
    expect(resolveColumnIndex("BloodSugar", ["Notes", "Timestamp", "Context", "ValueMmolL"], canonical).get("Notes")).toBe(0);
  });

  it("refuses a header row with a missing column instead of dropping that field", () => {
    expect(() => resolveColumnIndex("BloodSugar", ["Timestamp", "ValueMmolL", "Context"], canonical)).toThrow(SheetStructureError);
  });

  it("refuses duplicated headers (mom's sheet after the old top-up)", () => {
    const header = ["Timestamp (Час)", "ValueMmolL (Цукор)", "Context (Контекст)", "Notes (Примітки)", ...canonical];
    expect(() => resolveColumnIndex("BloodSugar", header, canonical)).toThrow(SheetStructureError);
  });

  it("refuses a missing header row", () => {
    expect(() => resolveColumnIndex("BloodSugar", [], canonical)).toThrow(SheetStructureError);
  });
});

describe("parseTab", () => {
  const canonical = ["Timestamp", "ValueMmolL", "Context", "Notes"];

  it("skips the readable-names row: data starts at sheet row 3", () => {
    const parsed = parseTab("BloodSugar", [canonical, ["Час", "Цукор, ммоль/л", "Контекст", "Примітки"], ["t1", "6.5", "fasting", ""]], canonical);
    expect(parsed.firstDataRow).toBe(3);
    expect(parsed.dataRows).toEqual([["t1", "6.5", "fasting", ""]]);
  });

  it("keeps working on a sheet without a names row: data starts at sheet row 2", () => {
    const parsed = parseTab("BloodSugar", [canonical, ["t1", "6.5", "fasting", ""]], canonical);
    expect(parsed.firstDataRow).toBe(2);
    expect(parsed.dataRows).toHaveLength(1);
  });
});
