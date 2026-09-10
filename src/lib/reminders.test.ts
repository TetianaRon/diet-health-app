import { describe, expect, it } from "vitest";
import { computeReminderTime, isWithinQuietHours, shouldScheduleReminder } from "./reminders";

describe("isWithinQuietHours", () => {
  // Mom's actual schedule: sleeps at midnight, wakes 6:30 — a non-wrapping window.
  it("treats a non-wrapping window (sleep 00:00, wake 06:30) as quiet only between them", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 3, 0), "06:30", "00:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 6, 30), "06:30", "00:00")).toBe(false);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), "06:30", "00:00")).toBe(false);
  });

  it("handles a window that wraps midnight (sleep 23:00, wake 06:30)", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 23, 30), "06:30", "23:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 3, 0), "06:30", "23:00")).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 0, 1, 12, 0), "06:30", "23:00")).toBe(false);
  });

  it("treats equal wake/sleep times as no quiet hours at all", () => {
    expect(isWithinQuietHours(new Date(2026, 0, 1, 3, 0), "07:00", "07:00")).toBe(false);
  });
});

describe("computeReminderTime", () => {
  it("adds maxGapHours to the last meal time", () => {
    const lastMeal = new Date(2026, 0, 1, 9, 0);
    const result = computeReminderTime(lastMeal, 3);
    expect(result).toEqual(new Date(2026, 0, 1, 12, 0));
  });
});

describe("shouldScheduleReminder", () => {
  it("is false when the reminder would land in quiet hours", () => {
    const reminderTime = new Date(2026, 0, 1, 2, 0);
    expect(shouldScheduleReminder(reminderTime, "06:30", "00:00")).toBe(false);
  });

  it("is true when the reminder would land outside quiet hours", () => {
    const reminderTime = new Date(2026, 0, 1, 12, 0);
    expect(shouldScheduleReminder(reminderTime, "06:30", "00:00")).toBe(true);
  });
});
