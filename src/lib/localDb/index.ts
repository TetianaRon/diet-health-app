// The app's side of the on-device database (worker.ts). One spreadsheet's
// database is open at a time, held by one tab: a Web Lock marks the holder,
// and «Відкрити тут» in another tab asks it (BroadcastChannel) to let go.
// Where the worker can't run (tests, browsers without OPFS) an in-memory
// store stands in, so the app behaves as before: read from the sheet,
// nothing kept between visits.
import type { TabSnapshot, WithoutId, WorkerRequest, WorkerResponse } from "./protocol";

export type { TabSnapshot } from "./protocol";

/** none: nothing open · ready: SQLite on the device · memory: in-memory stand-in · busy: another tab holds the database. */
export type LocalDbStatus = "none" | "ready" | "memory" | "busy";

interface Store {
  getTab(tab: string): Promise<TabSnapshot | null>;
  putTabs(snapshots: TabSnapshot[]): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  close(): Promise<void>;
}

export function createMemoryStore(): Store {
  const tabs = new Map<string, TabSnapshot>();
  const meta = new Map<string, string>();
  return {
    getTab: async (tab) => tabs.get(tab) ?? null,
    putTabs: async (snapshots) => snapshots.forEach((s) => tabs.set(s.tab, { ...s, rows: s.rows.map((r) => [...r]) })),
    getMeta: async (key) => meta.get(key) ?? null,
    setMeta: async (key, value) => void meta.set(key, value),
    close: async () => undefined,
  };
}

const LOCK_NAME = "trackmymeals-localdb";
const CHANNEL_NAME = "trackmymeals-localdb";

let worker: Worker | null = null;
let nextRequestId = 0;
const pending = new Map<number, (r: WorkerResponse) => void>();

function workerCall(req: WithoutId<WorkerRequest>): Promise<unknown> {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (r) => (r.ok ? resolve(r.value) : reject(new Error(r.error))));
    worker!.postMessage({ ...req, id } as WorkerRequest);
  });
}

/** Ends the worker: the only way to free the storage handles SQLite's pool holds, so another tab can open the database. */
function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  pending.forEach((resolve, id) => resolve({ id, ok: false, error: "Database closed" }));
  pending.clear();
}

const workerStore: Store = {
  getTab: async (tab) => (await workerCall({ op: "getTab", tab })) as TabSnapshot | null,
  putTabs: async (snapshots) => void (await workerCall({ op: "putTabs", snapshots })),
  getMeta: async (key) => (await workerCall({ op: "getMeta", key })) as string | null,
  setMeta: async (key, value) => void (await workerCall({ op: "setMeta", key, value })),
  close: async () => void (await workerCall({ op: "close" })),
};

let store: Store | null = null;
let status: LocalDbStatus = "none";
let openSheetId: string | null = null;
let releaseLock: (() => void) | null = null;
const listeners = new Set<(s: LocalDbStatus) => void>();
let channel: BroadcastChannel | null = null;

function setStatus(next: LocalDbStatus): void {
  status = next;
  listeners.forEach((l) => l(next));
}

export function getLocalDbStatus(): LocalDbStatus {
  return status;
}

export function onLocalDbStatus(listener: (s: LocalDbStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && typeof navigator !== "undefined" && !!navigator.storage?.getDirectory && !!navigator.locks && typeof BroadcastChannel !== "undefined";
}

function listenForTakeover(): void {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = async (e) => {
    if (e.data?.type === "release" && status === "ready") {
      await workerStore.close().catch(() => undefined);
      terminateWorker();
      store = null;
      openSheetId = null;
      releaseLock?.();
      releaseLock = null;
      setStatus("busy");
    }
  };
}

/** Holds the lock until release() is called; resolves false if another tab holds it (and `wait` is false). */
function acquireLock(wait: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK_NAME, { ifAvailable: !wait }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        return new Promise<void>((done) => (releaseLock = done));
      })
      .catch(() => resolve(false));
  });
}

async function openWorkerStore(spreadsheetId: string): Promise<void> {
  await workerCall({ op: "open", spreadsheetId });
  store = workerStore;
  openSheetId = spreadsheetId;
  setStatus("ready");
}

/** Opens this spreadsheet's database on the device (or the in-memory stand-in). Status "busy" means another tab holds it. */
export async function openLocalDb(spreadsheetId: string): Promise<LocalDbStatus> {
  if (openSheetId === spreadsheetId && (status === "ready" || status === "memory")) return status;
  if (status === "ready") await workerStore.close().catch(() => undefined);
  openSheetId = null;
  if (!canUseWorker()) {
    store = createMemoryStore();
    openSheetId = spreadsheetId;
    setStatus("memory");
    return status;
  }
  listenForTakeover();
  if (!releaseLock && !(await acquireLock(false))) {
    store = null;
    setStatus("busy");
    return status;
  }
  try {
    await openWorkerStore(spreadsheetId);
  } catch (err) {
    console.warn("[localDb] falling back to memory:", err);
    releaseLock?.();
    releaseLock = null;
    store = createMemoryStore();
    openSheetId = spreadsheetId;
    setStatus("memory");
  }
  return status;
}

/** «Відкрити тут»: asks the tab holding the database to let go, then opens it here. */
export async function takeOverLocalDb(spreadsheetId: string): Promise<LocalDbStatus> {
  listenForTakeover();
  channel?.postMessage({ type: "release" });
  if (!(await acquireLock(true))) return status;
  try {
    await openWorkerStore(spreadsheetId);
  } catch (err) {
    console.warn("[localDb] takeover failed:", err);
    releaseLock?.();
    releaseLock = null;
    setStatus("busy");
  }
  return status;
}

export async function closeLocalDb(): Promise<void> {
  await store?.close().catch(() => undefined);
  if (status === "ready") terminateWorker();
  store = null;
  openSheetId = null;
  releaseLock?.();
  releaseLock = null;
  setStatus("none");
}

/** The open spreadsheet's local copy of a tab, or null (nothing stored yet, or no database open). */
export async function getLocalTab(tab: string): Promise<TabSnapshot | null> {
  return store ? store.getTab(tab) : null;
}

export async function putLocalTabs(snapshots: TabSnapshot[]): Promise<void> {
  if (store && snapshots.length > 0) await store.putTabs(snapshots);
}

export async function getLocalMeta(key: string): Promise<string | null> {
  return store ? store.getMeta(key) : null;
}

export async function setLocalMeta(key: string, value: string): Promise<void> {
  if (store) await store.setMeta(key, value);
}

/** Which spreadsheet's database is open (null when none, or when another tab holds it). */
export function getOpenSpreadsheetId(): string | null {
  return openSheetId;
}
