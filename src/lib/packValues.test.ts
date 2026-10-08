// 2.0.1 — pack values per [n] g and per [n] pieces, through the data layer:
// meal rows by count, dishes by count, recipe lines by count.
import { describe, expect, it } from "vitest";
import { buildLogEntryForAmount, groupIntoMeals, rowToLogEntry, logEntryToRow } from "./dailyLog";
import { computeDishNutrition, parseIngredientsJson, serializeIngredientsJson, type IngredientNutrition } from "./dishes";
import { rowToIngredient, ingredientToRow, type Ingredient } from "./ingredients";
import { PER_100G, type Measure } from "./measure";

const n = (carbsG: number, caloriesKcal: number, gi: number): IngredientNutrition => ({
  carbsG,
  gi,
  fiberG: 0,
  sugarsG: 0,
  proteinG: 0,
  fatG: 0,
  caloriesKcal,
  sodiumMg: 0,
});

const dumplingMeasure: Measure = { basis: "piece", packPieces: 12, packGrams: null };
const dumpling = { id: "Idump", nameUk: "Пельмені", stored: n(4, 25, 60), unknownFields: [], measure: dumplingMeasure };

describe("meal rows by count", () => {
  it("logs 7,5 dumplings with every value and GL, and an unknown weight", () => {
    const entry = buildLogEntryForAmount("Обід", dumpling, { pieces: 7.5 }, "", "m1", "2026-10-07T12:00:00.000Z")!;
    expect(entry.carbsG).toBe(30);
    expect(entry.caloriesKcal).toBe(187.5);
    expect(entry.gl).toBe(18);
    expect(entry.portionPieces).toBe(7.5);
    expect(entry.portionGrams).toBe(0);
    expect(entry.unknownFields).toContain("portionGrams");
  });

  it("can't log grams of a per-piece item without a piece weight", () => {
    expect(buildLogEntryForAmount("Обід", dumpling, { grams: 100 }, "", "m1")).toBeNull();
  });

  it("logs nuts by count through their piece weight (100 г = 20 шт.)", () => {
    const nuts = { id: "Inut", nameUk: "Мигдаль", stored: n(20, 600, 15), unknownFields: [], measure: { basis: "100g" as const, packPieces: 20, packGrams: 100 } };
    const entry = buildLogEntryForAmount("Перекус", nuts, { pieces: 3 }, "", "m2")!;
    expect(entry.portionGrams).toBe(15);
    expect(entry.carbsG).toBe(3);
    expect(entry.unknownFields).not.toContain("portionGrams");
  });

  it("a meal's weight leaves out a portion whose weight is unknown, and the row keeps its count", () => {
    const counted = buildLogEntryForAmount("Обід", dumpling, { pieces: 6 }, "", "m3", "2026-10-07T12:00:00.000Z")!;
    const weighed = buildLogEntryForAmount(
      "Обід",
      { id: "Ibread", nameUk: "Хліб", stored: n(50, 250, 70), unknownFields: [], measure: PER_100G },
      { grams: 40 },
      "",
      "m3",
      "2026-10-07T12:00:01.000Z",
    )!;
    const [meal] = groupIntoMeals([counted, weighed]);
    expect(meal.totalGrams).toBe(40);
    expect(meal.totals.carbsG).toBe(44);
    const back = rowToLogEntry(logEntryToRow({ ...counted, id: "L1" }));
    expect(back.portionPieces).toBe(6);
    expect(back.unknownFields).toContain("portionGrams");
  });
});

describe("dishes and recipes by count", () => {
  const items: Record<string, IngredientNutrition & Partial<Measure>> = {
    flour: n(70, 350, 70),
    egg: { ...n(0.5, 75, 0), basis: "piece", packPieces: 1, packGrams: 50 },
    dumpling: { ...n(4, 25, 60), ...dumplingMeasure },
  };
  const lookup = (ref: { id?: string }) => items[ref.id ?? ""] ?? null;

  it("a dish made by count stores its values per piece (10 pancakes)", () => {
    const perPancake = computeDishNutrition(
      [
        { id: "flour", nameUk: "Борошно", grams: 200 },
        { id: "egg", nameUk: "Яйце", grams: 0, pieces: 2 },
      ],
      0,
      lookup,
      10,
    );
    expect(perPancake.carbsG).toBe(14.1); // (140 + 1) / 10
    expect(perPancake.caloriesKcal).toBe(85); // (700 + 150) / 10
  });

  it("a recipe can take a per-piece product by count, and keeps a per-100 g yield", () => {
    const per100 = computeDishNutrition([{ id: "dumpling", nameUk: "Пельмені", grams: 0, pieces: 12 }], 400, lookup);
    expect(per100.carbsG).toBe(12); // 48 g carbs in 400 g
    expect(per100.gi).toBe(60);
  });

  it("recipe lines keep their count in the sheet", () => {
    const refs = [{ id: "egg", nameUk: "Яйце", grams: 0, pieces: 2 }];
    expect(parseIngredientsJson(serializeIngredientsJson(refs))).toEqual(refs);
  });
});

describe("items keep their pack statement", () => {
  it("round-trips basis and the pack's count and weight", () => {
    const item = rowToIngredient(ingredientToRow({ ...rowToIngredient([]), id: "I1", nameUk: "Пельмені", basis: "piece", packPieces: 12, packGrams: 200 } as Ingredient));
    expect(item.basis).toBe("piece");
    expect(item.packPieces).toBe(12);
    expect(item.packGrams).toBe(200);
    const plain = rowToIngredient(ingredientToRow({ ...rowToIngredient([]), id: "I2", nameUk: "Рис" } as Ingredient));
    expect(plain.basis).toBe("100g");
    expect(plain.packGrams).toBeNull();
  });
});
