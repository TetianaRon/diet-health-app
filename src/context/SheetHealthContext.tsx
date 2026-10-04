// App-wide spreadsheet structure check. Runs on sign-in, whenever the
// connected spreadsheet changes (Settings calls check()), and the moment any
// screen's read/write trips over a broken tab (sheetRow.ts's
// onSheetStructureError) — so a broken sheet is flagged immediately, in a
// dialog (SheetHealthDialog), instead of only on the Settings screen.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { checkAndUpgradeSpreadsheet, repairSpreadsheet, type UpgradeSummary } from "../lib/spreadsheetInit";
import { getSpreadsheetName } from "../lib/sheets";
import { onSheetStructureError } from "../lib/sheetRow";
import type { TabReport } from "../lib/sheetSchema";

interface SheetHealthContextValue {
  /** null until the first check completes (or while signed out); [] = sound, current-format sheet. */
  reports: TabReport[] | null;
  /** Title of the spreadsheet the reports are about — shown in the dialog so a repair can't silently hit the wrong sheet. */
  spreadsheetName: string | null;
  checking: boolean;
  checkError: string | null;
  repairing: boolean;
  repairError: string | null;
  /** Bumped after every repair attempt, so screens can remount and re-read. */
  version: number;
  /**
   * Something needs a person (a repair, or a failed one) and it wasn't
   * dismissed since the last check — shown as an action toast
   * (AppNotifications), which can open the details dialog.
   */
  needsAttention: boolean;
  /** The details/repair dialog is open (only ever via openDetails). */
  dialogOpen: boolean;
  openDetails: () => void;
  /** Re-checks and re-opens the dialog if anything is found. */
  check: () => Promise<void>;
  repair: () => Promise<void>;
  dismissDialog: () => void;
  /** What the last silent upgrade changed (null when nothing did, or once dismissed). */
  upgradeSummary: UpgradeSummary | null;
  dismissUpgradeSummary: () => void;
}

const SheetHealthContext = createContext<SheetHealthContextValue | null>(null);

export function SheetHealthProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const [reports, setReports] = useState<TabReport[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null);
  // What the last silent upgrade changed — shown once (SheetUpgradeNotice) until dismissed.
  const [upgradeSummary, setUpgradeSummary] = useState<UpgradeSummary | null>(null);
  // Only the latest check's result counts — several screens can trip over
  // the same broken tab at once, and a slow earlier check must not
  // overwrite a newer one (e.g. after switching spreadsheets).
  const latestCheck = useRef(0);

  const check = useCallback(async () => {
    const id = ++latestCheck.current;
    setChecking(true);
    setCheckError(null);
    setDismissed(false);
    setDetailsOpen(false);
    try {
      // Silent, lossless upgrades (new columns, item IDs…) are applied here;
      // only what's left needs the dialog. If anything was written, screens
      // remount and re-read, so they don't keep rows loaded before the IDs.
      const [result, name] = await Promise.all([checkAndUpgradeSpreadsheet(), getSpreadsheetName().catch(() => null)]);
      if (id === latestCheck.current) {
        setReports(result.reports);
        setSpreadsheetName(name);
        if (result.upgrade) {
          setUpgradeSummary(result.upgrade);
          setVersion((v) => v + 1);
        }
      }
    } catch (err) {
      if (id === latestCheck.current) {
        setReports(null);
        setCheckError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (id === latestCheck.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (signedIn) {
      void check();
    } else {
      latestCheck.current++;
      setReports(null);
    }
  }, [signedIn, check]);

  useEffect(
    () =>
      onSheetStructureError(() => {
        // A burst of failing reads (every screen loading at once) needs one check, not one each.
        if (!checking) void check();
      }),
    [check, checking],
  );

  const repair = useCallback(async () => {
    setRepairing(true);
    setRepairError(null);
    try {
      await repairSpreadsheet();
    } catch (err) {
      setRepairError(err instanceof Error ? err.message : String(err));
    } finally {
      await check();
      setVersion((v) => v + 1);
      setRepairing(false);
    }
  }, [check]);

  // Stable functions: AppNotifications puts them into toasts.
  const openDetails = useCallback(() => setDetailsOpen(true), []);
  const dismissDialog = useCallback(() => {
    setDismissed(true);
    setDetailsOpen(false);
    setRepairError(null);
  }, []);
  const dismissUpgradeSummary = useCallback(() => setUpgradeSummary(null), []);

  const needsAttention = signedIn && !dismissed && (repairError !== null || (reports !== null && reports.length > 0));
  const dialogOpen = needsAttention && detailsOpen;

  return (
    <SheetHealthContext.Provider
      value={{
        reports,
        spreadsheetName,
        checking,
        checkError,
        repairing,
        repairError,
        version,
        needsAttention,
        dialogOpen,
        openDetails,
        check,
        repair,
        dismissDialog,
        upgradeSummary,
        dismissUpgradeSummary,
      }}
    >
      {children}
    </SheetHealthContext.Provider>
  );
}

export function useSheetHealth(): SheetHealthContextValue {
  const context = useContext(SheetHealthContext);
  if (!context) throw new Error("useSheetHealth must be used within a SheetHealthProvider");
  return context;
}
