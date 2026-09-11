// Shared Ukrainian date/time display helpers. Not unit-tested — the actual
// month-name spelling/declension comes from the platform's own uk-UA ICU
// data (see the comment in formatDateTime), which isn't ours to verify;
// these are thin wrappers, same "IO/platform glue" convention as sheets.ts.

/** "10 вересня, 14:30" — day + genitive Ukrainian month name (via uk-UA ICU data, not a hand-rolled name list) + time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

/** "14:30" — time only, for listing several same-day items without repeating the date. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

/**
 * "9 вересня" — day + month name, no time, no year. Takes a "yyyy-mm-dd"
 * date key (e.g. from dailyLog.ts's localDateKey/recentDayGroups), not a
 * full ISO timestamp — built from explicit local Y/M/D components rather
 * than `new Date(dateKey)`, since a date-only ISO string parses as UTC
 * midnight and could roll back to the previous day once rendered in a
 * timezone behind UTC.
 */
export function formatDayMonthFromKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "long" });
}

/**
 * ISO timestamp -> the local "yyyy-MM-ddTHH:mm" string a
 * `<input type="datetime-local">` needs. Built from the Date object's local
 * Y/M/D/h/m getters, not a slice of the ISO string itself — ISO is UTC, so
 * slicing it would show the wrong wall-clock time in any zone other than UTC.
 */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Inverse of toDatetimeLocalValue: a `<input type="datetime-local">` value
 * (no timezone) back to a full ISO timestamp. `new Date(...)` parses a
 * timezone-less date-time string as local time per spec, so this is a
 * straight round-trip, not a conversion.
 */
export function fromDatetimeLocalValue(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
