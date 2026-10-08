// Add and edit a blood sugar reading (moved out of the former Цукор screen
// in 1.7; used from Сьогодні). The time is the moment of the test, which can
// differ from when it's written down, so it's an editable field (default: now).
import { useState } from "react";
import { uk } from "../i18n/uk";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/dateFormat";
import type { Settings } from "../lib/settings";
import { fieldDecimal, parseDecimal } from "../lib/numberFormat";
import { DateTimeInput } from "./TimeInput";
import {
  BLOOD_SUGAR_CONTEXTS,
  addBloodSugarEntry,
  updateBloodSugarEntry,
  type BloodSugarContext,
  type BloodSugarEntry,
} from "../lib/bloodSugar";

export default function BloodSugarForm({
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
  const [value, setValue] = useState(original ? fieldDecimal(original.valueMmolL) : "");
  const [context, setContext] = useState<BloodSugarContext>(original?.context ?? "fasting");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [time, setTime] = useState(() => toDatetimeLocalValue(original?.timestamp ?? new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = parseDecimal(value);
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
        <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>

      <label>
        {uk.bloodSugar.form.timeLabel}
        <DateTimeInput ariaLabel={uk.bloodSugar.form.timeLabel} format={settings?.timeFormat ?? "24h"} value={time} onChange={setTime} />
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
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uk.bloodSugar.form.notesPlaceholder} />
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
