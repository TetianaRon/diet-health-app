// Cutting an A1 range ("A1:L200", "A:J", "B5") out of a stored copy of a
// whole tab, returning exactly what the Sheets values API would: the grid
// starting at the range's top-left cell, with trailing empty cells and rows
// trimmed. Lets every module keep its readRange(tab, range) calls while the
// data comes from the device.

export interface A1Range {
  /** 0-based first column / row; last column / row are inclusive, or Infinity when open-ended. */
  firstCol: number;
  firstRow: number;
  lastCol: number;
  lastRow: number;
}

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseCell(cell: string): { col: number | null; row: number | null } {
  const m = /^([A-Za-z]*)(\d*)$/.exec(cell.trim());
  if (!m || (!m[1] && !m[2])) throw new Error(`Not an A1 cell: "${cell}"`);
  return { col: m[1] ? columnNumber(m[1]) : null, row: m[2] ? Number(m[2]) - 1 : null };
}

/** Parses "A1:L200", "A:J", "A2:C", "3:3" or "B5" (a sheet prefix like "Tab!" is ignored). */
export function parseA1Range(range: string): A1Range {
  const body = range.includes("!") ? range.slice(range.lastIndexOf("!") + 1) : range;
  const [startText, endText = startText] = body.split(":");
  const start = parseCell(startText);
  const end = parseCell(endText);
  return {
    firstCol: start.col ?? 0,
    firstRow: start.row ?? 0,
    lastCol: end.col ?? Infinity,
    lastRow: end.row ?? Infinity,
  };
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/** The part of `grid` (a whole tab from A1) inside `range`, trimmed like the values API. */
export function sliceGrid(grid: readonly (readonly unknown[])[], range: string): unknown[][] {
  const r = parseA1Range(range);
  const out: unknown[][] = [];
  const lastRow = Math.min(r.lastRow, grid.length - 1);
  for (let i = r.firstRow; i <= lastRow; i++) {
    const row = grid[i] ?? [];
    const cells = row.slice(r.firstCol, r.lastCol === Infinity ? undefined : r.lastCol + 1);
    while (cells.length > 0 && isEmpty(cells[cells.length - 1])) cells.pop();
    out.push(cells);
  }
  while (out.length > 0 && out[out.length - 1].length === 0) out.pop();
  return out;
}

/** The tab names a list of ranges ("Ingredients!A2:B2", "'My tab'!C3") touch. */
export function tabsOfRanges(ranges: readonly string[]): string[] {
  const tabs = new Set<string>();
  for (const range of ranges) {
    const bang = range.lastIndexOf("!");
    if (bang <= 0) continue;
    tabs.add(range.slice(0, bang).replace(/^'(.*)'$/, "$1").replace(/''/g, "'"));
  }
  return [...tabs];
}
