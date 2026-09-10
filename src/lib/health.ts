// Pure health-math functions. Framework-free and unit-tested — see health.test.ts.

/** Glycemic Load for a portion: GI × carbs in that portion / 100. */
export function calcGlycemicLoad(gi: number, carbsInPortionGrams: number): number {
  return (gi * carbsInPortionGrams) / 100;
}

export interface FatLimitCheck {
  exceeded: boolean;
  overByGrams: number;
}

/** Per-meal fat check — relevant because there's no gallbladder to buffer fat digestion. */
export function checkFatLimit(fatGrams: number, limitGrams: number): FatLimitCheck {
  const overByGrams = Math.max(0, fatGrams - limitGrams);
  return { exceeded: overByGrams > 0, overByGrams };
}

export interface MealGapWarning {
  hoursSinceLastMeal: number;
  shouldWarn: boolean;
}

/** Gastritis requires eating every 2.5–3 hrs; warn as the gap approaches the max. */
export function mealGapWarning(lastMealTime: Date, now: Date, maxGapHours: number): MealGapWarning {
  const hoursSinceLastMeal = (now.getTime() - lastMealTime.getTime()) / (1000 * 60 * 60);
  return { hoursSinceLastMeal, shouldWarn: hoursSinceLastMeal >= maxGapHours };
}

export interface BloodSugarRangeCheck {
  tooLow: boolean;
  tooHigh: boolean;
  inRange: boolean;
}

/** Checks a blood sugar reading (mmol/L) against the Settings target range. */
export function checkBloodSugarRange(valueMmolL: number, minMmolL: number, maxMmolL: number): BloodSugarRangeCheck {
  const tooLow = valueMmolL < minMmolL;
  const tooHigh = valueMmolL > maxMmolL;
  return { tooLow, tooHigh, inRange: !tooLow && !tooHigh };
}

export type GiCategory = "low" | "medium" | "high";
export type GlCategory = "low" | "moderate" | "high";

/**
 * Standard per-food GI classification bands (0-55 low, 56-69 medium, 70+
 * high) — distinct from Settings.dailyGlycemicLoadTarget, which is a *daily
 * total*, not a per-item band. Matches the table in mom's own old
 * spreadsheet (tab "норми ГІ та ГН", sourced from prodiabet.ua).
 */
export function classifyGi(gi: number): GiCategory {
  if (gi <= 55) return "low";
  if (gi <= 69) return "medium";
  return "high";
}

/**
 * Standard per-portion GL classification bands (0-10 low, 11-19 moderate,
 * 20+ high) — same source as classifyGi above, also per-item, not a daily
 * total.
 */
export function classifyGl(gl: number): GlCategory {
  if (gl <= 10) return "low";
  if (gl <= 19) return "moderate";
  return "high";
}
