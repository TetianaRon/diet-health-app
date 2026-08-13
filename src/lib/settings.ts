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
};

// Project Brief midpoint defaults — used for any key missing from the sheet.
export const DEFAULT_SETTINGS: Settings = {
  dailyCarbsTarget: 140,
  fatPerMealLimit: 18,
  dailyCaloriesTarget: 1500,
  mealsPerDay: 5,
  maxGapHours: 3,
  bloodSugarMin: 4.0,
  bloodSugarMax: 7.8,
};

/** Parses raw Key/Value rows into a typed Settings object, falling back to defaults for missing keys. */
export function parseSettingsRows(rows: unknown[][]): Settings {
  const byKey = new Map<string, number>();
  for (const row of rows) {
    const key = String(row[0] ?? "");
    const value = Number(row[1]);
    if (key && Number.isFinite(value)) byKey.set(key, value);
  }

  const result = { ...DEFAULT_SETTINGS };
  for (const field of Object.keys(SETTINGS_KEYS) as (keyof Settings)[]) {
    const sheetValue = byKey.get(SETTINGS_KEYS[field]);
    if (sheetValue !== undefined) result[field] = sheetValue;
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
