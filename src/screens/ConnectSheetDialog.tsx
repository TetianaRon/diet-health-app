// The «Підключити таблицю» window (release 1.7.1, spec → "Connecting a
// spreadsheet"), opened from Settings or from the "no spreadsheet" notice.
// Top to bottom: sheets found in her Google Drive, create a new one, sheets
// this device connected before (kept only on the device), built-in sheets
// her account can open, and paste a link. See sheetConnections.ts.
import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useSheetHealth } from "../context/SheetHealthContext";
import {
  createSpreadsheetInAppFolder,
  getKnownSpreadsheetIds,
  getSpreadsheetId,
  getSpreadsheetTitle,
  listAppSpreadsheets,
  parseSpreadsheetId,
  setSpreadsheetId,
} from "../lib/sheets";
import { initializeSpreadsheet } from "../lib/spreadsheetInit";
import { connectOptions, forgetRecentSheet, loadRecentSheets, saveRecentSheets, type RecentSheet, type SheetOption } from "../lib/sheetConnections";

const t = uk.connectSheet;

function SheetList({
  sheets,
  busy,
  onConnect,
  onForget,
}: {
  sheets: SheetOption[];
  busy: boolean;
  onConnect: (sheet: SheetOption) => void;
  onForget?: (sheet: SheetOption) => void;
}) {
  return (
    <ul className="connect-sheet-list">
      {sheets.map((sheet) => (
        <li key={sheet.id}>
          <span className="connect-sheet-title">{sheet.title || t.untitled}</span>
          <span className="connect-sheet-actions">
            <button type="button" className="button-secondary" disabled={busy} onClick={() => onConnect(sheet)}>
              {t.connectThis}
            </button>
            {onForget && (
              <button
                type="button"
                className="icon-button connect-sheet-forget"
                aria-label={t.forgetLabel(sheet.title || t.untitled)}
                title={t.forgetLabel(sheet.title || t.untitled)}
                disabled={busy}
                onClick={() => onForget(sheet)}
              >
                ✕
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ConnectSheetDialog() {
  const { connectOpen, closeConnect, connectSpreadsheet } = useSheetHealth();
  const [found, setFound] = useState<SheetOption[] | null>(null);
  const [foundError, setFoundError] = useState(false);
  const [known, setKnown] = useState<SheetOption[] | null>(null);
  const [recent, setRecent] = useState<RecentSheet[]>([]);
  const [newName, setNewName] = useState<string>(t.newNameDefault);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown under the link field, where the person is looking.
  const [linkError, setLinkError] = useState<string | null>(null);

  // Each opening looks again: a sheet may have been created on another device.
  useEffect(() => {
    if (!connectOpen) return;
    let cancelled = false;
    setFound(null);
    setFoundError(false);
    setKnown(null);
    setError(null);
    setLinkError(null);
    setLink("");
    setRecent(loadRecentSheets());
    listAppSpreadsheets()
      .then((files) => !cancelled && setFound(files))
      .catch(() => {
        if (!cancelled) {
          setFound([]);
          setFoundError(true);
        }
      });
    Promise.all(getKnownSpreadsheetIds().map(async (id) => ({ id, title: await getSpreadsheetTitle(id) })))
      .then((results) => !cancelled && setKnown(results.filter((r): r is SheetOption => r.title !== null)))
      .catch(() => !cancelled && setKnown([]));
    return () => {
      cancelled = true;
    };
  }, [connectOpen]);

  if (!connectOpen) return null;

  const options = connectOptions({ currentId: getSpreadsheetId(), found: found ?? [], recent, known: known ?? [] });

  const run = async (action: () => Promise<void>, showError: (message: string) => void = setError) => {
    setBusy(true);
    setError(null);
    setLinkError(null);
    try {
      await action();
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const connect = (sheet: SheetOption) => void run(() => connectSpreadsheet(sheet));

  const create = () =>
    void run(async () => {
      const name = newName.trim();
      if (!name) throw new Error(t.newNameValidationError);
      const id = await createSpreadsheetInAppFolder(name);
      const previous = getSpreadsheetId();
      setSpreadsheetId(id); // initializeSpreadsheet works on the connected sheet
      try {
        await initializeSpreadsheet();
      } catch (err) {
        setSpreadsheetId(previous); // stay on the old sheet if the new one couldn't be set up
        throw err;
      }
      await connectSpreadsheet({ id, title: name }, { isNew: true });
    });

  const connectLink = () =>
    void run(async () => {
      const id = parseSpreadsheetId(link);
      if (!id) throw new Error(t.linkValidationError);
      const title = await getSpreadsheetTitle(id);
      if (title === null) throw new Error(t.linkNoAccess);
      await connectSpreadsheet({ id, title });
    }, setLinkError);

  const forget = (sheet: SheetOption) => {
    const next = forgetRecentSheet(recent, sheet.id);
    saveRecentSheets(next);
    setRecent(next);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal connect-sheet" role="dialog" aria-modal="true" aria-labelledby="connect-sheet-title">
        <h2 id="connect-sheet-title">{t.title}</h2>
        {error && <p className="food-form-error">{error}</p>}

        <section>
          <h3>{t.foundTitle}</h3>
          {found === null ? (
            <p className="food-form-hint">{t.searching}</p>
          ) : options.found.length > 0 ? (
            <SheetList sheets={options.found} busy={busy} onConnect={connect} />
          ) : (
            <p className="food-form-hint">{foundError ? t.foundError : t.foundNone}</p>
          )}
        </section>

        <section>
          <h3>{t.newTitle}</h3>
          <p className="food-form-hint">{t.newHint}</p>
          <label>
            {t.newNameLabel}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={create}>
            {busy ? t.working : t.createButton}
          </button>
        </section>

        {options.recent.length > 0 && (
          <section>
            <h3>{t.recentTitle}</h3>
            <SheetList sheets={options.recent} busy={busy} onConnect={connect} onForget={forget} />
          </section>
        )}

        {/* Checking access takes a moment (one request per built-in sheet) — say so instead of popping in late. */}
        {known === null && getKnownSpreadsheetIds().length > 0 ? (
          <section>
            <h3>{t.knownTitle}</h3>
            <p className="food-form-hint">{t.checkingAccess}</p>
          </section>
        ) : (
          options.known.length > 0 && (
            <section>
              <h3>{t.knownTitle}</h3>
              <SheetList sheets={options.known} busy={busy} onConnect={connect} />
            </section>
          )
        )}

        <section>
          <h3>{t.linkTitle}</h3>
          <label>
            {t.linkLabel}
            <input value={link} placeholder={t.linkPlaceholder} onChange={(e) => setLink(e.target.value)} />
          </label>
          {linkError && <p className="food-form-error">{linkError}</p>}
          <button type="button" className="button-secondary" disabled={busy} onClick={connectLink}>
            {t.connectThis}
          </button>
        </section>

        <div className="modal-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={closeConnect}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
