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

const SCHEMA_VERSION = 1;
let pool: Awaited<ReturnType<Awaited<ReturnType<typeof sqlite3InitModule>>["installOpfsSAHPoolVfs"]>> | null = null;
let db: Db | null = null;

async function open(spreadsheetId: string): Promise<void> {
  if (db) db.close();
  if (!pool) {
    const sqlite3 = await sqlite3InitModule();
    pool = await sqlite3.installOpfsSAHPoolVfs({ name: "trackmymeals", initialCapacity: 12 });
  }
  db = new pool.OpfsSAHPoolDb(`/tmm-${spreadsheetId.replace(/[^A-Za-z0-9_-]/g, "")}.sqlite3`) as unknown as Db;
  db.exec(`
    create table if not exists meta (key text primary key, value text);
    create table if not exists tabs (tab text primary key, pulled_at text not null);
    create table if not exists tab_rows (tab text not null, row_index integer not null, cells text not null, primary key (tab, row_index));
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

function close(): void {
  db?.close();
  db = null;
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
      case "close":
        close();
        return reply({ ok: true });
    }
  } catch (err) {
    reply({ ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
};
