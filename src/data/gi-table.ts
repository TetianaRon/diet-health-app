// Static Glycemic Index reference table. No API (free or paid) provides GI —
// it comes from academic research, not nutrition labels — so this is always
// looked up locally, never fetched. Used to fill in GI when a food comes
// from USDA (which has no GI field). Includes every food in the starter
// dataset plus some extra common items that come up in USDA lookups but
// aren't in src/data/starter-foods.ts.

import { STARTER_FOODS } from "./starter-foods";

const EXTRA_GI: Record<string, number> = {
  "watermelon": 76,
  "honey": 61,
  "sugar": 65,
  "white flour": 85,
  "sweet potato, cooked": 63,
  "cherries": 22,
  "dark chocolate": 23,
  "popcorn": 65,
  "quinoa, cooked": 53,
  "couscous, cooked": 65,
  "peach": 42,
  "apricot": 34,
  "raisins": 64,
  "cornflakes": 81,
  "spaghetti, al dente": 50,
};

const GI_TABLE: Record<string, number> = {
  ...Object.fromEntries(STARTER_FOODS.map((food) => [food.nameEn.toLowerCase(), food.gi])),
  ...EXTRA_GI,
};

/** Looks up GI by English name — exact match first, then a loose substring match. */
export function lookupGI(nameEn: string): number | null {
  const key = nameEn.toLowerCase().trim();
  if (key in GI_TABLE) return GI_TABLE[key];

  for (const [tableKey, gi] of Object.entries(GI_TABLE)) {
    if (key.includes(tableKey) || tableKey.includes(key)) return gi;
  }
  return null;
}
