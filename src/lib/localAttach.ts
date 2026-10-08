// Joining the phone's data to a Google spreadsheet (release 2.0): when someone
// who started without Google chooses «Синхронізувати з Google Таблицею» and
// picks a sheet in the connect window. Pure, unit-tested.
//
// The phone's records become ordinary pending changes for that sheet, so the
// normal sync uploads them (IDs never clash: they're unique per device since
// 2.0). Only same-name products, dishes and medicines, and a weight on a day
// the sheet already has, are duplicates — the person decides each one:
//   - keep the sheet's: the phone's copy is dropped, and the phone's records
//     that used it point to the sheet's item;
//   - keep the phone's: the sheet's item takes the phone's values (same
//     repointing);
//   - keep both: both stay, under names she sets (they must differ).
// Meals, sugar readings and medicine taken are events, never duplicates.
import { normalizeItemName } from "./itemIds";
import { parseIngredientsJson, serializeIngredientsJson } from "./dishes";
import { layoutOf } from "./sync/merge";
import type { StoredChange } from "./localDb/protocol";

export interface Duplicate {
  /** Stable key for the decision (tab + phone record ID). */
  key: string;
  tab: string;
  kind: "item" | "weight";
  localId: string;
  sheetId: string;
  localName: string;
  sheetName: string;
  /** Short readable values of each version, to tell them apart. */
  localFields: Record<string, unknown>;
  sheetFields: Record<string, unknown>;
}

export type Decision = { keep: "sheet" } | { keep: "phone" } | { keep: "both"; localName: string; sheetName: string };

const NAME_COLUMN: Record<string, string> = { Products: "NameUk", Medications: "Name" };
const DATA_TABS = ["Products", "Medications", "DailyLog", "BloodSugar", "MedicationLog", "Weight"];

interface Rec {
  id: string;
  fields: Record<string, unknown>;
}

function cleanText(v: unknown): string {
  return String(v ?? "").trim().replace(/^'/, "");
}

/** A tab's data rows as records (header → value, non-empty cells only, without Id/UpdatedAt). */
export function recordsOf(tab: string, grid: readonly (readonly unknown[])[]): Rec[] {
  if (grid.length === 0) return [];
  const layout = layoutOf(tab, grid);
  if (layout.idCol === undefined) return [];
  const out: Rec[] = [];
  for (const row of grid.slice(layout.firstDataIndex)) {
    const id = cleanText(row[layout.idCol]);
    if (!id) continue;
    const fields: Record<string, unknown> = {};
    for (const [header, col] of layout.columnIndex) {
      if (header === "Id" || header === "UpdatedAt") continue;
      const v = row[col];
      if (v !== undefined && v !== null && v !== "") fields[header] = v;
    }
    out.push({ id, fields });
  }
  return out;
}

/** Same-name items and same-day weights between the phone's data and the sheet's. */
export function findDuplicates(local: ReadonlyMap<string, unknown[][]>, sheet: ReadonlyMap<string, unknown[][]>): Duplicate[] {
  const out: Duplicate[] = [];
  for (const [tab, nameCol] of Object.entries(NAME_COLUMN)) {
    const sheetByName = new Map<string, Rec>();
    for (const r of recordsOf(tab, sheet.get(tab) ?? [])) {
      const name = normalizeItemName(cleanText(r.fields[nameCol]));
      if (name && !sheetByName.has(name)) sheetByName.set(name, r);
    }
    for (const r of recordsOf(tab, local.get(tab) ?? [])) {
      const match = sheetByName.get(normalizeItemName(cleanText(r.fields[nameCol])));
      if (!match) continue;
      out.push({
        key: `${tab}:${r.id}`,
        tab,
        kind: "item",
        localId: r.id,
        sheetId: match.id,
        localName: cleanText(r.fields[nameCol]),
        sheetName: cleanText(match.fields[nameCol]),
        localFields: r.fields,
        sheetFields: match.fields,
      });
    }
  }
  const sheetWeightByDate = new Map(recordsOf("Weight", sheet.get("Weight") ?? []).map((r) => [cleanText(r.fields.Date), r]));
  for (const r of recordsOf("Weight", local.get("Weight") ?? [])) {
    const date = cleanText(r.fields.Date);
    const match = sheetWeightByDate.get(date);
    if (!match || !date) continue;
    out.push({ key: `Weight:${r.id}`, tab: "Weight", kind: "weight", localId: r.id, sheetId: match.id, localName: date, sheetName: date, localFields: r.fields, sheetFields: match.fields });
  }
  return out;
}

/** Whether every duplicate has a usable decision ("keep both" needs two different, non-empty names). */
export function decisionsComplete(duplicates: readonly Duplicate[], decisions: ReadonlyMap<string, Decision>): boolean {
  return duplicates.every((d) => {
    const dec = decisions.get(d.key);
    if (!dec) return false;
    if (dec.keep !== "both") return true;
    const a = normalizeItemName(dec.localName);
    const b = normalizeItemName(dec.sheetName);
    return d.kind === "item" && a !== "" && b !== "" && a !== b;
  });
}

export type AttachChange = Omit<StoredChange, "seq">;

/**
 * The pending changes that add the phone's data to the sheet, given the
 * decisions. `includeSettings`: copy the phone's Settings too (a sheet created
 * just now; an existing sheet keeps its own).
 */
export function planAttach(
  local: ReadonlyMap<string, unknown[][]>,
  duplicates: readonly Duplicate[],
  decisions: ReadonlyMap<string, Decision>,
  options: { includeSettings: boolean; now: string },
): AttachChange[] {
  const changes: AttachChange[] = [];
  const byLocal = new Map(duplicates.map((d) => [`${d.tab}:${d.localId}`, d]));
  /** Phone item ID → the sheet item it merged into. */
  const remap = new Map<string, string>();
  for (const d of duplicates) {
    const dec = decisions.get(d.key);
    if (d.kind === "item" && (dec?.keep === "sheet" || dec?.keep === "phone")) remap.set(d.localId, d.sheetId);
  }
  const mapId = (id: unknown) => {
    const text = cleanText(id);
    return remap.get(text) ?? text;
  };

  for (const tab of DATA_TABS) {
    for (const r of recordsOf(tab, local.get(tab) ?? [])) {
      const fields = { ...r.fields };
      if (tab === "DailyLog" && fields.ItemId !== undefined) fields.ItemId = mapId(fields.ItemId);
      if (tab === "MedicationLog" && fields.MedicationId !== undefined) fields.MedicationId = mapId(fields.MedicationId);
      if (tab === "Products" && fields.IngredientsJson !== undefined) {
        fields.IngredientsJson = serializeIngredientsJson(parseIngredientsJson(fields.IngredientsJson).map((i) => (i.id ? { ...i, id: mapId(i.id) } : i)));
      }
      const dup = byLocal.get(`${tab}:${r.id}`);
      const dec = dup ? decisions.get(dup.key) : undefined;
      if (dup && dec?.keep === "sheet") continue;
      if (dup && dec?.keep === "phone") {
        const base: Record<string, unknown> = {};
        for (const k of Object.keys(fields)) base[k] = dup.sheetFields[k] ?? "";
        changes.push({ tab, id: dup.sheetId, op: "upsert", fields, base, changedAt: options.now });
        continue;
      }
      if (dup && dec?.keep === "both") {
        const nameCol = NAME_COLUMN[tab];
        fields[nameCol] = dec.localName.trim();
        if (dec.sheetName.trim() !== dup.sheetName) {
          changes.push({ tab, id: dup.sheetId, op: "upsert", fields: { [nameCol]: dec.sheetName.trim() }, base: { [nameCol]: dup.sheetName }, changedAt: options.now });
        }
      }
      changes.push({ tab, id: r.id, op: "upsert", fields, base: {}, changedAt: options.now });
    }
  }

  if (options.includeSettings) {
    for (const r of recordsOf("Settings", local.get("Settings") ?? [])) {
      if (r.fields.Value === undefined) continue;
      changes.push({ tab: "Settings", id: r.id, op: "upsert", fields: { Value: r.fields.Value }, base: {}, changedAt: options.now });
    }
  }
  return changes;
}
