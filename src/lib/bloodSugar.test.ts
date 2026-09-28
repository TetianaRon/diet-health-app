import { describe, expect, it } from "vitest";
import {
  BLOOD_SUGAR_HEADERS,
  bloodSugarEntryToRow,
  groupBloodSugarByDay,
  latestBloodSugarEntry,
  planBloodSugarUpdate,
  rowToBloodSugarEntry,
  type BloodSugarEntry,
} from "./bloodSugar";
import { buildColumnIndex } from "./sheetRow";

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

describe("planBloodSugarUpdate", () => {
  const columnIndex = buildColumnIndex(BLOOD_SUGAR_HEADERS);
  const a: BloodSugarEntry = { timestamp: "2026-09-27T06:00:00.000Z", valueMmolL: 6.2, context: "fasting", notes: "" };
  const b: BloodSugarEntry = { timestamp: "2026-09-27T12:00:00.000Z", valueMmolL: 7.9, context: "after-meal", notes: "" };
  const rows = [bloodSugarEntryToRow(a, columnIndex), bloodSugarEntryToRow(b, columnIndex)];

  it("rewrites the matching row, counting from the first data row", () => {
    const updated = { ...b, timestamp: "2026-09-27T11:30:00.000Z", valueMmolL: 7.4 };
    const plan = planBloodSugarUpdate(b, updated, rows, columnIndex, 3);
    expect(plan).toEqual({ range: "BloodSugar!A4:D4", values: [bloodSugarEntryToRow(updated, columnIndex)] });
  });

  it("returns null when the original reading is gone", () => {
    const missing = { ...a, valueMmolL: 9.9 };
    expect(planBloodSugarUpdate(missing, a, rows, columnIndex, 3)).toBeNull();
  });
});

describe("groupBloodSugarByDay", () => {
  it("groups by local day, newest day and newest reading first", () => {
    const at = (y: number, mo: number, d: number, h: number) => new Date(y, mo - 1, d, h).toISOString();
    const e = (ts: string, v: number): BloodSugarEntry => ({ timestamp: ts, valueMmolL: v, context: "other", notes: "" });
    const days = groupBloodSugarByDay([e(at(2026, 9, 26, 8), 1), e(at(2026, 9, 27, 7), 2), e(at(2026, 9, 27, 13), 3)]);
    expect(days.map((d) => d.dateKey)).toEqual(["2026-09-27", "2026-09-26"]);
    expect(days[0].entries.map((x) => x.valueMmolL)).toEqual([3, 2]);
  });
});
