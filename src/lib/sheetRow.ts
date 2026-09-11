// Shared helpers for reading/writing spreadsheet rows by column HEADER NAME
// instead of a fixed position, so every tab's parsing/writing stays correct
// even if its columns end up reordered — a deliberate future schema change,
// or (more realistically, since every schema change this app has made so
// far has been append-only, never a reorder — see the dev-feedback-patterns
// note on additive-only columns) someone manually dragging a column around
// in the Google Sheets UI itself.
import { readRange } from "./sheets";

export type ColumnIndex = Map<string, number>;

/** Builds a header-name -> 0-based column-index map from a tab's header row. */
export function buildColumnIndex(headerRow: readonly unknown[]): ColumnIndex {
  const index = new Map<string, number>();
  headerRow.forEach((value, i) => {
    const name = String(value ?? "").trim();
    if (name) index.set(name, i);
  });
  return index;
}

/**
 * Looks up one cell in a data row by column header name. Returns undefined
 * for a header this particular sheet doesn't have (e.g. a column added in a
 * later app release than this sheet was set up with) — every rowTo* mapper's
 * existing toNumber/toBoolean/String(x ?? "") fallback already treats
 * undefined the same as a blank cell, so this needs no new fallback logic.
 */
export function cell(row: readonly unknown[], columnIndex: ColumnIndex, headerName: string): unknown {
  const i = columnIndex.get(headerName);
  return i === undefined ? undefined : row[i];
}

/**
 * Builds a full row array by placing each {headerName: value} field at that
 * header's actual current column position — the write-side counterpart to
 * `cell`. A field whose header isn't in columnIndex (an old sheet missing a
 * column a newer release added) is simply left out: that field's data can't
 * go anywhere until the sheet is topped up (see spreadsheetInit.ts), same as
 * it couldn't before this module existed.
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

/** Reads just a tab's header row (row 1) and builds its column index — a cheap call for write paths that don't need the rest of the tab. */
export async function readColumnIndex(tab: string, lastColumnLetter: string): Promise<ColumnIndex> {
  const rows = await readRange(tab, `A1:${lastColumnLetter}1`);
  return buildColumnIndex(rows[0] ?? []);
}
