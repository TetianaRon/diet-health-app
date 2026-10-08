import { describe, expect, it } from "vitest";
import { computeReminderTime, isWithinQuietHours, nextQuietStart, planMealReminders, shouldScheduleReminder } from "./reminders";

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

describe("planMealReminders", () => {
  const settings = { maxGapHours: 3, wakeTime: "06:30", sleepTime: "23:00" };

  it("plans the reminder and follow-ups at +30 and +60 min, each caught up only until quiet hours", () => {
    const plan = planMealReminders(new Date(2026, 0, 1, 9, 0), settings, new Date(2026, 0, 1, 9, 5));
    expect(plan.map((p) => [p.index, p.at])).toEqual([
      [0, new Date(2026, 0, 1, 12, 0)],
      [1, new Date(2026, 0, 1, 12, 30)],
      [2, new Date(2026, 0, 1, 13, 0)],
    ]);
    expect(plan.every((p) => p.catchUpUntil?.getTime() === new Date(2026, 0, 1, 23, 0).getTime())).toBe(true);
  });

  it("never sends one already due — opening the app while overdue sends nothing new", () => {
    const plan = planMealReminders(new Date(2026, 0, 1, 9, 0), settings, new Date(2026, 0, 1, 12, 10));
    expect(plan.map((p) => p.index)).toEqual([1, 2]);
    expect(planMealReminders(new Date(2026, 0, 1, 9, 0), settings, new Date(2026, 0, 1, 14, 0))).toEqual([]);
  });

  it("drops the ones that fall in quiet hours", () => {
    const plan = planMealReminders(new Date(2026, 0, 1, 19, 45), settings, new Date(2026, 0, 1, 19, 50));
    expect(plan.map((p) => p.index)).toEqual([0]); // 22:45; 23:15 and 23:45 are in quiet hours
  });
});

describe("nextQuietStart", () => {
  it("is the next sleep time after the date, today or tomorrow", () => {
    expect(nextQuietStart(new Date(2026, 0, 1, 12, 0), "06:30", "00:00")).toEqual(new Date(2026, 0, 2, 0, 0));
    expect(nextQuietStart(new Date(2026, 0, 1, 12, 0), "06:30", "23:00")).toEqual(new Date(2026, 0, 1, 23, 0));
    expect(nextQuietStart(new Date(2026, 0, 1, 12, 0), "07:00", "07:00")).toBeNull();
  });
});
