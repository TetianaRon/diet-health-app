// The signed-out view's buttons (release 2.0.4), shared by Today, History,
// Foods and Settings: «Запам'ятати мене на цьому пристрої», the web's one-tap
// «Продовжити як …» when an address is remembered, and «Почати без Google»
// behind an acknowledgement (the data then lives only on this phone).
import { useState } from "react";
import { useBackHandler } from "../lib/useBackHandler";
import { Capacitor } from "@capacitor/core";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { canOfferLocalMode } from "../lib/localMode";
import { rememberMe } from "../lib/rememberMe";
import { applyRememberMe, getRememberedEmail } from "../lib/sheets";

const t = uk.auth;

export default function SignInPanel({ buttonLabel, offerLocalMode = true }: { buttonLabel: string; offerLocalMode?: boolean }) {
  const { signIn, startWithoutGoogle } = useAuth();
  const [remember, setRemember] = useState(rememberMe);
  const [email, setEmail] = useState(getRememberedEmail);
  const [confirmingLocal, setConfirmingLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => {
    setError(null);
    action().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  if (confirmingLocal) {
    return (
      <div className="local-ack" role="group" aria-labelledby="local-ack-title">
        <h2 id="local-ack-title">{t.localAck.title}</h2>
        <p>{t.localAck.onlyHere}</p>
        <p>{t.localAck.anyoneWithPhone}</p>
        <p>{t.localAck.lostWithPhone}</p>
        <p>{t.localAck.later}</p>
        <button type="button" onClick={() => run(startWithoutGoogle)}>
          {t.localAck.confirm}
        </button>
        <button type="button" className="button-secondary" onClick={() => setConfirmingLocal(false)}>
          {t.localAck.back}
        </button>
      </div>
    );
  }

  const native = Capacitor.isNativePlatform();
  return (
    <div className="sign-in-panel">
      {email ? (
        <>
          <button type="button" onClick={() => run(() => signIn({ hint: email }))}>
            {t.continueAs(email)}
          </button>
          <button type="button" className="button-secondary" onClick={() => run(() => signIn({ chooseAccount: true }))}>
            {t.otherAccount}
          </button>
        </>
      ) : (
        <button type="button" onClick={() => run(() => signIn())}>
          {buttonLabel}
        </button>
      )}
      <label className="remember-me">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => {
            applyRememberMe(e.target.checked);
            setRemember(e.target.checked);
            setEmail(getRememberedEmail());
          }}
        />
        {t.rememberMe}
      </label>
      <p className="food-form-hint">{remember ? (native ? t.rememberOnPhone : t.rememberOnWeb) : native ? t.forgetOnPhone : t.forgetOnWeb}</p>
      {error && <p className="food-form-error">{error}</p>}
      {offerLocalMode && canOfferLocalMode() && (
        <button type="button" className="button-secondary" onClick={() => setConfirmingLocal(true)}>
          {uk.localMode.startButton}
        </button>
      )}
    </div>
  );
}

/**
 * «Запам'ятати мене на цьому пристрої» in Settings, while signed in to Google:
 * shows this device's current choice, and a change asks first, saying what
 * will happen (developer, 2026-10-08). Closing the question changes nothing.
 */
export function RememberMeSetting() {
  const [remember, setRemember] = useState(rememberMe);
  const [asking, setAsking] = useState<boolean | null>(null);
  const native = Capacitor.isNativePlatform();
  const explain = (on: boolean) => (on ? (native ? t.rememberOnPhone : t.rememberOnWeb) : native ? t.forgetOnPhone : t.forgetOnWeb);
  useBackHandler(asking !== null, () => setAsking(null));
  return (
    <>
      <label className="remember-me">
        <input type="checkbox" checked={remember} onChange={(e) => setAsking(e.target.checked)} />
        {t.rememberMe}
      </label>
      <p className="food-form-hint">{explain(remember)}</p>
      {asking !== null && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="remember-confirm-text">
            <p id="remember-confirm-text">
              <strong>{asking ? t.rememberConfirm.turnOn : t.rememberConfirm.turnOff}</strong>
            </p>
            <p>{explain(asking)}</p>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  applyRememberMe(asking);
                  setRemember(asking);
                  setAsking(null);
                }}
              >
                {asking ? t.rememberConfirm.yesOn : t.rememberConfirm.yesOff}
              </button>
              <button type="button" className="button-secondary" onClick={() => setAsking(null)}>
                {t.rememberConfirm.keep}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
