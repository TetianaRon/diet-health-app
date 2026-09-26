// App-wide spreadsheet structure check. Runs on sign-in, whenever the
// connected spreadsheet changes (Settings calls check()), and the moment any
// screen's read/write trips over a broken tab (sheetRow.ts's
// onSheetStructureError) — so a broken sheet is flagged immediately, in a
// dialog (SheetHealthDialog), instead of only on the Settings screen.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { checkSpreadsheetHealth, repairSpreadsheet } from "../lib/spreadsheetInit";
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
  dialogOpen: boolean;
  /** Re-checks and re-opens the dialog if anything is found. */
  check: () => Promise<void>;
  repair: () => Promise<void>;
  dismissDialog: () => void;
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
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null);
  // Only the latest check's result counts — several screens can trip over
  // the same broken tab at once, and a slow earlier check must not
  // overwrite a newer one (e.g. after switching spreadsheets).
  const latestCheck = useRef(0);

  const check = useCallback(async () => {
    const id = ++latestCheck.current;
    setChecking(true);
    setCheckError(null);
    setDismissed(false);
    try {
      const [result, name] = await Promise.all([checkSpreadsheetHealth(), getSpreadsheetName().catch(() => null)]);
      if (id === latestCheck.current) {
        setReports(result);
        setSpreadsheetName(name);
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

  const dialogOpen = signedIn && !dismissed && (repairError !== null || (reports !== null && reports.length > 0));

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
        dialogOpen,
        check,
        repair,
        dismissDialog: () => {
          setDismissed(true);
          setRepairError(null);
        },
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
