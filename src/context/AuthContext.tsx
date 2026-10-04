// Google sign-in state, shared across screens (Foods needs it to gate data
// fetch now; Settings will manage the account from here later).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as sheets from "../lib/sheets";

interface AuthContextValue {
  signedIn: boolean;
  initializing: boolean;
  /**
   * The Google sign-in ran out (about an hour on the web) while the app was
   * open. `signedIn` deliberately stays true so screens keep what's on them
   * (a meal being typed); SessionExpiredBanner asks to sign in again, and
   * requests fail with SessionExpiredError until then.
   */
  sessionExpired: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    sheets
      .initGoogleAuth()
      // On native, initGoogleAuth() may have just silently signed in from a
      // stored refresh token (see sheets.ts) — reflect that here rather than
      // leaving signedIn stuck at its initial false until an interactive
      // signIn() call, which would never come if the user doesn't need one.
      .then(() => setSignedIn(sheets.isSignedIn()))
      .catch((error: unknown) => console.error("initGoogleAuth failed:", error))
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => sheets.onSessionExpired(() => setSessionExpired(true)), []);

  // Notice the expiry when it happens, not only on the next failed request:
  // a timer for an open page, plus a check whenever the page comes back into
  // view (timers are paused in background tabs and sleeping laptops).
  useEffect(() => {
    if (!signedIn || sessionExpired) return;
    const remaining = sheets.msUntilTokenExpiry();
    const timer = remaining === null ? undefined : window.setTimeout(sheets.checkTokenExpiry, Math.max(remaining, 0) + 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sheets.checkTokenExpiry();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [signedIn, sessionExpired]);

  const signIn = async () => {
    await sheets.signIn();
    setSignedIn(sheets.isSignedIn());
    setSessionExpired(false);
  };

  const signOut = () => {
    sheets.signOut();
    setSignedIn(false);
    setSessionExpired(false);
  };

  return (
    <AuthContext.Provider value={{ signedIn, initializing, sessionExpired, signIn, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
