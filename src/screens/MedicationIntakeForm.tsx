// Add and edit a medicine intake (release 1.7). She picks from her list
// (active medicines) or adds a new one right here; the dose is pre-filled
// with the usual one and can be changed. A plain diary — the app never
// suggests a dose or warns about anything (not a medical app).
import { useState } from "react";
import { uk } from "../i18n/uk";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/dateFormat";
import type { Settings } from "../lib/settings";
import { addIntake, addMedication, parseDose, updateIntake, type Medication, type MedicationIntake } from "../lib/medications";
import { DateTimeInput } from "./TimeInput";
import FormError from "./FormError";

const NEW = "__new__";

export default function MedicationIntakeForm({
  original,
  medications,
  settings,
  onSaved,
  onMedicationAdded,
  onCancel,
}: {
  original?: MedicationIntake;
  medications: Medication[];
  settings: Settings | null;
  onSaved: (intake: MedicationIntake) => void;
  onMedicationAdded: (medication: Medication) => void;
  onCancel: () => void;
}) {
  const active = medications.filter((m) => m.active || m.id === original?.medicationId);
  const [medicationId, setMedicationId] = useState(original?.medicationId ?? (active.length === 1 ? active[0].id : ""));
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("мг");
  const [dose, setDose] = useState(() => {
    if (original) return original.dose === null ? "" : String(original.dose).replace(".", ",");
    const only = active.length === 1 ? active[0] : null;
    return only?.dose != null ? String(only.dose).replace(".", ",") : "";
  });
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [time, setTime] = useState(() => toDatetimeLocalValue(original?.timestamp ?? new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = medicationId === NEW;

  const pick = (id: string) => {
    setMedicationId(id);
    const med = medications.find((m) => m.id === id);
    // Pre-fill the usual dose when picking (never overwrite while editing an intake).
    if (med && !original) setDose(med.dose === null ? "" : String(med.dose).replace(".", ","));
  };

  const handleSave = async () => {
    if (!medicationId) {
      setError(uk.medication.validationPick);
      return;
    }
    if (isNew && newName.trim() === "") {
      setError(uk.medication.validationName);
      return;
    }
    const parsedDose = parseDose(dose);
    if (dose.trim() !== "" && parsedDose === null) {
      setError(uk.medication.validationDose);
      return;
    }
    const timestamp = fromDatetimeLocalValue(time);
    if (new Date(timestamp).getTime() > Date.now() + 60_000) {
      setError(uk.medication.futureError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let med = medications.find((m) => m.id === medicationId) ?? null;
      if (isNew) {
        med = await addMedication({ name: newName.trim(), dose: parsedDose, unit: newUnit.trim(), notes: "" });
        onMedicationAdded(med);
      }
      if (!med) throw new Error(uk.medication.validationPick);
      const intake: MedicationIntake = {
        timestamp,
        medicationId: med.id,
        medicationName: med.name,
        dose: parsedDose,
        unit: med.unit,
        notes: notes.trim(),
      };
      if (original) {
        await updateIntake(original, intake);
        onSaved(intake);
      } else {
        onSaved(await addIntake(intake));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "MedicationLog entry not found" ? uk.medication.editNotFound : message);
    } finally {
      setSaving(false);
    }
  };

  const unit = isNew ? newUnit : (medications.find((m) => m.id === medicationId)?.unit ?? "");

  return (
    <div className="food-form">
      <label>
        {uk.medication.pickLabel}
        <select value={medicationId} onChange={(e) => pick(e.target.value)}>
          <option value="" disabled>
            {uk.medication.pickPlaceholder}
          </option>
          {active.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={NEW}>{uk.medication.newOption}</option>
        </select>
      </label>

      {isNew && (
        <>
          <label>
            {uk.medication.newNameLabel}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <label>
            {uk.medication.newUnitLabel}
            <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
          </label>
        </>
      )}

      <label>
        {unit ? `${uk.medication.doseLabel} (${unit})` : uk.medication.doseLabel}
        <input type="text" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} />
      </label>

      <label>
        {uk.medication.timeLabel}
        <DateTimeInput ariaLabel={uk.medication.timeLabel} format={settings?.timeFormat ?? "24h"} value={time} onChange={setTime} />
      </label>
      <p className="food-form-hint">{uk.medication.timeHint}</p>

      <label>
        {uk.medication.notesLabel}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uk.medication.notesPlaceholder} />
      </label>

      <FormError message={error} />

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {uk.medication.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.medication.cancelButton}
        </button>
      </div>
    </div>
  );
}
