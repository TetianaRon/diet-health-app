import { describe, expect, it } from "vitest";
import { pieceGrams, positiveOrNull, resolveAmount, toBasis, toStoredValues, toTypedValues, valuesAmount, PER_100G, type Measure } from "./measure";
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

// Pack «на 12 шт. (200 г)»: values per 12 pieces, and the same 12 pieces weigh 200 g.
const dumplings: Measure = { basis: "piece", valuesPer: 12, weighedPieces: 12, weighedGrams: 200 };
const dumplingsNoWeight: Measure = { basis: "piece", valuesPer: 12, weighedPieces: null, weighedGrams: null };
// Database values per 100 g, and 12 home-cooked dumplings weighed at 300 g.
const potatoDumplings: Measure = { basis: "100g", valuesPer: null, weighedPieces: 12, weighedGrams: 300 };
const nuts: Measure = { basis: "100g", valuesPer: null, weighedPieces: 20, weighedGrams: 100 };
const portionPack: Measure = { basis: "100g", valuesPer: 30, weighedPieces: null, weighedGrams: null };

describe("measure", () => {
  it("reads the basis and positive numbers", () => {
    expect(toBasis("piece")).toBe("piece");
    expect(toBasis("")).toBe("100g");
    expect(positiveOrNull("7,5")).toBe(7.5);
    expect(positiveOrNull("0")).toBeNull();
    expect(positiveOrNull("")).toBeNull();
  });

  it("knows one piece's weight from any weighed count, separately from what the values are for", () => {
    expect(pieceGrams(dumplings)).toBeCloseTo(16.6667, 4);
    expect(pieceGrams(potatoDumplings)).toBe(25);
    expect(pieceGrams(dumplingsNoWeight)).toBeNull();
    expect(pieceGrams(PER_100G)).toBeNull();
  });

  it("stores values per 1 piece or per 100 g, and gives them back as typed", () => {
    const stored = toStoredValues(values(48, 300), dumplings); // per 12 pieces
    expect(stored.carbsG).toBe(4);
    expect(stored.caloriesKcal).toBe(25);
    expect(stored.gi).toBe(50);
    expect(toTypedValues(stored, dumplings).carbsG).toBeCloseTo(48, 6);
    expect(toStoredValues(values(9, 120), portionPack).carbsG).toBe(30); // per 30 g → per 100 g
    expect(valuesAmount(portionPack)).toBe(30);
    expect(valuesAmount(potatoDumplings)).toBe(100);
  });

  it("turns pieces into the factor for a per-piece item, with grams when the piece weight is known", () => {
    const r = resolveAmount(dumplings, { pieces: 7.5 })!;
    expect(r.factor).toBe(7.5);
    expect(r.grams).toBeCloseTo(125, 6);
    expect(resolveAmount(dumplings, { grams: 210 })?.pieces).toBeCloseTo(12.6, 6);
    expect(resolveAmount(dumplingsNoWeight, { pieces: 3 })).toEqual({ factor: 3, pieces: 3, grams: null });
    expect(resolveAmount(dumplingsNoWeight, { grams: 50 })).toBeNull();
  });

  it("logs a per-100 g item by count through its weighed pieces (potato dumplings, nuts)", () => {
    const eight = resolveAmount(potatoDumplings, { pieces: 8 })!;
    expect(eight.grams).toBe(200);
    expect(eight.factor).toBe(2);
    const n = resolveAmount(nuts, { pieces: 3 })!;
    expect(n.grams).toBeCloseTo(15, 6);
    expect(resolveAmount(PER_100G, { pieces: 3 })).toBeNull();
    expect(resolveAmount(PER_100G, { grams: 150 })).toEqual({ factor: 1.5, grams: 150, pieces: null });
  });
});
