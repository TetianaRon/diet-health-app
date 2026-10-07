import { describe, expect, it } from "vitest";
import { decisionsComplete, findDuplicates, planAttach, type Decision } from "./localAttach";
import { labelFor } from "./sheetLabels";

const labels = (headers: string[]) => headers.map((h) => labelFor(h));

const ING = ["NameUk", "Carbs_g", "Calories_kcal", "Id", "UpdatedAt"];
const ING_L = labels(ING);
const DISH = ["NameUk", "IngredientsJson", "Id", "UpdatedAt"];
const DISH_L = labels(DISH);
const LOG = ["Timestamp", "ItemName", "ItemId", "Id", "UpdatedAt"];
const LOG_L = labels(LOG);
const W = ["Date", "WeightKg", "Id", "UpdatedAt"];
const W_L = labels(W);
const NOW = "2026-10-06T10:00:00.000Z";

const sheet = new Map<string, unknown[][]>([
  ["Ingredients", [ING, ING_L, ["Гречка", 20, 92, "I1", ""], ["Рис", 28, 130, "I2", ""]]],
  ["Weight", [W, W_L, ["2026-10-05", 71, "Wsheet", ""]]],
]);
const local = new Map<string, unknown[][]>([
  ["Ingredients", [ING, ING_L, ["гречка ", 19, 90, "Iphone1", ""], ["Кефір", 4, 40, "Iphone2", ""]]],
  ["Dishes", [DISH, DISH_L, ["Каша", JSON.stringify([{ id: "Iphone1", name: "гречка", grams: 100 }]), "Dphone", ""]]],
  ["DailyLog", [LOG, LOG_L, ["2026-10-05T08:00:00Z", "гречка", "Iphone1", "Lphone", ""]]],
  ["Weight", [W, W_L, ["'2026-10-05", 70.2, "Wphone", ""], ["2026-10-04", 70.5, "Wphone2", ""]]],
]);

describe("findDuplicates", () => {
  it("matches products by normalised name and weights by day", () => {
    const dups = findDuplicates(local, sheet);
    expect(dups.map((d) => [d.tab, d.localId, d.sheetId])).toEqual([
      ["Ingredients", "Iphone1", "I1"],
      ["Weight", "Wphone", "Wsheet"],
    ]);
  });
});

describe("planAttach", () => {
  const dups = findDuplicates(local, sheet);
  const plan = (item: Decision, weight: Decision) =>
    planAttach(local, dups, new Map([[dups[0].key, item], [dups[1].key, weight]]), { includeSettings: false, now: NOW });

  it("keeping the sheet's item drops the phone's copy and repoints meals and recipes", () => {
    const changes = plan({ keep: "sheet" }, { keep: "sheet" });
    expect(changes.find((c) => c.id === "Iphone1")).toBeUndefined();
    expect(changes.find((c) => c.id === "Lphone")!.fields.ItemId).toBe("I1");
    expect(JSON.parse(String(changes.find((c) => c.id === "Dphone")!.fields.IngredientsJson))[0].id).toBe("I1");
    expect(changes.find((c) => c.id === "Iphone2")!.base).toEqual({});
    expect(changes.find((c) => c.tab === "Weight" && c.id === "Wsheet")).toBeUndefined();
    expect(changes.some((c) => c.id === "Wphone2")).toBe(true);
  });

  it("keeping the phone's item writes its values onto the sheet's item", () => {
    const changes = plan({ keep: "phone" }, { keep: "phone" });
    const onto = changes.find((c) => c.id === "I1")!;
    expect(onto.fields).toMatchObject({ Carbs_g: 19, Calories_kcal: 90 });
    expect(onto.base).toMatchObject({ Carbs_g: 20, Calories_kcal: 92 });
    expect(changes.find((c) => c.id === "Wsheet")!.fields.WeightKg).toBe(70.2);
    expect(changes.find((c) => c.id === "Lphone")!.fields.ItemId).toBe("I1");
  });

  it("keeping both uploads the phone's item under its new name and renames the sheet's if asked", () => {
    const changes = plan({ keep: "both", localName: "Гречка (телефон)", sheetName: "Гречка ядриця" }, { keep: "sheet" });
    expect(changes.find((c) => c.id === "Iphone1")!.fields.NameUk).toBe("Гречка (телефон)");
    expect(changes.find((c) => c.id === "I1")!.fields).toEqual({ NameUk: "Гречка ядриця" });
    expect(changes.find((c) => c.id === "Lphone")!.fields.ItemId).toBe("Iphone1");
  });
});

describe("decisionsComplete", () => {
  const dups = findDuplicates(local, sheet);
  it("needs a choice for every duplicate, and two different names to keep both", () => {
    expect(decisionsComplete(dups, new Map([[dups[0].key, { keep: "sheet" }]]))).toBe(false);
    expect(decisionsComplete(dups, new Map<string, Decision>([[dups[0].key, { keep: "sheet" }], [dups[1].key, { keep: "phone" }]]))).toBe(true);
    expect(decisionsComplete(dups, new Map<string, Decision>([[dups[0].key, { keep: "both", localName: "Гречка", sheetName: "гречка" }], [dups[1].key, { keep: "phone" }]]))).toBe(false);
  });
});
