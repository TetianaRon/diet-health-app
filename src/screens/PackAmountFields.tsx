// A dish's yield (release 2.0.1, spec: "Pack values"): its weight and its
// count side by side — the same batch («850 г», «вийшло 10 шт.») — and a choice
// of which one the dish is measured by (the main one, required). With both,
// the dish has a piece weight.
import { uk } from "../i18n/uk";
import { positiveOrNull, type Basis, type Measure } from "../lib/measure";

export interface PackFields {
  main: Basis;
  grams: string;
  pieces: string;
}

const t = uk.foods.pack;

/** The measure the fields describe, or null while the main amount isn't a positive number (or the other one is garbage). */
export function measureFromPackFields(fields: PackFields): Measure | null {
  const grams = positiveOrNull(fields.grams);
  const pieces = positiveOrNull(fields.pieces);
  const mainValue = fields.main === "piece" ? pieces : grams;
  if (mainValue === null) return null;
  const other = fields.main === "piece" ? fields.grams : fields.pieces;
  if (other.trim() !== "" && positiveOrNull(other) === null) return null;
  return { basis: fields.main, valuesPer: null, weighedGrams: grams, weighedPieces: pieces };
}

export default function PackAmountFields({
  fields,
  onChange,
  legend,
  gramsLabel = t.gramsLabel,
  piecesLabel = t.piecesLabel,
  hints = { grams: t.gramsMainHint, pieces: t.piecesMainHint },
}: {
  fields: PackFields;
  onChange: (next: PackFields) => void;
  legend: string;
  gramsLabel?: string;
  piecesLabel?: string;
  /** What the main choice means here (a product's pack, or a dish's yield). */
  hints?: { grams: string; pieces: string };
}) {
  const option = (basis: Basis, label: string) => (
    <label className="pack-option">
      <input type="radio" checked={fields.main === basis} onChange={() => onChange({ ...fields, main: basis })} />
      {label}
    </label>
  );
  return (
    <fieldset className="pack-fields">
      <legend>{legend}</legend>
      <div className="pack-options" role="radiogroup">
        {option("100g", t.gramsOption)}
        {option("piece", t.piecesOption)}
      </div>
      <div className="pack-amounts">
        <label>
          {gramsLabel}
          {fields.main === "piece" && <span className="pack-optional"> {t.optional}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={fields.grams}
            onChange={(e) => onChange({ ...fields, grams: e.target.value })}
          />
        </label>
        <label>
          {piecesLabel}
          {fields.main === "100g" && <span className="pack-optional"> {t.optional}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={fields.pieces}
            onChange={(e) => onChange({ ...fields, pieces: e.target.value })}
          />
        </label>
      </div>
      <p className="food-form-hint">{fields.main === "piece" ? hints.pieces : hints.grams}</p>
    </fieldset>
  );
}
