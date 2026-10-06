// Backup copies of the spreadsheet (release 2.0): a full snapshot saved as a
// separate file in the app's Drive folder before a risky change — first used
// before a device's first sync. Each copy is registered on the device; once it
// is BACKUP_KEEP_DAYS old and syncing works, the app moves it to Drive's trash
// itself (recoverable there for 30 days), so the person never has to tidy up.
// Any future update that needs a safety copy uses makeBackupCopy the same way.
import { createBackupSpreadsheet, trashDriveFile } from "./sheets";
import { getLocalMeta, setLocalMeta } from "./localDb";

export const BACKUP_KEEP_DAYS = 14;
const REGISTRY_KEY = "backups";

export interface BackupRecord {
  fileId: string;
  /** Why it was made, e.g. "first-sync". */
  reason: string;
  /** ISO time it was made. */
  createdAt: string;
}

async function readRegistry(): Promise<BackupRecord[]> {
  try {
    return JSON.parse((await getLocalMeta(REGISTRY_KEY)) ?? "[]") as BackupRecord[];
  } catch {
    return [];
  }
}

async function writeRegistry(records: BackupRecord[]): Promise<void> {
  await setLocalMeta(REGISTRY_KEY, JSON.stringify(records));
}

/** Saves a snapshot of the given tabs as a new file and registers it for automatic clean-up. */
export async function makeBackupCopy(reason: string, title: string, grids: ReadonlyMap<string, unknown[][]>): Promise<BackupRecord> {
  const record: BackupRecord = { fileId: await createBackupSpreadsheet(title, grids), reason, createdAt: new Date().toISOString() };
  await writeRegistry([...(await readRegistry()), record]);
  return record;
}

/** The registered copies old enough to remove at `now`. */
export function backupsDue(records: readonly BackupRecord[], now: Date, keepDays = BACKUP_KEEP_DAYS): BackupRecord[] {
  const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000;
  return records.filter((r) => {
    const made = Date.parse(r.createdAt);
    return !Number.isNaN(made) && made <= cutoff;
  });
}

const listeners = new Set<(count: number) => void>();

/** Called with the number of copies moved to the trash (for the user's note). */
export function onBackupsTrashed(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Moves copies older than BACKUP_KEEP_DAYS to Drive's trash. Called after a
 * successful sync, so a copy is only removed while syncing works. A copy
 * already deleted by hand just leaves the registry.
 */
export async function cleanUpBackups(now = new Date()): Promise<number> {
  const records = await readRegistry();
  const due = backupsDue(records, now);
  if (due.length === 0) return 0;
  const removed = new Set<string>();
  for (const record of due) {
    try {
      await trashDriveFile(record.fileId);
      removed.add(record.fileId);
    } catch (err) {
      console.warn("[backups] could not trash", record.fileId, err);
    }
  }
  if (removed.size === 0) return 0;
  await writeRegistry(records.filter((r) => !removed.has(r.fileId)));
  listeners.forEach((l) => l(removed.size));
  return removed.size;
}
