import { describe, expect, it } from "vitest";
import { parseSpreadsheetId } from "./sheets";

describe("parseSpreadsheetId", () => {
  it("extracts the ID from a full Google Sheets URL", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1fm8fFccWv5sNlCFhWpfkIbGXCmcB9Ra7GxW1Rvs8RM0/edit#gid=0")).toBe(
      "1fm8fFccWv5sNlCFhWpfkIbGXCmcB9Ra7GxW1Rvs8RM0",
    );
  });

  it("extracts the ID from a URL with no trailing /edit", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/xyz789")).toBe("xyz789");
  });

  it("returns a bare ID unchanged", () => {
    expect(parseSpreadsheetId("1fm8fFccWv5sNlCFhWpfkIbGXCmcB9Ra7GxW1Rvs8RM0")).toBe("1fm8fFccWv5sNlCFhWpfkIbGXCmcB9Ra7GxW1Rvs8RM0");
  });

  it("trims surrounding whitespace", () => {
    expect(parseSpreadsheetId("  https://docs.google.com/spreadsheets/d/abc123/edit  ")).toBe("abc123");
  });
});
