import { describe, expect, it } from "vitest";
import type { IngredientNutrition } from "./dishes";
import {
  buildCustomLogEntry,
  buildLogEntry,
  computePortionNutrition,
  groupIntoMeals,
  isSameLocalDate,
  localDateKey,
  logEntryToRow,
  mealsBeforeTimestamp,
  recentDayGroups,
  rowToLogEntry,
  suggestMealType,
  sumKnownField,
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
    const entry = buildLogEntry(
      "Обід",
      "Гречка варена",
      200,
      BUCKWHEAT_PER_100G,
      "",
      "meal-1",
      "2026-08-13T12:00:00.000Z",
    );
    // carbs for 200g = 39.8, GL = 54 * 39.8 / 100
    expect(entry.carbsG).toBeCloseTo(39.8, 1);
    expect(entry.gl).toBeCloseTo((54 * 39.8) / 100, 1);
    expect(entry.mealType).toBe("Обід");
    expect(entry.itemName).toBe("Гречка варена");
    expect(entry.portionGrams).toBe(200);
    expect(entry.mealId).toBe("meal-1");
    expect(entry.unknownFields).toEqual([]);
  });
});

describe("buildCustomLogEntry", () => {
  it("stores every provided field and marks nothing unknown when all are given", () => {
    const entry = buildCustomLogEntry(
      "Обід",
      "Борщ у ресторані",
      350,
      { carbsG: 30, gi: 40, fiberG: 3, sugarsG: 5, proteinG: 8, fatG: 10, caloriesKcal: 250, sodiumMg: 600 },
      "",
      "meal-1",
      "2026-09-11T12:00:00.000Z",
    );
    expect(entry.carbsG).toBe(30);
    expect(entry.caloriesKcal).toBe(250);
    expect(entry.unknownFields).toEqual([]);
    expect(entry.gl).toBeCloseTo((40 * 30) / 100, 5);
  });

  it("marks a field unknown (stored as 0) when it's left out of values", () => {
    const entry = buildCustomLogEntry(
      "Обід",
      "Обід у кафе",
      300,
      { carbsG: 25, gi: 50 }, // caloriesKcal, fatG, etc. not supplied
      "",
      "meal-1",
    );
    expect(entry.caloriesKcal).toBe(0);
    expect(entry.unknownFields).toContain("caloriesKcal");
    expect(entry.unknownFields).toContain("fatG");
    expect(entry.unknownFields).not.toContain("carbsG");
    expect(entry.unknownFields).not.toContain("gi");
  });

  it("marks GL unknown when carbs is unknown, even if GI is known", () => {
    const entry = buildCustomLogEntry("Обід", "Страва", 200, { gi: 50 }, "", "meal-1");
    expect(entry.unknownFields).toContain("carbsG");
    expect(entry.unknownFields).toContain("gl");
    expect(entry.gl).toBe(0);
  });

  it("marks GL unknown when GI is unknown, even if carbs is known", () => {
    const entry = buildCustomLogEntry("Обід", "Страва", 200, { carbsG: 40 }, "", "meal-1");
    expect(entry.unknownFields).toContain("gi");
    expect(entry.unknownFields).toContain("gl");
    expect(entry.gl).toBe(0);
  });

  it("computes GL normally when both GI and carbs are known, regardless of other unknowns", () => {
    const entry = buildCustomLogEntry("Обід", "Страва", 200, { carbsG: 40, gi: 60 }, "", "meal-1");
    expect(entry.unknownFields).not.toContain("gl");
    expect(entry.gl).toBeCloseTo((60 * 40) / 100, 5);
  });
});

describe("sumKnownField", () => {
  const entry = (caloriesKcal: number, unknownFields: DailyLogEntry["unknownFields"] = []): DailyLogEntry => ({
    timestamp: "2026-09-11T12:00:00.000Z",
    mealType: "Обід",
    itemName: "Тест",
    portionGrams: 100,
    carbsG: 10,
    gi: 50,
    fiberG: 0,
    sugarsG: 0,
    proteinG: 0,
    fatG: 0,
    caloriesKcal,
    sodiumMg: 0,
    gl: 5,
    notes: "",
    mealId: "m1",
    unknownFields,
  });

  it("sums a field normally when nothing is unknown", () => {
    expect(sumKnownField([entry(100), entry(200)], "caloriesKcal")).toEqual({ total: 300, unknownCount: 0 });
  });

  it("excludes entries where that specific field is unknown, and counts them", () => {
    const entries = [entry(100), entry(999, ["caloriesKcal"]), entry(200)];
    expect(sumKnownField(entries, "caloriesKcal")).toEqual({ total: 300, unknownCount: 1 });
  });

  it("only excludes the field actually marked unknown, not the whole entry", () => {
    // carbsG is known even though caloriesKcal on this entry is unknown.
    const entries = [entry(100, ["caloriesKcal"])];
    expect(sumKnownField(entries, "carbsG")).toEqual({ total: 10, unknownCount: 0 });
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
      mealId: "2026-08-13T12:00:00.000Z",
      unknownFields: [],
    };
    expect(rowToLogEntry(logEntryToRow(entry))).toEqual(entry);
  });

  it("defaults an unrecognized MealType to Перекус", () => {
    const row = ["2026-08-13T12:00:00.000Z", "Weird", "Тест", "10", "1", "1", "1", "1", "1", "1", "1", "1", "1", ""];
    expect(rowToLogEntry(row).mealType).toBe("Перекус");
  });

  it("falls back MealId to the row's own timestamp when the column is blank (rows logged before MealId existed)", () => {
    const row = ["2026-08-13T12:00:00.000Z", "Обід", "Тест", "10", "1", "1", "1", "1", "1", "1", "1", "1", "1", ""];
    expect(rowToLogEntry(row).mealId).toBe("2026-08-13T12:00:00.000Z");
  });

  it("defaults UnknownFields to an empty array for a row logged before it existed", () => {
    const row = ["2026-08-13T12:00:00.000Z", "Обід", "Тест", "10", "1", "1", "1", "1", "1", "1", "1", "1", "1", ""];
    expect(rowToLogEntry(row).unknownFields).toEqual([]);
  });

  it("round-trips UnknownFields through logEntryToRow", () => {
    const entry = buildCustomLogEntry("Обід", "Ресторанна страва", 300, { carbsG: 30 }, "", "meal-1", "2026-09-11T12:00:00.000Z");
    expect(rowToLogEntry(logEntryToRow(entry)).unknownFields.sort()).toEqual([...entry.unknownFields].sort());
  });
});

describe("groupIntoMeals", () => {
  const item = (mealId: string, timestamp: string, itemName: string, carbsG = 10, caloriesKcal = 50): DailyLogEntry => ({
    timestamp,
    mealType: "Обід",
    itemName,
    portionGrams: 100,
    carbsG,
    gi: 50,
    fiberG: 0,
    sugarsG: 0,
    proteinG: 0,
    fatG: 0,
    caloriesKcal,
    sodiumMg: 0,
    gl: carbsG * 0.5,
    notes: "",
    mealId,
    unknownFields: [],
  });

  it("groups several items sharing a mealId into one meal with summed totals", () => {
    const entries = [
      item("lunch-1", "2026-08-13T12:00:00.000Z", "Гречка", 20, 90),
      item("lunch-1", "2026-08-13T12:01:00.000Z", "Курка", 0, 165),
      item("lunch-1", "2026-08-13T12:02:00.000Z", "Салат", 5, 25),
    ];
    const groups = groupIntoMeals(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
    expect(groups[0].totals.carbsG).toBeCloseTo(25, 5);
    expect(groups[0].totals.caloriesKcal).toBeCloseTo(280, 5);
  });

  it("keeps meals with different mealIds separate even when the mealType is identical", () => {
    // Mirrors the real scenario: a snack after breakfast and a snack after
    // lunch both carry mealType "Перекус" but are different occasions.
    const entries = [
      item("snack-1", "2026-08-13T10:00:00.000Z", "Яблуко"),
      item("snack-2", "2026-08-13T15:00:00.000Z", "Горіхи"),
    ];
    const groups = groupIntoMeals(entries);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.entries[0].itemName).sort()).toEqual(["Горіхи", "Яблуко"]);
  });

  it("uses the earliest item's timestamp and mealType for the group", () => {
    const entries = [
      item("lunch-1", "2026-08-13T12:05:00.000Z", "Другий"),
      item("lunch-1", "2026-08-13T12:00:00.000Z", "Перший"),
    ];
    const [group] = groupIntoMeals(entries);
    expect(group.timestamp).toBe("2026-08-13T12:00:00.000Z");
    expect(group.entries.map((e) => e.itemName)).toEqual(["Перший", "Другий"]);
  });

  it("is false when no item in the meal has an unknown value", () => {
    const entries = [item("lunch-1", "2026-08-13T12:00:00.000Z", "Гречка")];
    expect(groupIntoMeals(entries)[0].hasUnknownValues).toBe(false);
  });

  it("flags hasUnknownValues and excludes the unknown field from the meal total, without affecting other items' contribution", () => {
    const known = item("lunch-1", "2026-08-13T12:00:00.000Z", "Гречка", 20, 90);
    const customWithUnknownCalories = { ...item("lunch-1", "2026-08-13T12:01:00.000Z", "Ресторанна страва", 15, 999), unknownFields: ["caloriesKcal" as const] };
    const groups = groupIntoMeals([known, customWithUnknownCalories]);
    expect(groups[0].hasUnknownValues).toBe(true);
    // caloriesKcal total should only include the known item's 90, not the unknown entry's stored 999.
    expect(groups[0].totals.caloriesKcal).toBe(90);
    // carbsG is known on both, so it sums normally regardless of the calories gap.
    expect(groups[0].totals.carbsG).toBe(35);
  });
});

describe("mealsBeforeTimestamp", () => {
  const item = (mealId: string, timestamp: string, itemName: string): DailyLogEntry => ({
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
    mealId,
    unknownFields: [],
  });

  const entries: DailyLogEntry[] = [
    item("breakfast", "2026-08-13T07:00:00.000Z", "Сніданок"),
    item("snack-1", "2026-08-13T09:00:00.000Z", "Перекус 1"),
    item("lunch", "2026-08-13T12:00:00.000Z", "Обід"),
    item("after-reading", "2026-08-13T15:00:00.000Z", "Після вимірювання"),
  ];

  it("returns meal occasions at or before the given timestamp, most-recent-first", () => {
    const result = mealsBeforeTimestamp(entries, "2026-08-13T12:00:00.000Z");
    expect(result.map((m) => m.entries[0].itemName)).toEqual(["Обід", "Перекус 1", "Сніданок"]);
  });

  it("excludes meals after the given timestamp", () => {
    const result = mealsBeforeTimestamp(entries, "2026-08-13T10:00:00.000Z");
    expect(result.map((m) => m.entries[0].itemName)).toEqual(["Перекус 1", "Сніданок"]);
  });

  it("caps the result at the given limit, counting MEALS not individual items", () => {
    // The real bug this fixes: a single multi-dish meal used to eat up the
    // whole limit on its own, since each dish was counted as a separate
    // "meal" — a 6-item lunch would fill limit=6 by itself.
    const multiDishLunch = [
      item("lunch", "2026-08-13T12:00:00.000Z", "Гречка"),
      item("lunch", "2026-08-13T12:01:00.000Z", "Курка"),
      item("lunch", "2026-08-13T12:02:00.000Z", "Салат"),
    ];
    const withMultiDishLunch = [entries[0], entries[1], ...multiDishLunch];
    const result = mealsBeforeTimestamp(withMultiDishLunch, "2026-08-13T12:02:00.000Z", 2);
    expect(result).toHaveLength(2);
    expect(result[0].entries.map((e) => e.itemName)).toEqual(["Гречка", "Курка", "Салат"]);
    expect(result[1].entries[0].itemName).toBe("Перекус 1");
  });

  it("returns an empty list when nothing precedes the timestamp", () => {
    expect(mealsBeforeTimestamp(entries, "2026-08-13T00:00:00.000Z")).toEqual([]);
  });
});

describe("recentDayGroups", () => {
  const day = (y: number, m: number, d: number, h = 12): Date => new Date(y, m - 1, d, h);
  const entryAt = (date: Date, itemName: string): DailyLogEntry => ({
    timestamp: date.toISOString(),
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
    mealId: date.toISOString(),
    unknownFields: [],
  });

  it("groups the previous N days, excluding today, most-recent-day-first", () => {
    const today = day(2026, 9, 10);
    const entries = [
      entryAt(day(2026, 9, 10, 8), "today's breakfast"),
      entryAt(day(2026, 9, 9, 9), "yesterday breakfast"),
      entryAt(day(2026, 9, 9, 18), "yesterday dinner"),
      entryAt(day(2026, 9, 7, 8), "3 days ago"),
      entryAt(day(2026, 9, 5, 8), "too old, outside the 3-day window"),
    ];

    const result = recentDayGroups(entries, today, 3);

    expect(result.map((g) => g.dateKey)).toEqual(["2026-09-09", "2026-09-07"]);
    expect(result[0].entries.map((e) => e.itemName)).toEqual(["yesterday dinner", "yesterday breakfast"]);
    expect(result[1].entries.map((e) => e.itemName)).toEqual(["3 days ago"]);
  });

  it("returns an empty array when there's no history in the window", () => {
    expect(recentDayGroups([], day(2026, 9, 10), 3)).toEqual([]);
  });
});
