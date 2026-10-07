// The record-level core of offline saving and sync (release 2.0, checkpoint B).
// Pure, unit-tested. See docs/technical-spec.md → "Local-first app".
//
// A save on the device is a RecordChange: the record's ID, the fields written,
// and what those fields held before (`base`). Screens see the device copy of
// each tab with pending changes applied (applyChanges). Sync downloads the
// sheet, then planPush decides each change field by field:
//   - a field nobody else changed since `base` → the local value is written;
//   - a field changed in the sheet with a newer UpdatedAt (another device,
//     later) → the sheet's value stays; an older UpdatedAt → the local value wins;
//   - a field changed in the sheet without an UpdatedAt change (a hand edit)
//     → the hand edit stays.
// Deletions remove the row and are logged in the Deleted tab, so other
// devices drop the record too; a later edit elsewhere brings it back.
import { buildColumnIndex, columnLetter, type ColumnIndex } from "../sheetRow";
import { isLabelRow } from "../sheetLabels";

export interface RecordChange {
  /** Order of the change on this device (increasing). */
  seq: number;
  tab: string;
  id: string;
  op: "upsert" | "delete";
  /** Header → new value, for the fields this save wrote (upsert only). */
  fields: Record<string, unknown>;
  /** Header → the value before this save, for the same fields. Empty for a new record. */
  base: Record<string, unknown>;
  /** ISO time of the save. */
  changedAt: string;
}

/** The column that identifies a tab's records: Settings rows by Key, every other tab by Id. */
export function idColumnFor(tab: string): string {
  return tab === "Settings" ? "Key" : "Id";
}

/** Normalised cell text for comparisons: the sheet returns numbers and booleans, the app may hold strings. */
export function cellKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  let text = String(value).trim();
  if (text.startsWith("'")) text = text.slice(1);
  if (/^(true|false)$/i.test(text)) return text.toUpperCase();
  const n = Number(text.replace(",", "."));
  if (text !== "" && Number.isFinite(n)) return String(n);
  return text;
}

export function sameCell(a: unknown, b: unknown): boolean {
  return cellKey(a) === cellKey(b);
}

export interface TabLayout {
  columnIndex: ColumnIndex;
  /** 0-based index of the first data row in the grid (2 with a readable-names row, else 1). */
  firstDataIndex: number;
  idCol: number | undefined;
}

export function layoutOf(tab: string, grid: readonly (readonly unknown[])[]): TabLayout {
  const columnIndex = buildColumnIndex(grid[0] ?? []);
  const firstDataIndex = grid.length > 1 && isLabelRow(grid[1], columnIndex) ? 2 : 1;
  return { columnIndex, firstDataIndex, idCol: columnIndex.get(idColumnFor(tab)) };
}

function rowIndexOf(grid: readonly (readonly unknown[])[], layout: TabLayout, id: string): number {
  if (layout.idCol === undefined || id === "") return -1;
  for (let i = layout.firstDataIndex; i < grid.length; i++) {
    if (cellKey(grid[i]?.[layout.idCol]) === id) return i;
  }
  return -1;
}

/** A tab's grid with pending changes applied, as the screens should see it. */
export function applyChanges(tab: string, grid: readonly (readonly unknown[])[], changes: readonly RecordChange[]): unknown[][] {
  const out = grid.map((row) => [...row]);
  if (out.length === 0) return out;
  const layout = layoutOf(tab, out);
  if (layout.idCol === undefined) return out;
  for (const change of changes) {
    if (change.tab !== tab) continue;
    const i = rowIndexOf(out, layout, change.id);
    if (change.op === "delete") {
      if (i >= 0) out.splice(i, 1);
      continue;
    }
    const row = i >= 0 ? out[i] : [];
    for (const [header, value] of Object.entries(change.fields)) {
      const col = layout.columnIndex.get(header);
      if (col === undefined) continue;
      while (row.length <= col) row.push("");
      row[col] = value;
    }
    if (i < 0) {
      while (row.length <= layout.idCol) row.push("");
      row[layout.idCol] = change.id;
      out.push(row);
    }
  }
  return out;
}

/** One decision per record: later fields override earlier ones; each field keeps its first `base`. */
export interface CoalescedChange {
  id: string;
  op: "upsert" | "delete";
  fields: Record<string, unknown>;
  base: Record<string, unknown>;
  /** The record didn't exist on the device before the first of these changes. */
  created: boolean;
  changedAt: string;
  seqs: number[];
}

export function coalesce(changes: readonly RecordChange[]): CoalescedChange[] {
  const byId = new Map<string, CoalescedChange>();
  for (const c of [...changes].sort((a, b) => a.seq - b.seq)) {
    const prev = byId.get(c.id);
    if (!prev) {
      byId.set(c.id, {
        id: c.id,
        op: c.op,
        fields: { ...c.fields },
        base: { ...c.base },
        created: c.op === "upsert" && Object.keys(c.base).length === 0,
        changedAt: c.changedAt,
        seqs: [c.seq],
      });
      continue;
    }
    prev.op = c.op;
    prev.changedAt = c.changedAt > prev.changedAt ? c.changedAt : prev.changedAt;
    prev.seqs.push(c.seq);
    for (const [k, v] of Object.entries(c.fields)) {
      if (!(k in prev.fields) && !prev.created && k in c.base) prev.base[k] = c.base[k];
      prev.fields[k] = v;
    }
  }
  return [...byId.values()];
}

export interface PushPlan {
  /** Row rewrites in place: null cells are skipped by the Sheets API, so only the written fields change. */
  cellUpdates: { range: string; values: unknown[][] }[];
  /** New rows to append, aligned to the tab's columns. */
  appendRows: unknown[][];
  /** 1-based sheet rows to delete. */
  deleteRows: number[];
  /** Rows for the Deleted tab. */
  deletedLog: { id: string; tab: string; deletedAt: string }[];
  /** Change seqs this plan accounts for (written, or decided against) — cleared after a successful push. */
  doneSeqs: number[];
}

const BOOKKEEPING = new Set(["Id", "UpdatedAt"]);

/**
 * Decides every pending change of one tab against the sheet as just downloaded.
 * `deletedAt` maps record IDs found in the Deleted tab to when they were deleted.
 */
export function planPush(
  tab: string,
  grid: readonly (readonly unknown[])[],
  changes: readonly RecordChange[],
  deletedAt: ReadonlyMap<string, string>,
): PushPlan {
  const plan: PushPlan = { cellUpdates: [], appendRows: [], deleteRows: [], deletedLog: [], doneSeqs: [] };
  const layout = layoutOf(tab, grid);
  const { columnIndex } = layout;
  if (layout.idCol === undefined || grid.length === 0) return plan;
  const width = Math.max(...columnIndex.values()) + 1;
  const lastCol = columnLetter(width - 1);
  const updatedCol = columnIndex.get("UpdatedAt");

  for (const c of coalesce(changes.filter((ch) => ch.tab === tab))) {
    plan.doneSeqs.push(...c.seqs);
    const i = rowIndexOf(grid, layout, c.id);
    const remote = i >= 0 ? grid[i] : null;
    const remoteUpdated = remote && updatedCol !== undefined ? String(remote[updatedCol] ?? "") : "";
    const baseUpdated = String(c.base.UpdatedAt ?? "");
    // Another device wrote this row after our base, and later than our change.
    const remoteIsNewer = remoteUpdated !== "" && remoteUpdated !== baseUpdated && remoteUpdated > c.changedAt;

    if (c.op === "delete") {
      if (!remote || c.created) continue; // already gone, or never reached the sheet
      if (remoteIsNewer) continue; // edited later elsewhere — keep it
      plan.deleteRows.push(i + 1);
      plan.deletedLog.push({ id: c.id, tab, deletedAt: c.changedAt });
      continue;
    }

    if (!remote) {
      const goneAt = deletedAt.get(c.id);
      if (goneAt && goneAt > c.changedAt) continue; // deleted later elsewhere
      if (!c.created && !goneAt) continue; // removed by hand from the sheet — a hand edit wins
      const row: unknown[] = new Array(width).fill("");
      for (const [k, v] of Object.entries(c.fields)) {
        const col = columnIndex.get(k);
        if (col !== undefined) row[col] = v;
      }
      row[layout.idCol] = c.id;
      if (updatedCol !== undefined) row[updatedCol] = c.changedAt;
      plan.appendRows.push(row);
      continue;
    }

    const row: unknown[] = new Array(width).fill(null);
    let wrote = false;
    for (const [k, v] of Object.entries(c.fields)) {
      if (BOOKKEEPING.has(k)) continue;
      const col = columnIndex.get(k);
      if (col === undefined) continue;
      const remoteChanged = k in c.base && !sameCell(remote[col], c.base[k]);
      if (remoteChanged) {
        const handEdit = remoteUpdated === baseUpdated;
        if (handEdit || remoteIsNewer) continue;
      }
      if (sameCell(remote[col], v)) continue;
      row[col] = v;
      wrote = true;
    }
    if (!wrote) continue;
    if (updatedCol !== undefined) row[updatedCol] = c.changedAt;
    plan.cellUpdates.push({ range: `${tab}!A${i + 1}:${lastCol}${i + 1}`, values: [row] });
  }
  plan.deleteRows.sort((a, b) => b - a);
  return plan;
}
