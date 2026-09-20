import { uk } from "../i18n/uk";
import type { MealGroup } from "../lib/dailyLog";
import { mealStatItems, type MealStat } from "../lib/mealStats";
import type { Settings } from "../lib/settings";

function formatValue({ key, value }: MealStat & { value: number }): string {
  switch (key) {
    case "weight":
      return uk.today.mealStat.weight(value);
    case "carbs":
      return uk.today.mealStat.carbs(value);
    case "calories":
      return uk.today.mealStat.calories(value);
    case "gl":
      return uk.today.mealStat.gl(value);
    case "fat":
      return uk.today.mealStat.fat(value);
    case "sugars":
      return uk.today.mealStat.sugars(value);
    case "protein":
      return uk.today.mealStat.protein(value);
    case "sodium":
      return uk.today.mealStat.sodium(value);
  }
}

/** "Вага: 320 г · Калорії: 370 ккал" — a stat with no known value reads "Калорії: невідомо", never 0. */
export function formatStats(stats: MealStat[]): string {
  return stats
    .map((stat) =>
      stat.value === null
        ? `${uk.today.mealStatLabel[stat.key]}: ${uk.today.unknownValueLabel}`
        : formatValue({ ...stat, value: stat.value }),
    )
    .join(" · ");
}

// One meal's totals, showing exactly the stats the daily status shows (the
// Settings show* toggles) plus the meal's weight — the same line on Today, in
// history, and in the meal editor's running total, so they can never drift
// apart. Unknown values are already excluded from the totals (see
// sumKnownField); hasUnknownValues is just the visible caveat.
export default function MealStatsLine({ meal, settings }: { meal: MealGroup; settings: Settings | null }) {
  return (
    <p className="today-meal-total">
      {formatStats(mealStatItems(meal, settings))}
      {meal.hasUnknownValues && ` ${uk.today.mealHasUnknownSuffix}`}
    </p>
  );
}
