// Column migrations (release 1.7, developer, 2026-10-05): when a released
// column changes meaning, the app carries the data over instead of asking
// anyone to fix the sheet by hand. Each migration fills the NEW column's
// empty cells by converting the OLD column's values; the old column stays
// exactly as it is (nothing deleted or overwritten — the app just stops
// reading it). Applied by the silent upgrade (checkAndUpgradeSpreadsheet),
// after the new column itself was added. Pure, unit-tested.
//
// Rule for future releases (spec → "Item IDs and the sheet upgrade"): after
// a release, sheet changes are either additive or ship with a migration
// here; columns are never removed automatically.
import { buildColumnIndex, columnLetter } from "./sheetRow";
import { isLabelRow } from "./sheetLabels";
import { localDateKey } from "./dailyLog";

export interface ColumnMigration {
  tab: string;
  /** The old column the values come from. */
  from: string;
  /** The new column whose empty cells get filled. */
  to: string;
  /** Converts one old value to the new cell's value, or null to leave the cell empty. */
  convert: (value: unknown) => unknown;
  /** Written to the sheet as text (leading apostrophe) so Sheets doesn't reformat it. */
  asText?: boolean;
}

/** An ISO timestamp → its local calendar day "YYYY-MM-DD" (null if it isn't one). */
export function timestampToDateKey(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const t = new Date(text);
  return Number.isNaN(t.getTime()) ? null : localDateKey(t);
}

export const COLUMN_MIGRATIONS: ColumnMigration[] = [
  // 1.7 during testing: weight became one record per day (Timestamp → Date).
  { tab: "Weight", from: "Timestamp", to: "Date", convert: timestampToDateKey, asText: true },
];

export interface MigrationResult {
  valueUpdates: { range: string; values: unknown[][] }[];
  /** Per migration that filled anything: how many cells. */
  applied: { tab: string; from: string; to: string; cells: number }[];
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === "";
}

/** Plans every migration whose old and new columns both exist, for the tabs as read (header row first). */
export function planColumnMigrations(
  rowsByTab: ReadonlyMap<string, unknown[][]>,
  migrations: readonly ColumnMigration[] = COLUMN_MIGRATIONS,
): MigrationResult {
  const result: MigrationResult = { valueUpdates: [], applied: [] };
  for (const migration of migrations) {
    const rows = rowsByTab.get(migration.tab);
    if (!rows || rows.length === 0) continue;
    const columnIndex = buildColumnIndex(rows[0] ?? []);
    const fromCol = columnIndex.get(migration.from);
    const toCol = columnIndex.get(migration.to);
    if (fromCol === undefined || toCol === undefined) continue; // nothing to migrate, or the new column isn't added yet
    const hasLabelRow = rows.length > 1 && isLabelRow(rows[1], columnIndex);
    const firstDataRow = hasLabelRow ? 3 : 2;
    let cells = 0;
    rows.slice(hasLabelRow ? 2 : 1).forEach((row, i) => {
      if (!isBlank(row[toCol]) || isBlank(row[fromCol])) return;
      const converted = migration.convert(row[fromCol]);
      if (converted === null || converted === undefined || converted === "") return;
      result.valueUpdates.push({
        range: `${migration.tab}!${columnLetter(toCol)}${firstDataRow + i}`,
        values: [[migration.asText ? `'${String(converted)}` : converted]],
      });
      cells++;
    });
    if (cells > 0) result.applied.push({ tab: migration.tab, from: migration.from, to: migration.to, cells });
  }
  return result;
}
