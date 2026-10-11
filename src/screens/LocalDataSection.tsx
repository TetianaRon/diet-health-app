// Settings when the phone works without Google (release 2.0): the data is only
// on this phone; «Синхронізувати з Google Таблицею» signs in and opens the usual
// connect window — a new sheet or an existing one gets the phone's data.
import { useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { useSheetHealth } from "../context/SheetHealthContext";
import * as sheets from "../lib/sheets";
import FormError from "./FormError";

const t = uk.localMode.settings;

export default function LocalDataSection() {
  const { signIn } = useAuth();
  const { openConnect } = useSheetHealth();
  const [error, setError] = useState<string | null>(null);

  const sync = async () => {
    setError(null);
    try {
      // The app's own sign-in (the connect window lists the person's Drive), then the usual window.
      if (!sheets.isSignedIn()) await signIn();
      openConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="settings-account">
      <h2>{t.title}</h2>
      <p>{t.onlyHere}</p>
      <button type="button" onClick={() => void sync()}>
        {t.syncButton}
      </button>
      <p className="food-form-hint">{t.syncHint}</p>
      <FormError message={error} />
    </div>
  );
}
