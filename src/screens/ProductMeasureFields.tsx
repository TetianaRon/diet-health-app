// The product form's measure parts (release 2.0.1, spec: "Pack values"):
//   «Значення вказано на» — grams, millilitres (2.1.1) or pieces, and the
//   amount, as the pack says;
//   «Вага штук» (optional) — any weighed count of pieces, e.g. 12 шт. = 300 г,
//   which lets the product be logged both by count and by weight;
//   «Мілілітри й грами» (optional, 2.1.1) — a measured volume and its weight,
//   e.g. 100 мл = 103 г, which links millilitres and grams.
import { fieldDecimal } from "../lib/numberFormat";
import { uk } from "../i18n/uk";
import { positiveOrNull, round2, valuesAmount, type Basis, type Measure } from "../lib/measure";
import WeighedPiecesFields, { weighedPair } from "./WeighedPiecesFields";

export interface ProductFields {
  main: Basis;
  amount: string;
  weighedPieces: string;
  weighedGrams: string;
  densityMl: string;
  densityGrams: string;
}

const t = uk.foods.pack;

export function productFieldsFromMeasure(measure: Measure): ProductFields {
  return {
    main: measure.basis,
    amount: fieldDecimal(valuesAmount(measure)),
    weighedPieces: measure.weighedPieces !== null ? fieldDecimal(measure.weighedPieces) : "",
    weighedGrams: measure.weighedGrams !== null ? fieldDecimal(measure.weighedGrams) : "",
    densityMl: measure.densityMl ? fieldDecimal(measure.densityMl) : "",
    densityGrams: measure.densityGrams ? fieldDecimal(measure.densityGrams) : "",
  };
}

/** The density pair, or the problem to show when only half of it is filled in. */
function densityPair(ml: string, grams: string): { densityMl: number | null; densityGrams: number | null } | { problem: string } {
  const m = positiveOrNull(ml);
  const g = positiveOrNull(grams);
  if ((ml.trim() !== "" || grams.trim() !== "") && (m === null || g === null)) return { problem: t.densityIncomplete };
  return { densityMl: m, densityGrams: g };
}

/** The measure, or the problem to show: no amount for the values, or half a weighed or density pair. */
export function measureFromProductFields(fields: ProductFields): Measure | { problem: string } {
  const amount = positiveOrNull(fields.amount);
  if (amount === null) return { problem: t.mainMissing };
  const weighed = weighedPair(fields.weighedPieces, fields.weighedGrams);
  if ("problem" in weighed) return weighed;
  // Pieces have no volume here: the density applies to items in grams or millilitres.
  const density = fields.main === "piece" ? { densityMl: null, densityGrams: null } : densityPair(fields.densityMl, fields.densityGrams);
  if ("problem" in density) return density;
  const defaultAmount = fields.main === "piece" ? 1 : 100;
  return { basis: fields.main, valuesPer: amount === defaultAmount ? null : amount, ...weighed, ...density };
}

export function isMeasure(value: Measure | { problem: string }): value is Measure {
  return !("problem" in value);
}

function DensityFields({ ml, grams, onChange }: { ml: string; grams: string; onChange: (ml: string, grams: string) => void }) {
  const m = positiveOrNull(ml);
  const g = positiveOrNull(grams);
  return (
    <fieldset className="pack-fields">
      <legend>
        {t.densityLegend} <span className="pack-optional">{t.optional}</span>
      </legend>
      <div className="pack-amounts">
        <label>
          {t.densityMlLabel}
          <input type="text" inputMode="decimal" value={ml} onChange={(e) => onChange(e.target.value, grams)} />
        </label>
        <label>
          {t.densityGramsLabel}
          <input type="text" inputMode="decimal" value={grams} onChange={(e) => onChange(ml, e.target.value)} />
        </label>
      </div>
      <p className="food-form-hint">{m !== null && g !== null ? t.density(round2(g / m)) : t.densityHint}</p>
    </fieldset>
  );
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
  const amountLabel = fields.main === "piece" ? t.amountPiecesLabel : fields.main === "100ml" ? t.amountMlLabel : t.amountGramsLabel;
  const mainHint = fields.main === "piece" ? t.piecesMainHint : fields.main === "100ml" ? t.mlMainHint : t.gramsMainHint;
  return (
    <>
      <fieldset className="pack-fields">
        <legend>{t.legend}</legend>
        <div className="pack-options" role="radiogroup">
          {option("100g", t.gramsOption)}
          {option("100ml", t.mlOption)}
          {option("piece", t.piecesOption)}
        </div>
        <label>
          {amountLabel}
          <input type="text" inputMode="decimal" value={fields.amount} onChange={(e) => onChange({ ...fields, amount: e.target.value })} />
        </label>
        <p className="food-form-hint">{mainHint}</p>
      </fieldset>
      {fields.main !== "100ml" && (
        <WeighedPiecesFields
          pieces={fields.weighedPieces}
          grams={fields.weighedGrams}
          onChange={(weighedPieces, weighedGrams) => onChange({ ...fields, weighedPieces, weighedGrams })}
        />
      )}
      {fields.main !== "piece" && (
        <DensityFields ml={fields.densityMl} grams={fields.densityGrams} onChange={(densityMl, densityGrams) => onChange({ ...fields, densityMl, densityGrams })} />
      )}
    </>
  );
}
