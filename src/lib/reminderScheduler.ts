// Thin Capacitor glue for the meal-time reminder feature — no unit tests
// here by design, same as sheets.ts's authorizedFetch: this is IO/platform
// wiring around the pure logic in reminders.ts, which is what's tested.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { uk } from "../i18n/uk";
import { FOLLOW_UP_MINUTES, planMealReminders } from "./reminders";
import type { Settings } from "./settings";

// The reminder is 1001, its follow-ups 1002 and 1003 (2.0.3).
const MEAL_REMINDER_NOTIFICATION_IDS = [0, ...FOLLOW_UP_MINUTES].map((_, i) => 1001 + i);
// A channel's sound and vibration can't change once created, so 2.0.3's
// vibrating channel has a new id and the old one is deleted.
const MEAL_REMINDER_CHANNEL_ID = "meal-reminders-2";
const OLD_CHANNEL_IDS = ["meal-reminders"];

/**
 * Creates the high-importance, lock-screen-visible, vibrating channel (with the
 * phone's usual notification sound). Call once at app startup; no-op outside a
 * native (Android) build. It doesn't ask for any permission: that's
 * ReminderAccessNotice's one explained ask (2.0.3).
 */
export async function initMealReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await LocalNotifications.createChannel({
    id: MEAL_REMINDER_CHANNEL_ID,
    name: uk.reminders.channelName,
    importance: 5, // IMPORTANCE_HIGH — heads-up + sound
    visibility: 1, // VISIBILITY_PUBLIC — shown in full on the lock screen
    vibration: true,
  });
  for (const id of OLD_CHANNEL_IDS) await LocalNotifications.deleteChannel({ id }).catch(() => undefined);
}

/**
 * (Re)schedules the meal-gap reminder and its follow-ups (+30 and +60 min) for
 * the given last-meal time, cancelling the earlier ones first — so logging a
 * meal cancels whatever was pending. No-op outside a native (Android) build.
 * Ones already due or in quiet hours aren't scheduled (planMealReminders).
 * Each carries `catchUpUntil` for the patched plugin's reboot restore
 * (patches/@capacitor+local-notifications+8.3.1.patch): a reminder missed
 * while the phone was off shows after it starts again, unless quiet hours
 * have begun by then.
 */
export async function scheduleMealReminder(lastMealTime: Date, settings: Settings): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await LocalNotifications.cancel({ notifications: MEAL_REMINDER_NOTIFICATION_IDS.map((id) => ({ id })) });

  const plan = planMealReminders(lastMealTime, settings, new Date());
  if (plan.length === 0) return;

  // Exact only when «Будильники й нагадування» is already allowed. Asking for
  // an exact alarm without it makes the plugin (8.3.1) open that settings
  // screen on every schedule — each app open and meal save — and pressing
  // back from it reopened it on the app's return (build 22). Asking is
  // ReminderAccessNotice's job, on her tap.
  const exact = await LocalNotifications.checkExactNotificationSetting()
    .then((s) => s.exact_alarm === "granted")
    .catch(() => false);

  await LocalNotifications.schedule({
    notifications: plan.map((reminder) => ({
      id: MEAL_REMINDER_NOTIFICATION_IDS[reminder.index],
      channelId: MEAL_REMINDER_CHANNEL_ID,
      title: uk.reminders.notificationTitle,
      body: reminder.index === 0 ? uk.reminders.notificationBody : uk.reminders.followUpBody,
      // Without allowWhileIdle Android's Doze mode holds the alarm while the
      // phone sits idle with the screen off, so it only arrived once the app
      // was opened — 2026-09-27.
      schedule: { at: reminder.at, allowWhileIdle: true },
      isExactNotification: exact,
      extra: { screen: "today", action: "addMeal", catchUpUntil: reminder.catchUpUntil?.getTime() ?? 0 },
    })),
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

/**
 * Asks for whatever is missing, one after the other (2.0.3): the notification
 * prompt, then — once notifications are allowed — the system «Будильники й
 * нагадування» screen.
 */
export async function requestReminderAccess(access: ReminderAccess): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!access.notifications) {
    const result = await LocalNotifications.requestPermissions();
    if (result.display !== "granted") return;
  }
  if (!access.exactAlarms) await LocalNotifications.changeExactNotificationSetting();
}
