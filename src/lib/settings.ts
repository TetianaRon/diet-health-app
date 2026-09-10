// Typed data-access layer over the Settings tab (key/value rows — see
// docs/technical-spec.md -> "Google Sheets structure"). Unlike Ingredients
// (append-only), Settings rows already exist from the starter template, so
// updates target each key's existing row rather than appending.
import { batchUpdateRanges, readRange } from "./sheets";

export interface Settings {
  dailyCarbsTarget: number;
  fatPerMealLimit: number;
  dailyCaloriesTarget: number;
  mealsPerDay: number;
  maxGapHours: number;
  bloodSugarMin: number;
  bloodSugarMax: number;
  // "HH:MM" 24h local time. Used by the meal-reminder scheduler (src/lib/reminders.ts)
  // to suppress notifications during sleep — not a numeric target like the fields above.
  wakeTime: string;
  sleepTime: string;
  // Which Today-screen progress bars to show — mom picks what she actually
  // wants to track, rather than always seeing both.
  showCarbsProgress: boolean;
  showCaloriesProgress: boolean;
}

const NUMERIC_FIELDS = [
  "dailyCarbsTarget",
  "fatPerMealLimit",
  "dailyCaloriesTarget",
  "mealsPerDay",
  "maxGapHours",
  "bloodSugarMin",
  "bloodSugarMax",
] as const satisfies readonly (keyof Settings)[];

const STRING_FIELDS = ["wakeTime", "sleepTime"] as const satisfies readonly (keyof Settings)[];

const BOOLEAN_FIELDS = ["showCarbsProgress", "showCaloriesProgress"] as const satisfies readonly (keyof Settings)[];

function toBoolean(value: string): boolean {
  return value.trim().toUpperCase() === "TRUE";
}

// Maps our field names to the sheet's Key column values.
const SETTINGS_KEYS: Record<keyof Settings, string> = {
  dailyCarbsTarget: "DailyCarbsTarget",
  fatPerMealLimit: "FatPerMealLimit",
  dailyCaloriesTarget: "DailyCaloriesTarget",
  mealsPerDay: "MealsPerDay",
  maxGapHours: "MaxGapHours",
  bloodSugarMin: "BloodSugarMin",
  bloodSugarMax: "BloodSugarMax",
  wakeTime: "WakeTime",
  sleepTime: "SleepTime",
  showCarbsProgress: "ShowCarbsProgress",
  showCaloriesProgress: "ShowCaloriesProgress",
};

// Defaults per mom's 2026-09-07 interview (docs/requirements-open-questions.md) —
// used for any key missing from the sheet. wakeTime/sleepTime match her stated
// schedule (wakes 6:30, sleeps at midnight). Both progress bars default to
// shown, matching the app's original always-both behavior.
export const DEFAULT_SETTINGS: Settings = {
  dailyCarbsTarget: 140,
  fatPerMealLimit: 18,
  dailyCaloriesTarget: 1800,
  mealsPerDay: 6,
  maxGapHours: 3,
  bloodSugarMin: 4.0,
  bloodSugarMax: 7.8,
  wakeTime: "06:30",
  sleepTime: "00:00",
  showCarbsProgress: true,
  showCaloriesProgress: true,
};

/** Parses raw Key/Value rows into a typed Settings object, falling back to defaults for missing keys. */
export function parseSettingsRows(rows: unknown[][]): Settings {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const key = String(row[0] ?? "");
    if (key && row[1] !== undefined && row[1] !== "") byKey.set(key, String(row[1]));
  }

  const result = { ...DEFAULT_SETTINGS };
  for (const field of NUMERIC_FIELDS) {
    const raw = byKey.get(SETTINGS_KEYS[field]);
    const value = raw !== undefined ? Number(raw) : NaN;
    if (Number.isFinite(value)) result[field] = value;
  }
  for (const field of STRING_FIELDS) {
    const raw = byKey.get(SETTINGS_KEYS[field]);
    if (raw !== undefined) result[field] = raw;
  }
  for (const field of BOOLEAN_FIELDS) {
    const raw = byKey.get(SETTINGS_KEYS[field]);
    if (raw !== undefined) result[field] = toBoolean(raw);
  }
  return result;
}

export interface RangeUpdate {
  range: string;
  values: unknown[][];
}

/**
 * Computes the batchUpdate payload to write `settings` back, given the
 * sheet's current Key/Value rows (to find each key's row number). Keys not
 * present in the sheet are skipped — this layer doesn't add new rows.
 */
export function computeSettingsUpdates(settings: Settings, existingRows: unknown[][]): RangeUpdate[] {
  const rowNumberByKey = new Map<string, number>();
  existingRows.forEach((row, index) => {
    const key = String(row[0] ?? "");
    if (key) rowNumberByKey.set(key, index + 2); // +2: 1-based rows, plus the header row
  });

  const updates: RangeUpdate[] = [];
  for (const field of Object.keys(SETTINGS_KEYS) as (keyof Settings)[]) {
    const rowNumber = rowNumberByKey.get(SETTINGS_KEYS[field]);
    if (rowNumber !== undefined) {
      updates.push({ range: `Settings!B${rowNumber}`, values: [[settings[field]]] });
    }
  }
  return updates;
}

export async function getSettings(): Promise<Settings> {
  const rows = await readRange("Settings", "A2:B20");
  return parseSettingsRows(rows);
}

export async function updateSettings(settings: Settings): Promise<void> {
  const rows = await readRange("Settings", "A2:B20");
  const updates = computeSettingsUpdates(settings, rows);
  if (updates.length > 0) {
    await batchUpdateRanges(updates);
  }
}
