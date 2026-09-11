import { useEffect, useState } from "react";
import { Browser } from "@capacitor/browser";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { getSettings, updateSettings, type Settings } from "../lib/settings";
import {
  getSpreadsheetId,
  setSpreadsheetId,
  getMomSpreadsheetId,
  getTestSpreadsheetId,
  getDevSpreadsheetId,
  getSpreadsheetUrl,
  createSpreadsheetInAppFolder,
} from "../lib/sheets";
import { checkSpreadsheetTabs, initializeSpreadsheet } from "../lib/spreadsheetInit";

const NUMERIC_FIELDS = [
  "dailyCarbsTarget",
  "fatPerMealLimit",
  "dailyCaloriesTarget",
  "mealsPerDay",
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
// Clipboard API needs a secure context, which every real target (https dev
// server, Capacitor's custom scheme) satisfies — but falls back to the old
// execCommand trick rather than silently doing nothing if it's ever missing.
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the execCommand fallback below
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

// Which of this app's 5 tabs a connected spreadsheet is missing — null
// before the first check, or when not signed in yet (the check needs a real
// API call, so it can't run pre-sign-in; see the "Spreadsheet selection"
// comment in sheets.ts for why the ID itself is settable pre-sign-in anyway).
type TabCheckState = { checking: boolean; missing: string[] | null; error: string | null };

function SpreadsheetSection({ signedIn }: { signedIn: boolean }) {
  const [value, setValue] = useState(() => getSpreadsheetId());
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [tabCheck, setTabCheck] = useState<TabCheckState>({ checking: false, missing: null, error: null });
  const [initializing, setInitializing] = useState(false);
  const [newName, setNewName] = useState<string>(uk.settings.spreadsheet.newNameDefault);
  const [creatingNew, setCreatingNew] = useState(false);
  const momSpreadsheetId = getMomSpreadsheetId();
  const testSpreadsheetId = getTestSpreadsheetId();
  const devSpreadsheetId = getDevSpreadsheetId();

  const runTabCheck = async () => {
    setTabCheck({ checking: true, missing: null, error: null });
    try {
      const missing = await checkSpreadsheetTabs();
      setTabCheck({ checking: false, missing, error: null });
    } catch (err) {
      setTabCheck({ checking: false, missing: null, error: err instanceof Error ? err.message : String(err) });
    }
  };

  // Re-checks whenever sign-in becomes available (covers pasting an ID
  // before signing in) and right after connecting to a different spreadsheet.
  useEffect(() => {
    if (signedIn) void runTabCheck();
  }, [signedIn]);

  const handleInitialize = async () => {
    setInitializing(true);
    setSavedMessage(null);
    try {
      await initializeSpreadsheet();
      await runTabCheck();
      setSavedMessage(uk.settings.spreadsheet.initializeDone);
    } catch (err) {
      setTabCheck((prev) => ({ ...prev, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setInitializing(false);
    }
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

  const handleCopyLink = async () => {
    const copied = await copyToClipboard(getSpreadsheetUrl(getSpreadsheetId()));
    setError(copied ? null : uk.settings.spreadsheet.copyLinkError);
    setSavedMessage(copied ? uk.settings.spreadsheet.copyLinkSaved : null);
  };

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
        <button type="button" onClick={handleCopyLink}>
          {uk.settings.spreadsheet.copyLinkButton}
        </button>
      </div>

      {signedIn && tabCheck.checking && <p>{uk.settings.spreadsheet.checking}</p>}
      {signedIn && tabCheck.error && <p className="food-form-error">{tabCheck.error}</p>}
      {signedIn && tabCheck.missing && tabCheck.missing.length === 0 && <p>{uk.settings.spreadsheet.tabsOk}</p>}
      {signedIn && tabCheck.missing && tabCheck.missing.length > 0 && (
        <div className="today-warning">
          <p>{uk.settings.spreadsheet.tabsMissing(tabCheck.missing)}</p>
          <button type="button" onClick={() => void handleInitialize()} disabled={initializing}>
            {initializing ? uk.settings.spreadsheet.initializing : uk.settings.spreadsheet.initializeButton}
          </button>
        </div>
      )}
    </div>
  );
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
        setValues(Object.fromEntries(FIELDS.map((field) => [field, String(s[field])])));
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
      await updateSettings({ ...numericParsed, ...timeParsed, ...booleanParsed });
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
              {FIELDS.map((field) =>
                (BOOLEAN_FIELDS as readonly string[]).includes(field) ? (
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
