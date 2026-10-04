// Add and edit the day's weight (release 1.7) — one record per day, just a
// date (no time). Saving for a day that already has a weight updates it.
// Either decimal separator works.
import { useState } from "react";
import { uk } from "../i18n/uk";
import { localDateKey } from "../lib/dailyLog";
import { parseDecimal } from "../lib/numberFormat";
import { saveWeightEntry, type WeightEntry } from "../lib/weight";

export default function WeightForm({
  original,
  onSaved,
  onCancel,
}: {
  original?: WeightEntry;
  onSaved: (entry: WeightEntry) => void;
  onCancel: () => void;
}) {
  const t = uk.weight.form;
  const today = localDateKey(new Date());
  const [value, setValue] = useState(original ? String(original.weightKg).replace(".", ",") : "");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [date, setDate] = useState(original?.date ?? today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = parseDecimal(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 500) {
      setError(t.validationError);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
      setError(t.futureError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveWeightEntry({ date, weightKg: parsed, notes: notes.trim() }, original?.date));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {t.valueLabel}
        <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label>
        {t.dateLabel}
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </label>
      <p className="food-form-hint">{t.oneDayHint}</p>
      <label>
        {t.notesLabel}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.notesPlaceholder} />
      </label>

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {t.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {t.cancelButton}
        </button>
      </div>
    </div>
  );
}
