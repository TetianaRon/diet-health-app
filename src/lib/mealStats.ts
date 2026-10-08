// Which stats to show for one meal or one dish — the same ones the person
// picked for the Today screen's daily status (Settings.show* toggles), plus
// the weight, which has no daily counterpart. Pure and framework-free:
// returns structured values, the screen formats them with the uk.ts strings.
import type { DailyLogEntry, MealGroup } from "./dailyLog";
import type { Settings } from "./settings";

export type MealStatKey = "weight" | "carbs" | "calories" | "gl" | "fat" | "sugars" | "protein" | "sodium";

export interface MealStat {
  key: MealStatKey;
  // null = unknown (a dish whose value was left blank) — shown as "невідомо",
  // never as a number. A meal total is never null: unknown items are already
  // excluded from the sum (see sumKnownField), with a separate caveat.
  value: number | null;
}

type StatToggles = Pick<
  Settings,
  | "showCarbsProgress"
  | "showCaloriesProgress"
  | "showGlycemicLoadProgress"
  | "showFatTotal"
  | "showSugarsTotal"
  | "showProteinTotal"
  | "showSodiumTotal"
>;

// Same order the daily status shows them: carbs, calories, GL, then the
// plain-total stats.
const STATS: { key: Exclude<MealStatKey, "weight">; toggle: keyof StatToggles }[] = [
  { key: "carbs", toggle: "showCarbsProgress" },
  { key: "calories", toggle: "showCaloriesProgress" },
  { key: "gl", toggle: "showGlycemicLoadProgress" },
  { key: "fat", toggle: "showFatTotal" },
  { key: "sugars", toggle: "showSugarsTotal" },
  { key: "protein", toggle: "showProteinTotal" },
  { key: "sodium", toggle: "showSodiumTotal" },
];

/**
 * Weight always comes first; the rest mirror the daily status. With no
 * settings loaded yet, only the weight is shown — never a guess at which
 * stats were wanted.
 */
export function mealStatItems(meal: MealGroup, settings: StatToggles | null): MealStat[] {
  const { totals } = meal;
  const values: Record<Exclude<MealStatKey, "weight">, number> = {
    carbs: totals.carbsG,
    calories: totals.caloriesKcal,
    gl: totals.gl,
    fat: totals.fatG,
    sugars: totals.sugarsG,
    protein: totals.proteinG,
    sodium: totals.sodiumMg,
  };
  const stats: MealStat[] = [{ key: "weight", value: Math.round(meal.totalGrams) }];
  if (!settings) return stats;
  for (const { key, toggle } of STATS) if (settings[toggle]) stats.push({ key, value: Math.round(values[key]) });
  return stats;
}

/** The same stats for a single dish (one log entry) — a stat the dish has unknown comes back as null, not 0. */
export function entryStatItems(entry: DailyLogEntry, settings: StatToggles | null): MealStat[] {
  const fields: Record<Exclude<MealStatKey, "weight">, { value: number; unknown: boolean }> = {
    carbs: { value: entry.carbsG, unknown: entry.unknownFields.includes("carbsG") },
    calories: { value: entry.caloriesKcal, unknown: entry.unknownFields.includes("caloriesKcal") },
    gl: { value: entry.gl, unknown: entry.unknownFields.includes("gl") },
    fat: { value: entry.fatG, unknown: entry.unknownFields.includes("fatG") },
    sugars: { value: entry.sugarsG, unknown: entry.unknownFields.includes("sugarsG") },
    protein: { value: entry.proteinG, unknown: entry.unknownFields.includes("proteinG") },
    sodium: { value: entry.sodiumMg, unknown: entry.unknownFields.includes("sodiumMg") },
  };
  const weightUnknown = entry.unknownFields.includes("portionGrams");
  const stats: MealStat[] = [{ key: "weight", value: weightUnknown ? null : Math.round(entry.portionGrams * 10) / 10 }];
  if (!settings) return stats;
  for (const { key, toggle } of STATS) {
    if (settings[toggle]) stats.push({ key, value: fields[key].unknown ? null : Math.round(fields[key].value) });
  }
  return stats;
}
