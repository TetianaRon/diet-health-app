// Shared helpers for reading/writing spreadsheet rows by column HEADER NAME
// instead of a fixed position, so every tab's parsing/writing stays correct
// even if its columns end up reordered — a deliberate future schema change,
// or (more realistically, since every schema change this app has made so
// far has been append-only, never a reorder — see the dev-feedback-patterns
// note on additive-only columns) someone manually dragging a column around
// in the Google Sheets UI itself.
//
// Header-name lookup only works if the header row is sound, so every data
// module resolves its columns through resolveColumnIndex(), which refuses a
// tab with missing, duplicated or unrecognizable headers instead of silently
// dropping fields (the 2026-09-26 bug: mom's bilingual-header sheet made
// every save append a blank row while Google reported success). The fix for
// such a tab is Settings → «Виправити таблицю» — see sheetSchema.ts.
import { readRange } from "./sheets";
import { uk } from "../i18n/uk";
import { isLabelRow } from "./sheetLabels";

export type ColumnIndex = Map<string, number>;

/**
 * Every read and write scans row 1 (and data) this wide — one shared
 * constant, so the structure check and the actual reads/writes always see
 * the same columns. (They used to differ: the check scanned to AZ while each
 * tab's reads/writes stopped at its own canonical width, so a header placed
 * past that width passed the check but was invisible to every write.)
 */
export const SCAN_LAST_COLUMN = "AZ";

/**
 * Reduces a header cell to the app's canonical name: trimmed, with a trailing
 * parenthesized label dropped — so a bilingual header like
 * "Carbs_g (Вуглеводи, г)" (the style of the template mom's sheet was made
 * from) is recognized as "Carbs_g" and can stay human-friendly in the sheet.
 */
export function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/\s*\([^()]*\)\s*$/, "")
    .trim();
}

/**
 * Builds a header-name -> 0-based column-index map from a tab's header row.
 * If a name repeats, the FIRST (leftmost) column wins — but a duplicated
 * header is a structure problem in itself, which resolveColumnIndex refuses
 * before this map is ever used for real reads/writes.
 */
export function buildColumnIndex(headerRow: readonly unknown[]): ColumnIndex {
  const index = new Map<string, number>();
  headerRow.forEach((value, i) => {
    const name = normalizeHeader(value);
    if (name && !index.has(name)) index.set(name, i);
  });
  return index;
}

/** What's wrong with a tab's header row, relative to the columns this app expects there — pure. */
export interface HeaderProblems {
  /** Row 1 has content but none of it is a header this app knows — someone else's layout, not a gap. */
  notAppLayout: boolean;
  missing: string[];
  /** Canonical header -> every 0-based column it appears in (only headers appearing 2+ times). */
  duplicates: Map<string, number[]>;
}

export function findHeaderProblems(headerRow: readonly unknown[], canonicalHeaders: readonly string[]): HeaderProblems {
  const canonical = new Set(canonicalHeaders);
  const positions = new Map<string, number[]>();
  let anyContent = false;
  headerRow.forEach((value, i) => {
    const name = normalizeHeader(value);
    if (!name) return;
    anyContent = true;
    if (!canonical.has(name)) return;
    positions.set(name, [...(positions.get(name) ?? []), i]);
  });
  const duplicates = new Map([...positions].filter(([, cols]) => cols.length > 1));
  return {
    notAppLayout: anyContent && positions.size === 0,
    missing: canonicalHeaders.filter((h) => !positions.has(h)),
    duplicates,
  };
}

export function hasHeaderProblems(problems: HeaderProblems): boolean {
  return problems.notAppLayout || problems.missing.length > 0 || problems.duplicates.size > 0;
}

/** Thrown instead of reading/writing a tab whose header row can't be trusted. The message is user-facing (Ukrainian). */
export class SheetStructureError extends Error {
  constructor(public readonly tab: string) {
    super(uk.sheetStructure.brokenTab(tab));
    this.name = "SheetStructureError";
  }
}

/**
 * The only way data modules turn a live header row into a ColumnIndex: throws
 * SheetStructureError if any expected column is missing or duplicated, or the
 * tab isn't this app's layout at all — a field with nowhere to go must never
 * be silently dropped from a health log.
 */
export function resolveColumnIndex(tab: string, headerRow: readonly unknown[], canonicalHeaders: readonly string[]): ColumnIndex {
  if (hasHeaderProblems(findHeaderProblems(headerRow, canonicalHeaders))) {
    for (const listener of structureErrorListeners) listener(tab);
    throw new SheetStructureError(tab);
  }
  return buildColumnIndex(headerRow);
}

// Lets the app-wide structure check (SheetHealthContext) hear about a broken
// tab the moment any screen trips over it, instead of only on the next
// sign-in — it re-checks and shows its dialog.
const structureErrorListeners = new Set<(tab: string) => void>();

export function onSheetStructureError(listener: (tab: string) => void): () => void {
  structureErrorListeners.add(listener);
  return () => structureErrorListeners.delete(listener);
}

export interface ParsedTab {
  columnIndex: ColumnIndex;
  /** Rows below the header row and, when present, the readable-names row. */
  dataRows: unknown[][];
  /** Sheet row number (1-based) of dataRows[0] — 3 with a readable-names row in row 2, else 2 (a sheet not yet upgraded). */
  firstDataRow: number;
}

/** Splits a tab as read (header row first) into a resolved column index and its data rows. Throws SheetStructureError on an unsound header row. */
export function parseTab(tab: string, rows: unknown[][], canonicalHeaders: readonly string[]): ParsedTab {
  const [header = [], second] = rows;
  const columnIndex = resolveColumnIndex(tab, header, canonicalHeaders);
  const hasLabelRow = isLabelRow(second, columnIndex);
  return { columnIndex, dataRows: rows.slice(hasLabelRow ? 2 : 1), firstDataRow: hasLabelRow ? 3 : 2 };
}

/**
 * Looks up one cell in a data row by column header name. Returns undefined
 * for a header the index doesn't have — every rowTo* mapper's existing
 * toNumber/toBoolean/String(x ?? "") fallback already treats undefined the
 * same as a blank cell.
 */
export function cell(row: readonly unknown[], columnIndex: ColumnIndex, headerName: string): unknown {
  const i = columnIndex.get(headerName);
  return i === undefined ? undefined : row[i];
}

/**
 * Builds a full row array by placing each {headerName: value} field at that
 * header's actual current column position — the write-side counterpart to
 * `cell`. Real writes always pass a resolveColumnIndex() result, so every
 * field has a column; a field whose header is absent (tests with a partial
 * index) is left out.
 */
export function buildRow(fields: Record<string, unknown>, columnIndex: ColumnIndex): unknown[] {
  const maxIndex = Math.max(-1, ...columnIndex.values());
  const row: unknown[] = new Array(maxIndex + 1).fill("");
  for (const [headerName, value] of Object.entries(fields)) {
    const i = columnIndex.get(headerName);
    if (i !== undefined) row[i] = value;
  }
  return row;
}

/** 0-based column index -> A1-notation column letters (0 -> "A", 25 -> "Z", 26 -> "AA"). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Reads just a tab's header row (row 1) and resolves its column index — a cheap call for write paths that don't need the rest of the tab. Throws SheetStructureError on an unsound header row. */
export async function readColumnIndex(tab: string, canonicalHeaders: readonly string[]): Promise<ColumnIndex> {
  const rows = await readRange(tab, `A1:${SCAN_LAST_COLUMN}1`);
  return resolveColumnIndex(tab, rows[0] ?? [], canonicalHeaders);
}
