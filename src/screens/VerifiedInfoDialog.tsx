// The ⓘ details of a built-in product (release 1.8): for each part —
// nutrients, GI — its value, reliability, the reason in plain words, the
// source (dataset + entry) and when it was last checked. Values are "from the
// cited source", never advice (not-a-medical-app rule).
import { uk } from "../i18n/uk";
import { VERIFIED_SOURCES } from "../data/builtInFoods";
import { formatDecimal } from "../lib/numberFormat";
import type { VerifiedFoodEntry } from "../data/verifiedFoods";

const t = uk.verified;

/** "2026-10-04" → "04.10.2026" */
const dmy = (iso: string) => iso.split("-").reverse().join(".");

function SourceLine({ source }: { source: VerifiedFoodEntry["nutrients"]["source"] | null }) {
  if (!source) return null;
  const dataset = VERIFIED_SOURCES[source.dataset];
  return (
    <p className="verified-source">
      {dataset ? dataset.name : source.dataset}
      {source.entryId ? ` · ${t.entry(source.entryId)}` : ""}
      <br />
      <span className="verified-description">{source.description}</span>
    </p>
  );
}

/** `giOnly`: her own product whose GI came from this entry — only the GI part applies to it. */
export default function VerifiedInfoDialog({ entry, giOnly = false, onClose }: { entry: VerifiedFoodEntry; giOnly?: boolean; onClose: () => void }) {
  const n = entry.nutrients;
  const gi = entry.gi;
  const giText =
    gi.status === "notApplicable"
      ? t.giNotApplicable
      : gi.value === null
        ? t.giStatus.unknown
        : `${gi.value}${entry.state === "dry" ? ` (${t.afterCooking})` : ""} · ${t.giStatus[gi.status]}`;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal verified-info" role="dialog" aria-modal="true" aria-labelledby="verified-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="verified-title">{entry.nameUk}</h2>
        <p className="food-form-hint">{t.title}</p>

        {!giOnly && (
        <section>
          <h3>{t.nutrients}</h3>
          <p>
            {formatDecimal(n.per100g.carbsG)} г вуглеводів · {formatDecimal(n.per100g.caloriesKcal)} ккал · {t.reliability[n.reliability]}
          </p>
          <p>{n.reason.uk}</p>
          <SourceLine source={n.source} />
          <p className="verified-date">{t.verifiedOn(dmy(n.verified))}</p>
        </section>
        )}

        <section>
          <h3>{t.gi}</h3>
          <p>
            {giText} · {t.reliability[gi.reliability]}
          </p>
          <p>{gi.reason.uk}</p>
          <SourceLine source={gi.source} />
          <p className="verified-date">{t.verifiedOn(dmy(gi.verified))}</p>
        </section>

        <p className="food-form-hint">{t.disclaimer}</p>
        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
