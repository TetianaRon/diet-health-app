import { describe, expect, it } from "vitest";
import { BUILT_IN_FOODS } from "../data/builtInFoods";
import { copyUpdates } from "./builtInStatus";
import { coveredDatabaseIds, databaseCopyFields, fingerprintFills, idsNeedingCopies, usedDatabaseIds, valuesFingerprint } from "./databaseItems";
import type { Dish } from "./dishes";
import type { Ingredient } from "./ingredients";

const buckwheat = BUILT_IN_FOODS.find((f) => f.id === "B0001") as Ingredient;
const rice = BUILT_IN_FOODS.find((f) => f.id === "B0002") as Ingredient;

function copyOf(base: Ingredient, overrides: Partial<Ingredient> = {}): Ingredient {
  return { ...base, id: "I3", basedOn: base.id, dateAdded: "2026-10-09", favorite: false, ...overrides };
}

const dishWith = (refs: Dish["ingredients"], extra: Partial<Pick<Dish, "basedOn" | "nameUk">> = {}): Pick<Dish, "ingredients" | "basedOn" | "nameUk"> => ({
  ingredients: refs,
  basedOn: "",
  nameUk: "Страва",
  ...extra,
});

describe("databaseCopyFields", () => {
  it("makes her row from the database item, with the values it came from", () => {
    const fields = databaseCopyFields("B0001")!;
    expect(fields.basedOn).toBe("B0001");
    expect(fields.carbsG).toBe(buckwheat.carbsG);
    expect(fields.basedOnValues).toBe(valuesFingerprint(buckwheat));
    expect(fields.portionSizes).toEqual([]);
  });

  it("is null for an ID the database doesn't have", () => {
    expect(databaseCopyFields("B9999")).toBeNull();
  });
});

describe("usedDatabaseIds", () => {
  it("finds database items used in meals (by ID or by name) and recipes, once each, in first-use order", () => {
    const log = [
      { itemId: "B0002", itemName: rice.nameUk },
      { itemId: "", itemName: buckwheat.nameUk },
      { itemId: "B0002", itemName: rice.nameUk },
      { itemId: "I7", itemName: "Моє" },
    ];
    const dishes = [dishWith([{ id: "B0001", nameUk: buckwheat.nameUk, grams: 100 }])];
    expect(usedDatabaseIds(log, dishes, [])).toEqual(["B0002", "B0001"]);
  });

  it("leaves out items she already has a row for", () => {
    const log = [{ itemId: "B0001", itemName: buckwheat.nameUk }];
    expect(usedDatabaseIds(log, [], [copyOf(buckwheat)])).toEqual([]);
    expect(coveredDatabaseIds([copyOf(buckwheat)]).has("B0001")).toBe(true);
  });

  it("counts her composed copy of a pre-1.8 built-in dish, and her own items' names, as hers", () => {
    const herDish = dishWith([{ id: "B0001", nameUk: buckwheat.nameUk, grams: 100 }], { basedOn: "B0058", nameUk: "Гречка варена" });
    const log = [
      { itemId: "", itemName: "Гречка варена" },
      { itemId: "B0058", itemName: "Гречка варена" },
    ];
    expect(usedDatabaseIds(log, [herDish], [])).toEqual(["B0001"]);
  });

  it("ignores names and IDs the database doesn't know", () => {
    expect(usedDatabaseIds([{ itemId: "", itemName: "Щось своє" }, { itemId: "B9999", itemName: "?" }], [], [])).toEqual([]);
  });
});

describe("fingerprintFills", () => {
  it("fingerprints a pre-2.2 copy that still holds today's database values", () => {
    const [filled] = fingerprintFills([copyOf(buckwheat, { basedOnValues: "" })]);
    expect(filled.basedOnValues).toBe(valuesFingerprint(buckwheat));
  });

  it("leaves a changed copy, an already fingerprinted one and her own items alone", () => {
    expect(fingerprintFills([copyOf(buckwheat, { carbsG: 1, basedOnValues: "" })])).toEqual([]);
    expect(fingerprintFills([copyOf(buckwheat, { basedOnValues: "x" })])).toEqual([]);
    expect(fingerprintFills([{ ...buckwheat, id: "I9", basedOn: "" }])).toEqual([]);
  });
});

describe("copyUpdates for fingerprinted copies (2.2)", () => {
  const oldValues = { ...buckwheat, carbsG: buckwheat.carbsG - 2 };
  const madeFromOld = copyOf(buckwheat, { carbsG: oldValues.carbsG, nameUk: "Моя гречка", basedOnValues: valuesFingerprint(oldValues) });

  it("offers a database correction to a copy she didn't change, keeping her name", () => {
    const [update] = copyUpdates([madeFromOld]);
    expect(update.updated.carbsG).toBe(buckwheat.carbsG);
    expect(update.updated.nameUk).toBe("Моя гречка");
    expect(update.updated.basedOnValues).toBe(valuesFingerprint(buckwheat));
  });

  it("offers nothing to a copy she changed, or one already current", () => {
    expect(copyUpdates([{ ...madeFromOld, fatG: 99 }])).toEqual([]);
    expect(copyUpdates([copyOf(buckwheat, { basedOnValues: valuesFingerprint(buckwheat) })])).toEqual([]);
  });
});

describe("idsNeedingCopies", () => {
  it("picks the database items still listed as themselves, once each", () => {
    const merged = [{ id: "B0001" }, { id: "I3" }, { id: "B0002" }];
    expect(idsNeedingCopies(["B0001", "I3", "B0001", "B0005", "D2"], merged)).toEqual(["B0001"]);
  });
});
