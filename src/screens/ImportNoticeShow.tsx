// Shows a developer import's notice once on each device (release 2.3.1):
// «Додано ваші продукти зі старої таблиці» stays until «Зрозуміло»; the device
// remembers it per sheet, so it doesn't come back. Renders nothing itself.
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { uk } from "../i18n/uk";
import { importNoticeOf } from "../lib/importNotice";
import { getSpreadsheetId, readRange } from "../lib/sheets";
import { isLocalSheetId } from "../lib/localModeId";

const SEEN_PREFIX = "trackmymeals.importNoticeSeen.";

function seen(sheetId: string): string | null {
  try {
    return localStorage.getItem(SEEN_PREFIX + sheetId);
  } catch {
    return null;
  }
}

function rememberSeen(sheetId: string, at: string): void {
  try {
    localStorage.setItem(SEEN_PREFIX + sheetId, at);
  } catch {
    // storage blocked — the notice may show again
  }
}

export default function ImportNoticeShow() {
  const { signedIn, sessionExpired } = useAuth();
  const { hasSpreadsheet, reports } = useSheetHealth();
  const { show, remove } = useNotifications();
  const [checkedSheet, setCheckedSheet] = useState<string | null>(null);

  const sheetId = hasSpreadsheet ? getSpreadsheetId() : "";
  useEffect(() => {
    if (!signedIn || sessionExpired || !sheetId || isLocalSheetId(sheetId) || reports === null || reports.length > 0 || checkedSheet === sheetId) return;
    setCheckedSheet(sheetId);
    readRange("Settings", "A1:C200")
      .then((rows) => {
        const notice = importNoticeOf(rows);
        if (!notice || seen(sheetId) === notice.at) return;
        const done = () => rememberSeen(sheetId, notice.at);
        show({
          key: "import-notice",
          kind: "action",
          title: notice.text,
          actions: [
            {
              label: uk.importNotice.dismiss,
              onClick: () => {
                done();
                remove("import-notice");
              },
            },
          ],
          onDismiss: done,
        });
      })
      .catch(() => setCheckedSheet(null));
  }, [signedIn, sessionExpired, sheetId, reports, checkedSheet, show, remove]);

  return null;
}
