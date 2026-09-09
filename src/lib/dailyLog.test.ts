import { describe, expect, it } from "vitest";
import type { IngredientNutrition } from "./dishes";
import {
  buildLogEntry,
  computePortionNutrition,
  isSameLocalDate,
  localDateKey,
  logEntryToRow,
  mealsBeforeTimestamp,
  rowToLogEntry,
  suggestMealType,
  type DailyLogEntry,
} from "./dailyLog";

const BUCKWHEAT_PER_100G: IngredientNutrition = {
  carbsG: 19.9,
  gi: 54,
  fiberG: 2.7,
  sugarsG: 0.9,
  proteinG: 3.4,
  fatG: 0.6,
  caloriesKcal: 92,
  sodiumMg: 4,
};

describe("computePortionNutrition", () => {
  it("scales per-100g values by portion size", () => {
    const result = computePortionNutrition(BUCKWHEAT_PER_100G, 150);
    expect(result.carbsG).toBeCloseTo(29.85, 2);
    expect(result.caloriesKcal).toBeCloseTo(138, 0);
  });

  it("leaves GI unscaled", () => {
    const result = computePortionNutrition(BUCKWHEAT_PER_100G, 50);
    expect(result.gi).toBe(54);
  });
});

describe("buildLogEntry", () => {
  it("computes GL from the scaled carbs and GI", () => {
    const entry = buildLogEntry("Обід", "Гречка варена", 200, BUCKWHEAT_PER_100G, "", "2026-08-13T12:00:00.000Z");
    // carbs for 200g = 39.8, GL = 54 * 39.8 / 100
    expect(entry.carbsG).toBeCloseTo(39.8, 1);
    expect(entry.gl).toBeCloseTo((54 * 39.8) / 100, 1);
    expect(entry.mealType).toBe("Обід");
    expect(entry.itemName).toBe("Гречка варена");
    expect(entry.portionGrams).toBe(200);
  });
});

describe("suggestMealType", () => {
  it("suggests breakfast in the morning", () => {
    expect(suggestMealType(new Date("2026-08-13T08:00:00"))).toBe("Сніданок");
  });
  it("suggests lunch midday", () => {
    expect(suggestMealType(new Date("2026-08-13T13:00:00"))).toBe("Обід");
  });
  it("suggests dinner in the evening", () => {
    expect(suggestMealType(new Date("2026-08-13T18:00:00"))).toBe("Вечеря");
  });
  it("suggests a snack late at night", () => {
    expect(suggestMealType(new Date("2026-08-13T22:00:00"))).toBe("Перекус");
  });
});

describe("isSameLocalDate / localDateKey", () => {
  it("matches a timestamp on the given date", () => {
    const key = localDateKey(new Date("2026-08-13T10:00:00"));
    expect(isSameLocalDate("2026-08-13T18:30:00.000Z".replace("Z", ""), key)).toBe(true);
  });

  it("does not match a timestamp on a different date", () => {
    expect(isSameLocalDate("2026-08-12T10:00:00", "2026-08-13")).toBe(false);
  });

  it("returns false for an unparseable timestamp", () => {
    expect(isSameLocalDate("not-a-date", "2026-08-13")).toBe(false);
  });
});

describe("rowToLogEntry / logEntryToRow", () => {
  it("round-trips through column order", () => {
    const entry: DailyLogEntry = {
      timestamp: "2026-08-13T12:00:00.000Z",
      mealType: "Обід",
      itemName: "Гречка варена",
      portionGrams: 200,
      carbsG: 39.8,
      gi: 54,
      fiberG: 5.4,
      sugarsG: 1.8,
      proteinG: 6.8,
      fatG: 1.2,
      caloriesKcal: 184,
      sodiumMg: 8,
      gl: 21.49,
      notes: "",
    };
    expect(rowToLogEntry(logEntryToRow(entry))).toEqual(entry);
  });

  it("defaults an unrecognized MealType to Перекус", () => {
    const row = ["2026-08-13T12:00:00.000Z", "Weird", "Тест", "10", "1", "1", "1", "1", "1", "1", "1", "1", "1", ""];
    expect(rowToLogEntry(row).mealType).toBe("Перекус");
  });
});

describe("mealsBeforeTimestamp", () => {
  const entryAt = (timestamp: string, itemName: string): DailyLogEntry => ({
    timestamp,
    mealType: "Перекус",
    itemName,
    portionGrams: 100,
    carbsG: 0,
    gi: 0,
    fiberG: 0,
    sugarsG: 0,
    proteinG: 0,
    fatG: 0,
    caloriesKcal: 0,
    sodiumMg: 0,
    gl: 0,
    notes: "",
  });

  const entries: DailyLogEntry[] = [
    entryAt("2026-08-13T07:00:00.000Z", "Сніданок"),
    entryAt("2026-08-13T09:00:00.000Z", "Перекус 1"),
    entryAt("2026-08-13T12:00:00.000Z", "Обід"),
    entryAt("2026-08-13T15:00:00.000Z", "Після вимірювання"),
  ];

  it("returns entries at or before the given timestamp, most-recent-first", () => {
    const result = mealsBeforeTimestamp(entries, "2026-08-13T12:00:00.000Z");
    expect(result.map((e) => e.itemName)).toEqual(["Обід", "Перекус 1", "Сніданок"]);
  });

  it("excludes entries after the given timestamp", () => {
    const result = mealsBeforeTimestamp(entries, "2026-08-13T10:00:00.000Z");
    expect(result.map((e) => e.itemName)).toEqual(["Перекус 1", "Сніданок"]);
  });

  it("caps the result at the given limit", () => {
    const result = mealsBeforeTimestamp(entries, "2026-08-13T12:00:00.000Z", 2);
    expect(result.map((e) => e.itemName)).toEqual(["Обід", "Перекус 1"]);
  });

  it("returns an empty list when nothing precedes the timestamp", () => {
    expect(mealsBeforeTimestamp(entries, "2026-08-13T00:00:00.000Z")).toEqual([]);
  });
});
