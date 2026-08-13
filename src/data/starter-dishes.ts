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
    ...nutrition,
  };
});
