import { describe, expect, it } from "vitest";
import file from "./database-sets.json";
import verifiedFile from "./verified-foods.json";
import { DATABASE_SETS, SET_GROUPS, setItemIds, validateSets, type SetsFile } from "./databaseSets";
import type { VerifiedFoodsFile } from "./verifiedFoods";

const database = verifiedFile as VerifiedFoodsFile;

describe("database-sets.json", () => {
  it("is valid against the verified database", () => {
    expect(validateSets(file as SetsFile)).toEqual([]);
  });

  it("offers every active database item in at least one set", () => {
    const inSets = new Set(DATABASE_SETS.flatMap((set) => set.itemIds));
    const missing = database.entries.filter((e) => e.status === "active" && !inSets.has(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it("shows only groups that have sets", () => {
    expect(SET_GROUPS.length).toBeGreaterThan(0);
    expect(SET_GROUPS.every((group) => group.sets.length > 0)).toBe(true);
  });
});

describe("setItemIds / validateSets", () => {
  const sets: SetsFile = {
    groups: [{ id: "food", nameUk: "Їжа", nameEn: "Food" }],
    sets: [{ id: "mix", group: "food", nameUk: "Суміш", nameEn: "Mix", categories: ["eggs"], items: ["B0001", "B0001"] }],
  };

  it("joins categories and single items, once each (a product can be in several sets)", () => {
    const ids = setItemIds(sets.sets[0]);
    expect(ids.filter((id) => id === "B0001")).toHaveLength(1);
    expect(ids.length).toBeGreaterThan(1);
    expect(validateSets(sets)).toEqual([]);
  });

  it("names unknown groups, categories and items, repeated IDs and sets without items", () => {
    const bad: SetsFile = {
      groups: sets.groups,
      sets: [
        { id: "x", group: "nope", nameUk: "X", nameEn: "X", categories: ["nothing"], items: ["B9999"] },
        { id: "x", group: "food", nameUk: "Y", nameEn: "Y" },
      ],
    };
    const problems = validateSets(bad);
    expect(problems.some((p) => p.includes('unknown group "nope"'))).toBe(true);
    expect(problems.some((p) => p.includes('unknown category "nothing"'))).toBe(true);
    expect(problems.some((p) => p.includes("unknown item B9999"))).toBe(true);
    expect(problems.some((p) => p.includes("used twice"))).toBe(true);
    expect(problems.some((p) => p.includes("no items"))).toBe(true);
  });
});
