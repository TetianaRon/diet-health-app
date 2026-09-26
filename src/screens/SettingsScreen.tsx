import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { getSettings, updateSettings, type Settings, type TimeFormat } from "../lib/settings";
import { TimeInput } from "./TimeInput";
import { fullMealShareLeavesNoRoom, mealShares } from "../lib/mealRecommendation";
import { setTimeFormat } from "../lib/dateFormat";
import {
  getSpreadsheetId,
  setSpreadsheetId,
  getMomSpreadsheetId,
  getTestSpreadsheetId,
  getDevSpreadsheetId,
  getSpreadsheetUrl,
  getSpreadsheetName,
  createSpreadsheetInAppFolder,
} from "../lib/sheets";
import { initializeSpreadsheet } from "../lib/spreadsheetInit";
import { useSheetHealth } from "../context/SheetHealthContext";
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
// from inside the app itself, not just the Play Console listing field — see
// docs/privacy-policy.html (published via GitHub Pages, kept isolated from
// this repo's other docs/ files on its own gh-pages branch).
const PRIVACY_POLICY_URL = "https://tetianaron.github.io/diet-health-app/";

// Not gated behind sign-in — which spreadsheet this device talks to is a
// local, per-device setting independent of the signed-in Google account
// (unlike the numeric targets below, which live in that spreadsheet's
// Settings tab and so need a real read/write round-trip). See the
// "Spreadsheet selection" comment in src/lib/sheets.ts for why this exists:
// VITE_SPREADSHEET_ID is one value baked into the build, so every install
// shared it until this override existed.

function SpreadsheetSection({ signedIn }: { signedIn: boolean }) {
  const [value, setValue] = useState(() => getSpreadsheetId());
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const health = useSheetHealth();
  const [newName, setNewName] = useState<string>(uk.settings.spreadsheet.newNameDefault);
  const [creatingNew, setCreatingNew] = useState(false);
  // The connected spreadsheet's own title — shown as a hyperlink so it's
  // unmistakable which real file is connected, not just a bare ID (a gap
  // noticed when the create-new flow worked but gave no visible proof of
  // which spreadsheet it actually connected). Loaded alongside the tab
  // check, not separately, since both need the same signed-in API access.
  const [spreadsheetName, setSpreadsheetName] = useState<string | null>(null);
  const momSpreadsheetId = getMomSpreadsheetId();
  const testSpreadsheetId = getTestSpreadsheetId();
  const devSpreadsheetId = getDevSpreadsheetId();

  // The structure check itself is app-wide (SheetHealthContext, which also
  // runs it on sign-in); this re-runs it after switching spreadsheets and
  // refreshes the connected sheet's name alongside.
  const runTabCheck = async () => {
    setSpreadsheetName(null);
    const [name] = await Promise.all([getSpreadsheetName().catch(() => null), health.check()]);
    setSpreadsheetName(name);
  };

  useEffect(() => {
    if (signedIn) void getSpreadsheetName().then(setSpreadsheetName, () => setSpreadsheetName(null));
  }, [signedIn]);

  const handleRepair = async () => {
    setSavedMessage(null);
    await health.repair();
  };

  const handleCreateNew = async () => {
    if (!newName.trim()) {
      setError(uk.settings.spreadsheet.newNameValidationError);
      setSavedMessage(null);
      return;
    }
    setCreatingNew(true);
    setError(null);
    setSavedMessage(null);
    try {
      const id = await createSpreadsheetInAppFolder(newName.trim());
      setSpreadsheetId(id);
      setValue(getSpreadsheetId());
      await initializeSpreadsheet();
      await runTabCheck();
      setSavedMessage(uk.settings.spreadsheet.createdNew);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingNew(false);
    }
  };

  const handleSave = () => {
    if (!value.trim()) {
      setError(uk.settings.spreadsheet.validationError);
      setSavedMessage(null);
      return;
    }
    setSpreadsheetId(value);
    setValue(getSpreadsheetId()); // reflects the parsed-out ID, not whatever was pasted
    setError(null);
    setSavedMessage(uk.settings.spreadsheet.saved);
    if (signedIn) void runTabCheck();
  };

  const handleConnectMom = () => {
    setSpreadsheetId(momSpreadsheetId);
    setValue(getSpreadsheetId());
    setError(null);
    setSavedMessage(uk.settings.spreadsheet.connectMomSaved);
    if (signedIn) void runTabCheck();
  };

  const handleConnectTest = () => {
    setSpreadsheetId(testSpreadsheetId);
    setValue(getSpreadsheetId());
    setError(null);
    setSavedMessage(uk.settings.spreadsheet.connectTestSaved);
    if (signedIn) void runTabCheck();
  };

  const handleConnectDev = () => {
    setSpreadsheetId(devSpreadsheetId);
    setValue(getSpreadsheetId());
    setError(null);
    setSavedMessage(uk.settings.spreadsheet.connectDevSaved);
    if (signedIn) void runTabCheck();
  };

  const { lines, anyIssues, anyFixable, anyUnfixable, makesBackups } = summarizeIssues(health.reports);

  return (
    <div className="settings-account">
      <h2>{uk.settings.spreadsheet.title}</h2>

      {signedIn ? (
        <div className="settings-spreadsheet-create">
          <h3>{uk.settings.spreadsheet.newSpreadsheetTitle}</h3>
          <p>{uk.settings.spreadsheet.newSpreadsheetHint}</p>
          <label>
            {uk.settings.spreadsheet.newNameLabel}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button type="button" onClick={() => void handleCreateNew()} disabled={creatingNew}>
            {creatingNew ? uk.settings.spreadsheet.creating : uk.settings.spreadsheet.createButton}
          </button>
        </div>
      ) : (
        <p>{uk.settings.spreadsheet.signInToCreateHint}</p>
      )}

      <h3>{uk.settings.spreadsheet.existingSpreadsheetTitle}</h3>
      {signedIn && spreadsheetName && (
        <p>
          {uk.settings.spreadsheet.connectedLabel}{" "}
          <a href={getSpreadsheetUrl(getSpreadsheetId())} target="_blank" rel="noopener noreferrer">
            {spreadsheetName}
          </a>
        </p>
      )}
      <p>{uk.settings.spreadsheet.hint}</p>
      <label>
        {uk.settings.spreadsheet.inputLabel}
        <input
          value={value}
          placeholder={uk.settings.spreadsheet.placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setSavedMessage(null);
          }}
        />
      </label>
      {error && <p className="food-form-error">{error}</p>}
      {savedMessage && <p>{savedMessage}</p>}
      <div className="settings-actions">
        <button type="button" onClick={handleSave}>
          {uk.settings.spreadsheet.saveButton}
        </button>
        {momSpreadsheetId && (
          <button type="button" onClick={handleConnectMom}>
            {uk.settings.spreadsheet.connectMomButton}
          </button>
        )}
        {testSpreadsheetId && (
          <button type="button" onClick={handleConnectTest}>
            {uk.settings.spreadsheet.connectTestButton}
          </button>
        )}
        {devSpreadsheetId && (
          <button type="button" onClick={handleConnectDev}>
            {uk.settings.spreadsheet.connectDevButton}
          </button>
        )}
      </div>

      {signedIn && health.checking && <p>{uk.settings.spreadsheet.checking}</p>}
      {signedIn && health.checkError && <p className="food-form-error">{health.checkError}</p>}
      {signedIn && health.repairError && <p className="food-form-error">{uk.sheetStructure.dialogRepairFailed(health.repairError)}</p>}

      {signedIn && health.reports && !anyIssues && <p>{uk.settings.spreadsheet.tabsOk}</p>}

      {signedIn && anyIssues && (
        <div className="today-warning">
          <p>{uk.settings.spreadsheet.problemsFound}</p>
          <SheetHealthIssueList lines={lines} />
          {anyUnfixable && <p>{uk.settings.spreadsheet.unfixableNote}</p>}
          {anyFixable && (
            <>
              {makesBackups && <p>{uk.settings.spreadsheet.repairBackupNote}</p>}
              <button type="button" onClick={() => void handleRepair()} disabled={health.repairing}>
                {health.repairing ? uk.settings.spreadsheet.repairing : uk.settings.spreadsheet.repairButton}
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
  const { signedIn, initializing, signIn, signOut } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
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
  }, [signedIn]);

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
