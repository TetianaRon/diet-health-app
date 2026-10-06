// The on-device database: SQLite (WebAssembly) in a dedicated worker, stored
// in the browser's private file storage through the "SAH pool" VFS. That VFS
// needs no COOP/COEP headers, which would break Google sign-in popups. The
// same build runs inside the Android app's WebView. Proven in the
// spike/sqlite-web branch (docs/technical-spec.md → "Local-first app").
//
// One database file per connected spreadsheet. Only one tab may hold it at a
// time; the client (index.ts) coordinates that with a Web Lock.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { WithoutId, WorkerRequest, WorkerResponse } from "./protocol";

type Db = {
  exec: (sql: string | { sql: string; bind?: unknown[]; rowMode?: "array"; returnValue?: "resultRows" }) => unknown;
  close: () => void;
};

const SCHEMA_VERSION = 2;
let pool: Awaited<ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]>> | null = null;
let db: Db | null = null;
let dbName: string | null = null;

function fileName(spreadsheetId: string): string {
  return `/tmm-${spreadsheetId.replace(/[^A-Za-z0-9_-]/g, "")}.sqlite3`;
}

async function ensurePool() {
  if (!pool) {
    const sqlite3 = await sqlite3InitModule();
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: "trackmymeals", initialCapacity: 12 });
  }
  return pool;
}

async function open(spreadsheetId: string): Promise<void> {
  if (db) db.close();
  const p = await ensurePool();
  dbName = fileName(spreadsheetId);
  db = new p.OpfsSAHPoolDb(dbName) as unknown as Db;
  db.exec(`
    create table if not exists meta (key text primary key, value text);
    create table if not exists tabs (tab text primary key, pulled_at text not null);
    create table if not exists tab_rows (tab text not null, row_index integer not null, cells text not null, primary key (tab, row_index));
    create table if not exists changes (seq integer primary key autoincrement, tab text not null, record_id text not null, op text not null, fields text not null, base text not null, changed_at text not null);
  `);
  db.exec({ sql: "insert into meta(key, value) values ('schema_version', ?) on conflict(key) do update set value = excluded.value", bind: [String(SCHEMA_VERSION)] });
}

function rowsOf(sql: string, bind: unknown[] = []): unknown[][] {
  return db!.exec({ sql, bind, rowMode: "array", returnValue: "resultRows" }) as unknown[][];
}

function getTab(tab: string) {
  const meta = rowsOf("select pulled_at from tabs where tab = ?", [tab]);
  if (meta.length === 0) return null;
  const rows = rowsOf("select cells from tab_rows where tab = ? order by row_index", [tab]).map((r) => JSON.parse(String(r[0])) as unknown[]);
  return { tab, rows, pulledAt: String(meta[0][0]) };
}

function putTabs(snapshots: { tab: string; rows: unknown[][]; pulledAt: string }[]): void {
  db!.exec("begin");
  try {
    for (const { tab, rows, pulledAt } of snapshots) {
      db!.exec({ sql: "delete from tab_rows where tab = ?", bind: [tab] });
      rows.forEach((cells, i) => db!.exec({ sql: "insert into tab_rows (tab, row_index, cells) values (?, ?, ?)", bind: [tab, i, JSON.stringify(cells)] }));
      db!.exec({ sql: "insert into tabs (tab, pulled_at) values (?, ?) on conflict(tab) do update set pulled_at = excluded.pulled_at", bind: [tab, pulledAt] });
    }
    db!.exec("commit");
  } catch (err) {
    db!.exec("rollback");
    throw err;
  }
}

function getMeta(key: string): string | null {
  const r = rowsOf("select value from meta where key = ?", [key]);
  return r.length ? String(r[0][0]) : null;
}

function setMeta(key: string, value: string): void {
  db!.exec({ sql: "insert into meta(key, value) values (?, ?) on conflict(key) do update set value = excluded.value", bind: [key, value] });
}

function addChange(c: { tab: string; id: string; op: string; fields: unknown; base: unknown; changedAt: string }): number {
  db!.exec({ sql: "insert into changes (tab, record_id, op, fields, base, changed_at) values (?, ?, ?, ?, ?, ?)", bind: [c.tab, c.id, c.op, JSON.stringify(c.fields), JSON.stringify(c.base), c.changedAt] });
  return Number(rowsOf("select last_insert_rowid()")[0][0]);
}

function listChanges() {
  return rowsOf("select seq, tab, record_id, op, fields, base, changed_at from changes order by seq").map((r) => ({
    seq: Number(r[0]),
    tab: String(r[1]),
    id: String(r[2]),
    op: String(r[3]),
    fields: JSON.parse(String(r[4])),
    base: JSON.parse(String(r[5])),
    changedAt: String(r[6]),
  }));
}

function removeChanges(seqs: number[]): void {
  if (seqs.length === 0) return;
  db!.exec("begin");
  try {
    for (const seq of seqs) db!.exec({ sql: "delete from changes where seq = ?", bind: [seq] });
    db!.exec("commit");
  } catch (err) {
    db!.exec("rollback");
    throw err;
  }
}

/**
 * The web's privacy rule (release 2.0): every database file except the kept
 * ones loses its copy of the sheet. Saves that haven't reached the sheet stay,
 * unless older than `changesSince`; so do small markers such as backupDone.
 */
async function forgetCopies(keepSpreadsheetIds: string[], changesSince: string): Promise<void> {
  const p = await ensurePool();
  const keep = new Set(keepSpreadsheetIds.map(fileName));
  for (const name of p.getFileNames()) {
    if (!name.startsWith("/tmm-") || keep.has(name)) continue;
    const target = name === dbName && db ? db : (new p.OpfsSAHPoolDb(name) as unknown as Db);
    try {
      target.exec("delete from tab_rows; delete from tabs; delete from meta where key = 'lastPullAt'");
      target.exec({ sql: "delete from changes where changed_at < ?", bind: [changesSince] });
    } catch (err) {
      console.warn("[localDb] couldn't clear", name, err);
    } finally {
      if (target !== db) target.close();
    }
  }
}

function close(): void {
  db?.close();
  db = null;
  dbName = null;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const reply = (r: WithoutId<WorkerResponse>) => self.postMessage({ id: req.id, ...r } as WorkerResponse);
  try {
    switch (req.op) {
      case "open":
        await open(req.spreadsheetId);
        return reply({ ok: true });
      case "getTab":
        return reply({ ok: true, value: getTab(req.tab) });
      case "putTabs":
        putTabs(req.snapshots);
        return reply({ ok: true });
      case "getMeta":
        return reply({ ok: true, value: getMeta(req.key) });
      case "setMeta":
        setMeta(req.key, req.value);
        return reply({ ok: true });
      case "addChange":
        return reply({ ok: true, value: addChange(req.change) });
      case "listChanges":
        return reply({ ok: true, value: listChanges() });
      case "removeChanges":
        removeChanges(req.seqs);
        return reply({ ok: true });
      case "forgetCopies":
        await forgetCopies(req.keepSpreadsheetIds, req.changesSince);
        return reply({ ok: true });
      case "close":
        close();
        return reply({ ok: true });
    }
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
};
