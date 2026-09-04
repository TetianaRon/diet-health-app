import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupExternalCandidates, searchUsda, translateUkToEn } from "./nutrition";

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

describe("lookupExternalCandidates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates and queries USDA — never checks the bundle, even for a name that's in it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("mymemory")) {
          return { ok: true, json: async () => ({ responseData: { translatedText: "kefir, low-fat" } }) };
        }
        return {
          ok: true,
          json: async () => ({
            foods: [
              {
                description: "Kefir, low fat",
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

    const result = await lookupExternalCandidates("Кефір знежирений");

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("usda");
    expect(result[0].nameEn).toBe("Kefir, low fat");
    expect(result[0].carbsG).toBe(10);
    expect(result[0].proteinG).toBe(2);
  });

  it("returns [] when translation is unavailable, so the caller falls back to manual entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await lookupExternalCandidates("Незнайомий продукт")).toEqual([]);
  });
});

describe("searchUsda", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps every USDA candidate to the estimate shape, using each one's own description as nameEn", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [
            {
              description: "Beans, kidney, red, mature seeds, canned",
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
            {
              description: "Beans, snap, green, raw",
              foodNutrients: [{ nutrientNumber: "205", value: 7 }],
            },
          ],
        }),
      }),
    );

    const result = await searchUsda("kidney beans");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      nameEn: "Beans, kidney, red, mature seeds, canned",
      proteinG: 3.4,
      fatG: 0.6,
      carbsG: 19.9,
      caloriesKcal: 92,
      sugarsG: 0.9,
      fiberG: 2.7,
      sodiumMg: 4,
      // USDA's comma-led phrasing doesn't substring-match the GI table's
      // "kidney beans" key — null (blank, manual entry), not a guess.
      gi: null,
      source: "usda",
    });
    expect(result[1].nameEn).toBe("Beans, snap, green, raw");
  });

  it("looks up GI from each candidate's own description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [{ description: "buckwheat, raw", foodNutrients: [] }],
        }),
      }),
    );

    const result = await searchUsda("some unrelated query");
    expect(result[0].gi).toBe(54);
  });

  it("does not fall back to the search query for GI — a candidate unrelated to the query gets no guessed value", async () => {
    // Regression case: searching "рис" (rice) can surface "Rice crackers" as
    // a candidate — an entirely different product. GI must not be borrowed
    // from the query term ("rice" -> matches "white rice" in the table) and
    // applied to a candidate its own description doesn't actually support.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          foods: [{ description: "Rice crackers", foodNutrients: [] }],
        }),
      }),
    );

    const result = await searchUsda("rice");
    expect(result[0].gi).toBeNull();
  });

  it("returns [] when USDA has no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) }));
    expect(await searchUsda("nonexistent")).toEqual([]);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(searchUsda("anything")).rejects.toThrow("USDA lookup failed: 500");
  });
});
