// GI suggestions for her own product (release 1.9, spec → "Search and GI
// suggestions"): while the GI field is empty — or holds a GI without a
// source — the closest database matches for the product's name are offered,
// each with a button that takes only its GI. Her nutrients (e.g. from the
// pack) stay as they are. Once taken, the line says where the GI came from.
import { useState } from "react";
import { uk } from "../i18n/uk";
import { suggestGi } from "../lib/foodSearch";
import { verifiedEntry } from "../data/builtInFoods";
import file from "../data/verified-foods.json";
import type { VerifiedFoodEntry, VerifiedFoodsFile } from "../data/verifiedFoods";
import VerifiedInfoDialog from "./VerifiedInfoDialog";

const ENTRIES = (file as VerifiedFoodsFile).entries;
const t = uk.giSuggest;

function giLabel(entry: VerifiedFoodEntry): string {
  return `${entry.gi.value}${entry.state === "dry" ? ` (${uk.verified.afterCooking})` : ""}`;
}

export default function GiSuggestions({
  name,
  giValue,
  giFrom,
  onTake,
}: {
  name: string;
  /** What's in the GI field right now. */
  giValue: string;
  /** The database ID her GI was taken from, "" if none. */
  giFrom: string;
  onTake: (entry: VerifiedFoodEntry) => void;
}) {
  const [info, setInfo] = useState<VerifiedFoodEntry | null>(null);
  const source = giFrom ? verifiedEntry(giFrom) : null;
  const sourced = source !== null && String(source.gi.value) === giValue.trim();
  const offers = !sourced && name.trim() ? suggestGi(name, ENTRIES) : [];

  if (!sourced && offers.length === 0) return null;

  return (
    <div className="gi-suggest">
      {sourced ? (
        <p className="food-form-source">
          {t.taken(source.nameUk)}{" "}
          <button type="button" className="info-button" aria-label={uk.verified.infoLabel(source.nameUk)} onClick={() => setInfo(source)}>
            ⓘ
          </button>
        </p>
      ) : (
        <>
          <p className="food-form-hint">{t.title}</p>
          <ul className="gi-suggest-list">
            {offers.map((entry) => (
              <li key={entry.id}>
                <span>
                  {t.line(entry.nameUk, giLabel(entry), uk.verified.reliability[entry.gi.reliability])}{" "}
                  <button type="button" className="info-button" aria-label={uk.verified.infoLabel(entry.nameUk)} onClick={() => setInfo(entry)}>
                    ⓘ
                  </button>
                </span>
                <button type="button" className="button-secondary" onClick={() => onTake(entry)}>
                  {t.take(entry.gi.value as number)}
                </button>
              </li>
            ))}
          </ul>
          <p className="food-form-hint">{t.hint}</p>
        </>
      )}
      {info && <VerifiedInfoDialog entry={info} giOnly onClose={() => setInfo(null)} />}
    </div>
  );
}
