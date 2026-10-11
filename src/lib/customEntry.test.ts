import { describe, expect, it } from "vitest";
import { checkCustom, customLogEntry, isRecentId, recentCustomFoods, type CustomInput } from "./customEntry";
import type { DailyLogEntry } from "./dailyLog";
import type { NutritionKey } from "./dishes";

const none: Record<NutritionKey, number | null> = { caloriesKcal: null, carbsG: null, fatG: null, proteinG: null, fiberG: null, sugarsG: null, sodiumMg: null, gi: null };
const input = (over: Partial<CustomInput> = {}): CustomInput => ({
  name: "Гарячий шоколад Tim Hortons",
  basis: "portion",
  grams: null,
  ml: 296,
  pieces: null,
  values: { ...none, caloriesKcal: 240, carbsG: 41 },
  ...over,
});

describe("checkCustom", () => {
  it("takes a whole portion with no weight", () => {
    expect(checkCustom(input())).toEqual({});
  });

  it("names each field that stops saving", () => {
    expect(checkCustom(input({ name: " " })).name).toBe("missing");
    expect(checkCustom(input({ values: { ...none } })).values).toBe("needOneValue");
    expect(checkCustom(input({ values: { ...none, fatG: NaN } })).fatG).toBe("notNumber");
    expect(checkCustom(input({ grams: 0 })).grams).toBe("notNumber");
  });

  it("needs the amount in the values' unit when they're per 100 g or 100 ml", () => {
    expect(checkCustom(input({ basis: "100g" })).grams).toBe("needAmount");
    expect(checkCustom(input({ basis: "100ml", ml: null })).ml).toBe("needAmount");
    expect(checkCustom(input({ basis: "100ml" }))).toEqual({});
  });
});

describe("customLogEntry", () => {
  it("keeps whole-portion values, the weight unknown when not given", () => {
    const e = customLogEntry(input(), "Перекус", "", "m1", "2026-10-10T12:00:00Z");
    expect(e.caloriesKcal).toBe(240);
    expect(e.portionMl).toBe(296);
    expect(e.unknownFields).toContain("portionGrams");
    expect(e.unknownFields).toContain("gl"); // GI left empty
    expect(e.itemId).toBe("");
  });

  it("scales values per 100 ml or 100 g to the amount eaten", () => {
    const e = customLogEntry(input({ basis: "100ml", values: { ...none, caloriesKcal: 80, carbsG: 14, gi: 50 } }), "Перекус", "", "m1", "t");
    expect(e.caloriesKcal).toBe(236.8);
    expect(e.carbsG).toBe(41.44);
    expect(e.gi).toBe(50);
    expect(e.gl).toBeGreaterThan(0);
  });
});

const row = (over: Partial<DailyLogEntry>): DailyLogEntry =>
  ({
    timestamp: "2026-10-09T12:00:00.000Z",
    mealType: "Обід",
    itemId: "",
    itemName: "Сендвіч з індичкою",
    portionGrams: 210,
    portionPieces: null,
    portionSize: "",
    portionMl: null,
    carbsG: 44,
    gi: 70,
    fiberG: 0,
    sugarsG: 0,
    proteinG: 22,
    fatG: 13,
    caloriesKcal: 400,
    sodiumMg: 0,
    gl: 31,
    notes: "",
    mealId: "m",
    unknownFields: ["fiberG", "sugarsG", "sodiumMg"],
    ...over,
  }) as DailyLogEntry;

describe("recentCustomFoods", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("lists custom entries from the last 14 days, newest first, once per name, as 1 portion", () => {
    const entries = [
      row({ timestamp: "2026-10-01T12:00:00Z", caloriesKcal: 380 }),
      row({ timestamp: "2026-10-09T12:00:00Z" }),
      row({ itemName: "Гарячий шоколад", portionGrams: 0, portionMl: 296, unknownFields: ["portionGrams"], timestamp: "2026-10-08T09:00:00Z" }),
      row({ itemName: "Старий запис", timestamp: "2026-09-20T12:00:00Z" }),
      row({ itemName: "Гречка", itemId: "I3" }),
    ];
    const recent = recentCustomFoods(entries, [], now);
    expect(recent.map((r) => r.nameUk)).toEqual(["Сендвіч з індичкою", "Гарячий шоколад"]);
    expect(recent[0].values.caloriesKcal).toBe(400);
    expect(recent[0].measure).toMatchObject({ basis: "piece", weighedPieces: 1, weighedGrams: 210 });
    expect(recent[0].unknownFields).toEqual(["fiberG", "sugarsG", "sodiumMg"]);
    expect(recent[1].measure.weighedGrams).toBeNull();
    expect(isRecentId(recent[0].id)).toBe(true);
  });

  it("leaves out names that are now her items", () => {
    expect(recentCustomFoods([row({})], ["сендвіч  з індичкою"], now)).toEqual([]);
  });
});
