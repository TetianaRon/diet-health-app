// The reminder popups in the shared notice queue (release 2.1.3), Android only:
//   • never chosen      → after sign-in, once: «Нагадувати, коли час поїсти?»
//                         «Увімкнути нагадування» / «Не зараз». Closing it is
//                         «Не зараз»: it says Settings can turn them on, and
//                         never comes back.
//   • on, permission    → «Дозволити нагадування» / «Вимкнути нагадування».
//     missing             Closed with ✕: back at the next app start.
// Renders nothing itself.
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationsContext";
import { uk } from "../i18n/uk";
import { reminderPopup, remindersOffered, setReminderChoice, setRemindersOffered, useReminderChoice } from "../lib/reminderChoice";
import { requestReminderAccess, turnRemindersOff, turnRemindersOn } from "../lib/reminderScheduler";
import { missingPermissionLines, useReminderAccess } from "./ReminderSetting";

const t = uk.reminders;

export default function ReminderPopups() {
  const { signedIn, localMode } = useAuth();
  const { show, remove } = useNotifications();
  const choice = useReminderChoice();
  const [access, recheck] = useReminderAccess();
  // ✕ on the missing-permission popup: not again until the app starts again.
  const missingClosed = useRef(false);

  useEffect(() => {
    const ready = Capacitor.isNativePlatform() && (signedIn || localMode) && access !== null;
    const popup = ready && access ? reminderPopup(choice, remindersOffered(), access) : null;

    if (popup !== "offer") remove("reminders-offer");
    if (popup !== "missing") remove("reminders-missing");

    if (popup === "offer") {
      const notNow = () => {
        setRemindersOffered();
        setReminderChoice("off");
        show({ key: "reminders-later", kind: "info", title: t.offer.later });
      };
      show({
        key: "reminders-offer",
        kind: "action",
        title: t.offer.title,
        details: [t.offer.details],
        actions: [
          {
            label: t.offer.turnOn,
            onClick: () => {
              setRemindersOffered();
              remove("reminders-offer");
              void turnRemindersOn().then((result) => {
                if (result === "denied") show({ key: "reminders-later", kind: "action", title: t.offer.denied });
                recheck();
              });
            },
          },
          {
            label: t.offer.notNow,
            onClick: () => {
              remove("reminders-offer");
              notNow();
            },
          },
        ],
        onDismiss: notNow,
      });
    }

    if (popup === "missing" && access && !missingClosed.current) {
      show({
        key: "reminders-missing",
        kind: "action",
        title: t.missing.title,
        details: missingPermissionLines(access),
        actions: [
          { label: t.allow, onClick: () => void requestReminderAccess(access).then(recheck) },
          {
            label: t.missing.turnOff,
            onClick: () => {
              remove("reminders-missing");
              void turnRemindersOff();
            },
          },
        ],
        onDismiss: () => {
          missingClosed.current = true;
        },
      });
    }
  }, [signedIn, localMode, choice, access, recheck, show, remove]);

  return null;
}
