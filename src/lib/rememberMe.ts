// «Запам'ятати мене на цьому пристрої» (release 2.0.4). On: the device keeps
// its sheet copy and its sign-in until «Вийти». Off: the copy is cleared at
// the start of each session, and the sign-in lasts only while the app (or the
// browser tab) is open. Defaults (developer, 2026-10-08): on in the Android
// app (a personal phone), off on the web (a browser may be shared).
import { Capacitor } from "@capacitor/core";

const REMEMBER_KEY = "trackmymeals.rememberMe";
const EMAIL_KEY = "trackmymeals.rememberedEmail";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this page only.
  }
}

export function rememberMe(): boolean {
  const stored = read(REMEMBER_KEY);
  if (stored === null) return Capacitor.isNativePlatform();
  return stored === "1";
}

export function setRememberMe(on: boolean): void {
  write(REMEMBER_KEY, on ? "1" : "0");
  if (!on) write(EMAIL_KEY, null);
}

/** The web's «Продовжити як …» address: kept only while remember is on (developer chose the email). */
export function rememberedEmail(): string | null {
  return rememberMe() ? read(EMAIL_KEY) : null;
}

export function setRememberedEmail(email: string | null): void {
  write(EMAIL_KEY, email && rememberMe() ? email : null);
}
