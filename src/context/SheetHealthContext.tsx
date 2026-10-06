// App-wide spreadsheet structure check. Runs on sign-in, whenever the
// connected spreadsheet changes (Settings calls check()), and the moment any
// screen's read/write trips over a broken tab (sheetRow.ts's
// onSheetStructureError) — so a broken sheet is flagged immediately, in a
// dialog (SheetHealthDialog), instead of only on the Settings screen.
// Also owns which spreadsheet is connected (release 1.7.1): whether there is
// one, the «Підключити таблицю» window (ConnectSheetDialog) and switching.
import { isLocalSheetId } from "../lib/localModeId";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { checkAndUpgradeSpreadsheet, repairSpreadsheet, type UpgradeSummary } from "../lib/spreadsheetInit";
import { getSpreadsheetId, getSpreadsheetName, setSpreadsheetId } from "../lib/sheets";
import { addRecentSheet, loadRecentSheets, renameRecentSheet, saveRecentSheets, type SheetOption } from "../lib/sheetConnections";
import { onSheetStructureError } from "../lib/sheetRow";
import { attachLocalData, prepareAttach, type AttachPreparation } from "../lib/localMode";
import { LOCAL_SHEET_ID } from "../lib/localModeId";
import { syncIfStale } from "../lib/sync";
import type { Decision } from "../lib/localAttach";
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
  /** This device has a connected spreadsheet (false until one is chosen — no build-time fallback since 1.7.1). */
  hasSpreadsheet: boolean;
  /** The «Підключити таблицю» window is open. */
  connectOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
  /**
   * Connects this device to a spreadsheet, remembers it on the device, checks it and reloads the screens.
   * Working without Google, the phone's data is added to that sheet (isNew: it was just created, so the
   * phone's Settings go too); same-name items first wait for the person's decisions (attachReview).
   */
  connectSpreadsheet: (sheet: SheetOption, options?: { isNew?: boolean }) => Promise<void>;
  /** Duplicates found while adding the phone's data to a sheet, waiting for decisions (DuplicatesDialog). */
  attachReview: AttachPreparation | null;
  confirmAttach: (decisions: ReadonlyMap<string, Decision>) => Promise<void>;
  /** Doesn't connect: the phone keeps working without Google, nothing uploaded. */
  cancelAttach: () => void;
  /** Remounts the screens so they re-read the sheet (after an app-level write, e.g. updating saved copies). */
  reloadScreens: () => void;
}

const SheetHealthContext = createContext<SheetHealthContextValue | null>(null);

export function SheetHealthProvider({ children }: { children: ReactNode }) {
  const { signedIn, localMode, endLocalMode } = useAuth();
  const [attachReview, setAttachReview] = useState<AttachPreparation | null>(null);
  const pendingAttach = useRef<{ sheet: SheetOption; isNew: boolean } | null>(null);
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
  const [hasSpreadsheet, setHasSpreadsheet] = useState(() => getSpreadsheetId() !== "");
  const [connectOpen, setConnectOpen] = useState(false);

  const check = useCallback(async () => {
    const id = ++latestCheck.current;
    setChecking(true);
    setCheckError(null);
    setDismissed(false);
    setDetailsOpen(false);
    if (!getSpreadsheetId() || isLocalSheetId(getSpreadsheetId())) {
      // Nothing to check: no sheet yet (AppNotifications offers «Підключити»), or working without
      // Google (the device data is created complete).
      setReports(null);
      setSpreadsheetName(null);
      setChecking(false);
      return;
    }
    try {
      // Silent, lossless upgrades (new columns, item IDs…) are applied here;
      // only what's left needs the dialog. If anything was written, screens
      // remount and re-read, so they don't keep rows loaded before the IDs.
      const [result, name] = await Promise.all([checkAndUpgradeSpreadsheet(), getSpreadsheetName().catch(() => null)]);
      if (id === latestCheck.current) {
        setReports(result.reports);
        setSpreadsheetName(name);
        rememberConnectedSheet(name);
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
      // Signing in on the web can forget another account's sheet (sheets.ts → bindWebAccount).
      setHasSpreadsheet(getSpreadsheetId() !== "");
      // A new web session starts without a device copy: one sync loads every tab at once.
      void check().then(() => syncIfStale().catch((err) => console.warn("[sync] after sign-in:", err)));
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
  const openConnect = useCallback(() => setConnectOpen(true), []);
  const reloadScreens = useCallback(() => setVersion((v) => v + 1), []);
  const closeConnect = useCallback(() => setConnectOpen(false), []);

  const finishConnect = useCallback(
    async (sheet: SheetOption) => {
      saveRecentSheets(addRecentSheet(loadRecentSheets(), sheet));
      setHasSpreadsheet(true);
      setConnectOpen(false);
      setUpgradeSummary(null);
      await check();
      setVersion((v) => v + 1); // screens remount and read the new sheet
    },
    [check],
  );

  const confirmAttach = useCallback(
    async (decisions: ReadonlyMap<string, Decision>) => {
      const pending = pendingAttach.current;
      if (!attachReview || !pending) return;
      await attachLocalData(attachReview, decisions, pending.isNew);
      pendingAttach.current = null;
      setAttachReview(null);
      endLocalMode();
      await finishConnect(pending.sheet);
    },
    [attachReview, endLocalMode, finishConnect],
  );

  const cancelAttach = useCallback(() => {
    pendingAttach.current = null;
    setAttachReview(null);
    setSpreadsheetId(LOCAL_SHEET_ID);
  }, []);

  const connectSpreadsheet = useCallback(
    async (sheet: SheetOption, options: { isNew?: boolean } = {}) => {
      setSpreadsheetId(sheet.id);
      if (localMode) {
        // Working without Google: bring the sheet up to date, then add the phone's data to it.
        await checkAndUpgradeSpreadsheet();
        const prep = await prepareAttach();
        pendingAttach.current = { sheet, isNew: options.isNew ?? false };
        if (prep.duplicates.length > 0) {
          setConnectOpen(false);
          setAttachReview(prep);
          return;
        }
        await attachLocalData(prep, new Map(), options.isNew ?? false);
        pendingAttach.current = null;
        endLocalMode();
        await finishConnect(sheet);
        return;
      }
      saveRecentSheets(addRecentSheet(loadRecentSheets(), sheet));
      setHasSpreadsheet(true);
      setConnectOpen(false);
      setUpgradeSummary(null);
      await check();
      setVersion((v) => v + 1); // screens remount and read the new sheet
    },
    [check, localMode, endLocalMode, finishConnect],
  );

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
        hasSpreadsheet,
        connectOpen,
        openConnect,
        closeConnect,
        connectSpreadsheet,
        attachReview,
        confirmAttach,
        cancelAttach,
        reloadScreens,
      }}
    >
      {children}
    </SheetHealthContext.Provider>
  );
}

/**
 * Keeps the device's "connected before" list current: adds the connected
 * sheet if it isn't there (devices connected before 1.7.1) and refreshes its
 * title (it may have been renamed in Google Sheets).
 */
function rememberConnectedSheet(title: string | null) {
  const id = getSpreadsheetId();
  if (!id || title === null) return;
  const list = loadRecentSheets();
  saveRecentSheets(list.some((s) => s.id === id) ? renameRecentSheet(list, id, title) : addRecentSheet(list, { id, title }));
}

export function useSheetHealth(): SheetHealthContextValue {
  const context = useContext(SheetHealthContext);
  if (!context) throw new Error("useSheetHealth must be used within a SheetHealthProvider");
  return context;
}
