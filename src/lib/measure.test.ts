import { describe, expect, it } from "vitest";
import { packAmount, pieceGrams, positiveOrNull, resolveAmount, toBasis, toStoredValues, toTypedValues, PER_100G, type Measure } from "./measure";
import type { IngredientNutrition } from "./dishes";

const values = (carbsG: number, caloriesKcal: number, gi = 50): IngredientNutrition => ({
  carbsG,
  gi,
  fiberG: 0,
  sugarsG: 0,
  proteinG: 0,
  fatG: 0,
  caloriesKcal,
  sodiumMg: 0,
});

const dumplings: Measure = { basis: "piece", packPieces: 12, packGrams: 200 };
const dumplingsNoWeight: Measure = { basis: "piece", packPieces: 12, packGrams: null };
const nuts: Measure = { basis: "100g", packPieces: 20, packGrams: 100 };
const portionPack: Measure = { basis: "100g", packPieces: null, packGrams: 30 };

describe("measure", () => {
  it("reads the basis and positive numbers", () => {
    expect(toBasis("piece")).toBe("piece");
    expect(toBasis("")).toBe("100g");
    expect(positiveOrNull("7,5")).toBe(7.5);
    expect(positiveOrNull("0")).toBeNull();
    expect(positiveOrNull("")).toBeNull();
  });

  it("knows one piece's weight only when the pack gives a count and a weight", () => {
    expect(pieceGrams(dumplings)).toBeCloseTo(16.6667, 4);
    expect(pieceGrams(dumplingsNoWeight)).toBeNull();
    expect(pieceGrams(PER_100G)).toBeNull();
  });

  it("stores values per 1 piece or per 100 g, and gives them back as typed", () => {
    const stored = toStoredValues(values(48, 300), dumplings); // per 12 pieces
    expect(stored.carbsG).toBe(4);
    expect(stored.caloriesKcal).toBe(25);
    expect(stored.gi).toBe(50);
    const back = toTypedValues(stored, dumplings);
    expect(back.carbsG).toBeCloseTo(48, 6);
    expect(toStoredValues(values(9, 120), portionPack).carbsG).toBe(30); // per 30 g → per 100 g
    expect(packAmount(portionPack)).toEqual({ grams: 30, pieces: null });
    expect(packAmount(dumplings)).toEqual({ pieces: 12, grams: 200 });
  });

  it("turns pieces into the factor for a per-piece item, with grams when the piece weight is known", () => {
    const r = resolveAmount(dumplings, { pieces: 7.5 })!;
    expect(r.factor).toBe(7.5);
    expect(r.grams).toBeCloseTo(125, 6);
    expect(resolveAmount(dumplings, { grams: 210 })?.pieces).toBeCloseTo(12.6, 6);
    expect(resolveAmount(dumplingsNoWeight, { pieces: 3 })).toEqual({ factor: 3, pieces: 3, grams: null });
    expect(resolveAmount(dumplingsNoWeight, { grams: 50 })).toBeNull();
  });

  it("logs a per-100 g item by count when a piece weight is known (nuts)", () => {
    const n = resolveAmount(nuts, { pieces: 3 })!;
    expect(n.grams).toBeCloseTo(15, 6);
    expect(n.factor).toBeCloseTo(0.15, 6);
    expect(resolveAmount(PER_100G, { pieces: 3 })).toBeNull();
    expect(resolveAmount(PER_100G, { grams: 150 })).toEqual({ factor: 1.5, grams: 150, pieces: null });
  });
});
