// The app-wide "your spreadsheet needs fixing" dialog — opened by
// SheetHealthContext whenever a check finds problems (sign-in, switching
// spreadsheets, or any screen tripping over a broken tab). Offers the
// automatic repair when it can; otherwise, or when the repair fails, points
// to a manual fix or a fresh spreadsheet in Settings.
import { uk } from "../i18n/uk";
import { useBackHandler } from "../lib/useBackHandler";
import { useSheetHealth } from "../context/SheetHealthContext";
import { SheetHealthIssueList, summarizeIssues } from "./SheetHealthIssues";

export default function SheetHealthDialog({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { reports, spreadsheetName, dialogOpen, repairing, repairError, repair, dismissDialog } = useSheetHealth();
  useBackHandler(dialogOpen, () => {
    if (!repairing) dismissDialog();
  });
  if (!dialogOpen) return null;

  const t = uk.sheetStructure;
  const s = uk.settings.spreadsheet;
  const { lines, anyIssues, anyBlocking, anyFixable, anyUnfixable, makesBackups } = summarizeIssues(reports);

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sheet-health-title">
        <h2 id="sheet-health-title">{anyBlocking || repairError ? t.dialogTitleBlocking : t.dialogTitleSuggested}</h2>
        {spreadsheetName && (
          <p>
            <strong>{t.dialogSpreadsheet(spreadsheetName)}</strong>
          </p>
        )}
        {anyIssues && (
          <>
            <p>{anyBlocking ? t.dialogIntroBlocking : t.dialogIntroSuggested}</p>
            <SheetHealthIssueList lines={lines} />
          </>
        )}
        {repairError && <p className="food-form-error">{t.dialogRepairFailed(repairError)}</p>}
        {anyUnfixable && <p>{t.dialogUnfixable}</p>}
        {anyFixable && !repairError && makesBackups && <p>{s.repairBackupNote}</p>}

        <div className="modal-actions">
          {anyFixable && !repairError && (
            <button type="button" onClick={() => void repair()} disabled={repairing}>
              {repairing ? s.repairing : anyBlocking ? s.repairButton : t.updateButton}
            </button>
          )}
          {(anyUnfixable || repairError) && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                dismissDialog();
                onOpenSettings();
              }}
            >
              {t.openSettings}
            </button>
          )}
          <button type="button" className="button-secondary" onClick={dismissDialog} disabled={repairing}>
            {anyFixable && !repairError ? t.later : t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
