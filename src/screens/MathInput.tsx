// A number field that also takes a short calculation (release 2.0.2):
// `200*3/4` shows «= 150» under it; the result is what's saved.
import { uk } from "../i18n/uk";
import { evaluateInput, isCalculation } from "../lib/mathInput";
import { formatDecimal } from "../lib/numberFormat";

export default function MathInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const calculation = isCalculation(value);
  const result = calculation ? evaluateInput(value) : null;
  return (
    <>
      <input type="text" inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {calculation && (
        <span className={result === null ? "math-result math-result-error" : "math-result"}>
          {result === null ? uk.mathInput.cantCalculate : `= ${formatDecimal(result)}`}
        </span>
      )}
    </>
  );
}
