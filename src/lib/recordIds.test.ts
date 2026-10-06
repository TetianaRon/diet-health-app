import { describe, expect, it } from "vitest";
import { newRecordId } from "./itemIds";
import { planRecordIds } from "./sheetUpgrade";

describe("newRecordId", () => {
  it("is the kind's prefix, the time in base 36 and five random characters", () => {
    const id = newRecordId("log", 1_791_233_000_000, () => 0.5);
    expect(id).toBe(`L${(1_791_233_000_000).toString(36)}iiiii`);
    expect(newRecordId("sugar")).toMatch(/^S[0-9a-z]{13}$/);
  });
  it("differs between two calls in the same millisecond", () => {
    const now = 1_791_233_000_000;
    expect(newRecordId("weight", now)).not.toBe(newRecordId("weight", now));
  });
});

describe("planRecordIds", () => {
  const rows = [
    ["Timestamp", "ValueMmolL", "Id"],
    ["Час", "Цукор", "Ідентифікатор"],
    ["2026-10-01T08:00:00Z", 6.2, ""],
    [],
    ["2026-10-02T08:00:00Z", 6.8, "Skeep1"],
    ["2026-10-03T08:00:00Z", 7.1],
  ];
  it("fills only blank Id cells of non-blank rows, below the names row", () => {
    let n = 0;
    const plan = planRecordIds("BloodSugar", rows, () => `S${++n}`);
    expect(plan.valueUpdates).toEqual([
      { range: "BloodSugar!C3", values: [["S1"]] },
      { range: "BloodSugar!C6", values: [["S2"]] },
    ]);
    expect(plan.filled).toBe(2);
  });
  it("does nothing until the Id column exists", () => {
    expect(planRecordIds("Weight", [["Date", "WeightKg"], ["2026-10-01", 89]], () => "W1").valueUpdates).toEqual([]);
  });
});
