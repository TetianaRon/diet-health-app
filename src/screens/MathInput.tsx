// A number field that also takes a short calculation (release 2.0.2):
// `200*3/4` shows «= 150» under it; the result is what's saved. The phone's
// number keyboard has no × or ÷, so while the field is focused a row of
// operator keys sits under it and adds the sign at the cursor.
import { useRef, useState } from "react";
import { uk } from "../i18n/uk";
import { evaluateInput, isCalculation } from "../lib/mathInput";
import { formatDecimal } from "../lib/numberFormat";

const OPERATORS = [
  { sign: "+", label: uk.mathInput.plus },
  { sign: "−", label: uk.mathInput.minus },
  { sign: "×", label: uk.mathInput.times },
  { sign: "÷", label: uk.mathInput.divide },
];

export default function MathInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const calculation = isCalculation(value);
  const result = calculation ? evaluateInput(value) : null;

  function insert(sign: string) {
    const field = input.current;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + sign + value.slice(end));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + sign.length, start + sign.length);
    });
  }

  return (
    <>
      <input
        ref={input}
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {focused && (
        <span className="math-keys">
          {OPERATORS.map(({ sign, label }) => (
            <button
              key={sign}
              type="button"
              className="math-key"
              aria-label={label}
              // Keep the focus (and the phone keyboard) in the field.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(sign)}
            >
              {sign}
            </button>
          ))}
        </span>
      )}
      {calculation && (
        <span className={result === null ? "math-result math-result-error" : "math-result"}>
          {result === null ? uk.mathInput.cantCalculate : `= ${formatDecimal(result)}`}
        </span>
      )}
    </>
  );
}
