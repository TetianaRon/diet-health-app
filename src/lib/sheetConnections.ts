// Which spreadsheets the «Підключити таблицю» window offers (release 1.7.1,
// spec → "Connecting a spreadsheet"). Three sources besides "create new" and
// "paste a link":
//   • found  — sheets this app created or was given, listed from Google Drive
//              (drive.file scope: the app sees only those files);
//   • recent — sheets this device connected before, kept ONLY on the device
//              (localStorage), never on a server;
//   • known  — sheet IDs built into the app (mom's, test, dev), shown only
//              when the signed-in account can actually open them — access
//              decides who sees what, no emails in the app.
// A sheet appears once, in the first section it belongs to; the connected
// one is left out (Settings already shows it). Pure apart from the storage
// helpers at the bottom.

export interface SheetOption {
  id: string;
  title: string;
}

export interface RecentSheet extends SheetOption {
  /** ISO time it was last connected on this device. */
  lastUsed: string;
}

export const MAX_RECENT_SHEETS = 10;

/** Puts a sheet at the top of the recent list (newest first, no repeats, at most MAX_RECENT_SHEETS). */
export function addRecentSheet(list: readonly RecentSheet[], sheet: SheetOption, now: Date = new Date()): RecentSheet[] {
  const rest = list.filter((s) => s.id !== sheet.id);
  const previousTitle = list.find((s) => s.id === sheet.id)?.title ?? "";
  const entry = { id: sheet.id, title: sheet.title || previousTitle, lastUsed: now.toISOString() };
  return [entry, ...rest].slice(0, MAX_RECENT_SHEETS);
}

/** Updates a remembered sheet's title (it can be renamed in Google Sheets) without changing its place. */
export function renameRecentSheet(list: readonly RecentSheet[], id: string, title: string): RecentSheet[] {
  return list.map((s) => (s.id === id && title && s.title !== title ? { ...s, title } : s));
}

export function forgetRecentSheet(list: readonly RecentSheet[], id: string): RecentSheet[] {
  return list.filter((s) => s.id !== id);
}

/** The built-in sheet IDs, without blanks or repeats. */
export function knownSheetIds(values: readonly (string | undefined)[]): string[] {
  const ids = values.flatMap((v) => (v ?? "").split(",")).map((v) => v.trim()).filter(Boolean);
  return [...new Set(ids)];
}

export interface ConnectOptions {
  found: SheetOption[];
  recent: RecentSheet[];
  known: SheetOption[];
}

/** Each sheet once, in the first section it belongs to (found → recent → known), without the connected one. */
export function connectOptions(input: { currentId: string; found: SheetOption[]; recent: RecentSheet[]; known: SheetOption[] }): ConnectOptions {
  const seen = new Set(input.currentId ? [input.currentId] : []);
  const take = <T extends SheetOption>(list: T[]) =>
    list.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  return { found: take(input.found), recent: take(input.recent), known: take(input.known) };
}

// --- Device storage (never synced anywhere) ---

const RECENT_STORAGE_KEY = "trackmymeals.recentSheets";

export function loadRecentSheets(): RecentSheet[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((s): s is RecentSheet => typeof s?.id === "string" && s.id !== "").map((s) => ({ id: s.id, title: String(s.title ?? ""), lastUsed: String(s.lastUsed ?? "") }))
      : [];
  } catch {
    return [];
  }
}

export function saveRecentSheets(list: readonly RecentSheet[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage blocked — the list just isn't remembered
  }
}
