// The product form's two measure parts (release 2.0.1, spec: "Pack values"):
//   «Значення вказано на» — grams or pieces, and the amount, as the pack says;
//   «Вага штук» (optional) — any weighed count of pieces, e.g. 12 шт. = 300 г,
//   which lets the product be logged both by count and by weight.
import { fieldDecimal } from "../lib/numberFormat";
import { uk } from "../i18n/uk";
import { positiveOrNull, valuesAmount, type Basis, type Measure } from "../lib/measure";
import WeighedPiecesFields, { weighedPair } from "./WeighedPiecesFields";

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
    amount: fieldDecimal(valuesAmount(measure)),
    weighedPieces: measure.weighedPieces !== null ? fieldDecimal(measure.weighedPieces) : "",
    weighedGrams: measure.weighedGrams !== null ? fieldDecimal(measure.weighedGrams) : "",
  };
}

/** The measure, or the problem to show: no amount for the values, or half a weighed pair. */
export function measureFromProductFields(fields: ProductFields): Measure | { problem: string } {
  const amount = positiveOrNull(fields.amount);
  if (amount === null) return { problem: t.mainMissing };
  const weighed = weighedPair(fields.weighedPieces, fields.weighedGrams);
  if ("problem" in weighed) return weighed;
  const defaultAmount = fields.main === "piece" ? 1 : 100;
  return { basis: fields.main, valuesPer: amount === defaultAmount ? null : amount, ...weighed };
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
          <input type="text" inputMode="decimal" value={fields.amount} onChange={(e) => onChange({ ...fields, amount: e.target.value })} />
        </label>
        <p className="food-form-hint">{fields.main === "piece" ? t.piecesMainHint : t.gramsMainHint}</p>
      </fieldset>
      <WeighedPiecesFields
        pieces={fields.weighedPieces}
        grams={fields.weighedGrams}
        onChange={(weighedPieces, weighedGrams) => onChange({ ...fields, weighedPieces, weighedGrams })}
      />
    </>
  );
}
