import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { checkBloodSugarRange } from "../lib/health";
import { getSettings, type Settings } from "../lib/settings";
import { listLogEntries, mealsBeforeTimestamp, type DailyLogEntry } from "../lib/dailyLog";
import {
  BLOOD_SUGAR_CONTEXTS,
  addBloodSugarEntry,
  latestBloodSugarEntry,
  listBloodSugarEntries,
  type BloodSugarContext,
  type BloodSugarEntry,
} from "../lib/bloodSugar";

function statusLabel(entry: BloodSugarEntry, settings: Settings): string {
  const check = checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax);
  if (check.tooLow) return uk.bloodSugar.status.tooLow;
  if (check.tooHigh) return uk.bloodSugar.status.tooHigh;
  return uk.bloodSugar.status.inRange;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTimeBefore(mealTimestamp: string, readingTimestamp: string): string {
  const hours = (new Date(readingTimestamp).getTime() - new Date(mealTimestamp).getTime()) / (1000 * 60 * 60);
  return hours < 1 ? uk.bloodSugar.mealsBefore.lessThanHourAgo : uk.bloodSugar.mealsBefore.hoursAgo(hours);
}

function AddBloodSugarForm({
  onSaved,
  onCancel,
}: {
  onSaved: (entry: BloodSugarEntry) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [context, setContext] = useState<BloodSugarContext>("fasting");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(uk.bloodSugar.form.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const toSave = { valueMmolL: parsed, context, notes: notes.trim() };
      await addBloodSugarEntry(toSave);
      onSaved({ ...toSave, timestamp: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.bloodSugar.form.valueLabel}
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>

      <label>
        {uk.bloodSugar.form.contextLabel}
        <select value={context} onChange={(e) => setContext(e.target.value as BloodSugarContext)}>
          {BLOOD_SUGAR_CONTEXTS.map((c) => (
            <option key={c} value={c}>
              {uk.bloodSugar.context[c]}
            </option>
          ))}
        </select>
      </label>

      <label>
        {uk.bloodSugar.form.notesLabel}
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={uk.bloodSugar.form.notesPlaceholder}
        />
      </label>

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {uk.bloodSugar.form.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.bloodSugar.cancelButton}
        </button>
      </div>
    </div>
  );
}

export default function BloodSugarScreen() {
  const { signedIn, initializing, signIn } = useAuth();
  const [entries, setEntries] = useState<BloodSugarEntry[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logEntries, setLogEntries] = useState<DailyLogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedEntryKey, setExpandedEntryKey] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    listBloodSugarEntries()
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    getSettings()
      .then(setSettings)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    listLogEntries()
      .then(setLogEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn]);

  if (initializing) {
    return (
      <section className="screen">
        <h1>{uk.bloodSugar.title}</h1>
        <p>{uk.bloodSugar.loading}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="screen">
        <h1>{uk.bloodSugar.title}</h1>
        <p>{uk.bloodSugar.signIn.message}</p>
        <button type="button" onClick={() => void signIn()}>
          {uk.bloodSugar.signIn.button}
        </button>
      </section>
    );
  }

  const latest = entries ? latestBloodSugarEntry(entries) : null;
  const sortedEntries = [...(entries ?? [])].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  return (
    <section className="screen">
      <h1>{uk.bloodSugar.title}</h1>

      {loadError && <p className="food-form-error">{loadError}</p>}

      {latest && settings && (
        <p
          className={
            checkBloodSugarRange(latest.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax).inRange
              ? "blood-sugar-latest"
              : "blood-sugar-latest out-of-range"
          }
        >
          {uk.bloodSugar.latestLabel}: {latest.valueMmolL} ммоль/л ({uk.bloodSugar.context[latest.context]}) —{" "}
          {statusLabel(latest, settings)}
        </p>
      )}

      {showAddForm ? (
        <AddBloodSugarForm
          onSaved={(entry) => {
            setEntries((prev) => [...(prev ?? []), entry]);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowAddForm(true)}>
          {uk.bloodSugar.addButton}
        </button>
      )}

      {entries === null && !loadError && <p>{uk.bloodSugar.loading}</p>}
      {entries !== null && entries.length === 0 && !showAddForm && <p>{uk.bloodSugar.empty}</p>}

      <ul className="food-list">
        {sortedEntries.map((entry, i) => {
          const key = `${entry.timestamp}-${i}`;
          const isExpanded = expandedEntryKey === key;
          const meals = logEntries ? mealsBeforeTimestamp(logEntries, entry.timestamp) : [];
          return (
            <li key={key}>
              {formatTimestamp(entry.timestamp)} — <strong>{entry.valueMmolL} ммоль/л</strong> (
              {uk.bloodSugar.context[entry.context]})
              {settings &&
                !checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax).inRange && (
                  <span className="blood-sugar-flag"> — {statusLabel(entry, settings)}</span>
                )}
              {entry.notes && <span className="food-name-en"> — {entry.notes}</span>}
              <button
                type="button"
                className="link-button"
                onClick={() => setExpandedEntryKey(isExpanded ? null : key)}
              >
                {isExpanded ? "▾ " : "▸ "}
                {uk.bloodSugar.mealsBefore.toggleLabel}
              </button>
              {isExpanded &&
                (meals.length === 0 ? (
                  <p className="food-form-hint">{uk.bloodSugar.mealsBefore.empty}</p>
                ) : (
                  <ul className="food-list meals-before-list">
                    {meals.map((meal, j) => (
                      <li key={`${meal.timestamp}-${j}`}>
                        <strong>{meal.itemName}</strong> — {meal.mealType}, {formatTimeBefore(meal.timestamp, entry.timestamp)}
                      </li>
                    ))}
                  </ul>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
