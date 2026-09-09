// Shared "watch/avoid" flag used by both Ingredient and Dish (see
// docs/build-log.md's 2026-09-07 design entry). Independently settable on
// each — no automatic propagation in either direction; see
// dishContainsFlaggedIngredient in dishes.ts for the one derived (not
// persisted) cross-reference between the two.
export const GLYCEMIC_FLAGS = ["none", "watch", "avoid"] as const;
export type GlycemicFlag = (typeof GLYCEMIC_FLAGS)[number];

export function toGlycemicFlag(value: unknown): GlycemicFlag {
  return (GLYCEMIC_FLAGS as readonly string[]).includes(String(value)) ? (value as GlycemicFlag) : "none";
}

/** Cycles none -> watch -> avoid -> none, same one-click interaction as the ★/☆ favorite toggle. */
export function cycleGlycemicFlag(current: GlycemicFlag): GlycemicFlag {
  const index = GLYCEMIC_FLAGS.indexOf(current);
  return GLYCEMIC_FLAGS[(index + 1) % GLYCEMIC_FLAGS.length];
}

export const GLYCEMIC_FLAG_SYMBOL: Record<GlycemicFlag, string> = {
  none: "○",
  watch: "△",
  avoid: "✕",
};
