// External nutrition lookup: translation + USDA FoodData Central, for foods
// not covered by the bundle (src/data/starter-foods.ts — checked directly by
// the UI's browsable suggestion list, not by this module; see lookupExternal
// below for why). USDA goes through our own proxy (api/usda.js) so its key
// stays off the device (2026-09-28).
//
// Mom only ever types Ukrainian. English (needed for the USDA query) is
// resolved automatically via a free translation API — she is never asked to
// supply or understand an English name (see docs/build-log.md, 2026-08-13 fix).
import { lookupGI } from "../data/gi-table";

const TRANSLATE_URL = "https://api.mymemory.translated.net/get";

// MyMemory's free, anonymous tier allows only ~5,000 characters a day. When
// it's used up it still answers 200, with a "MYMEMORY WARNING" text and
// quotaFinished: true — treating that like any other failure made the add-food
// search say «Не знайдено» for a day (found 2026-09-30, docs/roadmap.md 1.5.1).
// So: every translation is remembered on the device, and once the limit is
// hit the app stops calling the translator until the next day and says so.
const TRANSLATION_CACHE_KEY = "trackmymeals.translations";
const TRANSLATION_LIMIT_KEY = "trackmymeals.translationLimitDate";
const TRANSLATION_CACHE_MAX = 500;

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Storage can be missing or throw (private mode, blocked site data) —
// translation still works without it, just without memory.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore — see readStorage
  }
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(readStorage(TRANSLATION_CACHE_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberTranslation(cacheKey: string, translated: string): void {
  const cache = readCache();
  delete cache[cacheKey]; // re-insert so the newest entries survive trimming
  cache[cacheKey] = translated;
  const keys = Object.keys(cache);
  for (const old of keys.slice(0, Math.max(0, keys.length - TRANSLATION_CACHE_MAX))) delete cache[old];
  writeStorage(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
}

/** True once the free translator reported its daily limit as used up today. */
export function isTranslationLimitedToday(): boolean {
  return readStorage(TRANSLATION_LIMIT_KEY) === todayLocal();
}

function markTranslationLimited(): void {
  writeStorage(TRANSLATION_LIMIT_KEY, todayLocal());
}

async function translate(text: string, langpair: "uk|en" | "en|uk"): Promise<string | null> {
  const cacheKey = `${langpair}:${text}`;
  const cached = readCache()[cacheKey];
  if (cached) return cached;
  if (isTranslationLimitedToday()) return null;

  const params = new URLSearchParams({ q: text, langpair });
  const response = await fetch(`${TRANSLATE_URL}?${params}`);
  if (response.status === 429) {
    markTranslationLimited();
    return null;
  }
  if (!response.ok) return null;

  const data = await response.json();
  const translated: string | undefined = data?.responseData?.translatedText;
  if (data?.quotaFinished === true || translated?.toUpperCase().includes("MYMEMORY WARNING")) {
    markTranslationLimited();
    return null;
  }
  if (!translated) return null;

  rememberTranslation(cacheKey, translated);
  return translated;
}

/**
 * Normalises a typed search before translating: trims, collapses spaces and
 * lowercases. The keyboard's automatic capital changed the translation itself
 * («Кукурудза» → "Maize", 1 USDA result; «кукурудза» → "corn", 20), and
 * Gboard often leaves a trailing space.
 */
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk");
}

/** A query typed in Latin letters is already English — it goes to USDA as is. */
export function isLatinQuery(query: string): boolean {
  return /\p{Script=Latin}/u.test(query) && !/\p{Script=Cyrillic}/u.test(query);
}

/** Translates a Ukrainian food name to English via a free, no-key API. Returns null if unavailable. */
export async function translateUkToEn(textUk: string): Promise<string | null> {
  return translate(textUk, "uk|en");
}

// USDA candidates are English-only (its own database descriptions, not
// something we translated ourselves) — mom never reads English, so the top
// TRANSLATED_CANDIDATE_COUNT candidates also get a best-effort Ukrainian
// back-translation purely for display (never saved as the authoritative
// nameUk; she still picks/edits the actual save name herself). Returns null
// on failure — callers fall back to showing English only.
export async function translateEnToUk(textEn: string): Promise<string | null> {
  return translate(textEn, "en|uk");
}

// Only the best matches are back-translated: each one costs part of the
// translator's small daily limit, and the rest are rarely the right pick.
// The others are still listed, untranslated (see FoodsScreen).
export const TRANSLATED_CANDIDATE_COUNT = 5;

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

// USDA search goes through our own proxy (api/usda.js), which adds the API
// key on the server — the key is no longer baked into the web bundle or the
// APK (2026-09-28). Same-origin "/api/usda" on the web; the Android build
// sets VITE_USDA_PROXY_URL to the deployed absolute URL; `npm run dev`
// proxies "/api/usda" to USDA in vite.config.ts.
const USDA_SEARCH_URL = import.meta.env.VITE_USDA_PROXY_URL || "/api/usda";

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
 * Queries USDA FoodData Central (via the api/usda proxy) and returns up to
 * USDA_CANDIDATE_COUNT ranked matches. An empty array means USDA had no
 * matches at all.
 */
export async function searchUsda(nameEn: string): Promise<NutritionEstimate[]> {
  const params = new URLSearchParams({
    query: nameEn,
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

export type ExternalLookupResult =
  | { kind: "found"; candidates: NutritionEstimate[] }
  | { kind: "none" }
  | { kind: "translation-limited" }
  | { kind: "failed" };

/**
 * Resolves a typed name to a list of USDA candidates via translation —
 * deliberately skips the bundle. The bundle is already covered by the
 * browsable suggestion list shown while typing; re-checking it here, behind
 * the "Знайти" button, would just be a second, redundant way to reach the
 * same items. Tells "nothing found" apart from "couldn't search": the screen
 * used to say «Не знайдено» for both.
 */
export async function lookupExternalCandidates(query: string): Promise<ExternalLookupResult> {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return { kind: "none" };

  let nameEn: string | null;
  if (isLatinQuery(normalized)) {
    nameEn = normalized;
  } else {
    try {
      nameEn = await translateUkToEn(normalized);
    } catch {
      nameEn = null;
    }
    if (!nameEn) return { kind: isTranslationLimitedToday() ? "translation-limited" : "failed" };
  }

  try {
    const candidates = await searchUsda(nameEn);
    return candidates.length > 0 ? { kind: "found", candidates } : { kind: "none" };
  } catch {
    return { kind: "failed" };
  }
}
