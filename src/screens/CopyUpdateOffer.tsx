// The one-time offer to bring her saved copies of built-in products up to the
// verified values (release 1.8, spec → "Verified food database" → App side).
// Only copies that still hold the pre-1.8 built-in values (she never changed
// them) are offered; copies she edited are never touched. Checked once per
// connected sheet after the structure check passes; «Залишити як є» is
// remembered on this device for that sheet. Renders the action notice and,
// on «Переглянути», the dialog.
import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { useNotifications } from "../context/NotificationsContext";
import { getSpreadsheetId } from "../lib/sheets";
import { listIngredients, updateIngredients } from "../lib/ingredients";
import { copyUpdates, type CopyUpdate } from "../lib/builtInStatus";
import { formatDecimal } from "../lib/numberFormat";

const t = uk.copyUpdate;
const DISMISSED_PREFIX = "trackmymeals.copyUpdate.kept.";

function keptIds(sheetId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_PREFIX + sheetId) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function rememberKept(sheetId: string, ids: string[]) {
  try {
    localStorage.setItem(DISMISSED_PREFIX + sheetId, JSON.stringify([...new Set([...keptIds(sheetId), ...ids])]));
  } catch {
    // storage blocked — the offer may come back next time
  }
}

export default function CopyUpdateOffer() {
  const { signedIn, sessionExpired } = useAuth();
  const { hasSpreadsheet, reports, reloadScreens } = useSheetHealth();
  const { show, remove } = useNotifications();
  const [updates, setUpdates] = useState<CopyUpdate[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedSheet, setCheckedSheet] = useState<string | null>(null);

  // Once per connected sheet, after the structure check found it sound.
  const sheetId = hasSpreadsheet ? getSpreadsheetId() : "";
  useEffect(() => {
    if (!signedIn || sessionExpired || !sheetId || reports === null || reports.length > 0 || checkedSheet === sheetId) return;
    setCheckedSheet(sheetId);
    listIngredients()
      .then((rows) => {
        const kept = keptIds(sheetId);
        setUpdates(copyUpdates(rows).filter((u) => !kept.has(u.copy.id)));
      })
      .catch(() => setUpdates(null)); // not worth an error of its own; it's checked again next time
  }, [signedIn, sessionExpired, sheetId, reports, checkedSheet]);

  useEffect(() => {
    if (!updates || updates.length === 0) {
      remove("copy-update");
      return;
    }
    show({ key: "copy-update", kind: "action", title: t.notice(updates.length), actions: [{ label: t.review, onClick: () => setOpen(true) }] });
  }, [updates, show, remove]);

  if (!open || !updates || updates.length === 0) return null;

  const close = () => {
    setOpen(false);
    setError(null);
  };
  const keep = () => {
    rememberKept(sheetId, updates.map((u) => u.copy.id));
    setUpdates([]);
    close();
  };
  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateIngredients(updates.map((u) => u.updated));
      setUpdates([]);
      close();
      show({ key: "copy-update-done", kind: "info", title: t.done });
      reloadScreens();
    } catch (err) {
      setError(t.failed(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="copy-update-title">
        <h2 id="copy-update-title">{t.title}</h2>
        <p>{t.intro}</p>
        <ul className="copy-update-list">
          {updates.map((u) => (
            <li key={u.copy.id}>
              <strong>{u.updated.nameUk}</strong>
              <span className="food-form-hint">
                {t.line(formatDecimal(u.copy.carbsG), formatDecimal(u.updated.carbsG), String(u.copy.gi), u.updated.unknownFields.includes("gi") ? "—" : String(u.updated.gi))}
              </span>
            </li>
          ))}
        </ul>
        {error && <p className="food-form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={() => void apply()} disabled={busy}>
            {busy ? t.updating : t.update(updates.length)}
          </button>
          <button type="button" className="button-secondary" onClick={keep} disabled={busy}>
            {t.keep}
          </button>
        </div>
      </div>
    </div>
  );
}
