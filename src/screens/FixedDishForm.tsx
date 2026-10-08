// Editing a dish saved from a custom meal entry (release 2.0.2): it has no
// recipe, only her values for 1 portion (a meal box, a restaurant dish), the
// portion's weight if known, and named sizes.
import { useState } from "react";
import { uk } from "../i18n/uk";
import { updateDish, type Dish, type IngredientNutrition, type NutritionKey } from "../lib/dishes";
import { evaluateInput } from "../lib/mathInput";
import { findNameMatch, suggestFreeName } from "../lib/itemIds";
import MathInput from "./MathInput";
import DuplicateNameNotice, { type NamedItem } from "./DuplicateNameNotice";
import PortionSizesFields, { sizeRowsFrom, sizesFromRows, type SizeRow } from "./PortionSizesFields";

const FIELDS: NutritionKey[] = ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "caloriesKcal", "sodiumMg"];

export default function FixedDishForm({
  dish,
  existingItems,
  onSaved,
  onCancel,
}: {
  dish: Dish;
  existingItems: NamedItem[];
  onSaved: (dish: Dish) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(dish.nameUk);
  const [values, setValues] = useState<Record<NutritionKey, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, dish.unknownFields.includes(f) ? "" : String(dish[f])])) as Record<NutritionKey, string>,
  );
  const [weight, setWeight] = useState(dish.yieldGrams > 0 ? String(dish.yieldGrams) : "");
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(() => sizeRowsFrom(dish.portionSizes));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameMatch = findNameMatch(nameUk, existingItems, dish.id);

  const handleSave = async () => {
    const parsed = {} as IngredientNutrition;
    const unknownFields: NutritionKey[] = [];
    for (const field of FIELDS) {
      if (values[field].trim() === "") {
        unknownFields.push(field);
        parsed[field] = 0;
        continue;
      }
      const n = evaluateInput(values[field]);
      if (n === null || n < 0) {
        setError(uk.foods.editForm.validationError);
        return;
      }
      parsed[field] = n;
    }
    const grams = weight.trim() === "" ? 0 : evaluateInput(weight);
    const portionSizes = sizesFromRows(sizeRows);
    if (nameUk.trim() === "" || grams === null || grams < 0 || unknownFields.length === FIELDS.length) {
      setError(uk.foods.editForm.validationError);
      return;
    }
    if (!Array.isArray(portionSizes)) {
      setError(portionSizes.problem);
      return;
    }
    if (nameMatch) return;
    setSaving(true);
    setError(null);
    try {
      const updated: Dish = { ...dish, nameUk: nameUk.trim(), ...parsed, unknownFields, yieldGrams: grams, portionSizes };
      await updateDish(updated);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.dishes.composeForm.nameLabel}
        <input value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
      </label>
      {nameMatch && (
        <DuplicateNameNotice match={nameMatch} suggestedName={suggestFreeName(nameUk, existingItems.map((i) => i.nameUk))} onRename={setNameUk} />
      )}
      <h3 className="pack-values-heading">{uk.dishes.fixedForm.valuesHeading}</h3>
      <p className="food-form-hint">{uk.foods.form.unknownHint}</p>
      {FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <MathInput value={values[field]} placeholder={uk.foods.form.unknownPlaceholder} onChange={(v) => setValues({ ...values, [field]: v })} />
        </label>
      ))}
      <label>
        {uk.dishes.fixedForm.weightLabel}
        <MathInput value={weight} placeholder={uk.foods.form.unknownPlaceholder} onChange={setWeight} />
      </label>
      <PortionSizesFields rows={sizeRows} onChange={setSizeRows} allowGrams={evaluateInput(weight) !== null} allowPieces />
      {error && <p className="food-form-error">{error}</p>}
      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving || nameMatch !== null}>
          {uk.foods.editForm.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}
