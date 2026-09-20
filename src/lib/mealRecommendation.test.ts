import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  countMealsByKind,
  fullMealShareLeavesNoRoom,
  mealKindOf,
  mealShares,
  recommendMeal,
  waking,
  type RecommendationInput,
} from "./mealRecommendation";

// 06:30 -> 24:00 is a 17.5h waking day; 6 meals (3 full + 3 snacks) => 2.92h spacing.
// Full meal = 25 % of each daily limit (default), so each snack = (100 - 3 x 25) / 3 = 8.33 %.
const settings = { ...DEFAULT_SETTINGS, dailyCaloriesTarget: 1800, dailyCarbsTarget: 140, dailyGlycemicLoadTarget: 80 };
const at = (h: number, m = 0) => new Date(2026, 8, 20, h, m);
const base = (over: Partial<RecommendationInput> = {}): RecommendationInput => ({
  now: at(7),
  kind: "full",
  settings,
  eatenFullMeals: 0,
  eatenSnacks: 0,
  eaten: { caloriesKcal: 0, carbsG: 0, gl: 0 },
  ...over,
});

describe("waking", () => {
  it("treats a sleep time of 00:00 as the end of the same waking day", () => {
    expect(waking(at(12), "06:30", "00:00")).toEqual({ hoursLeft: 12, awakeHours: 17.5 });
  });

  it("counts the whole waking day as still ahead before wake time", () => {
    expect(waking(at(5), "06:30", "00:00").hoursLeft).toBe(17.5);
  });

  it("has no time left after bedtime", () => {
    expect(waking(at(23, 59), "06:30", "22:00").hoursLeft).toBe(0);
  });

  it("handles a bedtime after midnight", () => {
    expect(waking(new Date(2026, 8, 21, 1, 0), "07:00", "02:00").hoursLeft).toBe(1);
  });
});

describe("mealKindOf / countMealsByKind", () => {
  it("treats Перекус as a snack and everything else as a full meal", () => {
    expect(mealKindOf("Перекус")).toBe("snack");
    expect(mealKindOf("Сніданок")).toBe("full");
    expect(countMealsByKind([{ mealType: "Обід" }, { mealType: "Перекус" }, { mealType: "Перекус" }])).toEqual({
      full: 1,
      snacks: 2,
    });
  });
});

describe("mealShares", () => {
  it("derives the snack share from what the full meals leave over", () => {
    const shares = mealShares({ mealsPerDay: 6, snacksPerDay: 3, fullMealSharePercent: 25 });
    expect(shares.fullPercent).toBe(25);
    expect(shares.snackPercent).toBeCloseTo((100 - 3 * 25) / 3, 10);
  });

  it("follows the formula for other splits", () => {
    // 3 full at 30 % leave 10 % over 2 snacks.
    expect(mealShares({ mealsPerDay: 5, snacksPerDay: 2, fullMealSharePercent: 30 }).snackPercent).toBeCloseTo(5, 10);
  });

  it("has no snack share when it can't be derived", () => {
    expect(mealShares({ mealsPerDay: 3, snacksPerDay: 0, fullMealSharePercent: 30 }).snackPercent).toBeNull();
    expect(mealShares({ mealsPerDay: 3, snacksPerDay: 3, fullMealSharePercent: 30 }).snackPercent).toBeNull();
    expect(mealShares({ mealsPerDay: 6, snacksPerDay: 3, fullMealSharePercent: 40 }).snackPercent).toBeNull();
  });
});

describe("fullMealShareLeavesNoRoom", () => {
  const s = { mealsPerDay: 6, snacksPerDay: 3 };
  it("accepts a share that leaves room for the snacks", () => {
    expect(fullMealShareLeavesNoRoom({ ...s, fullMealSharePercent: 25 })).toBe(false);
  });
  it("rejects full meals that reach or pass 100 %, and out-of-range values", () => {
    expect(fullMealShareLeavesNoRoom({ ...s, fullMealSharePercent: 100 / 3 })).toBe(true);
    expect(fullMealShareLeavesNoRoom({ ...s, fullMealSharePercent: 40 })).toBe(true);
    expect(fullMealShareLeavesNoRoom({ ...s, fullMealSharePercent: 0 })).toBe(true);
    expect(fullMealShareLeavesNoRoom({ ...s, fullMealSharePercent: -5 })).toBe(true);
  });
  it("doesn't care about the share exceeding 100 / meals when there are no snacks to leave room for", () => {
    expect(fullMealShareLeavesNoRoom({ mealsPerDay: 3, snacksPerDay: 0, fullMealSharePercent: 40 })).toBe(false);
  });
});

describe("recommendMeal", () => {
  it("gives a full meal exactly its configured share of the day at the start of the day", () => {
    const rec = recommendMeal(base());
    expect(rec.caloriesKcal).toBe(450); // 25 % of 1800
    expect(rec.carbsG).toBe(35); // 25 % of 140
    expect(rec.gl).toBe(20); // 25 % of 80
    expect(rec.mealsSharing).toBe(6);
  });

  it("gives a snack the derived share of the day at the start of the day", () => {
    const rec = recommendMeal(base({ kind: "snack" }));
    expect(rec.caloriesKcal).toBe(150); // 8.33 % of 1800
    expect(rec.carbsG).toBe(Math.round(140 / 12));
  });

  it("makes the whole day add up: full meals plus snacks use exactly the daily limit", () => {
    const full = recommendMeal(base({ kind: "full" })).caloriesKcal;
    const snack = recommendMeal(base({ kind: "snack" })).caloriesKcal;
    expect(3 * full + 3 * snack).toBe(1800);
  });

  it("changes a snack's size when the full-meal share is edited", () => {
    const rec = recommendMeal(base({ kind: "snack", settings: { ...settings, fullMealSharePercent: 30 } }));
    expect(rec.caloriesKcal).toBe(60); // 3 full meals at 30 % leave 10 %, i.e. 3.33 % per snack = 60 of 1800
  });

  it("shares only what is left of a limit, in proportion to the remaining meals' shares", () => {
    // After breakfast (500 kcal): 1300 left over 2 full (1 each) + 3 snacks (1/3 each) = 3 weight units.
    const rec = recommendMeal(base({ now: at(12), eatenFullMeals: 1, eaten: { caloriesKcal: 500, carbsG: 0, gl: 0 } }));
    expect(rec.caloriesKcal).toBe(Math.round(1300 / 3));
    expect(rec.mealsSharing).toBe(5);
  });

  it("does not cram the day's budget into a late meal when nothing has been eaten yet", () => {
    // Regression: an earlier version shrank the meal count as bedtime neared,
    // so an empty day at 21:30 recommended the entire 1800 kcal in one meal.
    const morning = recommendMeal(base({ now: at(8) }));
    const lateEvening = recommendMeal(base({ now: at(22, 30) }));
    expect(lateEvening.caloriesKcal).toBe(morning.caloriesKcal);
    expect(lateEvening.caloriesKcal).toBeLessThan(1800 / 2);
    expect(lateEvening.mealsSharing).toBe(6);
  });

  it("flags, without changing the numbers, that fewer meals fit before bedtime", () => {
    expect(recommendMeal(base({ now: at(8) })).fewerFitBeforeBedtime).toBe(false);
    const late = recommendMeal(base({ now: at(21, 30) }));
    expect(late.fewerFitBeforeBedtime).toBe(true);
    expect(late.caloriesKcal).toBe(450);
  });

  it("copes with a wake/sleep time read back from a sheet as H:MM:SS", () => {
    const rec = recommendMeal(base({ now: at(21, 30), settings: { ...settings, wakeTime: "6:30:00", sleepTime: "0:00:00" } }));
    expect(rec.fewerFitBeforeBedtime).toBe(true);
  });

  it("still counts the meal being planned when the day's plan for its kind is used up", () => {
    const rec = recommendMeal(
      base({ now: at(12), eatenFullMeals: 3, eatenSnacks: 3, eaten: { caloriesKcal: 1700, carbsG: 0, gl: 0 } }),
    );
    expect(rec.mealsSharing).toBe(1);
    expect(rec.caloriesKcal).toBe(100);
  });

  it("reports what's left of each daily limit before this meal, unclamped", () => {
    const rec = recommendMeal(base({ eaten: { caloriesKcal: 1200, carbsG: 150, gl: 30 } }));
    expect(rec.dailyLeft).toEqual({ caloriesKcal: 600, carbsG: -10, gl: 50 });
  });

  it("never recommends a negative amount, and flags a limit that is already used up", () => {
    const rec = recommendMeal(base({ eaten: { caloriesKcal: 2000, carbsG: 0, gl: 0 } }));
    expect(rec.caloriesKcal).toBe(0);
    expect(rec.dailyLeft.caloriesKcal).toBe(-200);
    expect(rec.overBudget.caloriesKcal).toBe(true);
    expect(rec.overBudget.carbsG).toBe(false);
  });

  it("passes the per-meal fat limit through unchanged rather than dividing it", () => {
    expect(recommendMeal(base()).fatLimitG).toBe(DEFAULT_SETTINGS.fatPerMealLimit);
  });

  it("splits evenly when the snack share can't be derived, rather than inventing a ratio", () => {
    const rec = recommendMeal(base({ settings: { ...settings, mealsPerDay: 4, snacksPerDay: 9 }, kind: "snack" }));
    expect(rec.shares.snackPercent).toBeNull();
    expect(rec.mealsSharing).toBeLessThanOrEqual(4);
    expect(rec.caloriesKcal).toBe(450); // 1800 over 4 equal meals
  });
});
