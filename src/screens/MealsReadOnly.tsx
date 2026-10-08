// Read-only meal lists (release 1.7): yesterday's meals on Сьогодні as a
// compact list (one line per meal: time, meal, totals) and each day's meals
// in Історія (with the dishes). Editing a meal only happens on Сьогодні.
import { uk } from "../i18n/uk";
import { formatTime } from "../lib/dateFormat";
import type { MealGroup } from "../lib/dailyLog";
import type { Settings } from "../lib/settings";
import MealStatsLine from "./MealStatsLine";

export function CompactMealsList({ meals, settings, title }: { meals: MealGroup[]; settings: Settings | null; title?: string }) {
  if (meals.length === 0) return null;
  return (
    <div className="meals-compact">
      {title && <p className="meals-compact-title">{title}</p>}
      <ul className="food-list">
        {meals.map((meal) => (
          <li key={meal.mealId} className="meal-compact-row">
            <span className="entry-time">{formatTime(meal.timestamp)}</span> · <strong>{meal.mealType}</strong>
            <MealStatsLine meal={meal} settings={settings} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MealsWithItems({ meals, settings }: { meals: MealGroup[]; settings: Settings | null }) {
  return (
    <>
      {meals.map((meal) => (
        <div key={meal.mealId} className="today-meal-group">
          <h3>
            {meal.mealType} <span className="entry-time">· {formatTime(meal.timestamp)}</span>
          </h3>
          <ul className="food-list">
            {meal.entries.map((entry, i) => (
              <li key={`${entry.timestamp}-${i}`}>
                <strong>{entry.itemName}</strong> — {uk.today.dishAmount(entry.unknownFields.includes("portionGrams") ? null : entry.portionGrams, entry.portionPieces)}
              </li>
            ))}
          </ul>
          <MealStatsLine meal={meal} settings={settings} />
        </div>
      ))}
    </>
  );
}
