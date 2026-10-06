// Messages between the app and the database worker (worker.ts).

export interface TabSnapshot {
  tab: string;
  /** The tab's cells as the Sheets values API returns them: row 1 keys, row 2 readable names, then data. */
  rows: unknown[][];
  /** When this copy was fetched from the sheet (ISO time). */
  pulledAt: string;
}

/** A save waiting to reach the sheet (see sync/merge.ts → RecordChange). */
export interface StoredChange {
  seq: number;
  tab: string;
  id: string;
  op: "upsert" | "delete";
  fields: Record<string, unknown>;
  base: Record<string, unknown>;
  changedAt: string;
}

export type WorkerRequest =
  | { id: number; op: "open"; spreadsheetId: string }
  | { id: number; op: "getTab"; tab: string }
  | { id: number; op: "putTabs"; snapshots: TabSnapshot[] }
  | { id: number; op: "getMeta"; key: string }
  | { id: number; op: "setMeta"; key: string; value: string }
  | { id: number; op: "addChange"; change: Omit<StoredChange, "seq"> }
  | { id: number; op: "listChanges" }
  | { id: number; op: "removeChanges"; seqs: number[] }
  | { id: number; op: "forgetCopies"; keepSpreadsheetIds: string[]; changesSince: string }
  | { id: number; op: "close" };

export type WorkerResponse = { id: number; ok: true; value?: unknown } | { id: number; ok: false; error: string };

/** A request or response without its id (distributes over the union). */
export type WithoutId<T> = T extends unknown ? Omit<T, "id"> : never;
