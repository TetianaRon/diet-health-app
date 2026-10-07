import { describe, expect, it } from "vitest";
import { isBackupCopyName } from "./backupTag";

describe("isBackupCopyName", () => {
  it("knows a backup copy by its name", () => {
    expect(isBackupCopyName("Трекер харчування — копія перед синхронізацією 2026-10-06 19:05")).toBe(true);
  });
  it("leaves real spreadsheets alone, including similar names", () => {
    expect(isBackupCopyName("Мої дані — Трекер харчування")).toBe(false);
    expect(isBackupCopyName("Трекер харчування")).toBe(false);
    expect(isBackupCopyName("trackmymealstemplate-dev")).toBe(false);
  });
});
