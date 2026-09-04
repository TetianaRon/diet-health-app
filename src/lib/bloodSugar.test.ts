import { describe, expect, it } from "vitest";
import {
  bloodSugarEntryToRow,
  latestBloodSugarEntry,
  rowToBloodSugarEntry,
  type BloodSugarEntry,
} from "./bloodSugar";

describe("rowToBloodSugarEntry / bloodSugarEntryToRow", () => {
  it("round-trips through column order", () => {
    const entry: BloodSugarEntry = {
      timestamp: "2026-08-13T07:00:00.000Z",
      valueMmolL: 5.6,
      context: "fasting",
      notes: "",
    };
    expect(rowToBloodSugarEntry(bloodSugarEntryToRow(entry))).toEqual(entry);
  });

  it("defaults an unrecognized Context to other", () => {
    const row = ["2026-08-13T07:00:00.000Z", "5.6", "weird", ""];
    expect(rowToBloodSugarEntry(row).context).toBe("other");
  });

  it("defaults an unparseable value to 0", () => {
    const row = ["2026-08-13T07:00:00.000Z", "n/a", "other", ""];
    expect(rowToBloodSugarEntry(row).valueMmolL).toBe(0);
  });
});

describe("latestBloodSugarEntry", () => {
  it("returns the entry with the latest timestamp", () => {
    const entries: BloodSugarEntry[] = [
      { timestamp: "2026-08-12T07:00:00.000Z", valueMmolL: 5.0, context: "fasting", notes: "" },
      { timestamp: "2026-08-13T19:00:00.000Z", valueMmolL: 6.2, context: "after-meal", notes: "" },
      { timestamp: "2026-08-13T07:00:00.000Z", valueMmolL: 5.4, context: "fasting", notes: "" },
    ];
    expect(latestBloodSugarEntry(entries)?.valueMmolL).toBe(6.2);
  });

  it("returns null for an empty list", () => {
    expect(latestBloodSugarEntry([])).toBeNull();
  });
});
