// Thin Capacitor glue for the meal-time reminder feature — no unit tests
// here by design, same as sheets.ts's authorizedFetch: this is IO/platform
// wiring around the pure logic in reminders.ts, which is what's tested.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { uk } from "../i18n/uk";
import { computeReminderTime, shouldScheduleReminder } from "./reminders";
import type { Settings } from "./settings";

const MEAL_REMINDER_NOTIFICATION_ID = 1001;
const MEAL_REMINDER_CHANNEL_ID = "meal-reminders";

/** Requests notification permission and creates the high-importance, lock-screen-visible channel. Call once at app startup; no-op outside a native (Android) build. */
export async function initMealReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await LocalNotifications.requestPermissions();
  await LocalNotifications.createChannel({
    id: MEAL_REMINDER_CHANNEL_ID,
    name: "Нагадування про їжу",
    importance: 5, // IMPORTANCE_HIGH — heads-up + sound
    visibility: 1, // VISIBILITY_PUBLIC — shown in full on the lock screen
  });
}

/**
 * (Re)schedules the meal-gap reminder for the given last-meal time,
 * cancelling any previously scheduled one first. No-op outside a native
 * (Android) build. If the gap is already overdue, fires almost immediately
 * instead — unless "now" itself falls in quiet hours, in which case it's
 * skipped entirely (no catch-up ping at wake, per design).
 */
export async function scheduleMealReminder(lastMealTime: Date, settings: Settings): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await LocalNotifications.cancel({ notifications: [{ id: MEAL_REMINDER_NOTIFICATION_ID }] });

  const now = new Date();
  const dueTime = computeReminderTime(lastMealTime, settings.maxGapHours);
  const overdue = dueTime < now;
  const checkTime = overdue ? now : dueTime;

  if (!shouldScheduleReminder(checkTime, settings.wakeTime, settings.sleepTime)) return;

  const fireTime = overdue ? new Date(now.getTime() + 5000) : dueTime;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: MEAL_REMINDER_NOTIFICATION_ID,
        channelId: MEAL_REMINDER_CHANNEL_ID,
        title: uk.reminders.notificationTitle,
        body: uk.reminders.notificationBody,
        schedule: { at: fireTime },
        extra: { screen: "today", action: "addMeal" },
      },
    ],
  });
}
