// Spreadsheet setup, structure check and repair — the IO around the pure
// rules in sheetSchema.ts.
//
// Tab layout (every tab): row 1 = fixed column keys the app reads, row 2 =
// readable names in the user's language (sheetLabels.ts), data from row 3.
// Settings follows the same idea with a third column: Key | Value | Label,
// row 2 = readable names of those three, and each key row's Label cell is
// that setting's readable name.
//
// "Initialize a blank spreadsheet": a genuinely blank Google Sheet only has
// its own single default tab, so every read this app makes fails. The init
// flow only ever adds the tabs this app expects — never touches or removes
// anything a sheet already has.
import { addSheetTabs, batchUpdateRanges, getTabGrids, listSheetTitles, readRanges, structuralBatchUpdate } from "./sheets";
import { columnLetter, SCAN_LAST_COLUMN } from "./sheetRow";
import { labelFor } from "./sheetLabels";
import { analyzeDataTab, isBlocking, isTabRepairable, planLabelRepair, planTabRepair, type TabIssue, type TabReport } from "./sheetSchema";
import { planItemIdUpgrade } from "./sheetUpgrade";
import { ID_COUNTER_KEYS, type SheetItemKind } from "./itemIds";
import { writeItemCounter } from "./itemIdStore";
import { STARTER_FOODS } from "../data/starter-foods";
import { STARTER_DISHES } from "../data/starter-dishes";
import { DEFAULT_SETTINGS, SETTINGS_KEYS, settingsToRows, type Settings } from "./settings";
import { INGREDIENTS_HEADERS } from "./ingredients";
import { DISHES_HEADERS } from "./dishes";
import { DAILY_LOG_HEADERS } from "./dailyLog";
import { BLOOD_SUGAR_HEADERS } from "./bloodSugar";
import { MEDICATIONS_HEADERS, MEDICATION_LOG_HEADERS } from "./medications";
import { WEIGHT_HEADERS } from "./weight";
import { uk } from "../i18n/uk";

// Medications, MedicationLog and Weight since 1.7 — on an existing sheet
// they're created silently by the upgrade (a missing tab is additive).
export const REQUIRED_TABS = ["Ingredients", "Dishes", "DailyLog", "BloodSugar", "Medications", "MedicationLog", "Weight", "Settings"] as const;

const DATA_TAB_HEADERS: Record<string, readonly string[]> = {
  Ingredients: INGREDIENTS_HEADERS,
  Dishes: DISHES_HEADERS,
  DailyLog: DAILY_LOG_HEADERS,
  BloodSugar: BLOOD_SUGAR_HEADERS,
  Medications: MEDICATIONS_HEADERS,
  MedicationLog: MEDICATION_LOG_HEADERS,
  Weight: WEIGHT_HEADERS,
};

const SETTINGS_HEADERS = ["Key", "Value", "Label"] as const;

type RangeUpdate = { range: string; values: unknown[][] };

/** Which of the required tabs aren't in a spreadsheet's actual tab list — pure, so it's testable without a live sheet. */
export function missingTabs(existingTitles: string[]): string[] {
  const present = new Set(existingTitles);
  return REQUIRED_TABS.filter((tab) => !present.has(tab));
}

/** The readable name of a Settings key (its Settings-screen label), for the Settings tab's Label column. */
export function settingsKeyLabel(key: string): string {
  const field = (Object.keys(SETTINGS_KEYS) as (keyof Settings)[]).find((f) => SETTINGS_KEYS[f] === key);
  return field ? uk.settings.fields[field] : "";
}

function headerAndLabelRows(tab: string, headers: readonly string[]): RangeUpdate {
  return {
    range: `${tab}!A1:${columnLetter(headers.length - 1)}2`,
    values: [[...headers], headers.map((h) => labelFor(h))],
  };
}

/**
 * Builds the header rows (and, for Settings, default-data) updates for
 * whichever tabs are missing. Pure — only tabs actually in `missing` get an
 * update, so re-running this against a partially-initialized sheet can't
 * clobber real data in a tab that already existed for some other reason.
 */
export function buildInitUpdates(missing: string[]): RangeUpdate[] {
  const missingSet = new Set(missing);
  const updates: RangeUpdate[] = [];
  for (const [tab, headers] of Object.entries(DATA_TAB_HEADERS)) {
    if (missingSet.has(tab)) updates.push(headerAndLabelRows(tab, headers));
  }
  if (missingSet.has("Settings")) {
    const settingsRows = settingsToRows(DEFAULT_SETTINGS).map(([key, value]) => [key, value, settingsKeyLabel(key as string)]);
    updates.push(headerAndLabelRows("Settings", SETTINGS_HEADERS));
    updates.push({ range: `Settings!A3:C${2 + settingsRows.length}`, values: settingsRows });
  }
  return updates;
}

/** Checks the connected spreadsheet for the tabs this app needs, without changing anything. */
export async function checkSpreadsheetTabs(): Promise<string[]> {
  const titles = await listSheetTitles();
  return missingTabs(titles);
}

/** Creates whichever of the required tabs are missing and fills each with its header/default rows. No-op if all already exist. */
export async function initializeSpreadsheet(): Promise<void> {
  const missing = await checkSpreadsheetTabs();
  if (missing.length === 0) return;
  await addSheetTabs(missing);
  await batchUpdateRanges(buildInitUpdates(missing));
}

// --- Settings tab: key/value rows, so checked by row rather than by column ---

/** Which Settings keys aren't in the sheet's actual Key column. */
export function missingSettingsKeysFor(existingRows: unknown[][], settingsKeys: readonly string[]): string[] {
  const present = new Set(existingRows.map((row) => String(row[0] ?? "").trim()).filter(Boolean));
  return settingsKeys.filter((k) => !present.has(k));
}

/**
 * Builds the update that appends default rows (key, value, readable name)
 * for whichever Settings keys are missing, right after the tab's last row.
 * `lastRow` is the sheet row number of the tab's current last row.
 */
export function buildSettingsKeyTopUpUpdate(lastRow: number, missingKeys: string[]): RangeUpdate {
  const missingSet = new Set(missingKeys);
  const rows = settingsToRows(DEFAULT_SETTINGS)
    .filter((row) => missingSet.has(row[0] as string))
    .map(([key, value]) => [key, value, settingsKeyLabel(key as string)]);
  const startRow = lastRow + 1;
  return { range: `Settings!A${startRow}:C${startRow + rows.length - 1}`, values: rows };
}

function hasSettingsLabelRow(rows: unknown[][]): boolean {
  return String(rows[1]?.[0] ?? "").trim() === labelFor("Key");
}

/** Checks the Settings tab as read from A1 (Key | Value | Label). Pure. */
export function analyzeSettingsTab(rows: unknown[][]): TabIssue[] {
  const issues: TabIssue[] = [];
  const keys = missingSettingsKeysFor(rows.slice(1), Object.values(SETTINGS_KEYS));
  if (keys.length > 0) issues.push({ kind: "missingSettingsKeys", keys });
  if (!hasSettingsLabelRow(rows)) issues.push({ kind: "missingLabelRow" });
  else if (planSettingsLabelRepair(rows).valueUpdates.length > 0) issues.push({ kind: "staleLabels", columns: [2] });
  return issues;
}

/** The Settings counterpart of planLabelRepair: Label header, readable-names row 2, and each key's readable name in column C. Coordinates are after any row insertion. */
export function planSettingsLabelRepair(rows: unknown[][]): { insertLabelRow: boolean; valueUpdates: RangeUpdate[] } {
  const insertLabelRow = !hasSettingsLabelRow(rows);
  const shift = insertLabelRow ? 1 : 0;
  const valueUpdates: RangeUpdate[] = [];
  if (SETTINGS_HEADERS.some((h, i) => String(rows[0]?.[i] ?? "").trim() !== h)) {
    valueUpdates.push({ range: "Settings!A1:C1", values: [[...SETTINGS_HEADERS]] });
  }

  const wantedLabels = SETTINGS_HEADERS.map((h) => labelFor(h));
  const labelRow = insertLabelRow ? [] : rows[1];
  if (wantedLabels.some((label, i) => String(labelRow[i] ?? "").trim() !== label)) {
    valueUpdates.push({ range: "Settings!A2:C2", values: [wantedLabels] });
  }

  rows.forEach((row, i) => {
    if (i === 0 || (!insertLabelRow && i === 1)) return;
    const label = settingsKeyLabel(String(row[0] ?? "").trim());
    if (label && String(row[2] ?? "").trim() === "") {
      valueUpdates.push({ range: `Settings!C${i + 1 + shift}`, values: [[label]] });
    }
  });
  return { insertLabelRow, valueUpdates };
}

// --- Structure check + repair of existing tabs ---
//
// Replaces the old header-only "Оновити структуру" top-up, which treated
// any header it didn't recognize as a gap and appended a second set of
// headers after it (what broke mom's bilingual-header sheet — see
// sheetSchema.ts).

// Same depth the data modules read to (DailyLog/BloodSugar are the longest).
const DATA_TAB_RANGE = `A1:${SCAN_LAST_COLUMN}5000`;
const SETTINGS_TAB_RANGE = "A1:C200";

interface HealthScan {
  reports: TabReport[];
  rowsByTab: Map<string, unknown[][]>;
}

async function scanSpreadsheet(): Promise<HealthScan> {
  const existingTabs = new Set(await listSheetTitles());
  const reports: TabReport[] = [];
  const rowsByTab = new Map<string, unknown[][]>();

  // Every existing tab in ONE read request (Google counts reads per minute).
  const present = REQUIRED_TABS.filter((tab) => existingTabs.has(tab));
  const allRows = await readRanges(present.map((tab) => ({ tab, range: tab === "Settings" ? SETTINGS_TAB_RANGE : DATA_TAB_RANGE })));
  present.forEach((tab, i) => rowsByTab.set(tab, allRows[i]));

  for (const tab of REQUIRED_TABS) {
    if (!existingTabs.has(tab)) {
      reports.push({ tab, issues: [{ kind: "missingTab" }] });
      continue;
    }
    const rows = rowsByTab.get(tab) ?? [];
    const issues = tab === "Settings" ? analyzeSettingsTab(rows) : analyzeDataTab(tab, rows, DATA_TAB_HEADERS[tab]).issues;
    if (issues.length > 0) reports.push({ tab, issues });
  }
  return { reports, rowsByTab };
}

/** Checks every tab's structure without changing anything. Empty result = sound, current-format spreadsheet. */
export async function checkSpreadsheetHealth(): Promise<TabReport[]> {
  return (await scanSpreadsheet()).reports;
}

function backupTabName(tab: string, now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${tab} — копія ${stamp}`;
}

/**
 * Pass 1 — structure: create missing tabs, and for each data tab whose
 * issues are ALL fixable, back it up (a duplicated tab in the same
 * spreadsheet) before merging/deleting duplicate columns and adding missing
 * ones; append missing Settings keys.
 */
async function repairStructure({ reports, rowsByTab }: HealthScan): Promise<void> {
  const missing = reports.filter((r) => r.issues.some((i) => i.kind === "missingTab")).map((r) => r.tab);
  if (missing.length > 0) {
    await addSheetTabs(missing);
    await batchUpdateRanges(buildInitUpdates(missing));
  }

  const plans = reports
    .filter((r) => r.tab in DATA_TAB_HEADERS && isTabRepairable(r) && r.issues.some(isBlocking))
    .map((r) => ({ tab: r.tab, plan: planTabRepair(r, rowsByTab.get(r.tab) ?? []) }));

  const valueUpdates = plans.flatMap(({ plan }) => plan.valueUpdates);
  const settingsRows = rowsByTab.get("Settings") ?? [];
  for (const issue of reports.find((r) => r.tab === "Settings")?.issues ?? []) {
    if (issue.kind === "missingSettingsKeys") valueUpdates.push(buildSettingsKeyTopUpUpdate(settingsRows.length, issue.keys));
  }

  if (plans.length > 0) {
    const grids = await getTabGrids();
    const now = new Date();
    const prepare: object[] = [];
    const deletions: object[] = [];
    for (const { tab, plan } of plans) {
      const grid = grids.get(tab);
      if (!grid) throw new Error(`repairSpreadsheet: tab ${tab} disappeared`);
      // A backup copy only when columns get merged/deleted — adding columns
      // after the last used one can't lose anything (1.6: no backup-tab
      // clutter from the silent upgrade).
      if (plan.deleteColumns.length > 0) {
        prepare.push({ duplicateSheet: { sourceSheetId: grid.sheetId, newSheetName: backupTabName(tab, now) } });
      }
      if (plan.requiredColumnCount > grid.columnCount) {
        prepare.push({
          appendDimension: { sheetId: grid.sheetId, dimension: "COLUMNS", length: plan.requiredColumnCount - grid.columnCount },
        });
      }
      for (const col of plan.deleteColumns) {
        deletions.push({ deleteDimension: { range: { sheetId: grid.sheetId, dimension: "COLUMNS", startIndex: col, endIndex: col + 1 } } });
      }
    }
    if (prepare.length > 0) await structuralBatchUpdate(prepare);
    if (valueUpdates.length > 0) await batchUpdateRanges(valueUpdates);
    if (deletions.length > 0) await structuralBatchUpdate(deletions);
  } else if (valueUpdates.length > 0) {
    await batchUpdateRanges(valueUpdates);
  }
}

/**
 * Pass 2 — presentation, on a fresh re-scan so it sees pass 1's result: bare
 * keys in row 1, readable-names row 2 inserted/refreshed (and frozen along
 * with row 1). Only for tabs with no blocking issue left. No backup: this
 * never touches a data cell — the names that were packed into row 1's
 * bilingual headers end up in row 2.
 */
async function repairLabels({ reports, rowsByTab }: HealthScan): Promise<void> {
  const grids = await getTabGrids();
  const structural: object[] = [];
  const valueUpdates: RangeUpdate[] = [];

  for (const report of reports) {
    if (report.issues.some(isBlocking)) continue;
    const rows = rowsByTab.get(report.tab) ?? [];
    const plan =
      report.tab === "Settings" ? planSettingsLabelRepair(rows) : planLabelRepair(report.tab, rows, DATA_TAB_HEADERS[report.tab]);
    const grid = grids.get(report.tab);
    if (plan.insertLabelRow && grid) {
      structural.push(
        { insertDimension: { range: { sheetId: grid.sheetId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, inheritFromBefore: true } },
        { updateSheetProperties: { properties: { sheetId: grid.sheetId, gridProperties: { frozenRowCount: 2 } }, fields: "gridProperties.frozenRowCount" } },
      );
    }
    valueUpdates.push(...plan.valueUpdates);
  }

  await structuralBatchUpdate(structural);
  if (valueUpdates.length > 0) await batchUpdateRanges(valueUpdates);
}

/**
 * Fixes everything checkSpreadsheetHealth() reports as fixable, re-scanning
 * first so it acts on the sheet as it is now, not on a stale report. The
 * steps are separate API calls, so an interruption can leave the sheet
 * part-way — but every step is idempotent, so re-running finishes the job.
 */
export async function repairSpreadsheet(): Promise<void> {
  await repairStructure(await scanSpreadsheet());
  await repairLabels(await scanSpreadsheet());
}

// --- Silent upgrades (release 1.6) ---
//
// Additive, lossless changes are applied without asking: a missing tab,
// missing columns (added after the last used one), missing Settings keys,
// readable names for columns whose name cell is still blank, and the item-ID
// upgrade (IDs, BasedOn links, recipe ingredient IDs — sheetUpgrade.ts, only
// ever writing blank cells). The structure dialog is left for what needs a
// person: someone else's layout, duplicate columns, and rewrites of cells
// that already hold something (header text, a names row to insert).

const SILENT_BLOCKING_KINDS: ReadonlySet<TabIssue["kind"]> = new Set(["missingTab", "missingColumns", "missingSettingsKeys"]);

/** Readable-name cells (row 2) that are stale only because they're blank — filling them changes nothing that's there. */
function blankLabelColumns(rows: unknown[][], columns: number[]): number[] {
  return columns.filter((col) => String(rows[1]?.[col] ?? "").trim() === "");
}

/** Whether every structural issue on this tab can be fixed silently (so a silent pass can repair it whole). */
export function isSilentlyRepairable(report: TabReport): boolean {
  return report.issues.filter(isBlocking).every((issue) => SILENT_BLOCKING_KINDS.has(issue.kind));
}

/** What a silent upgrade changed — shown to the user once (SheetUpgradeNotice), with the way back. */
export interface UpgradeSummary {
  addedTabs: string[];
  /** Readable names of the columns added. */
  addedColumns: string[];
  /** Readable-name cells filled in for columns that had none. */
  labelsFilled: number;
  idsFilled: number;
  idsRenumbered: number;
}

function emptySummary(): UpgradeSummary {
  return { addedTabs: [], addedColumns: [], labelsFilled: 0, idsFilled: 0, idsRenumbered: 0 };
}

async function applySilentRepairs({ reports, rowsByTab }: HealthScan, summary: UpgradeSummary): Promise<boolean> {
  let changed = false;
  const missingTabs = reports.filter((r) => r.issues.some((i) => i.kind === "missingTab")).map((r) => r.tab);
  if (missingTabs.length > 0) {
    await addSheetTabs(missingTabs);
    await batchUpdateRanges(buildInitUpdates(missingTabs));
    summary.addedTabs.push(...missingTabs);
    changed = true;
  }

  const valueUpdates: RangeUpdate[] = [];
  const widen: { tab: string; columns: number }[] = [];
  for (const report of reports) {
    const rows = rowsByTab.get(report.tab) ?? [];
    if (report.tab in DATA_TAB_HEADERS && isSilentlyRepairable(report) && report.issues.some((i) => i.kind === "missingColumns")) {
      const plan = planTabRepair({ tab: report.tab, issues: report.issues.filter((i) => i.kind === "missingColumns") }, rows);
      valueUpdates.push(...plan.valueUpdates);
      for (const issue of report.issues) {
        if (issue.kind === "missingColumns") summary.addedColumns.push(...issue.headers.map((h) => labelFor(h)));
      }
      widen.push({ tab: report.tab, columns: plan.requiredColumnCount });
      // and their readable names, if the tab has a names row
      for (const issue of report.issues) {
        if (issue.kind !== "missingColumns" || !report.issues.every((i) => i.kind !== "missingLabelRow")) continue;
        issue.headers.forEach((header, k) => {
          valueUpdates.push({ range: `${report.tab}!${columnLetter(issue.startColumn + k)}2`, values: [[labelFor(header)]] });
        });
      }
    }
    for (const issue of report.issues) {
      if (issue.kind === "missingSettingsKeys") valueUpdates.push(buildSettingsKeyTopUpUpdate(rows.length, issue.keys));
      if (issue.kind === "staleLabels" && report.tab in DATA_TAB_HEADERS) {
        const header = rows[0] ?? [];
        for (const col of blankLabelColumns(rows, issue.columns)) {
          valueUpdates.push({ range: `${report.tab}!${columnLetter(col)}2`, values: [[labelFor(String(header[col] ?? "").trim())]] });
          summary.labelsFilled++;
        }
      }
    }
  }

  if (widen.length > 0) {
    const grids = await getTabGrids();
    const append = widen
      .map(({ tab, columns }) => ({ grid: grids.get(tab), columns }))
      .filter((w) => w.grid && w.columns > w.grid.columnCount)
      .map((w) => ({ appendDimension: { sheetId: w.grid!.sheetId, dimension: "COLUMNS", length: w.columns - w.grid!.columnCount } }));
    if (append.length > 0) await structuralBatchUpdate(append);
  }
  if (valueUpdates.length > 0) {
    await batchUpdateRanges(valueUpdates);
    changed = true;
  }
  return changed;
}

function counterValue(settingsRows: unknown[][], kind: SheetItemKind): number {
  const row = settingsRows.find((r) => String(r[0] ?? "").trim() === ID_COUNTER_KEYS[kind]);
  return Number(row?.[1]) || 0;
}

/** Fills in item IDs, BasedOn links and recipe ingredient IDs (only blank cells). Returns whether anything was written. */
async function applyItemIdUpgrade({ rowsByTab }: HealthScan, summary: UpgradeSummary): Promise<boolean> {
  const ingredientsRows = rowsByTab.get("Ingredients");
  const dishesRows = rowsByTab.get("Dishes");
  if (!ingredientsRows || !dishesRows) return false;
  const settingsRows = rowsByTab.get("Settings") ?? [];
  const plan = planItemIdUpgrade({
    ingredientsRows,
    dishesRows,
    builtInFoods: STARTER_FOODS,
    builtInDishes: STARTER_DISHES,
    counters: { ingredient: counterValue(settingsRows, "ingredient"), dish: counterValue(settingsRows, "dish") },
  });
  if (plan.unresolved.length > 0) {
    console.warn("Sheet upgrade: recipe ingredients not found (kept by name):", plan.unresolved);
  }
  if (plan.valueUpdates.length > 0) await batchUpdateRanges(plan.valueUpdates);
  summary.idsFilled += plan.idsFilled;
  summary.idsRenumbered += plan.idsRenumbered;
  for (const kind of ["ingredient", "dish"] as const) {
    const highest = plan.highestNumber[kind];
    if (highest !== undefined && highest > counterValue(settingsRows, kind)) await writeItemCounter(kind, highest, settingsRows);
  }
  return plan.valueUpdates.length > 0;
}

/**
 * The check the app runs after sign-in / a sheet switch: applies every
 * silent upgrade first, then reports only what's left for the structure
 * dialog (which still offers the full repair).
 */
export async function checkAndUpgradeSpreadsheet(): Promise<{ reports: TabReport[]; upgrade: UpgradeSummary | null }> {
  let scan = await scanSpreadsheet();
  const summary = emptySummary();
  let changed = false;
  if (await applySilentRepairs(scan, summary)) {
    changed = true;
    scan = await scanSpreadsheet();
  }
  if (await applyItemIdUpgrade(scan, summary)) {
    changed = true;
    scan = await scanSpreadsheet();
  }
  const rowsOf = (tab: string) => scan.rowsByTab.get(tab) ?? [];
  const reports = scan.reports.filter((report) => !report.issues.every((issue) => isSilentIssue(issue, rowsOf(report.tab))));
  return { reports, upgrade: changed ? summary : null };
}

/** An issue the silent pass handles (so it doesn't, on its own, need the dialog). */
function isSilentIssue(issue: TabIssue, rows: unknown[][]): boolean {
  if (SILENT_BLOCKING_KINDS.has(issue.kind)) return true;
  if (issue.kind === "staleLabels") return blankLabelColumns(rows, issue.columns).length === issue.columns.length;
  return false;
}
