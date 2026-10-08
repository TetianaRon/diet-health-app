import { describe, expect, it } from "vitest";
import { absorbLeftovers, isDishRow, parseLabels, planProductsMerge, PRODUCTS_COLUMN_INDEX, PRODUCTS_HEADERS, serializeLabels } from "./products";
import { INGREDIENTS_HEADERS } from "./ingredients";
import { DISHES_HEADERS } from "./dishes";
import { cell } from "./sheetRow";

const at = (row: unknown[], header: string) => cell(row, PRODUCTS_COLUMN_INDEX, header);

function grid(headers: readonly string[], rows: Record<string, unknown>[]): unknown[][] {
  return [[...headers], ...rows.map((r) => headers.map((h) => r[h] ?? ""))];
}

describe("merging Ingredients and Dishes into Products (2.1)", () => {
  const ingredients = grid(INGREDIENTS_HEADERS, [
    { Id: "I3", NameUk: "Гречка суха", Carbs_g: 62, Favorite: "TRUE", UpdatedAt: "2026-10-01T10:00:00Z" },
    { NameUk: "Без ID", Carbs_g: 1 },
  ]);
  const dishes = grid(DISHES_HEADERS, [
    { Id: "D7", NameUk: "Млинці", IngredientsJson: JSON.stringify([{ id: "I3", name: "Гречка суха", grams: 300 }]), YieldGrams: 1200, Carbs_g: 18.7 },
    { Id: "D9", NameUk: "Ланч-бокс", Basis: "piece", YieldPieces: 1, YieldGrams: 450, Calories_kcal: 600 },
  ]);

  it("keeps every ID and value, marks typed and composed items, and labels dishes страва", () => {
    let n = 0;
    const plan = planProductsMerge(ingredients, dishes, (kind) => `${kind === "ingredient" ? "I" : "D"}new${++n}`);
    expect(plan.rows).toHaveLength(4);
    expect(plan.idsAdded).toBe(1);
    const [buckwheat, noId, pancakes, box] = plan.rows;
    expect([at(buckwheat, "Id"), at(buckwheat, "Values"), at(buckwheat, "Labels"), at(buckwheat, "Carbs_g"), at(buckwheat, "Favorite")]).toEqual(["I3", "typed", "", 62, true]);
    expect(at(buckwheat, "UpdatedAt")).toBe("2026-10-01T10:00:00Z");
    expect(at(noId, "Id")).toBe("Inew1");
    expect([at(pancakes, "Id"), at(pancakes, "Values"), at(pancakes, "Labels"), at(pancakes, "YieldGrams")]).toEqual(["D7", "recipe", "dish", 1200]);
    expect(JSON.parse(String(at(pancakes, "IngredientsJson")))[0].id).toBe("I3");
    // A fixed-value dish (no recipe) is a typed item labelled страва.
    expect([at(box, "Values"), at(box, "Labels"), at(box, "Basis"), at(box, "YieldGrams")]).toEqual(["typed", "dish", "piece", 450]);
    expect(plan.rows.every((r) => r.length <= PRODUCTS_HEADERS.length)).toBe(true);
  });

  it("shows dishes as dishes while the screens are still split", () => {
    const plan = planProductsMerge(ingredients, dishes, () => "X1");
    expect(plan.rows.map((r) => isDishRow(r, PRODUCTS_COLUMN_INDEX))).toEqual([false, false, true, true]);
    // A row saved by an older version (Values blank) is told apart by its ID.
    const blank = [...plan.rows[2]];
    blank[PRODUCTS_COLUMN_INDEX.get("Values")!] = "";
    blank[PRODUCTS_COLUMN_INDEX.get("Labels")!] = "";
    expect(isDishRow(blank, PRODUCTS_COLUMN_INDEX)).toBe(true);
  });

  it("works with one tab missing or empty", () => {
    expect(planProductsMerge(undefined, dishes, () => "X").rows).toHaveLength(2);
    expect(planProductsMerge([[...INGREDIENTS_HEADERS]], undefined, () => "X").rows).toHaveLength(0);
  });
});

describe("rows an older app saved after the merge", () => {
  const plan = planProductsMerge(grid(INGREDIENTS_HEADERS, [{ Id: "I1", NameUk: "Рис", UpdatedAt: "2026-10-08T10:00:00Z" }]), undefined, () => "X");
  it("adds new IDs and lets only a newer save replace a row", () => {
    const newer = [...plan.rows[0]];
    newer[PRODUCTS_COLUMN_INDEX.get("NameUk")!] = "Рис бурий";
    newer[PRODUCTS_COLUMN_INDEX.get("UpdatedAt")!] = "2026-10-09T10:00:00Z";
    const older = [...plan.rows[0]];
    older[PRODUCTS_COLUMN_INDEX.get("NameUk")!] = "Старе";
    older[PRODUCTS_COLUMN_INDEX.get("UpdatedAt")!] = "2026-10-01T10:00:00Z";
    const added = [...plan.rows[0]];
    added[PRODUCTS_COLUMN_INDEX.get("Id")!] = "I2";
    const result = absorbLeftovers(plan.rows, [older, newer, added]);
    expect(result).toMatchObject({ added: 1, replaced: 1 });
    expect(result.rows.map((r) => at(r, "NameUk"))).toEqual(["Рис бурий", "Рис"]);
  });
});

describe("labels", () => {
  it("keeps known keys in a fixed order", () => {
    expect(parseLabels("sauce, ingredient,unknown")).toEqual(["ingredient", "sauce"]);
    expect(serializeLabels(["sauce", "ingredient"])).toBe("ingredient,sauce");
    expect(parseLabels("")).toEqual([]);
  });
});
