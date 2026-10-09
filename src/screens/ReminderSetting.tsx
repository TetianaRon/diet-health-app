// «Нагадування про їжу» in Settings (release 2.1.3): turning it on asks for
// the phone's permissions; turning it off cancels the scheduled reminders.
// On, with a permission missing: the missing one is named, with
// «Дозволити нагадування». Android only — the web app has no reminders.
import { useCallback, useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { uk } from "../i18n/uk";
import { useReminderChoice } from "../lib/reminderChoice";
import {
  getReminderAccess,
  requestReminderAccess,
  resolveReminderChoice,
  turnRemindersOff,
  turnRemindersOn,
  type ReminderAccess,
} from "../lib/reminderScheduler";

const t = uk.reminders;

/** This phone's reminder permissions, re-checked when the app returns from the system settings. Null on the web. */
export function useReminderAccess(): [ReminderAccess | null, () => void] {
  const [access, setAccess] = useState<ReminderAccess | null>(null);
  const check = useCallback(() => void getReminderAccess().then(setAccess).catch(() => setAccess(null)), []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void resolveReminderChoice().finally(check);
    const listenerPromise = CapacitorApp.addListener("resume", check);
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [check]);
  return [access, check];
}

/** The missing permissions, named, plus the battery hint when timing is the problem. */
export function missingPermissionLines(access: ReminderAccess): string[] {
  const names = [
    ...(access.notifications ? [] : [t.permissionNames.notifications]),
    ...(access.exactAlarms ? [] : [t.permissionNames.exactAlarms]),
  ];
  return [t.missingList(names), ...(access.notifications && !access.exactAlarms ? [t.batteryHint] : [])];
}

export default function ReminderSetting() {
  const choice = useReminderChoice();
  const [access, recheck] = useReminderAccess();
  const [denied, setDenied] = useState(false);
  if (!Capacitor.isNativePlatform()) return null;

  const on = choice === "on";
  const missing = on && access !== null && (!access.notifications || !access.exactAlarms);

  const toggle = (next: boolean) => {
    if (next) {
      void turnRemindersOn().then((result) => {
        setDenied(result === "denied");
        recheck();
      });
    } else {
      setDenied(false);
      void turnRemindersOff();
    }
  };

  return (
    <div className="settings-account">
      <h2>{t.setting.title}</h2>
      <label className="remember-me">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
        {t.setting.label}
      </label>
      <p className="food-form-hint">{on ? t.setting.hintOn : t.setting.hintOff}</p>
      {denied && !on && <p className="food-form-error">{t.setting.denied}</p>}
      {missing && access && (
        <>
          {missingPermissionLines(access).map((line, i) => (
            <p key={line} className={i === 0 ? "food-form-error" : "food-form-hint"}>
              {line}
            </p>
          ))}
          <button type="button" onClick={() => void requestReminderAccess(access).then(recheck)}>
            {t.allow}
          </button>
        </>
      )}
    </div>
  );
}
