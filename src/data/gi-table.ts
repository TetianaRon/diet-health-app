// GI lookup for foods that come from a USDA search (USDA has no GI field).
// Since release 1.8 every value comes from the verified food database
// (verified-foods.json) — the same values, with the same sources, as the
// built-in items; the old hand-kept table (uncited, partly outdated — e.g.
// pearl barley 25, watermelon 76) was removed. A food the database doesn't
// cover gets no GI here, rather than an unsourced one; release 1.9 replaces
// this name lookup with proper matching and a GI suggestion the user accepts.
import { BUILT_IN_FOODS } from "./builtInFoods";
import file from "./verified-foods.json";
import type { VerifiedFoodsFile } from "./verifiedFoods";

const ENTRIES = (file as VerifiedFoodsFile).entries.filter((e) => e.status === "active" && e.gi.value !== null);

// Full database names only: a bare family word ("rice") would hand rice's GI
// to "Rice crackers" — a different product (see nutrition.test.ts).
const GI_TABLE: Record<string, number> = Object.fromEntries(
  BUILT_IN_FOODS.filter((f) => !f.unknownFields.includes("gi") && ENTRIES.some((e) => e.id === f.id)).map((f) => [f.nameEn.toLowerCase(), f.gi]),
);

/** Looks up GI by English name — exact match first, then a loose substring match. */
export function lookupGI(nameEn: string): number | null {
  const key = nameEn.toLowerCase().trim();
  if (key in GI_TABLE) return GI_TABLE[key];

  for (const [tableKey, gi] of Object.entries(GI_TABLE)) {
    if (key.includes(tableKey) || tableKey.includes(key)) return gi;
  }
  return null;
}
