// Readable column names for row 2 of every spreadsheet tab. Row 1 always
// holds the fixed keys the app reads ("Carbs_g") — they never change with
// the language — and row 2 holds what a person reads ("Вуглеводи, г"), in
// the user's language. Replaces the earlier bilingual-header style
// ("Carbs_g (Вуглеводи, г)"), which mixed the two in one cell and couldn't
// follow a language change.
//
// Adding a language (EN is planned for the first official release): add its
// label set to LABEL_SETS. Every set is also used for RECOGNIZING row 2, so
// a sheet labelled in one language is still read correctly after switching
// to another, and the repair relabels it.
import { uk } from "../i18n/uk";
import type { ColumnIndex } from "./sheetRow";

export type SheetLanguage = "uk";

const LABEL_SETS: Record<SheetLanguage, Record<string, string>> = {
  uk: uk.sheetLabels.columns,
};

/** The language row 2 is written in. Only Ukrainian exists so far; becomes a user setting once another language does. */
export const CURRENT_SHEET_LANGUAGE: SheetLanguage = "uk";

/** The readable name for a column key, falling back to the key itself if a language has no label for it. */
export function labelFor(header: string, language: SheetLanguage = CURRENT_SHEET_LANGUAGE): string {
  return LABEL_SETS[language][header] ?? header;
}

/**
 * Names the app itself wrote earlier, which a newer name replaces silently
 * (a person's own wording is never touched). 2.1.1 changed these two to
 * mention millilitres.
 */
const PREVIOUS_LABELS: Record<string, readonly string[]> = {
  Basis: ["Значення на (100g — 100 г, piece — 1 шт.)"],
  ValuesPer: ["Значення на (г або шт.)"],
};

/**
 * Whether a name cell holds something the app wrote and a newer name may
 * replace: a name from another language, an earlier name, or the bare key —
 * written when a column was added before its name existed (2.1, 2.1.1).
 */
export function isAppWrittenLabel(header: string, value: string): boolean {
  return value === header || (PREVIOUS_LABELS[header] ?? []).includes(value) || isKnownLabelFor(header, value);
}

function isKnownLabelFor(header: string, value: string): boolean {
  return Object.values(LABEL_SETS).some((set) => set[header] === value);
}

function cellText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Whether a row (row 2 of a tab) is the readable-names row rather than data.
 * There's no marker cell, so this goes by content: at least half of the
 * row's filled cells under known columns must be a known label (in any
 * language) for that column. A data row never matches ("Час" is not a
 * timestamp), while a row where a person reworded a label or two still does.
 */
export function isLabelRow(row: readonly unknown[] | undefined, columnIndex: ColumnIndex): boolean {
  if (!row) return false;
  let filled = 0;
  let matching = 0;
  for (const [header, col] of columnIndex) {
    const text = cellText(row[col]);
    if (!text) continue;
    filled++;
    if (isKnownLabelFor(header, text)) matching++;
  }
  return filled > 0 && matching * 2 >= filled;
}

/**
 * Columns whose label-row cell should be (re)written: blank, or a known
 * label from a DIFFERENT language (after a language switch). A label a
 * person reworded themselves is left alone.
 */
export function staleLabelColumns(
  row: readonly unknown[],
  columnIndex: ColumnIndex,
  canonicalHeaders: readonly string[],
  language: SheetLanguage = CURRENT_SHEET_LANGUAGE,
): number[] {
  const stale: number[] = [];
  for (const header of canonicalHeaders) {
    const col = columnIndex.get(header);
    if (col === undefined) continue;
    const text = cellText(row[col]);
    const wanted = labelFor(header, language);
    if (text === wanted) continue;
    if (!text || isAppWrittenLabel(header, text)) stale.push(col);
  }
  return stale;
}
