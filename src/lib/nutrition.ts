// External nutrition lookup: translation + USDA FoodData Central, for foods
// not covered by the bundle (src/data/starter-foods.ts — checked directly by
// the UI's browsable suggestion list, not by this module; see lookupExternal
// below for why). USDA goes through our own proxy (api/usda.js) so its key
// stays off the device (2026-09-28).
//
// Mom only ever types Ukrainian. English (needed for the USDA query) is
// resolved automatically via translation (our api/translate proxy) — she is never asked to
// supply or understand an English name (see docs/build-log.md, 2026-08-13 fix).
import { lookupGI } from "../data/gi-table";

// Translation goes through our own proxy (api/translate.js → Google Cloud
// Translation) since 1.5.2; the free MyMemory service it replaced had a tiny
// anonymous daily limit that made the search fail (docs/roadmap.md 1.5.1).
// Same-origin on the web; the Android build sets VITE_TRANSLATE_PROXY_URL.
const TRANSLATE_URL = import.meta.env.VITE_TRANSLATE_PROXY_URL || "/api/translate";

// Every translation is remembered on the device, and each device may send at
// most DAILY_TRANSLATION_LIMIT characters a day (remembered ones are free).
// The real cost guarantee is the Google Cloud quota (15,000 characters a day
// for everyone, under the free 500,000 a month); this keeps one device from
// using it all. Not tamper-proof by design.
const TRANSLATION_CACHE_KEY = "trackmymeals.translations";
const TRANSLATION_LIMIT_KEY = "trackmymeals.translationLimitDate";
const TRANSLATION_USAGE_KEY = "trackmymeals.translationUsage";
const TRANSLATION_CACHE_MAX = 500;
export const DAILY_TRANSLATION_LIMIT = 2000;

type Language = "uk" | "en";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Storage can be missing or throw (private mode, blocked site data) —
// translation still works without it, just without memory or the limit.
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

function rememberTranslations(entries: [string, string][]): void {
  const cache = readCache();
  for (const [key, translated] of entries) {
    delete cache[key]; // re-insert so the newest entries survive trimming
    cache[key] = translated;
  }
  const keys = Object.keys(cache);
  for (const old of keys.slice(0, Math.max(0, keys.length - TRANSLATION_CACHE_MAX))) delete cache[old];
  writeStorage(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
}

/** Characters this device has sent for translation today. */
export function translationCharsUsedToday(): number {
  try {
    const usage = JSON.parse(readStorage(TRANSLATION_USAGE_KEY) ?? "{}") as { date?: string; chars?: number };
    return usage.date === todayLocal() ? (usage.chars ?? 0) : 0;
  } catch {
    return 0;
  }
}

function addTranslationUsage(chars: number): void {
  writeStorage(TRANSLATION_USAGE_KEY, JSON.stringify({ date: todayLocal(), chars: translationCharsUsedToday() + chars }));
}

/** True once translation is used up for today — this device's limit or the shared Google quota. */
export function isTranslationLimitedToday(): boolean {
  return readStorage(TRANSLATION_LIMIT_KEY) === todayLocal();
}

function markTranslationLimited(): void {
  writeStorage(TRANSLATION_LIMIT_KEY, todayLocal());
}

/**
 * Translates several texts in one request; remembered ones aren't sent.
 * Returns null for each text that couldn't be translated (limit reached,
 * network or server failure) — callers fall back to the untranslated text.
 */
async function translateMany(texts: string[], source: Language, target: Language): Promise<(string | null)[]> {
  const cache = readCache();
  const keyOf = (text: string) => `${source}|${target}:${text}`;
  const results: (string | null)[] = texts.map((text) => cache[keyOf(text)] ?? null);
  // The proxy refuses texts over 200 characters (api/translate.js); those
  // rare long USDA names just stay in English.
  const missing = [...new Set(texts.filter((text, i) => results[i] === null && text.length <= 200))];
  if (missing.length === 0 || isTranslationLimitedToday()) return results;

  const chars = missing.reduce((sum, text) => sum + text.length, 0);
  if (translationCharsUsedToday() + chars > DAILY_TRANSLATION_LIMIT) {
    markTranslationLimited();
    return results;
  }

  let translations: string[];
  try {
    const response = await fetch(TRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: missing, source, target }),
    });
    if (response.status === 429) {
      markTranslationLimited();
      return results;
    }
    if (!response.ok) return results;
    const data = (await response.json()) as { translations?: unknown };
    if (!Array.isArray(data.translations) || data.translations.length !== missing.length) return results;
    translations = data.translations.map(String);
  } catch {
    return results;
  }

  addTranslationUsage(chars);
  rememberTranslations(missing.map((text, i) => [keyOf(text), translations[i]]));
  const byText = new Map(missing.map((text, i) => [text, translations[i]]));
  return texts.map((text, i) => results[i] ?? byText.get(text) ?? null);
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

/** Translates a Ukrainian food name to English. Returns null if unavailable. */
export async function translateUkToEn(textUk: string): Promise<string | null> {
  return (await translateMany([textUk], "uk", "en"))[0];
}

// USDA candidates are English-only (its own database descriptions, not
// something we translated ourselves) — mom never reads English, so the top
// TRANSLATED_CANDIDATE_COUNT candidates also get a best-effort Ukrainian
// back-translation purely for display (never saved as the authoritative
// nameUk; she still picks/edits the actual save name herself), all in one
// request. null entries mean unavailable — callers show English only.
export async function translateEnToUkMany(textsEn: string[]): Promise<(string | null)[]> {
  return translateMany(textsEn, "en", "uk");
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
