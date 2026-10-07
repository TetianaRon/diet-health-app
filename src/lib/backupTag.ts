// How backup copies are told apart from real spreadsheets (release 2.0,
// build 20): the connect window must never offer one — saves sent into a copy
// would go to the trash with it after 14 days. No imports.

/** Drive appProperties set on every backup copy at creation. */
export const BACKUP_APP_PROPERTY = { trackmymealsBackup: "1" } as const;

/** Every backup copy's name starts with this (copies made before the tag existed are found by it). */
export const BACKUP_NAME_PREFIX = "Трекер харчування — копія перед синхронізацією";

export function isBackupCopyName(name: string): boolean {
  return name.trim().startsWith(BACKUP_NAME_PREFIX);
}
