// «Нагадування про їжу» on or off (release 2.1.3). Kept per device, like
// «Запам'ятати мене»: reminders go to this phone only.
//   on   — reminders are scheduled; if a permission goes missing, a popup
//          offers «Дозволити нагадування» or «Вимкнути нагадування»;
//   off  — nothing is scheduled;
//   null — never chosen: offered once after sign-in. Someone who had already
//          allowed notifications before 2.1.3 (mom) starts on, with no offer.
import { useSyncExternalStore } from "react";

export type ReminderChoice = "on" | "off" | null;

const CHOICE_KEY = "trackmymeals.reminders";
const OFFERED_KEY = "trackmymeals.remindersOffered";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts while the app is open.
  }
}

const listeners = new Set<() => void>();
let current: ReminderChoice = parse(read(CHOICE_KEY));

function parse(value: string | null): ReminderChoice {
  return value === "on" || value === "off" ? value : null;
}

export function reminderChoice(): ReminderChoice {
  return current;
}

export function setReminderChoice(choice: "on" | "off"): void {
  current = choice;
  write(CHOICE_KEY, choice);
  for (const listener of listeners) listener();
}

export function remindersOffered(): boolean {
  return read(OFFERED_KEY) === "1";
}

export function setRemindersOffered(): void {
  write(OFFERED_KEY, "1");
}

/** The choice as React state: re-renders when it changes anywhere (Settings, a popup). */
export function useReminderChoice(): ReminderChoice {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/** The choice to start from: notifications already allowed before 2.1.3 means reminders were on. */
export function initialReminderChoice(stored: ReminderChoice, notificationsAllowed: boolean): ReminderChoice {
  return stored ?? (notificationsAllowed ? "on" : null);
}

export interface ReminderPermissions {
  notifications: boolean;
  exactAlarms: boolean;
}

/** Which popup, if any: the one-time offer, or the missing-permission choice for reminders that are on. */
export function reminderPopup(choice: ReminderChoice, offered: boolean, access: ReminderPermissions): "offer" | "missing" | null {
  if (choice === "on") return access.notifications && access.exactAlarms ? null : "missing";
  if (choice === null && !offered) return "offer";
  return null;
}
