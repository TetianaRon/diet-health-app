import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { checkBloodSugarRange } from "../lib/health";
import { formatDayMonthFromKey, formatTime, fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/dateFormat";
import { getSettings, type Settings } from "../lib/settings";
import { listLogEntries, localDateKey, mealsBeforeTimestamp, type DailyLogEntry } from "../lib/dailyLog";
import { DateTimeInput } from "./TimeInput";
import Breadcrumb from "./Breadcrumb";
import {
  BLOOD_SUGAR_CONTEXTS,
  addBloodSugarEntry,
  groupBloodSugarByDay,
  latestBloodSugarEntry,
  listBloodSugarEntries,
  updateBloodSugarEntry,
  type BloodSugarContext,
  type BloodSugarEntry,
} from "../lib/bloodSugar";

function statusLabel(entry: BloodSugarEntry, settings: Settings): string {
  const check = checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax);
  if (check.tooLow) return uk.bloodSugar.status.tooLow;
  if (check.tooHigh) return uk.bloodSugar.status.tooHigh;
  return uk.bloodSugar.status.inRange;
}

function formatTimeBefore(mealTimestamp: string, readingTimestamp: string): string {
  const hours = (new Date(readingTimestamp).getTime() - new Date(mealTimestamp).getTime()) / (1000 * 60 * 60);
  return hours < 1 ? uk.bloodSugar.mealsBefore.lessThanHourAgo : uk.bloodSugar.mealsBefore.hoursAgo(hours);
}

// Add and edit share one form. The time is the moment of the test, which can
// differ from when it's written down, so it's an editable field (default: now).
function BloodSugarForm({
  original,
  settings,
  onSaved,
  onCancel,
}: {
  original?: BloodSugarEntry;
  settings: Settings | null;
  onSaved: (entry: BloodSugarEntry) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(original ? String(original.valueMmolL) : "");
  const [context, setContext] = useState<BloodSugarContext>(original?.context ?? "fasting");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [time, setTime] = useState(() => toDatetimeLocalValue(original?.timestamp ?? new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(uk.bloodSugar.form.validationError);
      return;
    }
    const timestamp = fromDatetimeLocalValue(time);
    if (new Date(timestamp).getTime() > Date.now() + 60_000) {
      setError(uk.bloodSugar.form.futureError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fields = { valueMmolL: parsed, context, notes: notes.trim() };
      if (original) {
        const updated: BloodSugarEntry = { ...fields, timestamp };
        await updateBloodSugarEntry(original, updated);
        onSaved(updated);
      } else {
        onSaved(await addBloodSugarEntry(fields, timestamp));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "BloodSugar entry not found" ? uk.bloodSugar.editNotFound : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.bloodSugar.form.valueLabel}
        <input type="number" inputMode="decimal" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>

      <label>
        {uk.bloodSugar.form.timeLabel}
        <DateTimeInput
          ariaLabel={uk.bloodSugar.form.timeLabel}
          format={settings?.timeFormat ?? "24h"}
          value={time}
          onChange={setTime}
        />
      </label>
      <p className="food-form-hint">{uk.bloodSugar.form.timeHint}</p>

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
  const { signedIn, initializing, signIn, sessionExpired } = useAuth();
  const [entries, setEntries] = useState<BloodSugarEntry[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [logEntries, setLogEntries] = useState<DailyLogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // The reading being edited (only today's readings offer «Редагувати»).
  const [editing, setEditing] = useState<BloodSugarEntry | null>(null);
  const [expandedEntryKey, setExpandedEntryKey] = useState<string | null>(null);

  useEffect(() => {
    // Also after a renewed sign-in (sessionExpired true -> false): reload,
    // and clear the "sign in again" error the failed load left behind.
    if (!signedIn || sessionExpired) return;
    setLoadError(null);
    listBloodSugarEntries()
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    getSettings()
      .then(setSettings)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    listLogEntries()
      .then(setLogEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn, sessionExpired]);

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

  // The add/edit form is its own screen with a breadcrumb back at the top, like the other editors.
  if (showAddForm || editing) {
    const close = () => {
      setShowAddForm(false);
      setEditing(null);
    };
    return (
      <section className="screen">
        <Breadcrumb
          trail={[{ label: uk.bloodSugar.title, onClick: close }]}
          current={editing ? uk.bloodSugar.editTitle : uk.bloodSugar.addButton}
        />
        <BloodSugarForm
          key={editing?.timestamp ?? "new"}
          original={editing ?? undefined}
          settings={settings}
          onSaved={(entry) => {
            setEntries((prev) => [...(prev ?? []).filter((e) => e !== editing), entry]);
            close();
          }}
          onCancel={close}
        />
      </section>
    );
  }

  const latest = entries ? latestBloodSugarEntry(entries) : null;
  const days = groupBloodSugarByDay(entries ?? []);
  const todayKey = localDateKey(new Date());

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

      <button type="button" onClick={() => setShowAddForm(true)}>
        {uk.bloodSugar.addButton}
      </button>

      {entries === null && !loadError && <p>{uk.bloodSugar.loading}</p>}
      {entries !== null && entries.length === 0 && <p>{uk.bloodSugar.empty}</p>}

      {days.map((day) => (
        <div key={day.dateKey} className="blood-sugar-day">
          <h2>{day.dateKey === todayKey ? uk.bloodSugar.todayLabel : formatDayMonthFromKey(day.dateKey)}</h2>
          <ul className="food-list">
            {day.entries.map((entry, i) => {
              const key = `${entry.timestamp}-${i}`;
              const isExpanded = expandedEntryKey === key;
              const meals = logEntries ? mealsBeforeTimestamp(logEntries, entry.timestamp) : [];
              const time = formatTime(entry.timestamp);
              return (
                <li key={key}>
                  <div className="meal-header">
                    <p>
                      <strong className="reading-time">{time}</strong> · <strong>{entry.valueMmolL} ммоль/л</strong> (
                      {uk.bloodSugar.context[entry.context]})
                      {settings &&
                        !checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax).inRange && (
                          <span className="blood-sugar-flag"> — {statusLabel(entry, settings)}</span>
                        )}
                    </p>
                    {day.dateKey === todayKey && (
                      <button
                        type="button"
                        className="button-secondary meal-edit-button"
                        aria-label={uk.bloodSugar.editEntryLabel(time)}
                        onClick={() => setEditing(entry)}
                      >
                        {uk.bloodSugar.editButton}
                      </button>
                    )}
                  </div>
                  {entry.notes && <p className="food-name-en">{entry.notes}</p>}
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
                        {meals.map((meal) => (
                          <li key={meal.mealId}>
                            <strong>{meal.mealType}</strong> ({meal.entries.map((e) => e.itemName).join(", ")}) —{" "}
                            {formatTimeBefore(meal.timestamp, entry.timestamp)}
                          </li>
                        ))}
                      </ul>
                    ))}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
