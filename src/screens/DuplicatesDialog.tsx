// Same-name items (and same-day weights) found while adding the phone's data to
// a Google spreadsheet (release 2.0). Every row needs a choice — each button
// names its outcome with the values it keeps — before syncing; cancelling
// leaves the phone working without Google, nothing uploaded.
import { useState } from "react";
import { uk } from "../i18n/uk";
import { useBackHandler } from "../lib/useBackHandler";
import { useSheetHealth } from "../context/SheetHealthContext";
import { decisionsComplete, type Decision, type Duplicate } from "../lib/localAttach";
import { normalizeItemName } from "../lib/itemIds";
import { formatDecimal } from "../lib/numberFormat";

const t = uk.localMode.duplicates;

function num(v: unknown): string {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? formatDecimal(Math.round(n * 100) / 100) : String(v ?? "");
}

/** The values that tell the two versions apart, in a few words. */
function summary(d: Duplicate, fields: Record<string, unknown>): string {
  if (d.kind === "weight") return t.weightSummary(num(fields.WeightKg));
  if (d.tab === "Medications") return [fields.Dose, fields.Unit].filter((v) => v !== undefined && v !== "").map(String).join(" ") || String(fields.Name ?? "");
  // A blank-on-purpose value is stored as 0; it reads «невідомо», never as a real zero.
  const unknown = new Set(String(fields.UnknownFields ?? "").split(",").map((f) => f.trim()));
  return t.itemSummary(
    unknown.has("caloriesKcal") ? null : num(fields.Calories_kcal),
    unknown.has("carbsG") ? null : num(fields.Carbs_g),
    String(fields.Basis ?? "") === "piece" ? "piece" : "100g",
  );
}

export default function DuplicatesDialog() {
  const { attachReview, confirmAttach, cancelAttach } = useSheetHealth();
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Back = «Скасувати — залишитися без Google» (nothing uploaded).
  useBackHandler(attachReview !== null, () => {
    if (!busy) {
      setDecisions(new Map());
      cancelAttach();
    }
  });

  if (!attachReview) return null;
  const duplicates = attachReview.duplicates;
  const complete = decisionsComplete(duplicates, decisions);

  const choose = (key: string, decision: Decision) => setDecisions((prev) => new Map(prev).set(key, decision));

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmAttach(decisions);
      setDecisions(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal duplicates-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicates-title">
        <h2 id="duplicates-title">{t.title}</h2>
        <p>{t.intro}</p>
        <ul className="duplicates-list">
          {duplicates.map((d) => {
            const dec = decisions.get(d.key);
            const both = dec?.keep === "both" ? dec : null;
            const namesClash = both !== null && normalizeItemName(both.localName) === normalizeItemName(both.sheetName);
            return (
              <li key={d.key}>
                <p>
                  <strong>{d.kind === "weight" ? t.weightLine(d.sheetName) : t.itemLine(t.tabs[d.tab] ?? d.tab, d.sheetName)}</strong>
                </p>
                <div className="duplicates-choices">
                  <button type="button" className={dec?.keep === "sheet" ? undefined : "button-secondary"} aria-pressed={dec?.keep === "sheet"} onClick={() => choose(d.key, { keep: "sheet" })}>
                    {t.keepSheet(summary(d, d.sheetFields))}
                  </button>
                  <button type="button" className={dec?.keep === "phone" ? undefined : "button-secondary"} aria-pressed={dec?.keep === "phone"} onClick={() => choose(d.key, { keep: "phone" })}>
                    {t.keepPhone(summary(d, d.localFields))}
                  </button>
                  {d.kind === "item" && (
                    <button
                      type="button"
                      className={both ? undefined : "button-secondary"}
                      aria-pressed={both !== null}
                      onClick={() => choose(d.key, { keep: "both", localName: d.localName, sheetName: d.sheetName })}
                    >
                      {t.keepBoth}
                    </button>
                  )}
                </div>
                {both && (
                  <div className="duplicates-names">
                    <label>
                      {t.sheetNameLabel}
                      <input value={both.sheetName} onChange={(e) => choose(d.key, { ...both, sheetName: e.target.value })} />
                    </label>
                    <label>
                      {t.phoneNameLabel}
                      <input value={both.localName} onChange={(e) => choose(d.key, { ...both, localName: e.target.value })} />
                    </label>
                    {namesClash && <p className="food-form-error">{t.namesMustDiffer}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {error && <p className="food-form-error">{error}</p>}
        {!complete && <p className="food-form-hint">{t.continueHint}</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => void confirm()} disabled={!complete || busy}>
            {busy ? t.working : t.continueButton}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setDecisions(new Map());
              cancelAttach();
            }}
            disabled={busy}
          >
            {t.cancelButton}
          </button>
        </div>
      </div>
    </div>
  );
}
