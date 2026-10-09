// «Ліки» (release 2.1.4): her medicines, laid out like Продукти — a list with
// a pencil on each, «+ Додати ліки», and a form with «Приймаю зараз». Ones she
// no longer takes sit under «Більше не приймаю»; they leave the intake picker
// and Today's «Востаннє». No delete: logged intakes keep pointing at them.
// A first version — the developer will redesign it later.
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { uk } from "../i18n/uk";
import { addMedication, listMedications, parseDose, updateMedication, type Medication } from "../lib/medications";
import Breadcrumb from "./Breadcrumb";
import SignInPanel from "./SignInPanel";

const t = uk.medicationsScreen;

function doseText(m: Medication): string {
  if (m.dose === null) return "";
  return ` — ${String(m.dose).replace(".", ",")}${m.unit ? ` ${m.unit}` : ""}`;
}

function MedicationForm({ original, onSaved, onCancel }: { original: Medication | null; onSaved: (m: Medication) => void; onCancel: () => void }) {
  const [name, setName] = useState(original?.name ?? "");
  const [dose, setDose] = useState(original?.dose != null ? String(original.dose).replace(".", ",") : "");
  const [unit, setUnit] = useState(original?.unit ?? "мг");
  const [notes, setNotes] = useState(original?.notes ?? "");
  const [active, setActive] = useState(original?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (name.trim() === "") {
      setError(uk.medication.validationName);
      return;
    }
    const parsedDose = parseDose(dose);
    if (dose.trim() !== "" && parsedDose === null) {
      setError(t.doseInvalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fields = { name: name.trim(), dose: parsedDose, unit: unit.trim(), notes };
      if (original) {
        const updated = { ...original, ...fields, active };
        await updateMedication(updated);
        onSaved(updated);
      } else {
        onSaved(await addMedication(fields));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {t.nameLabel}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        {t.doseLabel}
        <input type="text" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} placeholder={uk.medication.notesPlaceholder} />
      </label>
      <label>
        {t.unitLabel}
        <input value={unit} onChange={(e) => setUnit(e.target.value)} />
      </label>
      <label>
        {t.notesLabel}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uk.medication.notesPlaceholder} />
      </label>
      {original && (
        <>
          <label className="remember-me">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t.activeLabel}
          </label>
          <p className="food-form-hint">{t.activeHint}</p>
        </>
      )}
      {error && <p className="food-form-error">{error}</p>}
      <div className="food-form-actions">
        <button type="button" onClick={() => void save()} disabled={saving}>
          {uk.medication.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.medication.cancelButton}
        </button>
      </div>
    </div>
  );
}

export default function MedicationsScreen() {
  const { signedIn, initializing } = useAuth();
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = the list; "new" = adding; a medicine = editing it.
  const [open, setOpen] = useState<Medication | "new" | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    listMedications()
      .then(setMedications)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn]);

  if (initializing || (signedIn && medications === null && !loadError)) {
    return (
      <section className="screen">
        <h1>{t.title}</h1>
        <p>{t.loading}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="screen">
        <h1>{t.title}</h1>
        <p>{t.signIn}</p>
        <SignInPanel buttonLabel={uk.foods.signIn.button} />
      </section>
    );
  }

  if (open) {
    return (
      <section className="screen">
        <Breadcrumb trail={[{ label: t.title, onClick: () => setOpen(null) }]} current={open === "new" ? t.addTitle : t.editTitle} />
        <MedicationForm
          key={open === "new" ? "new" : open.id}
          original={open === "new" ? null : open}
          onSaved={(saved) => {
            setMedications((prev) => {
              const list = prev ?? [];
              return list.some((m) => m.id === saved.id) ? list.map((m) => (m.id === saved.id ? saved : m)) : [...list, saved];
            });
            setOpen(null);
          }}
          onCancel={() => setOpen(null)}
        />
      </section>
    );
  }

  const byName = (a: Medication, b: Medication) => a.name.localeCompare(b.name, "uk");
  const taking = (medications ?? []).filter((m) => m.active).sort(byName);
  const stopped = (medications ?? []).filter((m) => !m.active).sort(byName);
  const row = (m: Medication) => (
    <li key={m.id} className={m.active ? "food-list-item-with-action" : "food-list-item-with-action food-list-item-muted"}>
      <span>
        <strong>{m.name}</strong>
        {doseText(m)}
        {m.notes && <span className="food-name-en"> ({m.notes})</span>}
      </span>
      <div className="food-list-actions">
        <button type="button" className="edit-toggle" onClick={() => setOpen(m)} aria-label={t.editLabel} title={t.editLabel}>
          ✎
        </button>
      </div>
    </li>
  );

  return (
    <section className="screen">
      <h1>{t.title}</h1>
      {loadError && <p className="food-form-error">{loadError}</p>}
      <div className="food-add-buttons">
        <button type="button" onClick={() => setOpen("new")}>
          {t.addButton}
        </button>
      </div>
      {medications && medications.length === 0 && <p className="food-form-hint">{t.empty}</p>}
      {taking.length > 0 && <ul className="food-list">{taking.map(row)}</ul>}
      {stopped.length > 0 && (
        <>
          <h2>{t.stoppedTitle}</h2>
          <ul className="food-list">{stopped.map(row)}</ul>
        </>
      )}
    </section>
  );
}
