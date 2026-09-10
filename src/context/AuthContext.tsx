// Google sign-in state, shared across screens (Foods needs it to gate data
// fetch now; Settings will manage the account from here later).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as sheets from "../lib/sheets";

interface AuthContextValue {
  signedIn: boolean;
  initializing: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [initializing, setInitializing] = useState(true);

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

  const signIn = async () => {
    await sheets.signIn();
    setSignedIn(sheets.isSignedIn());
  };

  const signOut = () => {
    sheets.signOut();
    setSignedIn(false);
  };

  return <AuthContext.Provider value={{ signedIn, initializing, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
