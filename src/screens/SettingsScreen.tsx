import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { getSettings, updateSettings, type Settings } from "../lib/settings";

const FIELDS = [
  "dailyCarbsTarget",
  "fatPerMealLimit",
  "dailyCaloriesTarget",
  "mealsPerDay",
  "maxGapHours",
  "bloodSugarMin",
  "bloodSugarMax",
] as const satisfies readonly (keyof Settings)[];
type SettingsField = (typeof FIELDS)[number];

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
    const parsed = Object.fromEntries(FIELDS.map((field) => [field, Number(values[field])])) as Record<
      SettingsField,
      number
    >;
    const allValid = FIELDS.every((field) => Number.isFinite(parsed[field]));

    if (!allValid) {
      setSaveError(uk.settings.validationError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await updateSettings(parsed);
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
                    type="number"
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
