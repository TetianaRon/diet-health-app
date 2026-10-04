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
import { computeDishNutrition, type Dish, type DishIngredientRef } from "../lib/dishes";
import { mergeBuiltInsById } from "../lib/itemIds";

function lookupStarterFood(ref: DishIngredientRef) {
  return STARTER_FOODS.find((f) => f.id === ref.id) ?? null;
}

interface StarterDishSpec {
  // Permanent built-in ID — same rules as StarterFood.id (numbering
  // continues across both built-in files).
  id: string;
  nameUk: string;
  nameEn: string;
  rawId: string;
  yieldGrams: number;
}

const STARTER_DISH_SPECS: StarterDishSpec[] = [
  { id: "B0058", nameUk: "Гречка варена", nameEn: "buckwheat, cooked", rawId: "B0001", yieldGrams: 360 },
  { id: "B0059", nameUk: "Рис білий варений", nameEn: "white rice, cooked", rawId: "B0002", yieldGrams: 280 },
  { id: "B0060", nameUk: "Рис бурий варений", nameEn: "brown rice, cooked", rawId: "B0003", yieldGrams: 335 },
  { id: "B0061", nameUk: "Вівсяна каша на воді", nameEn: "oatmeal, cooked with water", rawId: "B0004", yieldGrams: 550 },
  { id: "B0062", nameUk: "Пшоно варене", nameEn: "millet, cooked", rawId: "B0005", yieldGrams: 320 },
  { id: "B0063", nameUk: "Перлова крупа варена", nameEn: "pearl barley, cooked", rawId: "B0006", yieldGrams: 280 },
  { id: "B0064", nameUk: "Манна каша варена", nameEn: "semolina, cooked", rawId: "B0007", yieldGrams: 500 },
  { id: "B0065", nameUk: "Кукурудзяна каша варена", nameEn: "cornmeal, cooked", rawId: "B0008", yieldGrams: 375 },
  { id: "B0066", nameUk: "Макарони варені", nameEn: "pasta, cooked", rawId: "B0009", yieldGrams: 290 },
  { id: "B0067", nameUk: "Квасоля варена", nameEn: "kidney beans, cooked", rawId: "B0025", yieldGrams: 260 },
  { id: "B0068", nameUk: "Сочевиця варена", nameEn: "lentils, cooked", rawId: "B0026", yieldGrams: 300 },
  { id: "B0069", nameUk: "Нут варений", nameEn: "chickpeas, cooked", rawId: "B0027", yieldGrams: 225 },
];

export const STARTER_DISHES: Omit<Dish, "dateAdded">[] = STARTER_DISH_SPECS.map((spec) => {
  const raw = STARTER_FOODS.find((f) => f.id === spec.rawId);
  if (!raw) throw new Error(`starter dish ${spec.id}: raw ingredient ${spec.rawId} not found`);
  const ingredients: DishIngredientRef[] = [{ id: raw.id, nameUk: raw.nameUk, grams: 100 }];
  const nutrition = computeDishNutrition(ingredients, spec.yieldGrams, lookupStarterFood);
  return {
    id: spec.id,
    basedOn: "",
    nameUk: spec.nameUk,
    nameEn: spec.nameEn,
    ingredients,
    yieldGrams: spec.yieldGrams,
    source: "starter",
    glycemicFlag: "none",
    giVerified: false,
    unknownFields: [],
    ...nutrition,
  };
});

/**
 * Merges the bundled starter dishes with the personal Dishes sheet, so the
 * whole bundle is browsable/pickable (Dishes list, meal logging) without
 * first requiring each one to be individually saved — same principle as
 * mergeWithStarterFoods in lib/ingredients.ts (a saved copy, `basedOn`,
 * takes the built-in dish's place). Lives here rather than in lib/dishes.ts
 * to avoid a circular import (this file already depends on lib/dishes.ts).
 */
export function mergeWithStarterDishes(sheetDishes: Dish[]): Dish[] {
  return mergeBuiltInsById(
    STARTER_DISHES.map((dish) => ({ ...dish, dateAdded: "" })),
    sheetDishes,
  );
}
