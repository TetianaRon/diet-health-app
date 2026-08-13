import { afterEach, describe, expect, it, vi } from "vitest";
import { findInStarterData, lookupFood, lookupUsda } from "./nutrition";

describe("findInStarterData", () => {
  it("matches by Ukrainian name, case-insensitively", () => {
    const result = findInStarterData("гречка");
    expect(result?.nameEn).toBe("buckwheat, cooked");
  });

  it("matches by English name", () => {
    const result = findInStarterData("Buckwheat, Cooked");
    expect(result?.nameUk).toBe("Гречка");
  });

  it("returns null for foods not in the bundle", () => {
    expect(findInStarterData("dragonfruit")).toBeNull();
  });
});

describe("lookupFood", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the starter match without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await lookupFood("Гречка", "buckwheat");

    expect(result?.source).toBe("starter");
    expect(result?.carbsG).toBe(19.9);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to USDA when the food isn't in the bundle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [
            {
              foodNutrients: [
                { nutrientNumber: "205", value: 10 },
                { nutrientNumber: "203", value: 2 },
              ],
            },
          ],
        }),
      }),
    );

    const result = await lookupFood("Незнайомий продукт", "unknown food");

    expect(result?.source).toBe("usda");
    expect(result?.carbsG).toBe(10);
    expect(result?.proteinG).toBe(2);
  });
});

describe("lookupUsda", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps USDA nutrient numbers to the estimate shape and fills GI from the static table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [
            {
              foodNutrients: [
                { nutrientNumber: "203", value: 3.4 },
                { nutrientNumber: "204", value: 0.6 },
                { nutrientNumber: "205", value: 19.9 },
                { nutrientNumber: "208", value: 92 },
                { nutrientNumber: "269", value: 0.9 },
                { nutrientNumber: "291", value: 2.7 },
                { nutrientNumber: "307", value: 4 },
              ],
            },
          ],
        }),
      }),
    );

    const result = await lookupUsda("buckwheat, cooked");

    expect(result).toEqual({
      nameEn: "buckwheat, cooked",
      proteinG: 3.4,
      fatG: 0.6,
      carbsG: 19.9,
      caloriesKcal: 92,
      sugarsG: 0.9,
      fiberG: 2.7,
      sodiumMg: 4,
      gi: 54,
      source: "usda",
    });
  });

  it("returns null when USDA has no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) }),
    );

    expect(await lookupUsda("nonexistent")).toBeNull();
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(lookupUsda("anything")).rejects.toThrow("USDA lookup failed: 500");
  });
});
