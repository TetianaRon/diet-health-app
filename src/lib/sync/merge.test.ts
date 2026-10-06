import { describe, expect, it } from "vitest";
import { applyChanges, cellKey, coalesce, planPush, type RecordChange } from "./merge";

const HEAD = ["Timestamp", "ValueMmolL", "Notes", "Id", "UpdatedAt"];
const LABELS = ["Час", "Цукор, ммоль/л", "Примітки", "Ідентифікатор", "Змінено"];
const T0 = "2026-10-05T08:00:00.000Z";
const T1 = "2026-10-05T09:00:00.000Z";
const T2 = "2026-10-05T10:00:00.000Z";
const T3 = "2026-10-05T11:00:00.000Z";

function sheet(...rows: unknown[][]): unknown[][] {
  return [HEAD, LABELS, ...rows];
}

let seq = 0;
function upsert(id: string, fields: Record<string, unknown>, base: Record<string, unknown>, changedAt: string): RecordChange {
  return { seq: ++seq, tab: "BloodSugar", id, op: "upsert", fields, base, changedAt };
}
function del(id: string, base: Record<string, unknown>, changedAt: string): RecordChange {
  return { seq: ++seq, tab: "BloodSugar", id, op: "delete", fields: {}, base, changedAt };
}

describe("cellKey", () => {
  it("treats the sheet's numbers, booleans and text-dates like the app's strings", () => {
    expect(cellKey(6.2)).toBe(cellKey("6.2"));
    expect(cellKey("6,2")).toBe(cellKey(6.2));
    expect(cellKey(true)).toBe(cellKey("TRUE"));
    expect(cellKey("'2026-10-05")).toBe(cellKey("2026-10-05"));
    expect(cellKey(null)).toBe(cellKey(""));
  });
});

describe("applyChanges", () => {
  it("shows edits, new records and deletions on top of the device copy", () => {
    const grid = sheet([T0, 6.2, "", "S1", ""], [T0, 7.0, "", "S2", ""]);
    const view = applyChanges("BloodSugar", grid, [
      upsert("S1", { ValueMmolL: 6.5, UpdatedAt: T1 }, { ValueMmolL: 6.2, UpdatedAt: "" }, T1),
      del("S2", { UpdatedAt: "" }, T1),
      upsert("S3", { Timestamp: T1, ValueMmolL: 5.9, Notes: "", UpdatedAt: T1 }, {}, T1),
    ]);
    expect(view.slice(2)).toEqual([
      [T0, 6.5, "", "S1", T1],
      [T1, 5.9, "", "S3", T1],
    ]);
  });
});

describe("coalesce", () => {
  it("merges several saves of one record, keeping each field's first base", () => {
    const [c] = coalesce([
      upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2 }, T1),
      upsert("S1", { ValueMmolL: 6.8, Notes: "після сніданку" }, { ValueMmolL: 6.5, Notes: "" }, T2),
    ]);
    expect(c.fields).toEqual({ ValueMmolL: 6.8, Notes: "після сніданку" });
    expect(c.base).toEqual({ ValueMmolL: 6.2, Notes: "" });
    expect(c.changedAt).toBe(T2);
  });
  it("drops a record created and deleted before it ever synced", () => {
    const plan = planPush("BloodSugar", sheet(), [upsert("S9", { ValueMmolL: 5 }, {}, T1), del("S9", { ValueMmolL: 5 }, T2)], new Map());
    expect(plan.appendRows).toEqual([]);
    expect(plan.deleteRows).toEqual([]);
    expect(plan.doneSeqs).toHaveLength(2);
  });
});

describe("planPush", () => {
  it("writes only the changed field into the record's row, stamping UpdatedAt", () => {
    const plan = planPush("BloodSugar", sheet([T0, 6.2, "", "S1", ""]), [upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2, UpdatedAt: "" }, T1)], new Map());
    expect(plan.cellUpdates).toEqual([{ range: "BloodSugar!A3:E3", values: [[null, 6.5, null, null, T1]] }]);
  });

  it("appends a new record with its ID and time", () => {
    const plan = planPush("BloodSugar", sheet(), [upsert("S3", { Timestamp: T1, ValueMmolL: 5.9, Notes: "" }, {}, T1)], new Map());
    expect(plan.appendRows).toEqual([[T1, 5.9, "", "S3", T1]]);
  });

  it("keeps a hand edit made in the sheet, and still writes the other fields", () => {
    // Someone typed a note in the sheet; the phone changed the value of the same reading.
    const grid = sheet([T0, 6.2, "написала від руки", "S1", ""]);
    const plan = planPush(
      "BloodSugar",
      grid,
      [upsert("S1", { ValueMmolL: 6.5, Notes: "" }, { ValueMmolL: 6.2, Notes: "", UpdatedAt: "" }, T1)],
      new Map(),
    );
    expect(plan.cellUpdates[0].values[0]).toEqual([null, 6.5, null, null, T1]);
  });

  it("lets a hand edit of the same field win", () => {
    const grid = sheet([T0, 7.4, "", "S1", ""]);
    const plan = planPush("BloodSugar", grid, [upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2, UpdatedAt: "" }, T1)], new Map());
    expect(plan.cellUpdates).toEqual([]);
    expect(plan.doneSeqs).toHaveLength(1);
  });

  it("lets the later of two devices win a field both changed", () => {
    const base = { ValueMmolL: 6.2, UpdatedAt: T0 };
    const otherDeviceLater = sheet([T0, 7.0, "", "S1", T3]);
    expect(planPush("BloodSugar", otherDeviceLater, [upsert("S1", { ValueMmolL: 6.5 }, base, T2)], new Map()).cellUpdates).toEqual([]);
    const otherDeviceEarlier = sheet([T0, 7.0, "", "S1", T1]);
    expect(planPush("BloodSugar", otherDeviceEarlier, [upsert("S1", { ValueMmolL: 6.5 }, base, T2)], new Map()).cellUpdates[0].values[0]).toEqual([
      null,
      6.5,
      null,
      null,
      T2,
    ]);
  });

  it("deletes the row and logs it, bottom rows first", () => {
    const grid = sheet([T0, 6.2, "", "S1", ""], [T0, 7.0, "", "S2", ""]);
    const plan = planPush("BloodSugar", grid, [del("S1", { UpdatedAt: "" }, T1), del("S2", { UpdatedAt: "" }, T1)], new Map());
    expect(plan.deleteRows).toEqual([4, 3]);
    expect(plan.deletedLog).toEqual([
      { id: "S1", tab: "BloodSugar", deletedAt: T1 },
      { id: "S2", tab: "BloodSugar", deletedAt: T1 },
    ]);
  });

  it("keeps a record another device edited after this device deleted it", () => {
    const plan = planPush("BloodSugar", sheet([T0, 7.0, "", "S1", T3]), [del("S1", { UpdatedAt: T0 }, T2)], new Map());
    expect(plan.deleteRows).toEqual([]);
  });

  it("drops an edit to a record deleted later on another device, but brings back one deleted earlier", () => {
    const edit = upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2, UpdatedAt: T0 }, T2);
    expect(planPush("BloodSugar", sheet(), [edit], new Map([["S1", T3]])).appendRows).toEqual([]);
    const later = upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2, UpdatedAt: T0 }, T2);
    expect(planPush("BloodSugar", sheet(), [later], new Map([["S1", T1]])).appendRows).toHaveLength(1);
  });

  it("respects a row removed by hand from the sheet (no Deleted entry)", () => {
    const plan = planPush("BloodSugar", sheet(), [upsert("S1", { ValueMmolL: 6.5 }, { ValueMmolL: 6.2, UpdatedAt: "" }, T1)], new Map());
    expect(plan.appendRows).toEqual([]);
  });

  it("matches Settings rows by Key", () => {
    const grid = [["Key", "Value", "Label"], ["Ключ", "Значення", "Назва"], ["DailyCaloriesTarget", 1800, "Калорії"]];
    const change: RecordChange = { seq: 99, tab: "Settings", id: "DailyCaloriesTarget", op: "upsert", fields: { Value: 1700 }, base: { Value: 1800 }, changedAt: T1 };
    expect(planPush("Settings", grid, [change], new Map()).cellUpdates).toEqual([{ range: "Settings!A3:C3", values: [[null, 1700, null]] }]);
  });
});
