// Numbers as Ukrainian readers write them: a decimal comma (6,2 not 6.2).
// Display only — stored values stay real numbers.

/** 6.2 → "6,2"; rounds to `digits` decimals and drops trailing zeros (72.40 → "72,4"). */
export function formatDecimal(value: number, digits = 1): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor).replace(".", ",");
}

/** A number typed with either separator ("72,4" / "72.4"); NaN if it isn't one. */
export function parseDecimal(text: string): number {
  return Number(text.trim().replace(",", "."));
}
