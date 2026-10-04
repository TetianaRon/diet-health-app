import { describe, expect, it } from "vitest";
import { datesWithRecords, dayRecords, inOrder, lastIntakeOfDay, previousDateKey } from "./records";
import type { BloodSugarEntry } from "./bloodSugar";
import type { MedicationIntake } from "./medications";

// Local-time timestamps, so the date keys don't depend on the test machine's time zone.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

const sugar = (timestamp: string, valueMmolL: number): BloodSugarEntry => ({ timestamp, valueMmolL, context: "fasting", notes: "" });
const intake = (timestamp: string, medicationName: string, dose: number | null = 10): MedicationIntake => ({
  timestamp,
  medicationId: "M1",
  medicationName,
  dose,
  unit: "мг",
  notes: "",
});

describe("previousDateKey", () => {
  it("steps back one day, across months and years", () => {
    expect(previousDateKey("2026-10-05")).toBe("2026-10-04");
    expect(previousDateKey("2026-10-01")).toBe("2026-09-30");
    expect(previousDateKey("2026-01-01")).toBe("2025-12-31");
  });
});

describe("dayRecords", () => {
  const readings = [sugar(at(2026, 10, 5, 7, 10), 6.2), sugar(at(2026, 10, 4, 20, 0), 7.1)];
  const intakes = [intake(at(2026, 10, 5, 7, 30), "Форксига"), intake(at(2026, 10, 4, 21, 30), "Форксига")];

  it("merges the day's readings and intakes, newest first", () => {
    const records = dayRecords(readings, intakes, "2026-10-05", "newest");
    expect(records.map((r) => r.kind)).toEqual(["medication", "sugar"]);
  });

  it("oldest first puts them in chronological order", () => {
    const records = dayRecords(readings, intakes, "2026-10-05", "oldest");
    expect(records.map((r) => r.kind)).toEqual(["sugar", "medication"]);
  });

  it("leaves out other days", () => {
    expect(dayRecords(readings, intakes, "2026-10-03", "newest")).toEqual([]);
  });
});

describe("lastIntakeOfDay", () => {
  it("finds the latest intake of that day", () => {
    const intakes = [intake(at(2026, 10, 4, 8, 0), "A"), intake(at(2026, 10, 4, 21, 30), "B"), intake(at(2026, 10, 5, 7, 0), "C")];
    expect(lastIntakeOfDay(intakes, "2026-10-04")?.medicationName).toBe("B");
    expect(lastIntakeOfDay(intakes, "2026-10-03")).toBeNull();
  });
});

describe("inOrder / datesWithRecords", () => {
  it("sorts without mutating", () => {
    const items = [{ timestamp: at(2026, 10, 5, 9) }, { timestamp: at(2026, 10, 5, 7) }];
    expect(inOrder(items, "oldest")[0]).toBe(items[1]);
    expect(items[0].timestamp).toBe(at(2026, 10, 5, 9));
  });

  it("lists the days that have records, newest first", () => {
    expect(datesWithRecords([at(2026, 10, 3, 9), at(2026, 10, 5, 7), at(2026, 10, 5, 9), "bad"])).toEqual(["2026-10-05", "2026-10-03"]);
  });
});
