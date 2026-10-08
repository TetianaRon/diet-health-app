// Maths in value fields (release 2.0.2, spec: "Faster food entry"): a field
// accepts a short calculation — `200*3/4`, `150+30`, «200 ккал * 3/4» — and
// stores the result, never the formula. Numbers take a decimal comma or point;
// `+ − * / ( )` and × ÷ work; words (units) are ignored. Pure, unit-tested.

/** The value of what's typed: a plain number or a calculation; null when it isn't one. */
export function evaluateInput(text: string): number | null {
  const cleaned = text
    .replace(/×/g, "*")
    .replace(/(?<=[\d)]\s*)[xх](?=\s*[\d(])/gi, "*") // «2 х 150»
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[^\d.,+\-*/()\s]/g, " ") // drop words such as «ккал», «г», "cal"
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/,/g, ".")
    .trim();
  if (cleaned === "") return null;
  const tokens = cleaned.match(/\d+(?:\.\d+)?|\.\d+|[+\-*/()]/g);
  if (!tokens || tokens.join("") !== cleaned.replace(/\s+/g, "")) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  // expression := term (("+" | "-") term)*
  // term       := factor (("*" | "/") factor)*
  // factor     := ("+" | "-") factor | number | "(" expression ")"
  const expression = (): number | null => {
    let value = term();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = next();
      const right = term();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const term = (): number | null => {
    let value = factor();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = next();
      const right = factor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const factor = (): number | null => {
    const token = next();
    if (token === undefined) return null;
    if (token === "+" || token === "-") {
      const value = factor();
      return value === null ? null : token === "-" ? -value : value;
    }
    if (token === "(") {
      const value = expression();
      return next() === ")" ? value : null;
    }
    const n = Number(token);
    return Number.isFinite(n) ? n : null;
  };

  const result = expression();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) return null;
  return Math.round(result * 10000) / 10000;
}

/** Whether what's typed is a calculation (worth showing its result under the field). */
export function isCalculation(text: string): boolean {
  return /[\d)][^\d()]*[+\-*/×÷−xх][^\d()]*[\d(]/i.test(text);
}
