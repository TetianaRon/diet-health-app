// Deleting one of her saved products or dishes (release 1.9). The row is
// removed from her sheet — final, so the confirmation says plainly that the
// app can't bring it back (only Google Sheets' version history can). A
// product still used in her dishes isn't deleted: she gets a button per dish
// to go and change that dish first (developer, 2026-10-05). Both questions
// are dialogs: the delete button sits at the very end of a long form, so
// anything shown below it was off-screen on a phone (the 1.8.1 lesson).
import { useState } from "react";
import { uk } from "../i18n/uk";
import { useBackHandler } from "../lib/useBackHandler";
import type { Dish } from "../lib/dishes";

const t = uk.deleteItem;

export default function DeleteItem({
  kind,
  name,
  isCopy = false,
  usedIn = [],
  onConfirm,
  onEditDish,
}: {
  kind: "ingredient" | "dish";
  name: string;
  /** Her copy of a built-in product — the database version comes back after deleting. */
  isCopy?: boolean;
  /** Her dishes that use this product (products only). */
  usedIn?: Dish[];
  onConfirm: () => Promise<void>;
  onEditDish?: (dish: Dish) => void;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "blocked">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useBackHandler(step !== "idle", () => {
    if (!busy) setStep("idle");
  });

  const start = () => setStep(usedIn.length > 0 ? "blocked" : "confirm");
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(t.failed(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  };

  return (
    <div className="delete-item">
      <button type="button" className="button-danger" onClick={start}>
        {kind === "dish" ? t.deleteDish : t.deleteIngredient}
      </button>

      {step === "blocked" && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-item-text">
            <p id="delete-item-text">{t.usedIn(name)}</p>
            <div className="modal-actions">
              {usedIn.map((dish) => (
                <button key={dish.id} type="button" className="button-secondary" onClick={() => onEditDish?.(dish)}>
                  {t.editDish(dish.nameUk)}
                </button>
              ))}
              <button type="button" className="button-secondary" onClick={() => setStep("idle")}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-item-text">
            <p id="delete-item-text">
              <strong>{t.confirmTitle(name)}</strong>
            </p>
            <p>{t.final}</p>
            {isCopy && <p>{t.copyNote}</p>}
            {kind === "dish" && <p>{t.mealsKept}</p>}
            {error && <p className="food-form-error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="button-danger" onClick={() => void confirm()} disabled={busy}>
                {busy ? t.deleting : t.confirm(name)}
              </button>
              <button type="button" className="button-secondary" onClick={() => setStep("idle")} disabled={busy}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
