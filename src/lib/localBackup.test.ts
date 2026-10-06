import { describe, expect, it } from "vitest";
import * as xlsx from "xlsx";
import { backupReminderDue, gridsToWorkbook, workbookToGrids } from "./localBackup";
import { initialGrids } from "./localMode";

describe("the .xlsx backup", () => {
  it("round-trips every tab: keys, readable names, numbers, booleans and text", () => {
    const grids = initialGrids();
    grids.get("BloodSugar")!.push(["2026-10-05T08:00:00.000Z", 6.2, "fasting", "після сну", "Sabc", "2026-10-05T08:01:00.000Z"]);
    const back = workbookToGrids(xlsx, gridsToWorkbook(xlsx, grids));
    expect(back.get("BloodSugar")!.slice(-1)[0]).toEqual(["2026-10-05T08:00:00.000Z", 6.2, "fasting", "після сну", "Sabc", "2026-10-05T08:01:00.000Z"]);
    expect(back.get("Settings")![0]).toEqual(["Key", "Value", "Label"]);
    expect(back.get("Settings")!.length).toBe(grids.get("Settings")!.length);
  });

  it("refuses a file that isn't a backup of this app", () => {
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([["Something", "else"]]), "Sheet1");
    const bytes = new Uint8Array(xlsx.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect(() => workbookToGrids(xlsx, bytes)).toThrow();
  });
});

describe("backupReminderDue", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("reminds 30 days after the last backup, or after starting without one", () => {
    expect(backupReminderDue("2026-10-11T12:00:00Z", null, now)).toBe(true);
    expect(backupReminderDue("2026-10-12T12:00:00Z", null, now)).toBe(false);
    expect(backupReminderDue(null, "2026-10-01T00:00:00Z", now)).toBe(true);
    expect(backupReminderDue(null, null, now)).toBe(false);
  });
});
