// «Розміри порцій» in the product and dish editors (release 2.0.2): up to 3
// sizes of her own — a label and an amount in г or шт. Database sizes, when
// the item has them, are listed above (read-only; one of hers with the same
// label replaces it).
import { uk } from "../i18n/uk";
import { evaluateInput } from "../lib/mathInput";
import { formatDecimal } from "../lib/numberFormat";
import { DEFAULT_SIZE_LABELS, MAX_OWN_SIZES, type PortionSize } from "../lib/portionSizes";
import MathInput from "./MathInput";

export interface SizeRow {
  label: string;
  amount: string;
  unit: "grams" | "pieces";
}

const t = uk.foods.sizes;

export function sizeRowsFrom(sizes: readonly PortionSize[]): SizeRow[] {
  return sizes
    .filter((s) => !s.fromDatabase)
    .map((s) => (s.grams !== undefined ? { label: s.label, amount: String(s.grams), unit: "grams" as const } : { label: s.label, amount: String(s.pieces), unit: "pieces" as const }));
}

/** Her sizes from the rows (empty rows dropped), or the problem to show. */
export function sizesFromRows(rows: readonly SizeRow[]): PortionSize[] | { problem: string } {
  const filled = rows.filter((r) => r.label.trim() !== "" || r.amount.trim() !== "");
  const sizes: PortionSize[] = [];
  for (const row of filled) {
    const amount = evaluateInput(row.amount);
    if (row.label.trim() === "" || amount === null || amount <= 0) return { problem: t.invalid };
    sizes.push(row.unit === "grams" ? { label: row.label.trim(), grams: amount } : { label: row.label.trim(), pieces: amount });
  }
  return sizes;
}

export function sizeAmountText(size: PortionSize): string {
  return size.grams !== undefined ? `${formatDecimal(size.grams)} г` : `${formatDecimal(size.pieces ?? 0)} шт.`;
}

export default function PortionSizesFields({
  rows,
  onChange,
  databaseSizes = [],
  allowGrams,
  allowPieces,
}: {
  rows: SizeRow[];
  onChange: (rows: SizeRow[]) => void;
  databaseSizes?: readonly PortionSize[];
  allowGrams: boolean;
  allowPieces: boolean;
}) {
  const update = (index: number, patch: Partial<SizeRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const add = () =>
    onChange([...rows, { label: DEFAULT_SIZE_LABELS[rows.length] ?? "", amount: "", unit: allowGrams ? "grams" : "pieces" }]);
  return (
    <fieldset className="pack-fields">
      <legend>
        {t.legend} <span className="pack-optional">{uk.foods.pack.optional}</span>
      </legend>
      {databaseSizes.length > 0 && (
        <p className="food-form-hint">
          {t.database} {databaseSizes.map((s) => `${s.label} ≈ ${sizeAmountText(s)}`).join(", ")}
        </p>
      )}
      {rows.map((row, index) => (
        <div key={index} className="size-row">
          <label>
            {t.labelLabel}
            <input value={row.label} onChange={(e) => update(index, { label: e.target.value })} />
          </label>
          <label>
            {row.unit === "pieces" ? t.amountPiecesLabel : t.amountGramsLabel}
            <MathInput value={row.amount} onChange={(v) => update(index, { amount: v })} />
          </label>
          {allowGrams && allowPieces && (
            <div className="compose-unit" role="radiogroup">
              {(["grams", "pieces"] as const).map((unit) => (
                <label key={unit} className="pack-option">
                  <input type="radio" checked={row.unit === unit} onChange={() => update(index, { unit })} />
                  {unit === "grams" ? "г" : "шт."}
                </label>
              ))}
            </div>
          )}
          <button type="button" className="button-secondary" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            {t.removeButton}
          </button>
        </div>
      ))}
      {rows.length < MAX_OWN_SIZES && (
        <button type="button" className="button-secondary" onClick={add}>
          {t.addButton}
        </button>
      )}
      <p className="food-form-hint">{t.hint}</p>
    </fieldset>
  );
}
