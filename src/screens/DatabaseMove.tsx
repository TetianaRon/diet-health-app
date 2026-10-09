// Moving over to 2.2's clean start, and the first-run offer (spec → "Sets and
// the clean start"). Once per connected sheet per app start, after the
// structure check found it sound (working without Google: once the device's
// data is up to date):
//   • database items she already used (in meals or recipes) become her rows,
//     automatically, with a notice that stays until «Зрозуміло» (developer,
//     2026-10-09); her pre-2.2 copies that still hold the database values get
//     their fingerprint (BasedOnValues), so later corrections can be offered;
//   • a sheet with no products of hers at all is offered the sets once
//     («Переглянути набори» / «Не зараз», remembered on this device per sheet).
// Renders nothing itself.
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import { uk } from "../i18n/uk";
import { listLogEntries } from "../lib/dailyLog";
import { listDishes } from "../lib/dishes";
import { listIngredients, updateIngredients } from "../lib/ingredients";
import { copyFromDatabase, fingerprintFills, usedDatabaseIds } from "../lib/databaseItems";
import { requestOpenSets } from "../lib/openSets";
import { getSpreadsheetId } from "../lib/sheets";
import { isLocalSheetId } from "../lib/localModeId";

const t = uk.databaseSets;
const OFFERED_PREFIX = "trackmymeals.setsOffered.";

function offered(sheetId: string): boolean {
  try {
    return localStorage.getItem(OFFERED_PREFIX + sheetId) === "1";
  } catch {
    return false;
  }
}

function rememberOffered(sheetId: string): void {
  try {
    localStorage.setItem(OFFERED_PREFIX + sheetId, "1");
  } catch {
    // storage blocked — the offer may come back next time
  }
}

export default function DatabaseMove({ onOpenSets }: { onOpenSets: () => void }) {
  const { signedIn, sessionExpired } = useAuth();
  const { hasSpreadsheet, reports, checking, reloadScreens } = useSheetHealth();
  const { show, remove } = useNotifications();
  const [checkedSheet, setCheckedSheet] = useState<string | null>(null);

  const sheetId = hasSpreadsheet ? getSpreadsheetId() : "";
  useEffect(() => {
    const sound = isLocalSheetId(sheetId) ? !checking : reports !== null && reports.length === 0;
    if (!signedIn || sessionExpired || !sheetId || !sound || checkedSheet === sheetId) return;
    setCheckedSheet(sheetId);
    void (async () => {
      const [ingredients, dishes, log] = await Promise.all([listIngredients(), listDishes(), listLogEntries()]);
      const fills = fingerprintFills(ingredients);
      if (fills.length > 0) await updateIngredients(fills);
      const used = usedDatabaseIds(log, dishes, ingredients);
      if (used.length > 0) {
        const copies = await copyFromDatabase(used);
        reloadScreens();
        show({
          key: "database-move",
          kind: "action",
          title: t.moved(copies.length),
          details: [t.movedDetails],
          actions: [{ label: t.movedDismiss, onClick: () => remove("database-move") }],
        });
        return;
      }
      if (ingredients.length === 0 && dishes.length === 0 && !offered(sheetId)) {
        const later = () => {
          rememberOffered(sheetId);
          show({ key: "sets-offer-later", kind: "info", title: t.offerLaterNote });
        };
        show({
          key: "sets-offer",
          kind: "action",
          title: t.offerTitle,
          details: [t.offerDetails],
          actions: [
            {
              label: t.offerOpen,
              onClick: () => {
                rememberOffered(sheetId);
                remove("sets-offer");
                requestOpenSets();
                onOpenSets();
              },
            },
            {
              label: t.offerLater,
              onClick: () => {
                remove("sets-offer");
                later();
              },
            },
          ],
          onDismiss: later,
        });
      }
    })().catch(() => setCheckedSheet(null)); // tried again at the next check
  }, [signedIn, sessionExpired, sheetId, reports, checking, checkedSheet, show, remove, reloadScreens, onOpenSets]);

  return null;
}
