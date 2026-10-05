import { describe, expect, it } from "vitest";
import file from "./verified-foods.json";
import { validateVerifiedFoods, type VerifiedFoodEntry, type VerifiedFoodsFile } from "./verifiedFoods";

const TODAY = "2026-10-04";

const reason = { uk: "Точна відповідність опису USDA.", en: "Exact match of the USDA description." };

function entry(overrides: Partial<VerifiedFoodEntry> = {}): VerifiedFoodEntry {
  return {
    id: "B0001",
    status: "active",
    category: "grains",
    family: "buckwheat",
    state: "dry",
    nameUk: "Гречка, суха",
    nameEn: "Buckwheat groats, dry",
    nutrients: {
      per100g: { caloriesKcal: 346, carbsG: 74.9, fiberG: 10.3, sugarsG: 0, proteinG: 11.7, fatG: 2.7, sodiumMg: 11 },
      source: { dataset: "usda-sr-legacy", entryId: "170286", description: "Buckwheat groats, roasted, dry" },
      reliability: "high",
      reason,
      verified: "2026-10-04",
    },
    gi: {
      status: "measured",
      value: 45,
      source: { dataset: "gi-2021-st1", entryId: "123", description: "Buckwheat, boiled" },
      reliability: "medium",
      reason,
      verified: "2026-10-04",
    },
    ...overrides,
  };
}

function withEntries(...entries: VerifiedFoodEntry[]): VerifiedFoodsFile {
  return { ...(file as VerifiedFoodsFile), entries };
}

describe("verified-foods.json", () => {
  it("meets every rule of the format", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(validateVerifiedFoods(file as VerifiedFoodsFile, today)).toEqual([]);
  });
});

describe("validateVerifiedFoods", () => {
  it("accepts a complete entry", () => {
    expect(validateVerifiedFoods(withEntries(entry()), TODAY)).toEqual([]);
  });

  it("refuses a part without a reason in both languages, a reliability or a date", () => {
    const e = entry();
    const problems = validateVerifiedFoods(
      withEntries({ ...e, nutrients: { ...e.nutrients, reason: { uk: "", en: "x" }, reliability: "sure" as never, verified: "" } }),
      TODAY,
    );
    expect(problems).toEqual(
      expect.arrayContaining([expect.stringMatching(/reason/), expect.stringMatching(/reliability/), expect.stringMatching(/verified date/)]),
    );
  });

  it("refuses nutrients without a source entry, or from an unregistered dataset", () => {
    const e = entry();
    expect(validateVerifiedFoods(withEntries({ ...e, nutrients: { ...e.nutrients, source: { dataset: "usda-sr-legacy", entryId: "", description: "x" } } }), TODAY)).toEqual([
      "B0001 nutrients: source entry ID is required",
    ]);
    expect(validateVerifiedFoods(withEntries({ ...e, nutrients: { ...e.nutrients, source: { dataset: "somewhere", entryId: "1", description: "x" } } }), TODAY)).toEqual([
      'B0001 nutrients: unknown source dataset "somewhere"',
    ]);
  });

  it("refuses a measured GI without a source; allows conventional and unknown GI without one", () => {
    const e = entry();
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, source: null } }), TODAY)).toEqual(["B0001 gi: source is required"]);
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, status: "conventional", value: 15, source: null } }), TODAY)).toEqual([]);
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, status: "unknown", value: null, source: null } }), TODAY)).toEqual([]);
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, status: "unknown", value: 50, source: null } }), TODAY)).toEqual([
      "B0001 gi: an unknown GI must have value null",
    ]);
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, status: "notApplicable", value: null, source: null } }), TODAY)).toEqual([
      "B0001 gi: notApplicable is only for foods with at most 1 g carbohydrate per 100 g (2 g with no sugars)",
    ]);
    // Black coffee: 1.67 g "by difference", 0 g sugars — accepted; with any sugar it isn't.
    const coffee = (sugarsG: number) =>
      withEntries({ ...e, nutrients: { ...e.nutrients, per100g: { ...e.nutrients.per100g, carbsG: 1.67, sugarsG } }, gi: { ...e.gi, status: "notApplicable", value: null, source: null } });
    expect(validateVerifiedFoods(coffee(0), TODAY)).toEqual([]);
    expect(validateVerifiedFoods(coffee(0.5), TODAY)).toHaveLength(1);
  });

  it("keeps unknown nutrient fields at 0 and refuses negative values", () => {
    const e = entry();
    const per100g = { ...e.nutrients.per100g, sugarsG: 1.2, fatG: -1 };
    expect(validateVerifiedFoods(withEntries({ ...e, nutrients: { ...e.nutrients, per100g, unknown: ["sugarsG"] } }), TODAY)).toEqual([
      "B0001 nutrients: fatG must be a number ≥ 0",
      "B0001 nutrients: sugarsG is marked unknown, so it must hold 0",
    ]);
  });

  it("refuses duplicate or malformed IDs, unknown categories and states, and dates in the future", () => {
    const problems = validateVerifiedFoods(
      withEntries(entry(), entry({ category: "sweets", state: "boiled-ish" as never }), entry({ id: "B12" })),
      TODAY,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        "B0001: duplicate ID",
        'B0001: unknown category "sweets"',
        'B0001: unknown state "boiled-ish"',
        "B12: ID must be B + 4 digits",
      ]),
    );
    const e = entry();
    expect(validateVerifiedFoods(withEntries({ ...e, gi: { ...e.gi, verified: "2026-12-01" } }), TODAY)).toEqual(["B0001 gi: verified date is in the future"]);
  });

  it("requires a retired entry to point to an active replacement", () => {
    expect(validateVerifiedFoods(withEntries(entry(), entry({ id: "B0002", status: "retired", replacedBy: "B0001" })), TODAY)).toEqual([]);
    expect(validateVerifiedFoods(withEntries(entry({ status: "retired" })), TODAY)).toEqual([
      "B0001: a retired entry needs replacedBy pointing to an active entry",
    ]);
  });
});
