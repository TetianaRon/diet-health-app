import { describe, expect, it } from "vitest";
import { isSheetTooNew, sheetFormatOf, SUPPORTED_SHEET_FORMAT } from "./sheetFormat";

describe("the sheet's format (2.1)", () => {
  it("is 1 without the key, else its number", () => {
    expect(sheetFormatOf([["Key", "Value", "Label"], ["MaxGapHours", 3, ""]])).toBe(1);
    expect(sheetFormatOf([["SheetFormat", 2, ""]])).toBe(2);
    expect(sheetFormatOf([["SheetFormat", "абв", ""]])).toBe(1);
  });

  it("stops this app only on a format newer than it knows", () => {
    expect(isSheetTooNew([["SheetFormat", SUPPORTED_SHEET_FORMAT, ""]])).toBe(false);
    expect(isSheetTooNew([["SheetFormat", SUPPORTED_SHEET_FORMAT + 1, ""]])).toBe(true);
    expect(isSheetTooNew([])).toBe(false);
  });
});
