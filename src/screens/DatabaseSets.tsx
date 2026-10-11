// «Набори з бази» (release 2.2, spec → "Sets and the clean start"): the
// verified database as sets, by group (databaseSets.ts). A set opens as a checklist with every item
// she doesn't have yet ticked (developer, 2026-10-09); «Додати вибрані: N»
// makes them her rows. Items she already has are shown as «вже додано».
import { useState } from "react";
import { uk } from "../i18n/uk";
import { BUILT_IN_FOODS } from "../data/builtInFoods";
import { DATABASE_SETS, SET_GROUPS } from "../data/databaseSets";
import { copyFromDatabase } from "../lib/databaseItems";
import type { Ingredient } from "../lib/ingredients";
import { formatDecimal } from "../lib/numberFormat";
import FormError from "./FormError";

const t = uk.databaseSets;
const BY_ID = new Map(BUILT_IN_FOODS.map((item) => [item.id, item]));

export function SetsList({ covered, onOpen }: { covered: ReadonlySet<string>; onOpen: (setId: string) => void }) {
  return (
    <>
      <p className="food-form-hint">{t.intro}</p>
      {SET_GROUPS.map((group) => (
        <div key={group.id}>
          {/* One group today (by kind of food); cuisines and dishes join as their sets are made. */}
          {SET_GROUPS.length > 1 && <h2>{group.nameUk}</h2>}
          <ul className="food-list">
            {group.sets.map((set) => {
              const added = set.itemIds.filter((id) => covered.has(id)).length;
              return (
                <li key={set.id} className="food-list-item-with-action">
                  <span>
                    <strong>{set.nameUk}</strong> — {added === set.itemIds.length ? t.allAdded : t.setLine(set.itemIds.length, added)}
                    {set.descriptionUk && <span className="food-name-en"> · {set.descriptionUk}</span>}
                  </span>
                  <button type="button" onClick={() => onOpen(set.id)}>
                    {t.openSet}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

export function SetChecklist({
  setId,
  covered,
  onAdded,
  onCancel,
}: {
  setId: string;
  covered: ReadonlySet<string>;
  onAdded: (copies: Ingredient[]) => void;
  onCancel: () => void;
}) {
  const set = DATABASE_SETS.find((s) => s.id === setId);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set((set?.itemIds ?? []).filter((id) => !covered.has(id))));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!set) return null;

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      onAdded(await copyFromDatabase(set.itemIds.filter((id) => ticked.has(id))));
    } catch (err) {
      setError(t.failed(err instanceof Error ? err.message : String(err)));
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <ul className="food-list">
        {set.itemIds.map((id) => {
          const item = BY_ID.get(id);
          if (!item) return null;
          const have = covered.has(id);
          return (
            <li key={id}>
              <label className="remember-me">
                <input type="checkbox" checked={have || ticked.has(id)} disabled={have || saving} onChange={() => toggle(id)} />
                <span>
                  <strong>{item.nameUk}</strong> — {formatDecimal(item.carbsG)} г вуглеводів, {formatDecimal(item.caloriesKcal)} ккал (
                  {uk.foods.pack.per(item.basis)})
                  {have && <span className="food-name-en"> · {t.alreadyAdded}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <FormError message={error} />
      <div className="food-form-actions">
        <button type="button" onClick={() => void add()} disabled={saving || ticked.size === 0}>
          {ticked.size === 0 ? t.nothingSelected : t.addSelected(ticked.size)}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.medication.cancelButton}
        </button>
      </div>
    </div>
  );
}
