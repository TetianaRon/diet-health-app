import { describe, expect, it } from "vitest";
import {
  findDuplicateIds,
  findNameMatch,
  formatItemId,
  isBuiltInId,
  mergeBuiltInsById,
  nextItemNumber,
  normalizeItemName,
  parseItemNumber,
  suggestFreeName,
} from "./itemIds";

describe("formatItemId / parseItemNumber", () => {
  it("round-trips ingredient and dish IDs", () => {
    expect(formatItemId("ingredient", 12)).toBe("I12");
    expect(formatItemId("dish", 3)).toBe("D3");
    expect(parseItemNumber("I12", "ingredient")).toBe(12);
    expect(parseItemNumber(" D3 ", "dish")).toBe(3);
  });

  it("rejects other kinds and other text", () => {
    expect(parseItemNumber("D3", "ingredient")).toBeNull();
    expect(parseItemNumber("B0001", "ingredient")).toBeNull();
    expect(parseItemNumber("I", "ingredient")).toBeNull();
    expect(parseItemNumber("", "ingredient")).toBeNull();
    expect(parseItemNumber(undefined, "dish")).toBeNull();
  });
});

describe("isBuiltInId", () => {
  it("recognises B-numbers only", () => {
    expect(isBuiltInId("B0001")).toBe(true);
    expect(isBuiltInId("B12345")).toBe(true);
    expect(isBuiltInId("I1")).toBe(false);
    expect(isBuiltInId("B1")).toBe(false);
  });
});

describe("nextItemNumber", () => {
  it("is one more than the highest number in the tab", () => {
    expect(nextItemNumber(["I1", "I7", "I3", "", "D9"], "ingredient", 0)).toBe(8);
  });

  it("never reuses a number the counter remembers (last row deleted by hand)", () => {
    expect(nextItemNumber(["I1", "I2"], "ingredient", 5)).toBe(6);
  });

  it("starts at 1 for an empty tab", () => {
    expect(nextItemNumber([], "dish", 0)).toBe(1);
    expect(nextItemNumber([], "dish", Number.NaN)).toBe(1);
  });
});

describe("findDuplicateIds", () => {
  it("lists IDs used more than once, ignoring blanks", () => {
    expect(findDuplicateIds(["I1", "I2", "I1", "", "", "I3", "I2"])).toEqual(["I1", "I2"]);
    expect(findDuplicateIds(["I1", "I2"])).toEqual([]);
  });
});

describe("normalizeItemName", () => {
  it("ignores case, outer and repeated spaces", () => {
    expect(normalizeItemName("  Хліб   Житній ")).toBe("хліб житній");
  });

  it("maps Latin look-alike letters to Cyrillic in Cyrillic words", () => {
    // «хлiб» typed with a Latin i, «кефiр» with Latin e/i
    expect(normalizeItemName("хлiб")).toBe(normalizeItemName("хліб"));
    expect(normalizeItemName("кeфiр")).toBe(normalizeItemName("кефір"));
  });

  it("leaves English words alone", () => {
    expect(normalizeItemName("Corn Flakes")).toBe("corn flakes");
  });
});

describe("suggestFreeName", () => {
  it("appends the first free number", () => {
    expect(suggestFreeName("хліб", ["Хліб"])).toBe("хліб 2");
    expect(suggestFreeName("хліб", ["хліб", "хліб 2", "ХЛІБ 3"])).toBe("хліб 4");
  });
});

describe("mergeBuiltInsById", () => {
  const item = (id: string, nameUk: string, basedOn = "") => ({ id, basedOn, nameUk });
  const builtIns = [item("B0001", "Гречка суха"), item("B0002", "Рис білий сирий")];

  it("lists built-ins, then the user's own items", () => {
    const merged = mergeBuiltInsById(builtIns, [item("I1", "Хліб")]);
    expect(merged.map((i) => i.id)).toEqual(["B0001", "B0002", "I1"]);
  });

  it("puts a saved copy (basedOn) in the built-in item's place", () => {
    const merged = mergeBuiltInsById(builtIns, [item("I1", "Хліб"), item("I2", "Гречка (моя)", "B0001")]);
    expect(merged.map((i) => i.id)).toEqual(["I2", "B0002", "I1"]);
  });

  it("treats a pre-1.6 row with a built-in item's name as its copy", () => {
    const merged = mergeBuiltInsById(builtIns, [item("I5", " гречка  суха ")]);
    expect(merged.map((i) => i.id)).toEqual(["I5", "B0002"]);
  });

  it("keeps the user's same-named item separate once it's linked to nothing else", () => {
    const merged = mergeBuiltInsById(builtIns, [item("I1", "Рис білий сирий", "B0001"), item("I2", "Рис білий сирий")]);
    // I1 is the copy of B0001; I2 (same name as B0002, no basedOn) replaces B0002 as a legacy copy
    expect(merged.map((i) => i.id)).toEqual(["I1", "I2"]);
  });
});

describe("findNameMatch", () => {
  const items = [
    { id: "B0001", nameUk: "Гречка суха" },
    { id: "I3", nameUk: "Хліб" },
  ];

  it("finds an item with the same normalised name", () => {
    expect(findNameMatch(" хлiб ", items)?.id).toBe("I3");
  });

  it("ignores the item being edited and blank names", () => {
    expect(findNameMatch("Хліб", items, "I3")).toBeNull();
    expect(findNameMatch("   ", items)).toBeNull();
    expect(findNameMatch("Хліб житній", items)).toBeNull();
  });
});
