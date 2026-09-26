// The plain-language list of spreadsheet structure problems, each saying what
// «Виправити таблицю» will do about it (or that it can't) — shared by the
// app-wide dialog and the Settings screen, so the list IS the preview shown
// before any repair. Grouped per tab: a sheet like mom's has dozens of
// duplicate columns, which would otherwise be dozens of near-identical lines.
import { uk } from "../i18n/uk";
import { columnLetter } from "../lib/sheetRow";
import { isBlocking, isFixable, type TabIssue, type TabReport } from "../lib/sheetSchema";

/** One line per tab-level fact: fixable duplicates and format upgrades are merged; anything needing a person keeps its own line. */
export function describeReport(report: TabReport): string[] {
  const t = uk.settings.spreadsheet;
  const { tab, issues } = report;
  const lines: string[] = [];
  const mergeableDuplicates: string[] = [];
  let formatUpgrade = false;

  for (const issue of issues) {
    switch (issue.kind) {
      case "missingTab":
        lines.push(t.issueMissingTab(tab));
        break;
      case "notAppLayout":
        lines.push(t.issueNotAppLayout(tab));
        break;
      case "missingColumns":
        lines.push(t.issueMissingColumns(tab, issue.headers));
        break;
      case "duplicateColumns":
        if (issue.conflictRows.length === 0) mergeableDuplicates.push(issue.header);
        else lines.push(t.issueDuplicateConflict(tab, issue.header, issue.columns.map(columnLetter), issue.conflictRows));
        break;
      case "missingSettingsKeys":
        lines.push(t.issueMissingSettingsKeys(issue.keys));
        break;
      case "headerFormat":
      case "missingLabelRow":
      case "staleLabels":
        formatUpgrade = true;
        break;
    }
  }
  if (mergeableDuplicates.length > 0) lines.push(t.issueDuplicateColumns(tab, mergeableDuplicates));
  // A new tab already gets both header rows; no separate upgrade line for it.
  if (formatUpgrade && !issues.some((i) => i.kind === "missingTab")) lines.push(t.issueFormatUpgrade(tab));
  return lines;
}

export interface IssueSummary {
  lines: string[];
  anyIssues: boolean;
  anyBlocking: boolean;
  anyFixable: boolean;
  anyUnfixable: boolean;
  /** A fixable blocking issue means the repair restructures a tab — and backs it up first. */
  makesBackups: boolean;
}

export function summarizeIssues(reports: TabReport[] | null): IssueSummary {
  const all: TabIssue[] = (reports ?? []).flatMap((r) => r.issues);
  return {
    lines: (reports ?? []).flatMap(describeReport),
    anyIssues: all.length > 0,
    anyBlocking: all.some(isBlocking),
    anyFixable: all.some(isFixable),
    anyUnfixable: all.some((issue) => !isFixable(issue)),
    makesBackups: all.some((issue) => isBlocking(issue) && isFixable(issue) && issue.kind !== "missingTab"),
  };
}

export function SheetHealthIssueList({ lines }: { lines: string[] }) {
  return (
    <ul className="sheet-health-issues">
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </ul>
  );
}
