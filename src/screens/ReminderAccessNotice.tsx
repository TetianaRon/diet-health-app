import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { uk } from "../i18n/uk";
import { getReminderAccess, requestReminderAccess, type ReminderAccess } from "../lib/reminderScheduler";

/**
 * Warns on Today when the meal reminder can't be delivered on time. Without
 * notification permission it explains the reminder and asks for both
 * permissions in a row; with notifications on but no exact alarms
 * ("Будильники й нагадування") only that notice remains. Re-checks when the
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

  const ask = () => void requestReminderAccess(access).then(() => getReminderAccess()).then(setAccess);

  // Notifications not allowed yet: one explanation, then both asks in a row
  // (2.0.3 — before, the app asked at startup with no explanation, and the
  // second ask looked like the first had failed).
  if (!access.notifications) {
    return (
      <div className="today-warning">
        <p>{uk.reminders.accessNotice.intro}</p>
        <button type="button" onClick={ask}>
          {uk.reminders.accessNotice.turnOn}
        </button>
      </div>
    );
  }

  return (
    <div className="today-warning">
      <p>{uk.reminders.accessNotice.exactAlarms}</p>
      <button type="button" onClick={ask}>
        {uk.reminders.accessNotice.button}
      </button>
      <p className="food-form-hint">{uk.reminders.accessNotice.batteryHint}</p>
    </div>
  );
}
