import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { getSettings, updateSettings, type Settings, type TimeFormat } from "../lib/settings";
import { TimeInput } from "./TimeInput";
import { fullMealShareLeavesNoRoom, mealShares } from "../lib/mealRecommendation";
import { setTimeFormat } from "../lib/dateFormat";
import { getLastPullAt, getSpreadsheetId, getSpreadsheetUrl } from "../lib/sheets";
import { onSynced, pendingCount, syncNow } from "../lib/sync";
import { formatDateTime } from "../lib/dateFormat";
import { useSheetHealth } from "../context/SheetHealthContext";
import { useNotifications } from "../context/NotificationsContext";
import { SheetHealthIssueList, summarizeIssues } from "./SheetHealthIssues";

const NUMERIC_FIELDS = [
  "dailyCarbsTarget",
  "fatPerMealLimit",
  "dailyCaloriesTarget",
  "mealsPerDay",
  "snacksPerDay",
  "fullMealSharePercent",
  "maxGapHours",
  "bloodSugarMin",
  "bloodSugarMax",
  "dailyGlycemicLoadTarget",
] as const satisfies readonly (keyof Settings)[];
type NumericField = (typeof NUMERIC_FIELDS)[number];

// wakeTime/sleepTime are "HH:MM" strings (quiet hours for the meal reminder),
// not numeric targets — kept in a separate list so they get <input type="time">
// and format validation instead of the numeric-field checks below.
const TIME_FIELDS = ["wakeTime", "sleepTime"] as const satisfies readonly (keyof Settings)[];
type TimeField = (typeof TIME_FIELDS)[number];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// A Sheets time cell can read back as "6:30:00" — reduce it to the "HH:MM" the
// picker and TIME_PATTERN expect, leaving anything unparseable untouched.
function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
}

// Which Today-screen stats to show — a checkbox, not a text field, so kept
// separate from the numeric/time validation below (nothing to validate).
const BOOLEAN_FIELDS = [
  "showCarbsProgress",
  "showCaloriesProgress",
  "showGlycemicLoadProgress",
  "showFatTotal",
  "showSugarsTotal",
  "showProteinTotal",
  "showSodiumTotal",
] as const satisfies readonly (keyof Settings)[];
type BooleanField = (typeof BOOLEAN_FIELDS)[number];

// 24h/12h display — a choice, not a number/time/checkbox, so rendered by hand
// (right above the wake/sleep times it also governs).
const FIELDS = [...NUMERIC_FIELDS, ...TIME_FIELDS, ...BOOLEAN_FIELDS] as const satisfies readonly (keyof Settings)[];

// Google Play's User Data policy requires the privacy policy to be reachable
// from inside the app itself, not just the Play Console listing field. Served
// by the roncreator.com site (repo roncreator-site) since 2026-09-28 — the
// English (root) page is the primary one for publishing requirements; the old
// GitHub Pages copy (gh-pages branch) stays up until installs with the old
// link are gone.
const PRIVACY_POLICY_URL = "https://roncreator.com/track-my-meals/privacy";

// Settings shows only which spreadsheet is connected (a link to open it, a
// copy-link button) and one button to connect a different one — everything
// else (found sheets, create new, recent, built-in, paste a link) lives in
// the «Підключити таблицю» window (ConnectSheetDialog, release 1.7.1). The
// connected sheet is a per-device choice, kept on the device.
function CopyLinkButton({ url }: { url: string }) {
  const { show } = useNotifications();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      show({ key: "link-copied", kind: "info", title: uk.settings.spreadsheet.linkCopied });
    } catch {
      show({ key: "link-copied", kind: "info", title: uk.settings.spreadsheet.linkCopyFailed });
    }
  };
  return (
    <button type="button" className="icon-button" aria-label={uk.settings.spreadsheet.copyLinkLabel} title={uk.settings.spreadsheet.copyLinkLabel} onClick={() => void copy()}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </svg>
    </button>
  );
}

/** When the device copy was last refreshed, and «Синхронізувати» (release 2.0). */
function SyncLine() {
  const { reloadScreens } = useSheetHealth();
  const s = uk.settings.spreadsheet;
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const load = () => {
      void getLastPullAt().then(setLastPullAt).catch(() => setLastPullAt(null));
      void pendingCount().then(setPending).catch(() => setPending(0));
    };
    load();
    return onSynced(load);
  }, []);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncNow();
      setLastPullAt(await getLastPullAt());
      setPending(await pendingCount());
      reloadScreens();
    } catch (err) {
      setError(s.syncFailed(err instanceof Error ? err.message : String(err)));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sync-line">
      <p>
        {lastPullAt ? s.syncedAt(formatDateTime(lastPullAt)) : s.neverSynced}
        {pending > 0 && <> · {s.pending(pending)}</>}
      </p>
      <button type="button" className="button-secondary" onClick={() => void sync()} disabled={syncing}>
        {syncing ? s.syncing : s.syncButton}
      </button>
      {error && <p className="food-form-error">{error}</p>}
    </div>
  );
}

function SpreadsheetSection({ signedIn }: { signedIn: boolean }) {
  const health = useSheetHealth();
  const { hasSpreadsheet, spreadsheetName, openConnect } = health;
  const s = uk.settings.spreadsheet;
  const url = hasSpreadsheet ? getSpreadsheetUrl(getSpreadsheetId()) : "";

  const { lines, anyIssues, anyFixable, anyUnfixable, makesBackups } = summarizeIssues(health.reports);

  return (
    <div className="settings-account">
      <h2>{s.title}</h2>

      {!signedIn ? (
        <p>{s.signInToConnectHint}</p>
      ) : hasSpreadsheet ? (
        <>
          <div className="connected-sheet">
            <p>
              {s.connectedLabel}{" "}
              <a href={url} target="_blank" rel="noopener noreferrer">
                {spreadsheetName || s.openSheetLink}
              </a>
            </p>
            <CopyLinkButton url={url} />
          </div>
          <SyncLine />
          <button type="button" className="button-secondary" onClick={openConnect}>
            {s.connectOtherButton}
          </button>
        </>
      ) : (
        <>
          <p>{s.notConnected}</p>
          <button type="button" onClick={openConnect}>
            {uk.connectSheet.connectButton}
          </button>
        </>
      )}

      {signedIn && hasSpreadsheet && health.checking && <p>{s.checking}</p>}
      {signedIn && health.checkError && <p className="food-form-error">{health.checkError}</p>}
      {signedIn && health.repairError && <p className="food-form-error">{uk.sheetStructure.dialogRepairFailed(health.repairError)}</p>}

      {signedIn && health.reports && !anyIssues && <p>{s.tabsOk}</p>}

      {signedIn && anyIssues && (
        <div className="today-warning">
          <p>{s.problemsFound}</p>
          <SheetHealthIssueList lines={lines} />
          {anyUnfixable && <p>{s.unfixableNote}</p>}
          {anyFixable && (
            <>
              {makesBackups && <p>{s.repairBackupNote}</p>}
              <button type="button" onClick={() => void health.repair()} disabled={health.repairing}>
                {health.repairing ? s.repairing : s.repairButton}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Shows what the full-meal share works out to for the other meals, live as the
// numbers are edited: the derived snack share, and both in the person's own
// units. Purely arithmetic (see mealShares) — never advice.
function SnackShareHint({ values }: { values: Record<string, string> }) {
  const num = (key: string) => (values[key] ?? "").trim() !== "" ? Number(values[key]) : NaN;
  const settings = {
    mealsPerDay: num("mealsPerDay"),
    snacksPerDay: num("snacksPerDay"),
    fullMealSharePercent: num("fullMealSharePercent"),
  };
  if (!Object.values(settings).every(Number.isFinite)) return null;
  if (fullMealShareLeavesNoRoom(settings)) return <span className="food-form-hint">{uk.settings.fullMealShareError}</span>;

  const { fullPercent, snackPercent } = mealShares(settings);
  const of = (target: number, percent: number) => Math.round((target * percent) / 100);
  const calories = num("dailyCaloriesTarget");
  const parts = [uk.settings.shareSummary.full(Math.round(fullPercent * 10) / 10, Number.isFinite(calories) ? of(calories, fullPercent) : null)];
  if (snackPercent !== null) {
    parts.push(
      uk.settings.shareSummary.snack(Math.round(snackPercent * 10) / 10, Number.isFinite(calories) ? of(calories, snackPercent) : null),
    );
  }
  return <span className="food-form-hint">{parts.join(" ")}</span>;
}

export default function SettingsScreen() {
  const { signedIn, initializing, signIn, signOut, sessionExpired } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Also after a renewed sign-in (sessionExpired true -> false): reload,
    // and clear the "sign in again" error the failed load left behind.
    if (!signedIn || sessionExpired) return;
    setLoadError(null);
    getSettings()
      .then((s) => {
        setValues({
          ...Object.fromEntries(FIELDS.map((field) => [field, String(s[field])])),
          timeFormat: s.timeFormat,
          wakeTime: normalizeTime(s.wakeTime),
          sleepTime: normalizeTime(s.sleepTime),
        });
        setLoaded(true);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn, sessionExpired]);

  const handleSave = async () => {
    const numericParsed = Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, Number(values[field])])) as Record<
      NumericField,
      number
    >;
    // Number("") is 0, not NaN — checking for a blank string first is
    // required, otherwise a field left empty would silently pass as 0
    // instead of being caught by validation.
    const numericValid = NUMERIC_FIELDS.every(
      (field) => (values[field] ?? "").trim() !== "" && Number.isFinite(numericParsed[field]),
    );
    const timeValid = TIME_FIELDS.every((field) => TIME_PATTERN.test(values[field] ?? ""));

    if (!numericValid || !timeValid) {
      setSaveError(uk.settings.validationError);
      return;
    }
    if (numericParsed.snacksPerDay < 0 || numericParsed.snacksPerDay > numericParsed.mealsPerDay) {
      setSaveError(uk.settings.snacksValidationError);
      return;
    }
    if (fullMealShareLeavesNoRoom(numericParsed)) {
      setSaveError(uk.settings.fullMealShareError);
      return;
    }

    const timeParsed = Object.fromEntries(TIME_FIELDS.map((field) => [field, values[field]])) as Record<
      TimeField,
      string
    >;
    const booleanParsed = Object.fromEntries(BOOLEAN_FIELDS.map((field) => [field, values[field] === "true"])) as Record<
      BooleanField,
      boolean
    >;

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const timeFormat: TimeFormat = values.timeFormat === "12h" ? "12h" : "24h";
      await updateSettings({ ...numericParsed, ...timeParsed, ...booleanParsed, timeFormat });
      setTimeFormat(timeFormat);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="screen">
      <h1>{uk.settings.title}</h1>

      <div className="settings-account">
        <h2>{uk.settings.account.title}</h2>
        {initializing ? (
          <p>{uk.settings.loading}</p>
        ) : signedIn ? (
          <>
            <p>{uk.settings.account.signedIn}</p>
            <button type="button" onClick={signOut}>
              {uk.settings.account.signOutButton}
            </button>
          </>
        ) : (
          <>
            <p>{uk.settings.account.notSignedIn}</p>
            <button type="button" onClick={() => void signIn()}>
              {uk.settings.account.signInButton}
            </button>
          </>
        )}
      </div>

      <SpreadsheetSection signedIn={signedIn} />

      {signedIn && (
        <div className="settings-targets">
          {loadError && <p className="food-form-error">{loadError}</p>}
          {!loaded && !loadError && <p>{uk.settings.loading}</p>}

          {loaded && (
            <>
              <label>
                {uk.settings.fields.timeFormat}
                <select
                  value={values.timeFormat === "12h" ? "12h" : "24h"}
                  onChange={(e) => setValues({ ...values, timeFormat: e.target.value })}
                >
                  <option value="24h">{uk.settings.timeFormatOptions["24h"]}</option>
                  <option value="12h">{uk.settings.timeFormatOptions["12h"]}</option>
                </select>
              </label>

              {FIELDS.map((field) =>
                (TIME_FIELDS as readonly string[]).includes(field) ? (
                  <label key={field}>
                    {uk.settings.fields[field]}
                    <TimeInput
                      ariaLabel={uk.settings.fields[field]}
                      format={values.timeFormat === "12h" ? "12h" : "24h"}
                      value={values[field] ?? "00:00"}
                      onChange={(t) => setValues({ ...values, [field]: t })}
                    />
                  </label>
                ) : (BOOLEAN_FIELDS as readonly string[]).includes(field) ? (
                  <label key={field} className="settings-checkbox">
                    <input
                      type="checkbox"
                      checked={values[field] === "true"}
                      onChange={(e) => setValues({ ...values, [field]: String(e.target.checked) })}
                    />
                    {uk.settings.fields[field]}
                  </label>
                ) : (
                  <label key={field}>
                    {uk.settings.fields[field]}
                    {field === "fullMealSharePercent" && <SnackShareHint values={values} />}
                    <input
                      type={(TIME_FIELDS as readonly string[]).includes(field) ? "time" : "number"}
                      inputMode={(TIME_FIELDS as readonly string[]).includes(field) ? undefined : "decimal"}
                      step={(TIME_FIELDS as readonly string[]).includes(field) ? undefined : "0.1"}
                      value={values[field] ?? ""}
                      onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                    />
                  </label>
                ),
              )}

              {saveError && <p className="food-form-error">{saveError}</p>}
              {saved && <p>{uk.settings.saved}</p>}

              <button type="button" onClick={() => void handleSave()} disabled={saving}>
                {uk.settings.saveButton}
              </button>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        className="link-button"
        onClick={() => void Browser.open({ url: PRIVACY_POLICY_URL })}
      >
        {uk.settings.privacyPolicyLink}
      </button>
    </section>
  );
}
