import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { uk } from "../i18n/uk";
import { getReminderAccess, requestReminderAccess, type ReminderAccess } from "../lib/reminderScheduler";

/**
 * Warns on Today when the meal reminder can't be delivered on time — no
 * notification permission, or no exact-alarm ("Будильники й нагадування")
 * access — with one button that asks for what's missing. Re-checks when the
 * app returns from the system settings screen. Renders nothing on the web.
 */
export default function ReminderAccessNotice() {
  const [access, setAccess] = useState<ReminderAccess | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const check = () => void getReminderAccess().then(setAccess).catch(() => setAccess(null));
    check();
    const listenerPromise = CapacitorApp.addListener("resume", check);
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  if (!access || (access.notifications && access.exactAlarms)) return null;

  return (
    <div className="today-warning">
      <p>{access.notifications ? uk.reminders.accessNotice.exactAlarms : uk.reminders.accessNotice.notifications}</p>
      <button
        type="button"
        onClick={() => void requestReminderAccess(access).then(() => getReminderAccess()).then(setAccess)}
      >
        {uk.reminders.accessNotice.button}
      </button>
      <p className="food-form-hint">{uk.reminders.accessNotice.batteryHint}</p>
    </div>
  );
}
