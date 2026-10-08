import { describe, expect, it } from "vitest";
import { mergePortionSizes, parsePortionSizes, serializePortionSizes, sizeAmount, sizeLabel } from "./portionSizes";
import { PER_100G, type Measure } from "./measure";

describe("portion sizes", () => {
  it("round-trips her sizes and drops invalid ones", () => {
    const sizes = [
      { label: "скибка", grams: 45 },
      { label: "порція", pieces: 10 },
    ];
    expect(parsePortionSizes(serializePortionSizes(sizes))).toEqual(sizes);
    expect(parsePortionSizes('[{"label":"","grams":5},{"label":"x"},{"label":"чашка","grams":250}]')).toEqual([{ label: "чашка", grams: 250 }]);
    expect(parsePortionSizes("")).toEqual([]);
    expect(serializePortionSizes([])).toBe("");
  });

  it("keeps at most 3 of hers, and never saves database sizes as hers", () => {
    const four = ["a", "b", "c", "d"].map((label) => ({ label, grams: 10 }));
    expect(parsePortionSizes(JSON.stringify(four))).toHaveLength(3);
    expect(serializePortionSizes([{ label: "середнє", grams: 180, fromDatabase: true }])).toBe("");
  });

  it("adds hers to the database's, and hers replaces one with the same label", () => {
    const merged = mergePortionSizes(
      [
        { label: "Середнє", grams: 182 },
        { label: "велике", grams: 223 },
      ],
      [{ label: "середнє", grams: 170 }],
    );
    expect(merged).toEqual([
      { label: "велике", grams: 223, fromDatabase: true },
      { label: "середнє", grams: 170 },
    ]);
  });

  it("turns a size and a count into an amount for the item", () => {
    expect(sizeAmount({ label: "середнє", grams: 180 }, 2, PER_100G)).toEqual({ grams: 360, pieces: null });
    const dumplings: Measure = { basis: "piece", valuesPer: null, weighedPieces: null, weighedGrams: null };
    expect(sizeAmount({ label: "порція", pieces: 10 }, 1, dumplings)).toEqual({ grams: null, pieces: 10 });
    expect(sizeAmount({ label: "скибка", grams: 45 }, 1, dumplings)).toBeNull(); // grams of a per-piece item without a weight
    expect(sizeLabel({ label: "середнє", grams: 180 }, 2)).toBe("2 × середнє");
    expect(sizeLabel({ label: "середнє", grams: 180 }, 1)).toBe("середнє");
    expect(sizeLabel({ label: "скибка", grams: 45 }, 1.5)).toBe("1,5 × скибка");
  });
});
