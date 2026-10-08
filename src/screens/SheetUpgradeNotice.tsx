// The lines of the info toast shown once after the app silently upgraded the
// connected spreadsheet (new columns or tabs, item IDs — see
// checkAndUpgradeSpreadsheet; shown by AppNotifications): what changed and
// how to get the previous version back, so no change to her sheet happens
// unseen (developer, 2026-10-04).
import { uk } from "../i18n/uk";
import type { UpgradeSummary } from "../lib/spreadsheetInit";

/** The notice's lines for a summary — exported for tests. */
export function upgradeNoticeLines(summary: UpgradeSummary): string[] {
  const t = uk.sheetUpgrade;
  const lines: string[] = [];
  if (summary.addedTabs.length > 0) lines.push(t.addedTabs(summary.addedTabs.join(", ")));
  const columns = [...new Set(summary.addedColumns)];
  if (columns.length > 0) lines.push(t.addedColumns(columns.map((c) => `«${c}»`).join(", ")));
  else if (summary.labelsFilled > 0) lines.push(t.labelsFilled);
  for (const m of summary.migrated) lines.push(t.migrated(m.to, m.from));
  if (summary.idsFilled > 0) lines.push(t.idsFilled);
  if (summary.idsRenumbered > 0) lines.push(t.idsRenumbered(summary.idsRenumbered));
  if (summary.productsMerged) lines.push(t.productsMerged, t.backupSaved);
  if (summary.productsAbsorbed > 0) lines.push(t.productsAbsorbed(summary.productsAbsorbed));
  if (summary.idsRenumbered === 0 && !summary.productsMerged && summary.productsAbsorbed === 0) lines.push(t.onlyEmptyCells);
  lines.push(t.history);
  return lines;
}
