// The 1.6 sheet upgrade, planned purely (unit-tested): fills in item IDs,
// BasedOn links and recipe ingredient IDs on an existing sheet. See
// docs/technical-spec.md → "Item IDs and the sheet upgrade (release 1.6)".
//
// Lossless by construction: it only writes into BLANK cells (an empty Id or
// BasedOn cell, a recipe entry that has no id yet) — never changes a value
// that's there. The one exception is a duplicated ID (two devices adding a
// row in the same second): the later row gets a new number.
import { buildColumnIndex, columnLetter, type ColumnIndex } from "./sheetRow";
import { isLabelRow } from "./sheetLabels";
import { parseIngredientsJson, serializeIngredientsJson } from "./dishes";
import { formatItemId, nextItemNumber, normalizeItemName, parseItemNumber, type SheetItemKind } from "./itemIds";

export interface BuiltInRef {
  id: string;
  nameUk: string;
}

export interface UpgradePlan {
  /** Cell writes, in the tab's own column positions (values API). */
  valueUpdates: { range: string; values: unknown[][] }[];
  /** The highest number now used per kind — raise the Settings counters to at least this. */
  highestNumber: Partial<Record<SheetItemKind, number>>;
  /** Recipe ingredients whose name matched nothing — kept as they are (name only), never dropped. */
  unresolved: { dishRow: number; dishName: string; ingredientName: string }[];
}

interface TabView {
  columnIndex: ColumnIndex;
  firstDataRow: number; // sheet row number of the first data row
  dataRows: readonly (readonly unknown[])[];
}

function viewOf(rows: readonly (readonly unknown[])[]): TabView {
  const columnIndex = buildColumnIndex(rows[0] ?? []);
  const hasLabelRow = rows.length > 1 && isLabelRow(rows[1], columnIndex);
  return { columnIndex, firstDataRow: hasLabelRow ? 3 : 2, dataRows: rows.slice(hasLabelRow ? 2 : 1) };
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((v) => text(v) === "");
}

/**
 * Gives every row an ID (blank Id → next number; a duplicated Id → a new
 * number for the later row) and fills BasedOn where the row's name matches a
 * built-in item's (how copies of built-in items were stored before 1.6).
 * Returns each data row's final ID, for resolving recipes afterwards.
 */
function planIdsAndLinks(
  tab: string,
  view: TabView,
  kind: SheetItemKind,
  builtIns: readonly BuiltInRef[],
  counter: number,
  plan: UpgradePlan,
): (string | null)[] {
  const idCol = view.columnIndex.get("Id");
  const basedOnCol = view.columnIndex.get("BasedOn");
  const nameCol = view.columnIndex.get("NameUk");
  if (idCol === undefined) return view.dataRows.map(() => null); // column not added yet — nothing to do

  const builtInByName = new Map(builtIns.map((b) => [normalizeItemName(b.nameUk), b.id]));
  const existing = view.dataRows.map((row) => text(row[idCol]));
  let next = nextItemNumber(existing, kind, counter);
  const seen = new Set<string>();
  const finalIds: (string | null)[] = [];

  view.dataRows.forEach((row, i) => {
    const sheetRow = view.firstDataRow + i;
    if (isBlankRow(row)) {
      finalIds.push(null);
      return;
    }
    let id = text(row[idCol]);
    // A blank cell or a repeated ID gets a fresh number. Anything else typed
    // there by hand is left as it is.
    if (id === "" || seen.has(id)) {
      id = formatItemId(kind, next++);
      plan.valueUpdates.push({ range: `${tab}!${columnLetter(idCol)}${sheetRow}`, values: [[id]] });
    }
    seen.add(id);
    finalIds.push(id);

    if (basedOnCol !== undefined && nameCol !== undefined && text(row[basedOnCol]) === "") {
      const builtInId = builtInByName.get(normalizeItemName(text(row[nameCol])));
      if (builtInId) plan.valueUpdates.push({ range: `${tab}!${columnLetter(basedOnCol)}${sheetRow}`, values: [[builtInId]] });
    }
  });

  const highest = Math.max(counter, ...finalIds.map((id) => parseItemNumber(id, kind) ?? 0));
  if (highest > 0) plan.highestNumber[kind] = highest;
  return finalIds;
}

export function planItemIdUpgrade(input: {
  ingredientsRows: readonly (readonly unknown[])[];
  dishesRows: readonly (readonly unknown[])[];
  builtInFoods: readonly BuiltInRef[];
  builtInDishes: readonly BuiltInRef[];
  counters: Partial<Record<SheetItemKind, number>>;
}): UpgradePlan {
  const plan: UpgradePlan = { valueUpdates: [], highestNumber: {}, unresolved: [] };

  const ingredients = viewOf(input.ingredientsRows);
  const ingredientIds = planIdsAndLinks("Ingredients", ingredients, "ingredient", input.builtInFoods, input.counters.ingredient ?? 0, plan);
  const dishes = viewOf(input.dishesRows);
  planIdsAndLinks("Dishes", dishes, "dish", input.builtInDishes, input.counters.dish ?? 0, plan);

  // Recipe names → IDs, resolved the way the app did before 1.6: her own
  // ingredient of that name first (it overrode a built-in one of the same
  // name), else the built-in item.
  const nameCol = ingredients.columnIndex.get("NameUk");
  const sheetIdByName = new Map<string, string>();
  if (nameCol !== undefined) {
    ingredients.dataRows.forEach((row, i) => {
      const id = ingredientIds[i];
      const key = text(row[nameCol]).toLowerCase();
      if (id && key && !sheetIdByName.has(key)) sheetIdByName.set(key, id);
    });
  }
  const builtInIdByName = new Map(input.builtInFoods.map((b) => [b.nameUk.trim().toLowerCase(), b.id]));

  const jsonCol = dishes.columnIndex.get("IngredientsJson");
  const dishNameCol = dishes.columnIndex.get("NameUk");
  if (jsonCol !== undefined) {
    dishes.dataRows.forEach((row, i) => {
      if (isBlankRow(row) || text(row[jsonCol]) === "") return;
      const refs = parseIngredientsJson(row[jsonCol]);
      let changed = false;
      const resolved = refs.map((ref) => {
        if (ref.id) return ref;
        const key = ref.nameUk.trim().toLowerCase();
        const id = sheetIdByName.get(key) ?? builtInIdByName.get(key);
        if (!id) {
          plan.unresolved.push({
            dishRow: dishes.firstDataRow + i,
            dishName: dishNameCol === undefined ? "" : text(row[dishNameCol]),
            ingredientName: ref.nameUk,
          });
          return ref;
        }
        changed = true;
        return { ...ref, id };
      });
      if (changed) {
        plan.valueUpdates.push({
          range: `Dishes!${columnLetter(jsonCol)}${dishes.firstDataRow + i}`,
          values: [[serializeIngredientsJson(resolved)]],
        });
      }
    });
  }
  return plan;
}
