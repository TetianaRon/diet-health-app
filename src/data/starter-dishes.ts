// Bundled starter Dishes — the cooked/prepared counterparts of the raw
// grains and legumes in starter-foods.ts (see the scope note there for why
// meat/fish/eggs and lightly-boiled vegetables aren't modeled this way).
// Nutrition is computed via computeDishNutrition, never hand-typed — true to
// "Dishes are auto-calculated from Ingredients."
//
// YieldGrams (finished weight from 100g raw input) is derived from published
// raw-vs-cooked reference values for each food: yield = rawCarbsPer100g /
// cookedCarbsPer100g * 100, cross-checked against the calories ratio. This
// is the standard practical model (cooking water dilutes; it adds no
// calories) — an approximation, like everything else in the starter bundle.
//
// GI source audit, 2026-09-10 — each dish's GI comes from the matching raw
// entry in starter-foods.ts (see the comment there); this table records what
// was actually checked, since none of it was cited before. GI research
// itself is inherently noisy — even the University of Sydney's own database
// differs from other cited studies by wide margins for several of these
// (rice, millet, barley especially) — so "sourced" means "checked against
// real published figures and defensible," not "the one true number."
//
//   Buckwheat:      GI 50. Univ. Sydney database cites 49; other sources ~50±4.
//                   Adjusted from 54 to better center on this.
//   White rice:     GI 73. Commonly cited ~70-72; some varieties/studies up
//                   to 89. Highly variety-dependent — kept as a mid-range
//                   defensible figure, not adjusted.
//   Brown rice:     GI 68. Cited range 50-87 depending on variety/amylose
//                   content — the widest spread found in this audit. Kept.
//   Oatmeal (water): GI 58. Traditional rolled oats cooked with water,
//                   specifically — matches this dish's exact prep. Adjusted
//                   from 55 (crosses from "low" into "medium" classification
//                   — a real, deliberate change, not rounding).
//   Millet:         GI 71. Matches a boiled-millet-specific study almost
//                   exactly (71±10); the broader millet literature mean is
//                   lower (52.7±10.3) but that average blends porridge/flour
//                   preparations this dish isn't. Kept.
//   Pearl barley:   GI 25. Unresolved conflict found, flagged rather than
//                   silently picked: one source cites ~25 for "cooked pearl
//                   barley," another cites pearled barley specifically at
//                   58±8 vs. whole-grain at 21±4. Ukrainian "Перлова крупа"
//                   is the pearled (polished) product, which the second
//                   source suggests could be notably higher than 25. Kept
//                   the existing value pending a clearer source rather than
//                   guess between two conflicting citations.
//   Semolina:       GI 55. International Tables of GI cites 54; steamed
//                   semolina 55±9. Kept.
//   Cornmeal:       GI 68. Polenta commonly cited ~70, range 55-85 by grind
//                   and cooking method. Kept.
//   Pasta:          GI 50. Al dente specifically runs lower (43-48) in most
//                   citations; overcooking past al dente raises GI ~30%.
//                   "Макарони варені" doesn't specify doneness — kept the
//                   existing value as a middle ground rather than assume
//                   al dente, but doneness matters more here than the
//                   number alone suggests.
//   Kidney beans:   GI 29. Close to a Univ. Sydney-cited 23; legumes are
//                   consistently low-GI across sources regardless of the
//                   exact figure. Kept.
//   Lentils:        GI 32. Most-cited figures run lower (22-25, one review's
//                   mean as low as 16), but 32 doesn't cross the low/medium
//                   boundary (still comfortably "low") — kept rather than
//                   over-fit to noisy data.
//   Chickpeas:      GI 28. Matches the commonly-cited figure closely. Kept.

import { STARTER_FOODS } from "./starter-foods";
import { computeDishNutrition, type Dish } from "../lib/dishes";

function lookupStarterFood(nameUk: string) {
  const food = STARTER_FOODS.find((f) => f.nameUk === nameUk);
  return food ?? null;
}

interface StarterDishSpec {
  nameUk: string;
  nameEn: string;
  rawNameUk: string;
  yieldGrams: number;
}

const STARTER_DISH_SPECS: StarterDishSpec[] = [
  { nameUk: "Гречка варена", nameEn: "buckwheat, cooked", rawNameUk: "Гречка суха", yieldGrams: 360 },
  { nameUk: "Рис білий варений", nameEn: "white rice, cooked", rawNameUk: "Рис білий сирий", yieldGrams: 280 },
  { nameUk: "Рис бурий варений", nameEn: "brown rice, cooked", rawNameUk: "Рис бурий сирий", yieldGrams: 335 },
  {
    nameUk: "Вівсяна каша на воді",
    nameEn: "oatmeal, cooked with water",
    rawNameUk: "Вівсяні пластівці сирі",
    yieldGrams: 550,
  },
  { nameUk: "Пшоно варене", nameEn: "millet, cooked", rawNameUk: "Пшоно сире", yieldGrams: 320 },
  { nameUk: "Перлова крупа варена", nameEn: "pearl barley, cooked", rawNameUk: "Перлова крупа суха", yieldGrams: 280 },
  { nameUk: "Манна каша варена", nameEn: "semolina, cooked", rawNameUk: "Манна крупа суха", yieldGrams: 500 },
  {
    nameUk: "Кукурудзяна каша варена",
    nameEn: "cornmeal, cooked",
    rawNameUk: "Кукурудзяна крупа суха",
    yieldGrams: 375,
  },
  { nameUk: "Макарони варені", nameEn: "pasta, cooked", rawNameUk: "Макарони сухі", yieldGrams: 290 },
  { nameUk: "Квасоля варена", nameEn: "kidney beans, cooked", rawNameUk: "Квасоля суха", yieldGrams: 260 },
  { nameUk: "Сочевиця варена", nameEn: "lentils, cooked", rawNameUk: "Сочевиця суха", yieldGrams: 300 },
  { nameUk: "Нут варений", nameEn: "chickpeas, cooked", rawNameUk: "Нут сухий", yieldGrams: 225 },
];

export const STARTER_DISHES: Omit<Dish, "dateAdded">[] = STARTER_DISH_SPECS.map((spec) => {
  const ingredients = [{ nameUk: spec.rawNameUk, grams: 100 }];
  const nutrition = computeDishNutrition(ingredients, spec.yieldGrams, lookupStarterFood);
  return {
    nameUk: spec.nameUk,
    nameEn: spec.nameEn,
    ingredients,
    yieldGrams: spec.yieldGrams,
    source: "starter",
    glycemicFlag: "none",
    giVerified: false,
    ...nutrition,
  };
});

/**
 * Merges the bundled starter dishes with the personal Dishes sheet, so the
 * whole bundle is browsable/pickable (Dishes list, meal logging) without
 * first requiring each one to be individually saved — same principle as
 * mergeWithStarterFoods in lib/ingredients.ts. Sheet rows take precedence
 * for the same name. Lives here rather than in lib/dishes.ts to avoid a
 * circular import (this file already depends on lib/dishes.ts).
 */
export function mergeWithStarterDishes(sheetDishes: Dish[]): Dish[] {
  const byKey = new Map<string, Dish>();
  for (const dish of STARTER_DISHES) {
    byKey.set(dish.nameUk.trim().toLowerCase(), { ...dish, dateAdded: "" });
  }
  for (const dish of sheetDishes) {
    byKey.set(dish.nameUk.trim().toLowerCase(), dish);
  }
  return [...byKey.values()];
}
