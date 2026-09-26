// Structure check + repair planning for the app's data tabs (Ingredients,
// Dishes, DailyLog, BloodSugar) — pure, so every rule here is unit-tested
// without a live sheet. spreadsheetInit.ts does the IO around it
// (checkSpreadsheetHealth / repairSpreadsheet).
//
// Why this exists: the earlier "Оновити структуру" top-up only compared
// header names and appended whatever it didn't recognize at the end. On
// mom's sheet (bilingual headers like "Timestamp (Час)", from the template
// she was set up with) that meant "every column is missing" → a full second
// set of headers → every save silently wrote a blank row. This module looks
// at the header row AND the data under it, and only plans changes it can
// prove are safe; anything else is reported as needing a person.
//
// Tab layout it checks for: row 1 = fixed column keys (what the app reads),
// row 2 = readable names in the user's language (see sheetLabels.ts), data
// from row 3. A tab without row 2 still works (data from row 2) — adding it
// is a presentation fix, not a blocking one.
import { buildColumnIndex, columnLetter, findHeaderProblems, normalizeHeader } from "./sheetRow";
import { isLabelRow, labelFor, staleLabelColumns } from "./sheetLabels";

export type TabIssue =
  /** The tab doesn't exist at all — created with headers (plus defaults for Settings). */
  | { kind: "missingTab" }
  /** Row 1 is someone else's layout (none of this app's headers), or data sits under a blank header row. Not auto-fixable. */
  | { kind: "notAppLayout" }
  /** Expected columns absent — added after the last column that holds anything (header or data), so nothing is written over. */
  | { kind: "missingColumns"; headers: string[]; startColumn: number }
  /**
   * One header in several columns. Fixable when no row has two different
   * values across them: the column with the most data is kept, stray values
   * from the others are moved into it, and the others are deleted.
   */
  | { kind: "duplicateColumns"; header: string; columns: number[]; keep: number; conflictRows: number[] }
  /** Settings keys absent from the Key column — appended with their defaults. */
  | { kind: "missingSettingsKeys"; keys: string[] }
  // --- Presentation only: the tab works, these bring it to the current format ---
  /** Row 1 holds recognized keys in a non-exact form (the old bilingual "GI (Глікемічний індекс)") — rewritten as bare keys. */
  | { kind: "headerFormat"; columns: number[] }
  /** No readable-names row 2 yet — inserted, in the current language. */
  | { kind: "missingLabelRow" }
  /** Readable-names cells that are blank or in another language — rewritten. */
  | { kind: "staleLabels"; columns: number[] };

export interface TabReport {
  tab: string;
  issues: TabIssue[];
}

const PRESENTATION_KINDS: ReadonlySet<TabIssue["kind"]> = new Set(["headerFormat", "missingLabelRow", "staleLabels"]);

/** Whether the app can't safely read/write with this unfixed (vs. a format upgrade the tab works without). */
export function isBlocking(issue: TabIssue): boolean {
  return !PRESENTATION_KINDS.has(issue.kind);
}

export function isFixable(issue: TabIssue): boolean {
  if (issue.kind === "notAppLayout") return false;
  if (issue.kind === "duplicateColumns") return issue.conflictRows.length === 0;
  return true;
}

/** A tab is repaired only if EVERY issue on it is fixable — a half-repaired tab would be harder to reason about than an untouched one. */
export function isTabRepairable(report: TabReport): boolean {
  return report.issues.every(isFixable);
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/** 0-based index of the rightmost column holding anything in any row (header or data), or -1 for an empty tab. */
export function lastUsedColumn(rows: readonly (readonly unknown[])[]): number {
  let last = -1;
  for (const row of rows) {
    for (let i = row.length - 1; i > last; i--) {
      if (!isBlank(row[i])) {
        last = i;
        break;
      }
    }
  }
  return last;
}

/** Row-1 columns holding a recognized key in a non-exact form, e.g. the old bilingual "GI (Глікемічний індекс)". */
export function nonCanonicalHeaderColumns(header: readonly unknown[], canonicalHeaders: readonly string[]): number[] {
  const canonical = new Set(canonicalHeaders);
  const cols: number[] = [];
  header.forEach((value, i) => {
    const name = normalizeHeader(value);
    if (canonical.has(name) && String(value ?? "").trim() !== name) cols.push(i);
  });
  return cols;
}

/** Where a tab's data starts: after row 2 if row 2 is the readable-names row, else after row 1. */
function splitRows(rows: readonly (readonly unknown[])[]): { hasLabelRow: boolean; dataRows: readonly (readonly unknown[])[]; firstDataRow: number } {
  const hasLabelRow = rows.length > 1 && isLabelRow(rows[1], buildColumnIndex(rows[0] ?? []));
  return { hasLabelRow, dataRows: rows.slice(hasLabelRow ? 2 : 1), firstDataRow: hasLabelRow ? 3 : 2 };
}

/**
 * Checks one data tab. `rows` is the tab as read, header row first.
 * Returns an empty issue list for a sound, current-format tab.
 */
export function analyzeDataTab(tab: string, rows: readonly (readonly unknown[])[], canonicalHeaders: readonly string[]): TabReport {
  const [header = [], ...belowHeader] = rows;
  const headerIsBlank = header.every(isBlank);
  const dataIsBlank = belowHeader.every((row) => row.every(isBlank));

  if (headerIsBlank) {
    // An empty tab just needs its headers (and names row); data under no
    // headers can't be attributed to columns safely.
    return dataIsBlank
      ? { tab, issues: [{ kind: "missingColumns", headers: [...canonicalHeaders], startColumn: 0 }, { kind: "missingLabelRow" }] }
      : { tab, issues: [{ kind: "notAppLayout" }] };
  }

  const problems = findHeaderProblems(header, canonicalHeaders);
  if (problems.notAppLayout) return { tab, issues: [{ kind: "notAppLayout" }] };

  const { hasLabelRow, dataRows, firstDataRow } = splitRows(rows);
  const issues: TabIssue[] = [];
  for (const [name, columns] of problems.duplicates) {
    const counts = columns.map((col) => dataRows.filter((row) => !isBlank(row[col])).length);
    const keep = columns[counts.indexOf(Math.max(...counts))]; // most data; ties → leftmost
    const conflictRows: number[] = [];
    dataRows.forEach((row, i) => {
      const distinct = new Set(columns.map((col) => row[col]).filter((v) => !isBlank(v)).map((v) => String(v).trim()));
      if (distinct.size > 1) conflictRows.push(i + firstDataRow);
    });
    issues.push({ kind: "duplicateColumns", header: name, columns, keep, conflictRows });
  }
  if (problems.missing.length > 0) {
    issues.push({ kind: "missingColumns", headers: problems.missing, startColumn: lastUsedColumn(rows) + 1 });
  }

  const headerFormat = nonCanonicalHeaderColumns(header, canonicalHeaders);
  if (headerFormat.length > 0) issues.push({ kind: "headerFormat", columns: headerFormat });
  if (!hasLabelRow) {
    issues.push({ kind: "missingLabelRow" });
  } else {
    const stale = staleLabelColumns(rows[1], buildColumnIndex(header), canonicalHeaders);
    if (stale.length > 0) issues.push({ kind: "staleLabels", columns: stale });
  }
  return { tab, issues };
}

export interface TabRepairPlan {
  /** Cell writes (values API), in the tab's CURRENT column positions — apply before any column is deleted. */
  valueUpdates: { range: string; values: unknown[][] }[];
  /** 0-based columns to delete, highest first so earlier deletions don't shift later ones. */
  deleteColumns: number[];
  /** Grid width the value writes need — the caller widens the tab first if it's narrower. */
  requiredColumnCount: number;
}

/**
 * Turns a repairable report's STRUCTURAL issues into concrete edits (the
 * presentation ones are planned by planLabelRepair once the structure is
 * sound). `rows` must be the same read the report came from.
 */
export function planTabRepair(report: TabReport, rows: readonly (readonly unknown[])[]): TabRepairPlan {
  if (!isTabRepairable(report)) throw new Error(`${report.tab}: not automatically repairable`);
  const valueUpdates: TabRepairPlan["valueUpdates"] = [];
  const deleteColumns: number[] = [];
  let requiredColumnCount = 0;
  const { dataRows, firstDataRow } = splitRows(rows);

  for (const issue of report.issues) {
    if (issue.kind === "duplicateColumns") {
      const others = issue.columns.filter((c) => c !== issue.keep);
      dataRows.forEach((row, i) => {
        if (!isBlank(row[issue.keep])) return;
        const stray = others.map((c) => row[c]).find((v) => !isBlank(v));
        if (stray !== undefined) {
          valueUpdates.push({ range: `${report.tab}!${columnLetter(issue.keep)}${i + firstDataRow}`, values: [[stray]] });
        }
      });
      deleteColumns.push(...others);
    } else if (issue.kind === "missingColumns") {
      const start = issue.startColumn;
      const end = start + issue.headers.length - 1;
      valueUpdates.push({ range: `${report.tab}!${columnLetter(start)}1:${columnLetter(end)}1`, values: [issue.headers] });
      requiredColumnCount = Math.max(requiredColumnCount, end + 1);
    }
  }

  return { valueUpdates, deleteColumns: [...new Set(deleteColumns)].sort((a, b) => b - a), requiredColumnCount };
}

export interface LabelRepairPlan {
  /** Insert an empty row 2 first (valueUpdates then fill it). */
  insertLabelRow: boolean;
  /** In coordinates AFTER any insertion. */
  valueUpdates: { range: string; values: unknown[][] }[];
}

/**
 * Plans the presentation fixes for a structurally sound tab: bare keys in
 * row 1, and readable names (current language) in row 2 — inserting row 2
 * if the tab doesn't have one yet.
 */
export function planLabelRepair(tab: string, rows: readonly (readonly unknown[])[], canonicalHeaders: readonly string[]): LabelRepairPlan {
  const header = rows[0] ?? [];
  const columnIndex = buildColumnIndex(header);
  const insertLabelRow = !splitRows(rows).hasLabelRow;
  const valueUpdates: LabelRepairPlan["valueUpdates"] = [];

  for (const col of nonCanonicalHeaderColumns(header, canonicalHeaders)) {
    valueUpdates.push({ range: `${tab}!${columnLetter(col)}1`, values: [[normalizeHeader(header[col])]] });
  }
  const headerAt = new Map([...columnIndex].map(([name, col]) => [col, name]));
  const labelCols = insertLabelRow
    ? canonicalHeaders.map((h) => columnIndex.get(h)).filter((c): c is number => c !== undefined)
    : staleLabelColumns(rows[1] ?? [], columnIndex, canonicalHeaders);
  for (const col of labelCols) {
    valueUpdates.push({ range: `${tab}!${columnLetter(col)}2`, values: [[labelFor(headerAt.get(col) ?? "")]] });
  }
  return { insertLabelRow, valueUpdates };
}
