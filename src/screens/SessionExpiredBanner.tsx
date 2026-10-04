// Shown at the top of the app when the Google sign-in ran out while it was
// open (see AuthContext.sessionExpired). Screens stay as they are underneath,
// so nothing typed is lost; after signing in again the last action can just
// be repeated.
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { uk } from "../i18n/uk";

export default function SessionExpiredBanner() {
  const { sessionExpired, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  if (!sessionExpired) return null;

  return (
    <div className="session-banner" role="alert">
      <p>{uk.auth.sessionExpiredBanner}</p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          signIn().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        {uk.auth.signInAgainButton}
      </button>
      {error && <p className="food-form-error">{error}</p>}
    </div>
  );
}
