// External nutrition lookup: translation + USDA FoodData Central, for foods
// not covered by the bundle (src/data/starter-foods.ts — checked directly by
// the UI's browsable suggestion list, not by this module; see lookupExternal
// below for why). No serverless proxy needed — USDA's key is free/public-data
// with no billing risk, unlike the Anthropic key this replaced (see
// docs/build-log.md, 2026-08-13).
//
// Mom only ever types Ukrainian. English (needed for the USDA query) is
// resolved automatically via a free translation API — she is never asked to
// supply or understand an English name (see docs/build-log.md, 2026-08-13 fix).
import { lookupGI } from "../data/gi-table";

const TRANSLATE_URL = "https://api.mymemory.translated.net/get";

async function translate(text: string, langpair: "uk|en" | "en|uk"): Promise<string | null> {
  const params = new URLSearchParams({ q: text, langpair });
  const response = await fetch(`${TRANSLATE_URL}?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  const translated: string | undefined = data?.responseData?.translatedText;
  if (!translated || translated.toUpperCase().includes("MYMEMORY WARNING")) return null;

  return translated;
}

/** Translates a Ukrainian food name to English via a free, no-key API. Returns null if unavailable. */
export async function translateUkToEn(textUk: string): Promise<string | null> {
  return translate(textUk, "uk|en");
}

// USDA candidates are English-only (its own database descriptions, not
// something we translated ourselves) — mom never reads English, so each
// candidate also gets a best-effort Ukrainian back-translation purely for
// display (never saved as the authoritative nameUk; she still picks/edits
// the actual save name herself). Returns null on failure — callers fall back
// to showing English only, same as before this existed.
export async function translateEnToUk(textEn: string): Promise<string | null> {
  return translate(textEn, "en|uk");
}

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

// USDA's search returns multiple ranked matches per query (its API supports
// up to 200 per page) — fetching a generous batch up front, in one request,
// lets the UI list every reasonable candidate for picking from directly,
// rather than "literally all" (often hundreds, mostly irrelevant for a
// generic query) or a slow one-at-a-time cycle.
const USDA_CANDIDATE_COUNT = 20;

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

interface UsdaFood {
  description: string;
  foodNutrients: UsdaFoodNutrient[];
}

interface UsdaSearchResponse {
  foods: UsdaFood[];
}

// USDA's own description (e.g. "Beans, kidney, red, mature seeds, canned")
// is more specific than our translated query and is what distinguishes one
// candidate from another, so it's used as the estimate's nameEn — and, on
// purpose, as the *only* thing GI is looked up against. An earlier version
// also fell back to the original query when the description didn't match
// (to catch USDA's comma-led phrasing missing our "kidney beans"-style GI
// table keys), but that was too permissive: a short query word like "рис"
// -> "rice" could substring-match "white rice" in the table and get applied
// to a completely unrelated candidate like "Rice crackers". A blank GI that
// forces a deliberate manual entry is safer than a value that looks
// authoritative but doesn't actually belong to the food in front of you.
function usdaFoodToEstimate(food: UsdaFood): NutritionEstimate {
  const valueFor = (nutrientNumber: string) =>
    food.foodNutrients.find((n) => n.nutrientNumber === nutrientNumber)?.value ?? 0;

  return {
    nameEn: food.description,
    carbsG: valueFor(NUTRIENT_NUMBER.carbs),
    fiberG: valueFor(NUTRIENT_NUMBER.fiber),
    sugarsG: valueFor(NUTRIENT_NUMBER.sugars),
    proteinG: valueFor(NUTRIENT_NUMBER.protein),
    fatG: valueFor(NUTRIENT_NUMBER.fat),
    caloriesKcal: valueFor(NUTRIENT_NUMBER.energy),
    sodiumMg: valueFor(NUTRIENT_NUMBER.sodium),
    gi: lookupGI(food.description),
    source: "usda",
  };
}

/**
 * Queries USDA FoodData Central and returns up to USDA_CANDIDATE_COUNT
 * ranked matches — safe client-side, it's a free public-data API. An empty
 * array means USDA had no matches at all.
 */
export async function searchUsda(nameEn: string): Promise<NutritionEstimate[]> {
  const apiKey = import.meta.env.VITE_USDA_API_KEY;
  const params = new URLSearchParams({
    query: nameEn,
    api_key: apiKey,
    pageSize: String(USDA_CANDIDATE_COUNT),
    dataType: "Foundation,SR Legacy",
  });

  const response = await fetch(`${USDA_SEARCH_URL}?${params}`);
  if (!response.ok) {
    throw new Error(`USDA lookup failed: ${response.status}`);
  }

  const data: UsdaSearchResponse = await response.json();
  return data.foods.map(usdaFoodToEstimate);
}

/**
 * Resolves a Ukrainian name to a list of USDA candidates via translation —
 * deliberately skips the bundle. The bundle is already covered by the
 * browsable suggestion list shown while typing; re-checking it here, behind
 * the "Знайти" button, would just be a second, redundant way to reach the
 * same items. Returns [] if translation is unavailable or USDA has no
 * matches — caller should fall back to manual entry.
 */
export async function lookupExternalCandidates(nameUk: string): Promise<NutritionEstimate[]> {
  const nameEn = await translateUkToEn(nameUk);
  if (!nameEn) return [];

  return searchUsda(nameEn);
}
