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
  dishName: string;
  rawNameUk: string;
  yieldGrams: number;
}

const STARTER_DISH_SPECS: StarterDishSpec[] = [
  { dishName: "Гречка варена", rawNameUk: "Гречка суха", yieldGrams: 360 },
  { dishName: "Рис білий варений", rawNameUk: "Рис білий сирий", yieldGrams: 280 },
  { dishName: "Рис бурий варений", rawNameUk: "Рис бурий сирий", yieldGrams: 335 },
  { dishName: "Вівсяна каша на воді", rawNameUk: "Вівсяні пластівці сирі", yieldGrams: 550 },
  { dishName: "Пшоно варене", rawNameUk: "Пшоно сире", yieldGrams: 320 },
  { dishName: "Перлова крупа варена", rawNameUk: "Перлова крупа суха", yieldGrams: 280 },
  { dishName: "Манна каша варена", rawNameUk: "Манна крупа суха", yieldGrams: 500 },
  { dishName: "Кукурудзяна каша варена", rawNameUk: "Кукурудзяна крупа суха", yieldGrams: 375 },
  { dishName: "Макарони варені", rawNameUk: "Макарони сухі", yieldGrams: 290 },
  { dishName: "Квасоля варена", rawNameUk: "Квасоля суха", yieldGrams: 260 },
  { dishName: "Сочевиця варена", rawNameUk: "Сочевиця суха", yieldGrams: 300 },
  { dishName: "Нут варений", rawNameUk: "Нут сухий", yieldGrams: 225 },
];

export const STARTER_DISHES: Omit<Dish, "dateAdded">[] = STARTER_DISH_SPECS.map((spec) => {
  const ingredients = [{ nameUk: spec.rawNameUk, grams: 100 }];
  const nutrition = computeDishNutrition(ingredients, spec.yieldGrams, lookupStarterFood);
  return {
    dishName: spec.dishName,
    ingredients,
    yieldGrams: spec.yieldGrams,
    ...nutrition,
  };
});
