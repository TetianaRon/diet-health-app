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

/** Minutes after the reminder at which the follow-ups come (2.0.3, developer: +30 and +60). */
export const FOLLOW_UP_MINUTES = [30, 60] as const;

export interface PlannedReminder {
  /** 0 = the reminder itself, 1… = its follow-ups. */
  index: number;
  at: Date;
  /**
   * When a reminder missed while the phone was off stops being worth showing
   * after it starts again: the next quiet hours (null when there are none).
   */
  catchUpUntil: Date | null;
}

/** The next start of quiet hours after `date`, or null when sleep and wake times are equal (no quiet hours). */
export function nextQuietStart(date: Date, wakeTime: string, sleepTime: string): Date | null {
  if (parseTimeToMinutes(wakeTime) === parseTimeToMinutes(sleepTime)) return null;
  const sleepMin = parseTimeToMinutes(sleepTime);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(sleepMin / 60), sleepMin % 60);
  if (start <= date) start.setDate(start.getDate() + 1);
  return start;
}

/**
 * The reminder and its follow-ups for a last meal, as of `now`: only those
 * still ahead and outside quiet hours. One already due is dropped, not fired
 * again — opening the app while overdue sends nothing (2.0.3, developer);
 * Today's own notice says how long it's been.
 */
export function planMealReminders(
  lastMealTime: Date,
  settings: { maxGapHours: number; wakeTime: string; sleepTime: string },
  now: Date,
): PlannedReminder[] {
  const due = computeReminderTime(lastMealTime, settings.maxGapHours);
  return [0, ...FOLLOW_UP_MINUTES]
    .map((minutes, index) => ({ index, at: new Date(due.getTime() + minutes * 60 * 1000) }))
    .filter(({ at }) => at > now && shouldScheduleReminder(at, settings.wakeTime, settings.sleepTime))
    .map(({ index, at }) => ({ index, at, catchUpUntil: nextQuietStart(at, settings.wakeTime, settings.sleepTime) }));
}
