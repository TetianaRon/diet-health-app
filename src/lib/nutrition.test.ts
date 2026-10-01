import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLatinQuery,
  isTranslationLimitedToday,
  lookupExternalCandidates,
  normalizeSearchQuery,
  searchUsda,
  DAILY_TRANSLATION_LIMIT,
  translateEnToUkMany,
  translateUkToEn,
  translationCharsUsedToday,
} from "./nutrition";

// Translations and the daily-limit flag live in localStorage — a fresh
// in-memory one per test, so nothing carries over between tests.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
});

// The translation proxy (api/translate.js): POST { q, source, target } ->
// { translations }. Translates each text with `dictionary`, else echoes it.
function translateResponse(dictionary: Record<string, string>) {
  return async (_url: string, init?: RequestInit) => {
    const { q } = JSON.parse(String(init?.body)) as { q: string[] };
    return { ok: true, status: 200, json: async () => ({ translations: q.map((t) => dictionary[t] ?? t) }) };
  };
}

describe("translateUkToEn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the proxy and returns the translation", async () => {
    const fetchMock = vi.fn(translateResponse({ гречка: "buckwheat" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateUkToEn("гречка")).toBe("buckwheat");
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/translate$/);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ q: ["гречка"], source: "uk", target: "en" });
  });

  it("returns null when the proxy fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect(await translateUkToEn("гречка")).toBeNull();
    expect(isTranslationLimitedToday()).toBe(false);
  });

  it("returns null when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await translateUkToEn("гречка")).toBeNull();
  });

  it("treats 429 (Google's daily quota) as the limit and stops calling for the rest of the day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateUkToEn("кукурудза")).toBeNull();
    expect(isTranslationLimitedToday()).toBe(true);
    expect(await translateUkToEn("морква")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("remembers translations, so the same word doesn't call the proxy twice or count again", async () => {
    const fetchMock = vi.fn(translateResponse({ кукурудза: "corn" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateUkToEn("кукурудза")).toBe("corn");
    expect(await translateUkToEn("кукурудза")).toBe("corn");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(translationCharsUsedToday()).toBe("кукурудза".length);
  });

  it("stops at this device's daily limit without calling the proxy", async () => {
    const fetchMock = vi.fn(translateResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const long = "а".repeat(150);

    // Distinct texts until the next one would cross the limit.
    let sent = 0;
    for (let i = 0; sent + 150 <= DAILY_TRANSLATION_LIMIT; i++, sent += 150) {
      expect(await translateUkToEn(long.slice(0, 149) + String.fromCharCode(1072 + i))).not.toBeNull();
    }
    const calls = fetchMock.mock.calls.length;

    expect(await translateUkToEn("б".repeat(150))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(isTranslationLimitedToday()).toBe(true);
  });

  it("still translates when storage is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    vi.stubGlobal("fetch", vi.fn(translateResponse({ кукурудза: "corn" })));

    expect(await translateUkToEn("кукурудза")).toBe("corn");
  });
});

describe("translateEnToUkMany", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("translates several names in one request, sending only the ones not remembered", async () => {
    const fetchMock = vi.fn(translateResponse({ "Corn, sweet": "Кукурудза цукрова", "Corn grain": "Зерно кукурудзи" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateEnToUkMany(["Corn, sweet"])).toEqual(["Кукурудза цукрова"]);
    expect(await translateEnToUkMany(["Corn, sweet", "Corn grain"])).toEqual(["Кукурудза цукрова", "Зерно кукурудзи"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).q).toEqual(["Corn grain"]);
  });

  it("leaves names over 200 characters untranslated instead of failing the whole request", async () => {
    const fetchMock = vi.fn(translateResponse({ Corn: "Кукурудза" }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await translateEnToUkMany(["Corn", "x".repeat(201)])).toEqual(["Кукурудза", null]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).q).toEqual(["Corn"]);
  });

  it("returns nulls when unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    expect(await translateEnToUkMany(["Buckwheat, raw"])).toEqual([null]);
  });
});

describe("normalizeSearchQuery", () => {
  it("lowercases, trims and collapses spaces — the keyboard's capital changed the translation", () => {
    expect(normalizeSearchQuery("Кукурудза ")).toBe("кукурудза");
    expect(normalizeSearchQuery("  Гречка   варена ")).toBe("гречка варена");
  });
});

describe("isLatinQuery", () => {
  it("is true only for queries in Latin letters", () => {
    expect(isLatinQuery("corn")).toBe(true);
    expect(isLatinQuery("sweet corn 2%")).toBe(true);
    expect(isLatinQuery("кукурудза")).toBe(false);
    expect(isLatinQuery("кукурудза corn")).toBe(false);
    expect(isLatinQuery("123")).toBe(false);
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
        if (url.includes("/api/translate")) {
          return { ok: true, status: 200, json: async () => ({ translations: ["kefir, low-fat"] }) };
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

    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe("usda");
    expect(result.candidates[0].nameEn).toBe("Kefir, low fat");
    expect(result.candidates[0].carbsG).toBe(10);
    expect(result.candidates[0].proteinG).toBe(2);
  });

  it("translates the lowercased, trimmed query", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes("/api/translate")
        ? { ok: true, status: 200, json: async () => ({ translations: ["corn"] }) }
        : { ok: true, json: async () => ({ foods: [] }) },
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupExternalCandidates("Кукурудза ");

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).q).toEqual(["кукурудза"]);
  });

  it("sends an English query straight to USDA without translating it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ foods: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await lookupExternalCandidates("Corn")).toEqual({ kind: "none" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("query=corn");
  });

  it("says 'none' only when USDA genuinely has no matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/api/translate")
          ? { ok: true, status: 200, json: async () => ({ translations: ["unknown thing"] }) }
          : { ok: true, json: async () => ({ foods: [] }) },
      ),
    );
    expect(await lookupExternalCandidates("Незнайомий продукт")).toEqual({ kind: "none" });
  });

  it("says 'failed' when translation is unavailable for another reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await lookupExternalCandidates("Незнайомий продукт")).toEqual({ kind: "failed" });
  });

  it("says 'failed' when the network itself fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await lookupExternalCandidates("гречка")).toEqual({ kind: "failed" });
  });

  it("says 'failed' when the USDA proxy fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/api/translate")
          ? { ok: true, status: 200, json: async () => ({ translations: ["corn"] }) }
          : { ok: false, status: 500 },
      ),
    );
    expect(await lookupExternalCandidates("кукурудза")).toEqual({ kind: "failed" });
  });

  it("says 'translation-limited' once the translator's daily limit is used up", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    expect(await lookupExternalCandidates("кукурудза")).toEqual({ kind: "translation-limited" });
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
    expect(result[0].gi).toBe(50);
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
