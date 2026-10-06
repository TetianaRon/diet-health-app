// Release 2.0: IDs for rows that have none (existing rows at the upgrade, rows
// typed into the sheet by hand at sync). Pure; free of data-module imports so
// sync can use it without import cycles.
import { buildColumnIndex, columnLetter } from "./sheetRow";
import { isLabelRow } from "./sheetLabels";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Release 2.0: gives every non-blank row of a record tab (DailyLog, BloodSugar,
 * MedicationLog, Weight) an ID where its Id cell is blank. Only blank cells are
 * written. `makeId` is newRecordId for the tab's kind (injected for tests).
 */
export function planRecordIds(
  tab: string,
  rows: readonly (readonly unknown[])[],
  makeId: () => string,
): { valueUpdates: { range: string; values: unknown[][] }[]; filled: number } {
  const columnIndex = buildColumnIndex(rows[0] ?? []);
  const firstDataRow = rows.length > 1 && isLabelRow(rows[1], columnIndex) ? 3 : 2;
  const dataRows = rows.slice(firstDataRow - 1);
  const idCol = columnIndex.get("Id");
  if (idCol === undefined) return { valueUpdates: [], filled: 0 }; // column not added yet
  const valueUpdates: { range: string; values: unknown[][] }[] = [];
  dataRows.forEach((row, i) => {
    if (row.every((v) => text(v) === "") || text(row[idCol]) !== "") return;
    valueUpdates.push({ range: `${tab}!${columnLetter(idCol)}${firstDataRow + i}`, values: [[makeId()]] });
  });
  return { valueUpdates, filled: valueUpdates.length };
}
