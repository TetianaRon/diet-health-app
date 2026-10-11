// Turns app state into notices for the shared queue (NotificationsContext /
// Toaster) — the one place that decides which app-level messages exist:
//   • sign-in expired          → action: «Увійти знову» (until signed in)
//   • sheet structure problem  → action: «Переглянути» opens the repair dialog;
//                                closing it = "later", it returns at the
//                                next check (sign-in, sheet switch, app start)
//   • silent sheet upgrade     → progress «Оновлюємо таблицю…» while it runs, then
//                                the same notice becomes the result (info: what
//                                changed + how to undo, closes itself) or gives
//                                way to the structure notice above
//   • no spreadsheet connected → action: «Підключити» opens the connect window
//   • backup copy trashed      → info: where it went and that it can be restored
// Renders nothing itself.
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { uk } from "../i18n/uk";
import { summarizeIssues } from "./SheetHealthIssues";
import { upgradeNoticeLines } from "./SheetUpgradeNotice";
import { onBackupsTrashed } from "../lib/backups";
import { onNewVersion } from "../lib/serviceWorker";

export default function AppNotifications() {
  const { signedIn, sessionExpired, signIn, localMode } = useAuth();
  const { show, remove } = useNotifications();
  const health = useSheetHealth();

  // A new release took over while the app was open (web, 2.3.2): offer the reload, never force it.
  useEffect(
    () =>
      onNewVersion(() =>
        show({
          key: "new-version",
          kind: "action",
          title: uk.newVersion.title,
          actions: [{ label: uk.newVersion.reload, onClick: () => window.location.reload() }],
        }),
      ),
    [show],
  );

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

  // The sheet couldn't be brought up to date (2.1: the products merge stopped). The data
  // isn't changed — the merge writes only after its copy — but the screens can't read it yet.
  const { checkError, check } = health;
  useEffect(() => {
    if (!signedIn || localMode || !checkError) {
      remove("sheet-check-error");
      return;
    }
    show({
      key: "sheet-check-error",
      kind: "action",
      title: uk.sheetUpgrade.failed,
      details: [checkError, uk.sheetUpgrade.failedSafe],
      actions: [{ label: uk.sheetUpgrade.retry, onClick: () => void check() }],
    });
  }, [signedIn, localMode, checkError, check, show, remove]);

  const { upgrading, upgradeSummary, dismissUpgradeSummary } = health;
  useEffect(() => {
    if (upgrading) {
      show({ key: "sheet-upgrade", kind: "progress", title: uk.sheetUpgrade.working });
      return;
    }
    if (!upgradeSummary) {
      // Nothing was changed (or the update couldn't run — the structure notice says what to do).
      remove("sheet-upgrade");
      return;
    }
    // The 2.1 products merge changes the sheet's tabs: that notice stays until read.
    const merged = upgradeSummary.productsMerged || upgradeSummary.productsAbsorbed > 0;
    show({
      key: "sheet-upgrade",
      kind: merged ? "action" : "info",
      title: upgradeSummary.productsMerged ? uk.sheetUpgrade.mergedTitle : uk.sheetUpgrade.title,
      details: upgradeNoticeLines(upgradeSummary),
      ...(merged ? { actions: [{ label: uk.sheetUpgrade.dismiss, onClick: () => { remove("sheet-upgrade"); dismissUpgradeSummary(); } }] } : {}),
      onDismiss: dismissUpgradeSummary,
    });
  }, [upgrading, upgradeSummary, dismissUpgradeSummary, show, remove]);

  const { hasSpreadsheet, openConnect } = health;
  useEffect(() => {
    if (!signedIn || hasSpreadsheet || localMode) {
      remove("no-spreadsheet");
      return;
    }
    show({
      key: "no-spreadsheet",
      kind: "action",
      title: uk.connectSheet.noSpreadsheetNotice,
      actions: [{ label: uk.connectSheet.connectButton, onClick: openConnect }],
    });
  }, [signedIn, hasSpreadsheet, localMode, openConnect, show, remove]);

  return null;
}
