// Backups for the phone working without Google (release 2.0, checkpoint C): an
// .xlsx file with one sheet per tab, in the same layout as the Google
// spreadsheet (row 1 keys, row 2 readable names, data from row 3). It opens in
// any spreadsheet app, restores here, and can be uploaded to Google later.
// Saved through Android's share sheet (Drive, Files, email…); a reminder comes
// when the last backup is over BACKUP_REMINDER_DAYS old.
import { Capacitor } from "@capacitor/core";
import { getLocalMeta, getLocalTab, putLocalTabs, setLocalMeta } from "./localDb";
import { REQUIRED_TABS } from "./tabs";
import { idColumnFor } from "./sync/merge";
import { uk } from "../i18n/uk";

export const BACKUP_REMINDER_DAYS = 30;
const LAST_BACKUP_KEY = "lastLocalBackupAt";

type Xlsx = typeof import("xlsx");
/** SheetJS is loaded only when a backup is saved or restored. */
const loadXlsx = (): Promise<Xlsx> => import("xlsx");

/** Builds the .xlsx bytes from the tabs' grids. */
export function gridsToWorkbook(xlsx: Xlsx, grids: ReadonlyMap<string, unknown[][]>): Uint8Array {
  const book = xlsx.utils.book_new();
  for (const [tab, rows] of grids) xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet(rows), tab);
  return new Uint8Array(xlsx.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/**
 * Reads the tabs back from an .xlsx. Throws (user-facing) if the file isn't a
 * backup of this app: every tab must be there with its ID column in row 1.
 */
export function workbookToGrids(xlsx: Xlsx, bytes: ArrayBuffer | Uint8Array): Map<string, unknown[][]> {
  const book = xlsx.read(bytes, { type: "array" });
  const grids = new Map<string, unknown[][]>();
  for (const tab of REQUIRED_TABS) {
    const sheet = book.Sheets[tab];
    if (!sheet) throw new Error(uk.localBackup.notABackup);
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    if (!(rows[0] ?? []).map((v) => String(v).trim()).includes(idColumnFor(tab))) throw new Error(uk.localBackup.notABackup);
    grids.set(tab, rows);
  }
  return grids;
}

async function currentGrids(): Promise<Map<string, unknown[][]>> {
  const grids = new Map<string, unknown[][]>();
  for (const tab of REQUIRED_TABS) grids.set(tab, (await getLocalTab(tab))?.rows ?? []);
  return grids;
}

function localDateStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** «Зберегти копію даних»: builds the .xlsx and hands it to the share sheet (or a download in a browser). */
export async function saveLocalBackup(): Promise<void> {
  const xlsx = await loadXlsx();
  const bytes = gridsToWorkbook(xlsx, await currentGrids());
  const name = `Трекер харчування — копія ${localDateStamp()}.xlsx`;
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const written = await Filesystem.writeFile({ path: name, data: toBase64(bytes), directory: Directory.Cache });
    await Share.share({ title: name, files: [written.uri] });
  } else {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  await setLocalMeta(LAST_BACKUP_KEY, new Date().toISOString());
}

/** «Відновити з файлу»: replaces the phone's data with the backup's. Callers confirm with the person first. */
export async function restoreLocalBackup(file: File): Promise<void> {
  const xlsx = await loadXlsx();
  const grids = workbookToGrids(xlsx, await file.arrayBuffer());
  const pulledAt = new Date().toISOString();
  await putLocalTabs([...grids].map(([tab, rows]) => ({ tab, rows, pulledAt })));
}

/** When the last backup was saved on this phone (ISO), or null. */
export async function getLastLocalBackupAt(): Promise<string | null> {
  return getLocalMeta(LAST_BACKUP_KEY);
}

/** Whether to remind about a backup at `now` (never saved counts from `since`, the start of local mode). */
export function backupReminderDue(lastBackupAt: string | null, since: string | null, now: Date, days = BACKUP_REMINDER_DAYS): boolean {
  const from = Date.parse(lastBackupAt ?? since ?? "");
  if (Number.isNaN(from)) return false;
  return now.getTime() - from >= days * 24 * 60 * 60 * 1000;
}
