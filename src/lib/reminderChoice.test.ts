import { describe, expect, it } from "vitest";
import { initialReminderChoice, reminderPopup } from "./reminderChoice";

const allowed = { notifications: true, exactAlarms: true };

describe("initialReminderChoice", () => {
  it("keeps a choice already made", () => {
    expect(initialReminderChoice("off", true)).toBe("off");
    expect(initialReminderChoice("on", false)).toBe("on");
  });

  it("starts on for someone who had allowed notifications before 2.1.3", () => {
    expect(initialReminderChoice(null, true)).toBe("on");
  });

  it("leaves it unchosen otherwise, so the offer can be shown", () => {
    expect(initialReminderChoice(null, false)).toBeNull();
  });
});

describe("reminderPopup", () => {
  it("offers reminders once when never chosen", () => {
    expect(reminderPopup(null, false, { notifications: false, exactAlarms: false })).toBe("offer");
    expect(reminderPopup(null, true, { notifications: false, exactAlarms: false })).toBeNull();
  });

  it("says nothing when reminders are on and allowed, or off", () => {
    expect(reminderPopup("on", true, allowed)).toBeNull();
    expect(reminderPopup("off", false, { notifications: false, exactAlarms: false })).toBeNull();
  });

  it("asks when reminders are on but a permission is missing", () => {
    expect(reminderPopup("on", true, { notifications: false, exactAlarms: true })).toBe("missing");
    expect(reminderPopup("on", true, { notifications: true, exactAlarms: false })).toBe("missing");
  });
});
