// Turns app state into notices for the shared queue (NotificationsContext /
// Toaster) — the one place that decides which app-level messages exist:
//   • sign-in expired          → action: «Увійти знову» (until signed in)
//   • sheet structure problem  → action: «Переглянути» opens the repair dialog;
//                                closing it = "later", it returns at the
//                                next check (sign-in, sheet switch, app start)
//   • silent sheet upgrade     → info: what changed + how to undo, closes itself
//   • no spreadsheet connected → action: «Підключити» opens the connect window
//   • backup copy trashed      → info: where it went and that it can be restored
//   • no phone backup 30 days  → action: «Зберегти копію» (working without Google)
// Renders nothing itself.
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { uk } from "../i18n/uk";
import { summarizeIssues } from "./SheetHealthIssues";
import { upgradeNoticeLines } from "./SheetUpgradeNotice";
import { onBackupsTrashed } from "../lib/backups";
import { backupReminderDue, getLastLocalBackupAt, saveLocalBackup } from "../lib/localBackup";
import { getLocalMeta, openLocalDb } from "../lib/localDb";
import { LOCAL_SHEET_ID } from "../lib/localModeId";

export default function AppNotifications() {
  const { signedIn, sessionExpired, signIn, localMode } = useAuth();
  const { show, remove } = useNotifications();
  const health = useSheetHealth();

  // Working without Google: remind to keep a copy after 30 days without one (release 2.0).
  useEffect(() => {
    if (!localMode) {
      remove("local-backup-reminder");
      return;
    }
    void (async () => {
      await openLocalDb(LOCAL_SHEET_ID);
      if (!backupReminderDue(await getLastLocalBackupAt(), await getLocalMeta("localSince"), new Date())) return;
      show({
        key: "local-backup-reminder",
        kind: "action",
        title: uk.localMode.reminder.title,
        actions: [
          {
            label: uk.localMode.reminder.button,
            onClick: () => {
              remove("local-backup-reminder");
              void saveLocalBackup();
            },
          },
        ],
      });
    })();
  }, [localMode, show, remove]);

  // A backup copy past its keeping time went to Drive's trash (release 2.0).
  useEffect(() => onBackupsTrashed((n) => show({ key: "backups-trashed", kind: "info", title: uk.backups.trashed(n) })), [show]);

  useEffect(() => {
    if (!sessionExpired) {
      remove("session-expired");
      return;
    }
    const notice = {
      key: "session-expired",
      kind: "action" as const,
      // No ✕: signing in again is the only way on (Settings still shows her
      // as signed in, so closing this would leave no sign-in button).
      dismissible: false,
      title: uk.auth.sessionExpiredBanner,
      actions: [
        {
          label: uk.auth.signInAgainButton,
          onClick: () => {
            signIn().catch((err: unknown) =>
              show({ ...notice, details: [err instanceof Error ? err.message : String(err)] }),
            );
          },
        },
      ],
    };
    show(notice);
  }, [sessionExpired, signIn, show, remove]);

  const { needsAttention, reports, repairError, openDetails, dismissDialog } = health;
  useEffect(() => {
    if (!needsAttention) {
      remove("sheet-structure");
      return;
    }
    const { anyBlocking } = summarizeIssues(reports);
    show({
      key: "sheet-structure",
      kind: "action",
      title: anyBlocking || repairError ? uk.sheetStructure.dialogTitleBlocking : uk.sheetStructure.dialogTitleSuggested,
      actions: [{ label: uk.notifications.review, onClick: openDetails }],
      onDismiss: dismissDialog,
    });
  }, [needsAttention, reports, repairError, openDetails, dismissDialog, show, remove]);

  const { upgradeSummary, dismissUpgradeSummary } = health;
  useEffect(() => {
    if (!upgradeSummary) return;
    show({
      key: "sheet-upgrade",
      kind: "info",
      title: uk.sheetUpgrade.title,
      details: upgradeNoticeLines(upgradeSummary),
      onDismiss: dismissUpgradeSummary,
    });
  }, [upgradeSummary, dismissUpgradeSummary, show]);

  const { hasSpreadsheet, openConnect } = health;
  useEffect(() => {
    if (!signedIn || hasSpreadsheet) {
      remove("no-spreadsheet");
      return;
    }
    show({
      key: "no-spreadsheet",
      kind: "action",
      title: uk.connectSheet.noSpreadsheetNotice,
      actions: [{ label: uk.connectSheet.connectButton, onClick: openConnect }],
    });
  }, [signedIn, hasSpreadsheet, openConnect, show, remove]);

  return null;
}
