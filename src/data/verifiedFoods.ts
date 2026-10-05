// The verified food database's format (release 1.8, spec → "Verified food
// database"). One JSON file, verified-foods.json, is the single source for
// the app's built-in items and, later, the public pages on roncreator.com —
// so every entry must stand on its own: each PART of an entry (nutrients,
// GI) carries its own source, reliability, reasoning (Ukrainian + English)
// and verified date. Nothing is "verified" as a whole; an entry can have
// sourced nutrients and an unknown GI. validateVerifiedFoods() is the guard:
// the test suite refuses a file that breaks any rule below.
//
// Not a medical claim anywhere: values are "from the cited source", reasons
// explain the match and the reliability, never what is good for anyone.

export type Reliability = "high" | "medium" | "low";

export interface Bilingual {
  uk: string;
  en: string;
}

/** Where one part's values come from. `dataset` is a key of the file's `sources` registry. */
export interface SourceRef {
  dataset: string;
  /** The entry in that dataset, e.g. a USDA FDC ID or a GI table row; "" only for the "calculation" dataset. */
  entryId: string;
  /** The dataset's own description of that entry, as written there. */
  description: string;
}

/** Shared by every part: how much to trust it and why, and when it was last checked against the source. */
interface Provenance {
  reliability: Reliability;
  reason: Bilingual;
  /** YYYY-MM-DD */
  verified: string;
}

export const NUTRIENT_FIELDS = ["caloriesKcal", "carbsG", "fiberG", "sugarsG", "proteinG", "fatG", "sodiumMg"] as const;
export type NutrientField = (typeof NUTRIENT_FIELDS)[number];

export interface NutrientsPart extends Provenance {
  /** Per 100 g of the food in this entry's state. A field listed in `unknown` holds 0 and is excluded from totals. */
  per100g: Record<NutrientField, number>;
  unknown?: NutrientField[];
  source: SourceRef;
}

/**
 * measured     — a GI table value for this food (or a stated close match);
 * conventional — no measurable GI (too little carbohydrate to test); a
 *                conventional value, labelled «умовне», so its carbs still
 *                count in glycemic load (developer, 2026-10-04);
 * unknown      — no usable value; GL can't be counted («немає даних»);
 * notApplicable — practically no carbohydrate (meat, fish, oils), so GI
 *                isn't defined and GL counts as 0 («не застосовується»).
 */
export type GiStatus = "measured" | "conventional" | "unknown" | "notApplicable";

export interface GiPart extends Provenance {
  status: GiStatus;
  value: number | null;
  /** Required for measured values; null for conventional/unknown. */
  source: SourceRef | null;
}

export interface VerifiedFoodEntry {
  /** Permanent built-in ID (B + 4 digits): never changed, never reused. */
  id: string;
  /** retired entries stay defined so old references still resolve. */
  status: "active" | "retired";
  replacedBy?: string;
  category: string;
  /** What the food is, across states — e.g. "buckwheat" for dry and boiled. */
  family: string;
  /**
   * A type within the family whose GI differs (developer, 2026-10-05: «different
   * entries with different types of rice… where GI has a ranged value depending
   * on subtype») — e.g. family "rice", variant "basmati". When USDA has no entry
   * for the type, its nutrients come from the closest one, with the reason.
   */
  variant?: string;
  state: FoodState;
  nameUk: string;
  nameEn: string;
  nutrients: NutrientsPart;
  gi: GiPart;
}

export const FOOD_STATES = ["raw", "dry", "boiled", "baked", "fried", "steamed", "canned", "dried", "fermented", "processed"] as const;
export type FoodState = (typeof FOOD_STATES)[number];

export interface DatasetInfo {
  name: string;
  /** Edition/release of the dataset the values were taken from. */
  version: string;
  citation: string;
  url: string;
}

export interface Category {
  id: string;
  nameUk: string;
  nameEn: string;
}

export interface VerifiedFoodsFile {
  formatVersion: 1;
  sources: Record<string, DatasetInfo>;
  categories: Category[];
  entries: VerifiedFoodEntry[];
}

const ID_PATTERN = /^B\d{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELIABILITY: readonly string[] = ["high", "medium", "low"];
/** Our own arithmetic (e.g. a porridge computed from the dry product) — needs no entry ID, but says how in `description`. */
export const CALCULATION_DATASET = "calculation";

function filled(text: unknown): boolean {
  return typeof text === "string" && text.trim() !== "";
}

/** Every rule a database file must meet. Returns readable problems; [] means the file is sound. `today` bounds verified dates. */
export function validateVerifiedFoods(file: VerifiedFoodsFile, today: string): string[] {
  const problems: string[] = [];
  const categoryIds = new Set(file.categories.map((c) => c.id));
  const ids = new Set<string>();
  const active = new Set(file.entries.filter((e) => e.status === "active").map((e) => e.id));

  for (const [key, info] of Object.entries(file.sources)) {
    if (!filled(info.name) || !filled(info.version) || !filled(info.citation)) problems.push(`source ${key}: name, version and citation are required`);
  }
  for (const c of file.categories) {
    if (!filled(c.id) || !filled(c.nameUk) || !filled(c.nameEn)) problems.push(`category ${c.id || "?"}: id and both names are required`);
  }

  const checkProvenance = (where: string, part: Provenance) => {
    if (!RELIABILITY.includes(part.reliability)) problems.push(`${where}: reliability must be high, medium or low`);
    if (!filled(part.reason?.uk) || !filled(part.reason?.en)) problems.push(`${where}: reason is required in Ukrainian and English`);
    if (!DATE_PATTERN.test(part.verified ?? "")) problems.push(`${where}: verified date must be YYYY-MM-DD`);
    else if (part.verified > today) problems.push(`${where}: verified date is in the future`);
  };

  const checkSource = (where: string, source: SourceRef | null | undefined) => {
    if (!source) {
      problems.push(`${where}: source is required`);
      return;
    }
    if (!file.sources[source.dataset]) problems.push(`${where}: unknown source dataset "${source.dataset}"`);
    if (source.dataset !== CALCULATION_DATASET && !filled(source.entryId)) problems.push(`${where}: source entry ID is required`);
    if (!filled(source.description)) problems.push(`${where}: source description is required`);
  };

  for (const e of file.entries) {
    const at = `${e.id || "?"}`;
    if (!ID_PATTERN.test(e.id)) problems.push(`${at}: ID must be B + 4 digits`);
    if (ids.has(e.id)) problems.push(`${at}: duplicate ID`);
    ids.add(e.id);
    if (e.status === "retired") {
      if (!e.replacedBy || !active.has(e.replacedBy)) problems.push(`${at}: a retired entry needs replacedBy pointing to an active entry`);
    } else if (e.status !== "active") {
      problems.push(`${at}: status must be active or retired`);
    }
    if (!categoryIds.has(e.category)) problems.push(`${at}: unknown category "${e.category}"`);
    if (!filled(e.family)) problems.push(`${at}: family is required`);
    if (e.variant !== undefined && !filled(e.variant)) problems.push(`${at}: variant, when given, must not be empty`);
    if (!(FOOD_STATES as readonly string[]).includes(e.state)) problems.push(`${at}: unknown state "${e.state}"`);
    if (!filled(e.nameUk) || !filled(e.nameEn)) problems.push(`${at}: Ukrainian and English names are required`);

    const n = e.nutrients;
    if (!n) {
      problems.push(`${at}: nutrients are required`);
    } else {
      for (const field of NUTRIENT_FIELDS) {
        const value = n.per100g?.[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) problems.push(`${at} nutrients: ${field} must be a number ≥ 0`);
      }
      for (const field of n.unknown ?? []) {
        if (!(NUTRIENT_FIELDS as readonly string[]).includes(field)) problems.push(`${at} nutrients: unknown field "${field}" in unknown`);
        else if (n.per100g?.[field] !== 0) problems.push(`${at} nutrients: ${field} is marked unknown, so it must hold 0`);
      }
      checkSource(`${at} nutrients`, n.source);
      checkProvenance(`${at} nutrients`, n);
    }

    const gi = e.gi;
    if (!gi) {
      problems.push(`${at}: gi is required (status unknown if there's no value)`);
    } else {
      if (gi.status === "measured") {
        if (typeof gi.value !== "number" || gi.value < 1 || gi.value > 120) problems.push(`${at} gi: a measured value must be a number from 1 to 120`);
        checkSource(`${at} gi`, gi.source);
      } else if (gi.status === "conventional") {
        if (typeof gi.value !== "number" || gi.value < 1 || gi.value > 120) problems.push(`${at} gi: a conventional value must be a number from 1 to 120`);
      } else if (gi.status === "unknown" || gi.status === "notApplicable") {
        if (gi.value !== null) problems.push(`${at} gi: an ${gi.status} GI must have value null`);
        if (gi.status === "notApplicable" && n && n.per100g.carbsG > 1) problems.push(`${at} gi: notApplicable is only for foods with at most 1 g carbohydrate per 100 g`);
      } else {
        problems.push(`${at} gi: status must be measured, conventional, unknown or notApplicable`);
      }
      checkProvenance(`${at} gi`, gi);
    }
  }
  return problems;
}
