import { describe, expect, it } from "vitest";
import { normalizeWords, searchFoods, suggestGi } from "./foodSearch";
import { BUILT_IN_FOODS, verifiedEntry } from "../data/builtInFoods";
import file from "../data/verified-foods.json";
import type { VerifiedFoodsFile } from "../data/verifiedFoods";

const ENTRIES = (file as VerifiedFoodsFile).entries;
const names = (query: string) => searchFoods(query, BUILT_IN_FOODS, (f) => verifiedEntry(f.id)).map((f) => f.nameUk);

describe("normalizeWords", () => {
  it("lower-cases, drops apostrophes and punctuation", () => {
    expect(normalizeWords("Пір’я, «Макарони» (сухі)")).toEqual(["піря", "макарони", "сухі"]);
  });
});

describe("searchFoods", () => {
  it("finds a name by a word with another Ukrainian ending", () => {
    expect(names("гречки")[0]).toMatch(/^Гречка/);
    expect(names("макаронні").some((n) => n.startsWith("Макарони"))).toBe(true);
  });

  it("uses everyday synonyms of a food family", () => {
    expect(names("спагетті").every((n) => n.startsWith("Макарони"))).toBe(true);
    expect(names("геркулес")[0]).toMatch(/^Вівс/);
    expect(names("манка")[0]).toMatch(/^Манн/);
  });

  it("never matches a state word on its own: «сир» doesn't find raw vegetables", () => {
    expect(names("сир").some((n) => n.startsWith("Капуста"))).toBe(false);
    expect(names("сир").some((n) => n.startsWith("Сир"))).toBe(true);
  });

  it("prefers the state she typed: «гречка варена» puts the cooked entry first", () => {
    expect(names("гречка варена")[0]).toBe("Гречка варена, без солі");
  });

  it("keeps a family's types together and lets more words win", () => {
    const rice = names("рис");
    expect(rice.length).toBeGreaterThanOrEqual(14);
    expect(names("рис басмати")[0]).toMatch(/^Рис басмати/);
  });

  it("returns everything for an empty query and nothing for an unknown word", () => {
    expect(names("")).toHaveLength(BUILT_IN_FOODS.length);
    expect(names("ананас")).toEqual([]);
  });

  it("puts a close match before one that only shares a short stem: «чорниці» finds «чорниця» before «чорний»", () => {
    const items = [
      { id: "I1", nameUk: "Хліб чорний" },
      { id: "I2", nameUk: "Кава чорна" },
      { id: "I3", nameUk: "Лохина (садова чорниця)" },
    ];
    expect(searchFoods("чорниці", items, () => null)[0].id).toBe("I3");
  });

  it("puts database entries before her own items at equal match", () => {
    const own = { ...BUILT_IN_FOODS[0], id: "I1", nameUk: "Гречка Хуторок" };
    const result = searchFoods("гречка", [own, ...BUILT_IN_FOODS], (f) => verifiedEntry(f.id));
    expect(result[0].id).not.toBe("I1");
    expect(result.some((f) => f.id === "I1")).toBe(true);
  });
});

describe("suggestGi", () => {
  it("offers the database GI for a pack product, once per family and value", () => {
    const offered = suggestGi("Гречка ядриця Хуторок", ENTRIES);
    expect(offered[0].family).toBe("buckwheat");
    expect(offered.filter((e) => e.family === "buckwheat")).toHaveLength(1);
  });

  it("finds durum pasta for a pack of spaghetti from durum wheat", () => {
    expect(suggestGi("Спагетті з твердих сортів пшениці", ENTRIES).some((e) => e.variant === "durum")).toBe(true);
  });

  it("ignores numbers and brands that match nothing: «(тест 1.9)» must not bring «Кефір 1%»", () => {
    const offered = suggestGi("Гречка ядриця Хуторок (тест 1.9)", ENTRIES);
    expect(offered.map((e) => e.family)).toEqual(["buckwheat"]);
  });

  it("never offers a GI that doesn't apply or isn't known", () => {
    expect(suggestGi("олія соняшникова", ENTRIES)).toEqual([]);
    expect(suggestGi("часник", ENTRIES)).toEqual([]);
  });
});
