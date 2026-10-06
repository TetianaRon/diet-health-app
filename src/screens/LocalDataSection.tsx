// Settings when the phone works without Google (release 2.0): the data is only
// on this phone, so this section offers keeping a copy (.xlsx through the
// share sheet), restoring one, and moving everything into a Google spreadsheet.
import { useEffect, useRef, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { getLastLocalBackupAt, restoreLocalBackup, saveLocalBackup } from "../lib/localBackup";
import { moveLocalDataToSheet } from "../lib/localMode";
import { formatDateTime } from "../lib/dateFormat";
import * as sheets from "../lib/sheets";

const t = uk.localMode.settings;

export default function LocalDataSection() {
  const { endLocalMode } = useAuth();
  const { reloadScreens } = useSheetHealth();
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "restore" | "move" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"restore" | "move" | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getLastLocalBackupAt().then(setLastBackupAt);
  }, []);

  const run = async (kind: "save" | "restore" | "move", action: () => Promise<void>, done: string) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run(
      "save",
      async () => {
        await saveLocalBackup();
        setLastBackupAt(await getLastLocalBackupAt());
      },
      t.saved,
    );

  const restore = () => {
    const file = pendingFile;
    setConfirm(null);
    setPendingFile(null);
    if (!file) return;
    void run(
      "restore",
      async () => {
        await restoreLocalBackup(file);
        reloadScreens();
      },
      t.restored,
    );
  };

  const move = () => {
    setConfirm(null);
    void run(
      "move",
      async () => {
        if (!sheets.isSignedIn()) await sheets.signIn();
        await moveLocalDataToSheet();
        endLocalMode();
        reloadScreens();
      },
      t.moved,
    );
  };

  return (
    <div className="settings-account">
      <h2>{t.title}</h2>
      <p>{t.onlyHere}</p>
      <p>{lastBackupAt ? t.lastBackup(formatDateTime(lastBackupAt)) : t.noBackupYet}</p>
      <div className="local-data-actions">
        <button type="button" onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? t.saving : t.saveButton}
        </button>
        <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === "restore" ? t.restoring : t.restoreButton}
        </button>
        <button type="button" className="button-secondary" onClick={() => setConfirm("move")} disabled={busy !== null}>
          {busy === "move" ? t.moving : t.moveButton}
        </button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) {
            setPendingFile(file);
            setConfirm("restore");
          }
        }}
      />
      {message && <p>{message}</p>}
      {error && <p className="food-form-error">{error}</p>}

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="local-confirm-text">
            <p id="local-confirm-text">{confirm === "restore" ? t.confirmRestore(pendingFile?.name ?? "") : t.confirmMove}</p>
            <div className="modal-actions">
              <button type="button" className={confirm === "restore" ? "button-danger" : undefined} onClick={confirm === "restore" ? restore : move}>
                {confirm === "restore" ? t.confirmRestoreYes : t.confirmMoveYes}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setConfirm(null);
                  setPendingFile(null);
                }}
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
