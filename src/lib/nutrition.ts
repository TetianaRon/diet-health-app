// Nutrition lookup: bundled starter data first, USDA FoodData Central only
// for foods not in the bundle. No serverless proxy needed — USDA's key is
// free/public-data with no billing risk, unlike the Anthropic key this
// replaced (see docs/build-log.md, 2026-08-13).
import { STARTER_FOODS, type StarterFood } from "../data/starter-foods";
import { lookupGI } from "../data/gi-table";

export interface NutritionEstimate {
  nameEn: string;
  carbsG: number;
  gi: number | null;
  fiberG: number;
  sugarsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  sodiumMg: number;
  source: "starter" | "usda";
}

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

const NUTRIENT_NUMBER = {
  protein: "203",
  fat: "204",
  carbs: "205",
  energy: "208",
  sugars: "269",
  fiber: "291",
  sodium: "307",
} as const;

interface UsdaFoodNutrient {
  nutrientNumber: string;
  value: number;
}

interface UsdaSearchResponse {
  foods: { foodNutrients: UsdaFoodNutrient[] }[];
}

/** Checks the bundled starter dataset by either name — no network call. */
export function findInStarterData(query: string): StarterFood | null {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  return (
    STARTER_FOODS.find(
      (food) => food.nameUk.toLowerCase() === key || food.nameEn.toLowerCase() === key,
    ) ?? null
  );
}

function toEstimate(food: StarterFood): NutritionEstimate {
  return {
    nameEn: food.nameEn,
    carbsG: food.carbsG,
    gi: food.gi,
    fiberG: food.fiberG,
    sugarsG: food.sugarsG,
    proteinG: food.proteinG,
    fatG: food.fatG,
    caloriesKcal: food.caloriesKcal,
    sodiumMg: food.sodiumMg,
    source: "starter",
  };
}

/** Queries USDA FoodData Central directly — safe client-side, it's a free public-data API. */
export async function lookupUsda(nameEn: string): Promise<NutritionEstimate | null> {
  const apiKey = import.meta.env.VITE_USDA_API_KEY;
  const params = new URLSearchParams({
    query: nameEn,
    api_key: apiKey,
    pageSize: "1",
    dataType: "Foundation,SR Legacy",
  });

  const response = await fetch(`${USDA_SEARCH_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`USDA lookup failed: ${response.status}`);
  }

  const data: UsdaSearchResponse = await response.json();
  const food = data.foods[0];
  if (!food) return null;

  const valueFor = (nutrientNumber: string) =>
    food.foodNutrients.find((n) => n.nutrientNumber === nutrientNumber)?.value ?? 0;

  return {
    nameEn,
    carbsG: valueFor(NUTRIENT_NUMBER.carbs),
    fiberG: valueFor(NUTRIENT_NUMBER.fiber),
    sugarsG: valueFor(NUTRIENT_NUMBER.sugars),
    proteinG: valueFor(NUTRIENT_NUMBER.protein),
    fatG: valueFor(NUTRIENT_NUMBER.fat),
    caloriesKcal: valueFor(NUTRIENT_NUMBER.energy),
    sodiumMg: valueFor(NUTRIENT_NUMBER.sodium),
    gi: lookupGI(nameEn),
    source: "usda",
  };
}

/**
 * Full lookup order: bundled starter data (by Ukrainian or English name) first,
 * then USDA FoodData Central by English name. Returns null if neither has it —
 * caller should fall back to manual entry.
 */
export async function lookupFood(nameUk: string, nameEn: string): Promise<NutritionEstimate | null> {
  const starterMatch = findInStarterData(nameUk) ?? findInStarterData(nameEn);
  if (starterMatch) return toEstimate(starterMatch);

  return lookupUsda(nameEn);
}
