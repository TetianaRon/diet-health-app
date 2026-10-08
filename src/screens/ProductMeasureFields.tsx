// The product form's two measure parts (release 2.0.1, spec: "Pack values"):
//   «Значення вказано на» — grams or pieces, and the amount, as the pack says;
//   «Вага штук» (optional) — any weighed count of pieces, e.g. 12 шт. = 300 г,
//   which lets the product be logged both by count and by weight.
import { uk } from "../i18n/uk";
import { pieceGrams, positiveOrNull, round2, valuesAmount, type Basis, type Measure } from "../lib/measure";

export interface ProductFields {
  main: Basis;
  amount: string;
  weighedPieces: string;
  weighedGrams: string;
}

const t = uk.foods.pack;

export function productFieldsFromMeasure(measure: Measure): ProductFields {
  return {
    main: measure.basis,
    amount: String(valuesAmount(measure)),
    weighedPieces: measure.weighedPieces !== null ? String(measure.weighedPieces) : "",
    weighedGrams: measure.weighedGrams !== null ? String(measure.weighedGrams) : "",
  };
}

/** The measure, or the problem to show: no amount for the values, or half a weighed pair. */
export function measureFromProductFields(fields: ProductFields): Measure | { problem: string } {
  const amount = positiveOrNull(fields.amount);
  if (amount === null) return { problem: t.mainMissing };
  const pieces = positiveOrNull(fields.weighedPieces);
  const grams = positiveOrNull(fields.weighedGrams);
  const typedPieces = fields.weighedPieces.trim() !== "";
  const typedGrams = fields.weighedGrams.trim() !== "";
  if ((typedPieces || typedGrams) && (pieces === null || grams === null)) return { problem: t.weighedIncomplete };
  const defaultAmount = fields.main === "piece" ? 1 : 100;
  return { basis: fields.main, valuesPer: amount === defaultAmount ? null : amount, weighedPieces: pieces, weighedGrams: grams };
}

export function isMeasure(value: Measure | { problem: string }): value is Measure {
  return !("problem" in value);
}

export default function ProductMeasureFields({ fields, onChange }: { fields: ProductFields; onChange: (next: ProductFields) => void }) {
  const option = (basis: Basis, label: string) => (
    <label className="pack-option">
      <input
        type="radio"
        checked={fields.main === basis}
        onChange={() => onChange({ ...fields, main: basis, amount: basis === "piece" ? "1" : "100" })}
      />
      {label}
    </label>
  );
  const result = measureFromProductFields(fields);
  const weight = isMeasure(result) ? pieceGrams(result) : null;
  return (
    <>
      <fieldset className="pack-fields">
        <legend>{t.legend}</legend>
        <div className="pack-options" role="radiogroup">
          {option("100g", t.gramsOption)}
          {option("piece", t.piecesOption)}
        </div>
        <label>
          {fields.main === "piece" ? t.amountPiecesLabel : t.amountGramsLabel}
          <input type="number" inputMode="decimal" step="0.1" value={fields.amount} onChange={(e) => onChange({ ...fields, amount: e.target.value })} />
        </label>
        <p className="food-form-hint">{fields.main === "piece" ? t.piecesMainHint : t.gramsMainHint}</p>
      </fieldset>
      <fieldset className="pack-fields">
        <legend>
          {t.weighedLegend} <span className="pack-optional">{t.optional}</span>
        </legend>
        <div className="pack-amounts">
          <label>
            {t.weighedPiecesLabel}
            <input
              type="number"
              inputMode="decimal"
              step="1"
              value={fields.weighedPieces}
              onChange={(e) => onChange({ ...fields, weighedPieces: e.target.value })}
            />
          </label>
          <label>
            {t.weighedGramsLabel}
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={fields.weighedGrams}
              onChange={(e) => onChange({ ...fields, weighedGrams: e.target.value })}
            />
          </label>
        </div>
        <p className="food-form-hint">{weight !== null ? t.pieceWeight(round2(weight)) : t.weighedHint}</p>
      </fieldset>
    </>
  );
}
