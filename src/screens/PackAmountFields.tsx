// «Значення вказано на … г / … шт.» (release 2.0.1, spec: "Pack values"):
// two amounts side by side and a choice of which one the values are for (the
// main one, required). The other is optional and states the same amount the
// other way — «12 шт. = 200 г» — which gives the item a piece weight.
import { uk } from "../i18n/uk";
import { positiveOrNull, type Basis, type Measure } from "../lib/measure";

export interface PackFields {
  main: Basis;
  grams: string;
  pieces: string;
}

const t = uk.foods.pack;

export function packFieldsFromMeasure(measure: Measure): PackFields {
  return {
    main: measure.basis,
    grams: measure.packGrams !== null ? String(measure.packGrams) : measure.basis === "100g" ? "100" : "",
    pieces: measure.packPieces !== null ? String(measure.packPieces) : measure.basis === "piece" ? "1" : "",
  };
}

/** The measure the fields describe, or null while the main amount isn't a positive number (or the other one is garbage). */
export function measureFromPackFields(fields: PackFields): Measure | null {
  const grams = positiveOrNull(fields.grams);
  const pieces = positiveOrNull(fields.pieces);
  const mainValue = fields.main === "piece" ? pieces : grams;
  if (mainValue === null) return null;
  const other = fields.main === "piece" ? fields.grams : fields.pieces;
  if (other.trim() !== "" && positiveOrNull(other) === null) return null;
  return { basis: fields.main, packGrams: grams, packPieces: pieces };
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
            type="number"
            inputMode="decimal"
            step="0.1"
            value={fields.grams}
            onChange={(e) => onChange({ ...fields, grams: e.target.value })}
          />
        </label>
        <label>
          {piecesLabel}
          {fields.main === "100g" && <span className="pack-optional"> {t.optional}</span>}
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={fields.pieces}
            onChange={(e) => onChange({ ...fields, pieces: e.target.value })}
          />
        </label>
      </div>
      <p className="food-form-hint">{fields.main === "piece" ? hints.pieces : hints.grams}</p>
    </fieldset>
  );
}
