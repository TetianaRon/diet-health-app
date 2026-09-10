// Pure scheduling logic for the meal-time reminder feature (see the
// 2026-09-09 "Scoped the meal-time reminder mechanics" entry in
// docs/build-log.md for the full design). Platform-specific work (Capacitor
// Local Notifications, cached last-meal timestamp) lives in
// reminderScheduler.ts — this file has no Capacitor dependency so it can be
// unit-tested like the rest of src/lib.

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * True if `date`'s local time-of-day falls within the [sleepTime, wakeTime)
 * quiet window. Handles a window that wraps past midnight (e.g. sleep 23:00,
 * wake 6:30) as well as one that doesn't (e.g. sleep 00:00, wake 06:30).
 */
export function isWithinQuietHours(date: Date, wakeTime: string, sleepTime: string): boolean {
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  const sleepMin = parseTimeToMinutes(sleepTime);
  const wakeMin = parseTimeToMinutes(wakeTime);

  if (sleepMin === wakeMin) return false; // degenerate config — treat as "no quiet hours" rather than "always quiet"
  if (sleepMin < wakeMin) return minutesOfDay >= sleepMin && minutesOfDay < wakeMin;
  return minutesOfDay >= sleepMin || minutesOfDay < wakeMin; // wraps midnight
}

/** The reminder's target fire time — lastMealTime plus the configured max gap. */
export function computeReminderTime(lastMealTime: Date, maxGapHours: number): Date {
  return new Date(lastMealTime.getTime() + maxGapHours * 60 * 60 * 1000);
}

/**
 * Whether a reminder due at `reminderTime` should actually be scheduled.
 * False if it would land in quiet hours — no catch-up ping at wake, per
 * design; normal gap-tracking just resumes from whenever she next logs.
 */
export function shouldScheduleReminder(reminderTime: Date, wakeTime: string, sleepTime: string): boolean {
  return !isWithinQuietHours(reminderTime, wakeTime, sleepTime);
}
