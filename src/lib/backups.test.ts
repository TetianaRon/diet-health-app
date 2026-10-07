import { describe, expect, it } from "vitest";
import { backupsDue, BACKUP_KEEP_DAYS } from "./backups";

describe("backupsDue", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * day).toISOString();
  it("removes a copy once it is BACKUP_KEEP_DAYS old, not before", () => {
    const records = [
      { fileId: "old", reason: "first-sync", createdAt: at(BACKUP_KEEP_DAYS) },
      { fileId: "young", reason: "first-sync", createdAt: at(BACKUP_KEEP_DAYS - 1) },
      { fileId: "broken", reason: "first-sync", createdAt: "not a date" },
    ];
    expect(backupsDue(records, now).map((r) => r.fileId)).toEqual(["old"]);
  });
});
