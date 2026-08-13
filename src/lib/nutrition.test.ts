import { afterEach, describe, expect, it, vi } from "vitest";
import { findInStarterData, lookupFood, lookupUsda, translateUkToEn } from "./nutrition";

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

describe("translateUkToEn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the translated text on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ responseData: { translatedText: "Buckwheat", match: 1 } }),
      }),
    );

    expect(await translateUkToEn("гречка")).toBe("Buckwheat");
  });

  it("returns null when the API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await translateUkToEn("гречка")).toBeNull();
  });

  it("returns null on a quota-exceeded warning instead of passing it through as a translation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS" },
        }),
      }),
    );

    expect(await translateUkToEn("гречка")).toBeNull();
  });
});

describe("lookupFood", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the starter match by Ukrainian name alone, without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await lookupFood("Гречка");

    expect(result?.source).toBe("starter");
    expect(result?.carbsG).toBe(19.9);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("translates and falls back to USDA when the food isn't in the bundle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("mymemory")) {
          return { ok: true, json: async () => ({ responseData: { translatedText: "unknown food" } }) };
        }
        return {
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
        };
      }),
    );

    const result = await lookupFood("Незнайомий продукт");

    expect(result?.source).toBe("usda");
    expect(result?.nameEn).toBe("unknown food");
    expect(result?.carbsG).toBe(10);
    expect(result?.proteinG).toBe(2);
  });

  it("returns null when translation is unavailable, so the caller falls back to manual entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await lookupFood("Незнайомий продукт")).toBeNull();
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
