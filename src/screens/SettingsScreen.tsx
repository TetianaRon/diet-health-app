import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { getSettings, updateSettings, type Settings } from "../lib/settings";

const NUMERIC_FIELDS = [
  "dailyCarbsTarget",
  "fatPerMealLimit",
  "dailyCaloriesTarget",
  "mealsPerDay",
  "maxGapHours",
  "bloodSugarMin",
  "bloodSugarMax",
] as const satisfies readonly (keyof Settings)[];
type NumericField = (typeof NUMERIC_FIELDS)[number];

// wakeTime/sleepTime are "HH:MM" strings (quiet hours for the meal reminder),
// not numeric targets — kept in a separate list so they get <input type="time">
// and format validation instead of the numeric-field checks below.
const TIME_FIELDS = ["wakeTime", "sleepTime"] as const satisfies readonly (keyof Settings)[];
type TimeField = (typeof TIME_FIELDS)[number];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const FIELDS = [...NUMERIC_FIELDS, ...TIME_FIELDS] as const satisfies readonly (keyof Settings)[];

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

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateSettings({ ...numericParsed, ...timeParsed });
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

      {signedIn && (
        <div className="settings-targets">
          {loadError && <p className="food-form-error">{loadError}</p>}
          {!loaded && !loadError && <p>{uk.settings.loading}</p>}

          {loaded && (
            <>
              {FIELDS.map((field) => (
                <label key={field}>
                  {uk.settings.fields[field]}
                  <input
                    type={(TIME_FIELDS as readonly string[]).includes(field) ? "time" : "number"}
                    value={values[field] ?? ""}
                    onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                  />
                </label>
              ))}

              {saveError && <p className="food-form-error">{saveError}</p>}
              {saved && <p>{uk.settings.saved}</p>}

              <button type="button" onClick={() => void handleSave()} disabled={saving}>
                {uk.settings.saveButton}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
