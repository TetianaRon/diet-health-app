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
