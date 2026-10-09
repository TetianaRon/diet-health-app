// A dish's yield (release 2.0.1, spec: "Pack values"): its weight, its count
// and (2.1.2) its volume side by side — the same batch («850 г», «вийшло
// 10 шт.», «1,2 л») — and a choice of which one the dish is measured by (the
// main one, required). With weight and count, the dish has a piece weight;
// with weight and volume, it can be logged in ml and in g.
import { uk } from "../i18n/uk";
import { positiveOrNull, type Basis, type Measure } from "../lib/measure";

export interface PackFields {
  main: Basis;
  grams: string;
  pieces: string;
  ml: string;
}

const t = uk.foods.pack;

/**
 * The measure the fields describe (its volume as `yieldMl`), or null while
 * the main amount isn't a positive number (or another one is garbage).
 */
export function measureFromPackFields(fields: PackFields): (Measure & { yieldMl: number | null }) | null {
  const grams = positiveOrNull(fields.grams);
  const pieces = positiveOrNull(fields.pieces);
  const ml = positiveOrNull(fields.ml);
  const mainValue = fields.main === "piece" ? pieces : fields.main === "100ml" ? ml : grams;
  if (mainValue === null) return null;
  for (const text of [fields.grams, fields.pieces, fields.ml]) if (text.trim() !== "" && positiveOrNull(text) === null) return null;
  return {
    basis: fields.main,
    valuesPer: null,
    weighedGrams: grams,
    weighedPieces: pieces,
    densityMl: ml && grams ? ml : null,
    densityGrams: ml && grams ? grams : null,
    yieldMl: ml,
  };
}

export default function PackAmountFields({
  fields,
  onChange,
  legend,
  gramsLabel = t.gramsLabel,
  piecesLabel = t.piecesLabel,
  mlLabel = t.densityMlLabel,
  hints = { grams: t.gramsMainHint, pieces: t.piecesMainHint, ml: t.mlMainHint },
}: {
  fields: PackFields;
  onChange: (next: PackFields) => void;
  legend: string;
  gramsLabel?: string;
  piecesLabel?: string;
  mlLabel?: string;
  /** What the main choice means here (a product's pack, or a dish's yield). */
  hints?: { grams: string; pieces: string; ml: string };
}) {
  const option = (basis: Basis, label: string) => (
    <label className="pack-option">
      <input type="radio" checked={fields.main === basis} onChange={() => onChange({ ...fields, main: basis })} />
      {label}
    </label>
  );
  const amount = (basis: Basis, label: string, value: string, key: "grams" | "pieces" | "ml") => (
    <label>
      {label}
      {fields.main !== basis && <span className="pack-optional"> {t.optional}</span>}
      <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange({ ...fields, [key]: e.target.value })} />
    </label>
  );
  return (
    <fieldset className="pack-fields">
      <legend>{legend}</legend>
      <div className="pack-options" role="radiogroup">
        {option("100g", t.gramsOption)}
        {option("100ml", t.mlOption)}
        {option("piece", t.piecesOption)}
      </div>
      <div className="pack-amounts">
        {amount("100g", gramsLabel, fields.grams, "grams")}
        {amount("100ml", mlLabel, fields.ml, "ml")}
        {amount("piece", piecesLabel, fields.pieces, "pieces")}
      </div>
      <p className="food-form-hint">{fields.main === "piece" ? hints.pieces : fields.main === "100ml" ? hints.ml : hints.grams}</p>
    </fieldset>
  );
}
