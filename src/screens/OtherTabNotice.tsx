// Shown when another browser tab holds the device database (release 2.0): only
// one tab can open it at a time. «Відкрити тут» takes it over; the other tab
// then shows this same notice.
import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { getLocalDbStatus, onLocalDbStatus, takeOverLocalDb, type LocalDbStatus } from "../lib/localDb";
import { getSpreadsheetId } from "../lib/sheets";
import { useSheetHealth } from "../context/SheetHealthContext";

export default function OtherTabNotice() {
  const { reloadScreens } = useSheetHealth();
  const [status, setStatus] = useState<LocalDbStatus>(getLocalDbStatus);
  const [taking, setTaking] = useState(false);

  useEffect(() => onLocalDbStatus(setStatus), []);

  if (status !== "busy") return null;

  const takeOver = async () => {
    setTaking(true);
    try {
      await takeOverLocalDb(getSpreadsheetId());
      reloadScreens();
    } finally {
      setTaking(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="other-tab-text">
        <p id="other-tab-text">
          <strong>{uk.otherTab.title}</strong>
        </p>
        <p>{uk.otherTab.body}</p>
        <div className="modal-actions">
          <button type="button" onClick={() => void takeOver()} disabled={taking}>
            {taking ? uk.otherTab.opening : uk.otherTab.openHere}
          </button>
        </div>
      </div>
    </div>
  );
}
