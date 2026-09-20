// A plain arithmetic split of the remaining daily limits across the meals
// still to come — NOT medical advice. It only divides numbers the person
// already set in Settings; it knows nothing about what's appropriate for
// their health, and nothing here should be presented as if it did.
//
// Model: the day is planned as `mealsPerDay` meals, `snacksPerDay` of them
// snacks and the rest full meals. The person sets what share of each daily
// limit one FULL meal gets (Settings.fullMealSharePercent); a snack's share is
// then whatever is left, spread over the snacks:
//
//     snack % = (100 − full meal % × number of full meals) / number of snacks
//
// At the start of the day a full meal therefore gets exactly its configured
// share. As the day goes on, what's left of each limit (limit minus what's
// already eaten) is shared over the planned meals still to come in proportion
// to those shares — so eating less (or more) earlier shifts the rest of the
// day evenly rather than being ignored.
//
// Time left before bedtime does NOT change the numbers — an earlier version
// shrank the number of meals as the evening wore on, which crammed the whole
// day's untouched budget into one late meal (the full daily limit by ~21:30 on
// an empty day). It only flags (`fewerFitBeforeBedtime`) that the remaining
// planned meals no longer all fit before bedtime.
//
// About the default share (DEFAULT_SETTINGS.fullMealSharePercent = 25): there
// is no authoritative figure for a 3-meals-plus-3-snacks day. Clinical
// guidance (e.g. the ADA's) is to individualise it with a dietitian, and the
// commonly repeated "breakfast 25–30 %, lunch 30–35 %, dinner 25–30 %, snacks
// 5–10 % each" split could not be traced to a primary source when this was
// written. 25 % is a mid-range starting point consistent with those ranges (it
// leaves ~8 % per snack with 3 snacks) — a default to edit, not a recommendation.
import type { MealGroup, MealType } from "./dailyLog";
import type { Settings } from "./settings";

export type MealKind = "full" | "snack";

export function mealKindOf(mealType: MealType): MealKind {
  return mealType === "Перекус" ? "snack" : "full";
}

export interface MealShares {
  /** Share of a daily limit for one full meal (the setting, as given). */
  fullPercent: number;
  /**
   * Share for one snack, derived from what the full meals leave over — or
   * null when it can't be derived (no snacks, no full meals, or the full
   * meals alone already reach 100 %).
   */
  snackPercent: number | null;
}

export function mealShares(
  settings: Pick<Settings, "mealsPerDay" | "snacksPerDay" | "fullMealSharePercent">,
): MealShares {
  const mealsPerDay = Math.max(1, Math.round(settings.mealsPerDay));
  const snacks = Math.min(Math.max(0, Math.round(settings.snacksPerDay)), mealsPerDay);
  const full = mealsPerDay - snacks;
  const fullPercent = settings.fullMealSharePercent;
  const left = 100 - fullPercent * full;
  const snackPercent = snacks > 0 && full > 0 && left > 0 ? left / snacks : null;
  return { fullPercent, snackPercent };
}

/** True when the configured full-meal share leaves nothing for the snacks (or is out of range) — Settings rejects this. */
export function fullMealShareLeavesNoRoom(
  settings: Pick<Settings, "mealsPerDay" | "snacksPerDay" | "fullMealSharePercent">,
): boolean {
  const mealsPerDay = Math.max(1, Math.round(settings.mealsPerDay));
  const snacks = Math.min(Math.max(0, Math.round(settings.snacksPerDay)), mealsPerDay);
  const full = mealsPerDay - snacks;
  if (!(settings.fullMealSharePercent > 0) || settings.fullMealSharePercent > 100) return true;
  return snacks > 0 && full > 0 && settings.fullMealSharePercent * full >= 100;
}

export interface RecommendationInput {
  /** The reference time — for a meal being logged, the meal's own time. */
  now: Date;
  /** The kind of the meal being planned. */
  kind: MealKind;
  settings: Pick<
    Settings,
    | "dailyCaloriesTarget"
    | "dailyCarbsTarget"
    | "dailyGlycemicLoadTarget"
    | "fatPerMealLimit"
    | "mealsPerDay"
    | "snacksPerDay"
    | "fullMealSharePercent"
    | "wakeTime"
    | "sleepTime"
  >;
  /** Meals already eaten today, NOT counting the one being planned/edited. */
  eatenFullMeals: number;
  eatenSnacks: number;
  /** Totals of everything already eaten today (unknown values already excluded). */
  eaten: { caloriesKcal: number; carbsG: number; gl: number };
}

export interface MealRecommendation {
  caloriesKcal: number;
  carbsG: number;
  gl: number;
  /** A per-meal limit already, not a share of a daily one — passed through unchanged. */
  fatLimitG: number;
  /** How many planned meals (this one included) the remaining budget was shared across. */
  mealsSharing: number;
  /** The shares the split was based on (see mealShares). */
  shares: MealShares;
  /**
   * What's left of each daily limit BEFORE this meal (limit minus what's
   * already eaten) — unclamped, so a limit already exceeded is negative. The
   * meal editor subtracts the meal being composed to show what would remain.
   */
  dailyLeft: { caloriesKcal: number; carbsG: number; gl: number };
  /** True when, at the day's even spacing, fewer meals than that still fit before bedtime. */
  fewerFitBeforeBedtime: boolean;
  /** True once a daily limit is already used up — the share for it is 0, not negative. */
  overBudget: { caloriesKcal: boolean; carbsG: boolean; gl: boolean };
}

function parseMinutes(hhmm: string, fallback: number): number {
  // Accepts "6:30", "06:30", and the "6:30:00" a Sheets time cell reads back as.
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(hhmm.trim());
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Hours from `now` until the person's bedtime (Settings.sleepTime), and the
 * length of their waking day. A sleep time at or before the wake time (e.g.
 * "00:00") means bedtime is on the following day. Before waking time, the
 * whole waking day is still ahead.
 */
export function waking(now: Date, wakeTime: string, sleepTime: string): { hoursLeft: number; awakeHours: number } {
  const wake = parseMinutes(wakeTime, 6 * 60 + 30);
  let sleep = parseMinutes(sleepTime, 24 * 60);
  if (sleep <= wake) sleep += 24 * 60;

  let nowMin = now.getHours() * 60 + now.getMinutes();
  // Past midnight but still before a bedtime that's after midnight (e.g. 01:00 with sleep at 02:00).
  if (sleep > 24 * 60 && nowMin < sleep - 24 * 60) nowMin += 24 * 60;
  else if (nowMin < wake) nowMin = wake;

  return { hoursLeft: Math.max(0, (sleep - nowMin) / 60), awakeHours: (sleep - wake) / 60 };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function recommendMeal(input: RecommendationInput): MealRecommendation {
  const { now, kind, settings, eatenFullMeals, eatenSnacks, eaten } = input;

  const mealsPerDay = Math.max(1, Math.round(settings.mealsPerDay));
  const plannedSnacks = Math.min(Math.max(0, Math.round(settings.snacksPerDay)), mealsPerDay);
  const plannedFull = mealsPerDay - plannedSnacks;

  // What's still planned; the meal being recommended always counts, even if
  // the day's plan for its kind is already used up (the person is eating it).
  let full = Math.max(0, plannedFull - eatenFullMeals);
  let snacks = Math.max(0, plannedSnacks - eatenSnacks);
  if (kind === "full") full = Math.max(1, full);
  else snacks = Math.max(1, snacks);

  // How many meals fit before bedtime at the day's even spacing — informational only (see the header).
  const { hoursLeft, awakeHours } = waking(now, settings.wakeTime, settings.sleepTime);
  const spacingHours = awakeHours / mealsPerDay;
  const fitByTime = spacingHours > 0 ? Math.max(1, Math.floor(hoursLeft / spacingHours) + 1) : full + snacks;

  // A full meal weighs 1; a snack weighs its derived share relative to a full
  // meal's. When the snack share can't be derived, snacks weigh the same as
  // full meals (an even split) rather than inventing a ratio.
  const shares = mealShares(settings);
  const snackWeight = shares.snackPercent !== null && shares.fullPercent > 0 ? shares.snackPercent / shares.fullPercent : 1;
  const totalWeight = full + snacks * snackWeight;
  const share = (kind === "full" ? 1 : snackWeight) / totalWeight;

  const left = {
    caloriesKcal: settings.dailyCaloriesTarget - eaten.caloriesKcal,
    carbsG: settings.dailyCarbsTarget - eaten.carbsG,
    gl: settings.dailyGlycemicLoadTarget - eaten.gl,
  };

  return {
    caloriesKcal: round(Math.max(0, left.caloriesKcal) * share, 0),
    carbsG: round(Math.max(0, left.carbsG) * share, 0),
    gl: round(Math.max(0, left.gl) * share, 1),
    fatLimitG: settings.fatPerMealLimit,
    mealsSharing: full + snacks,
    shares,
    dailyLeft: left,
    fewerFitBeforeBedtime: fitByTime < full + snacks,
    overBudget: {
      caloriesKcal: left.caloriesKcal <= 0,
      carbsG: left.carbsG <= 0,
      gl: left.gl <= 0,
    },
  };
}

/** Counts meals by kind — for the "already eaten today" side of RecommendationInput. */
export function countMealsByKind(meals: Pick<MealGroup, "mealType">[]): { full: number; snacks: number } {
  let full = 0;
  let snacks = 0;
  for (const meal of meals) {
    if (mealKindOf(meal.mealType) === "snack") snacks++;
    else full++;
  }
  return { full, snacks };
}
