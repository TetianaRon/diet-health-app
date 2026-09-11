// "Initialize a blank spreadsheet" flow — a genuinely blank Google Sheet
// only has its own single default tab, so every read this app makes fails
// the same way (each data module hardcodes a specific tab name/range — see
// ingredients.ts, dishes.ts, dailyLog.ts, bloodSugar.ts, settings.ts). This
// only ever adds the 5 tabs this app expects and fills them with header rows
// (Settings also gets full default key/value rows, since it isn't
// append-only like the others) — never touches or removes anything a sheet
// already has, so it's safe to run on a partially-set-up sheet too.
import { addSheetTabs, batchUpdateRanges, listSheetTitles, readRange } from "./sheets";
import { columnLetter, readColumnIndex, type ColumnIndex } from "./sheetRow";
import { DEFAULT_SETTINGS, SETTINGS_KEYS, settingsToRows } from "./settings";
import { INGREDIENTS_HEADERS } from "./ingredients";
import { DISHES_HEADERS } from "./dishes";
import { DAILY_LOG_HEADERS } from "./dailyLog";
import { BLOOD_SUGAR_HEADERS } from "./bloodSugar";

export const REQUIRED_TABS = ["Ingredients", "Dishes", "DailyLog", "BloodSugar", "Settings"] as const;

/** Which of the 5 required tabs aren't in a spreadsheet's actual tab list — pure, so it's testable without a live sheet. */
export function missingTabs(existingTitles: string[]): string[] {
  const present = new Set(existingTitles);
  return REQUIRED_TABS.filter((tab) => !present.has(tab));
}

/**
 * Builds the header (and, for Settings, default-data) range updates for
 * whichever tabs are missing. Pure — only tabs actually in `missing` get an
 * update, so re-running this against a partially-initialized sheet can't
 * clobber real data in a tab that already existed for some other reason.
 */
export function buildInitUpdates(missing: string[]): { range: string; values: unknown[][] }[] {
  const missingSet = new Set(missing);
  const updates: { range: string; values: unknown[][] }[] = [];
  if (missingSet.has("Ingredients")) updates.push({ range: "Ingredients!A1:O1", values: [[...INGREDIENTS_HEADERS]] });
  if (missingSet.has("Dishes")) updates.push({ range: "Dishes!A1:P1", values: [[...DISHES_HEADERS]] });
  if (missingSet.has("DailyLog")) updates.push({ range: "DailyLog!A1:O1", values: [[...DAILY_LOG_HEADERS]] });
  if (missingSet.has("BloodSugar")) updates.push({ range: "BloodSugar!A1:D1", values: [[...BLOOD_SUGAR_HEADERS]] });
  if (missingSet.has("Settings")) {
    const settingsRows = settingsToRows(DEFAULT_SETTINGS);
    updates.push({ range: "Settings!A1:B1", values: [["Key", "Value"]] });
    updates.push({ range: `Settings!A2:B${1 + settingsRows.length}`, values: settingsRows });
  }
  return updates;
}

/** Checks the connected spreadsheet for the tabs this app needs, without changing anything. */
export async function checkSpreadsheetTabs(): Promise<string[]> {
  const titles = await listSheetTitles();
  return missingTabs(titles);
}

/** Creates whichever of the 5 required tabs are missing and fills each with its header/default rows. No-op if all 5 already exist. */
export async function initializeSpreadsheet(): Promise<void> {
  const missing = await checkSpreadsheetTabs();
  if (missing.length === 0) return;
  await addSheetTabs(missing);
  await batchUpdateRanges(buildInitUpdates(missing));
}

// --- Column/key gaps on an EXISTING tab (a level below missing-whole-tab) ---
//
// A tab that already exists can still be missing some of the columns this
// app expects — e.g. an Ingredients tab set up before GiVerified was added.
// Same additive-only philosophy as initializeSpreadsheet above (only ever
// appends, never touches/reorders anything already there), just one level
// finer-grained: per column instead of per tab.

const TAB_CANONICAL_HEADERS: Record<string, readonly string[]> = {
  Ingredients: INGREDIENTS_HEADERS,
  Dishes: DISHES_HEADERS,
  DailyLog: DAILY_LOG_HEADERS,
  BloodSugar: BLOOD_SUGAR_HEADERS,
};

// Generous cap for a header-row-only scan — comfortably wider than any tab
// here (max 16 columns), so it finds every real column (including any extra
// ones a person added of their own, e.g. a personal note column) without
// reading the whole tab's data.
const HEADER_SCAN_WIDTH = "AZ";

export interface ColumnGap {
  tab: string;
  missingHeaders: string[];
}

/** Which of a tab's canonical headers its actual live column index doesn't have — pure. */
export function missingHeadersFor(columnIndex: ColumnIndex, canonicalHeaders: readonly string[]): string[] {
  return canonicalHeaders.filter((h) => !columnIndex.has(h));
}

/** Which Settings keys aren't in the sheet's actual Key column — the row-based analog of missingHeadersFor, since Settings is key/value rows, not columns. */
export function missingSettingsKeysFor(existingRows: unknown[][], settingsKeys: readonly string[]): string[] {
  const present = new Set(existingRows.map((row) => String(row[0] ?? "").trim()).filter(Boolean));
  return settingsKeys.filter((k) => !present.has(k));
}

/** Builds the range update that appends a tab's missing headers right after its current last column — pure. */
export function buildColumnTopUpUpdate(
  tab: string,
  columnIndex: ColumnIndex,
  missingHeaders: string[],
): { range: string; values: unknown[][] } {
  const startCol = Math.max(-1, ...columnIndex.values()) + 1;
  const endCol = startCol + missingHeaders.length - 1;
  return { range: `${tab}!${columnLetter(startCol)}1:${columnLetter(endCol)}1`, values: [missingHeaders] };
}

/** Builds the range update that appends default rows for whichever Settings keys are missing, right after the sheet's existing rows — pure. */
export function buildSettingsKeyTopUpUpdate(
  existingRowCount: number,
  missingKeys: string[],
): { range: string; values: unknown[][] } {
  const missingSet = new Set(missingKeys);
  const rows = settingsToRows(DEFAULT_SETTINGS).filter((row) => missingSet.has(row[0] as string));
  const startRow = existingRowCount + 2; // +2: header row, plus 1-based rows
  return { range: `Settings!A${startRow}:B${startRow + rows.length - 1}`, values: rows };
}

export interface SchemaGaps {
  columnGaps: ColumnGap[];
  missingSettingsKeys: string[];
}

/**
 * Checks every already-existing tab for columns (or, for Settings, keys)
 * this app expects but doesn't find — without changing anything. Skips a
 * tab entirely if it doesn't exist yet at all (that's checkSpreadsheetTabs'
 * job, not this one).
 */
export async function checkSchemaGaps(): Promise<SchemaGaps> {
  const existingTabs = new Set(await listSheetTitles());

  const columnGaps: ColumnGap[] = [];
  for (const [tab, headers] of Object.entries(TAB_CANONICAL_HEADERS)) {
    if (!existingTabs.has(tab)) continue;
    const columnIndex = await readColumnIndex(tab, HEADER_SCAN_WIDTH);
    const missing = missingHeadersFor(columnIndex, headers);
    if (missing.length > 0) columnGaps.push({ tab, missingHeaders: missing });
  }

  let missingSettingsKeys: string[] = [];
  if (existingTabs.has("Settings")) {
    const rows = await readRange("Settings", "A2:B200");
    missingSettingsKeys = missingSettingsKeysFor(rows, Object.values(SETTINGS_KEYS));
  }

  return { columnGaps, missingSettingsKeys };
}

/** Adds whichever missing columns/Settings keys checkSchemaGaps() finds. No-op if there's nothing to add. */
export async function topUpSchemaGaps(): Promise<void> {
  const { columnGaps, missingSettingsKeys } = await checkSchemaGaps();
  const updates: { range: string; values: unknown[][] }[] = [];

  for (const gap of columnGaps) {
    const columnIndex = await readColumnIndex(gap.tab, HEADER_SCAN_WIDTH);
    updates.push(buildColumnTopUpUpdate(gap.tab, columnIndex, gap.missingHeaders));
  }

  if (missingSettingsKeys.length > 0) {
    const rows = await readRange("Settings", "A2:B200");
    updates.push(buildSettingsKeyTopUpUpdate(rows.length, missingSettingsKeys));
  }

  if (updates.length > 0) await batchUpdateRanges(updates);
}
