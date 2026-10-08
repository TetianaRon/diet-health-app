// Item labels (release 2.1, spec → "One product list (2.1)"): for finding and
// filtering only, never part of the maths. An item can have none, one or
// several. No imports, so any module can use it.

export const LABEL_KEYS = ["ingredient", "dish", "drink", "sauce", "snack"] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];

export function parseLabels(value: unknown): LabelKey[] {
  const wanted = new Set(String(value ?? "").split(",").map((s) => s.trim()));
  return LABEL_KEYS.filter((key) => wanted.has(key));
}

export function serializeLabels(labels: readonly LabelKey[]): string {
  return LABEL_KEYS.filter((key) => labels.includes(key)).join(",");
}

/**
 * A database entry's labels, from its category and state (spec): drinks →
 * напій; cooked foods (boiled, baked, fried, steamed — not bread) → страва;
 * the rest → інгредієнт.
 */
export function databaseLabels(category: string, state: string): LabelKey[] {
  if (category === "drinks") return ["drink"];
  if (category !== "bread" && ["boiled", "baked", "fried", "steamed"].includes(state)) return ["dish"];
  return ["ingredient"];
}
