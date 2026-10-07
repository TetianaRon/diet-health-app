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

  // Exact only when «Будильники й нагадування» is already allowed. Asking for
  // an exact alarm without it makes the plugin (8.3.1) open that settings
  // screen on every schedule — each app open and meal save — and pressing
  // back from it reopened it on the app's return (build 22). Asking is
  // ReminderAccessNotice's job, on her tap.
  const exact = await LocalNotifications.checkExactNotificationSetting()
    .then((s) => s.exact_alarm === "granted")
    .catch(() => false);

  await LocalNotifications.schedule({
    notifications: [
      {
        id: MEAL_REMINDER_NOTIFICATION_ID,
        channelId: MEAL_REMINDER_CHANNEL_ID,
        title: uk.reminders.notificationTitle,
        body: uk.reminders.notificationBody,
        // Without allowWhileIdle Android's Doze mode holds the alarm while the
        // phone sits idle with the screen off, so it only arrived once the app
        // was opened (and the overdue branch above re-fired it) — 2026-09-27.
        schedule: { at: fireTime, allowWhileIdle: true },
        isExactNotification: exact,
        extra: { screen: "today", action: "addMeal" },
      },
    ],
  });
}

/**
 * What the reminder is still missing on this phone: notification permission
 * and Android 12+'s "Alarms & reminders" (exact alarms), which Android 14+
 * leaves off by default for new installs — without it the reminder can come
 * late. Null outside a native build (nothing to ask for).
 */
export interface ReminderAccess {
  notifications: boolean;
  exactAlarms: boolean;
}

export async function getReminderAccess(): Promise<ReminderAccess | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const [perm, exact] = await Promise.all([
    LocalNotifications.checkPermissions(),
    LocalNotifications.checkExactNotificationSetting(),
  ]);
  return { notifications: perm.display === "granted", exactAlarms: exact.exact_alarm === "granted" };
}

/** Asks for whatever is missing: the notification prompt, or opens the system "Alarms & reminders" screen. */
export async function requestReminderAccess(access: ReminderAccess): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!access.notifications) await LocalNotifications.requestPermissions();
  if (!access.exactAlarms) await LocalNotifications.changeExactNotificationSetting();
}
