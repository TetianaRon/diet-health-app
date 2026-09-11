// "Initialize a blank spreadsheet" flow — a genuinely blank Google Sheet
// only has its own single default tab, so every read this app makes fails
// the same way (each data module hardcodes a specific tab name/range — see
// ingredients.ts, dishes.ts, dailyLog.ts, bloodSugar.ts, settings.ts). This
// only ever adds the 5 tabs this app expects and fills them with header rows
// (Settings also gets full default key/value rows, since it isn't
// append-only like the others) — never touches or removes anything a sheet
// already has, so it's safe to run on a partially-set-up sheet too.
import { addSheetTabs, batchUpdateRanges, listSheetTitles } from "./sheets";
import { DEFAULT_SETTINGS, settingsToRows } from "./settings";
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
