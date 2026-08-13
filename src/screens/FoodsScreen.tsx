import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { addIngredient, listIngredients, type Ingredient, type IngredientSource } from "../lib/ingredients";
import { lookupFood } from "../lib/nutrition";

const NUMERIC_FIELDS = ["carbsG", "gi", "fiberG", "sugarsG", "proteinG", "fatG", "caloriesKcal", "sodiumMg"] as const;
type NumericField = (typeof NUMERIC_FIELDS)[number];

type FormValues = Record<NumericField, string>;

const EMPTY_FORM_VALUES: FormValues = {
  carbsG: "",
  gi: "",
  fiberG: "",
  sugarsG: "",
  proteinG: "",
  fatG: "",
  caloriesKcal: "",
  sodiumMg: "",
};

function AddFoodForm({ onSaved, onCancel }: { onSaved: (ingredient: Ingredient) => void; onCancel: () => void }) {
  const [nameUk, setNameUk] = useState("");
  const [resolvedNameEn, setResolvedNameEn] = useState("");
  const [values, setValues] = useState<FormValues>(EMPTY_FORM_VALUES);
  const [source, setSource] = useState<IngredientSource>("manual");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Only nameUk is user-facing — English (needed for the USDA query) is
  // resolved automatically inside lookupFood, from the bundle or via
  // translation, so mom never has to type or see it.
  const handleLookup = async () => {
    setLookupLoading(true);
    setError(null);
    try {
      const estimate = await lookupFood(nameUk);
      setLookupAttempted(true);
      if (estimate) {
        setValues({
          carbsG: String(estimate.carbsG),
          gi: estimate.gi === null ? "" : String(estimate.gi),
          fiberG: String(estimate.fiberG),
          sugarsG: String(estimate.sugarsG),
          proteinG: String(estimate.proteinG),
          fatG: String(estimate.fatG),
          caloriesKcal: String(estimate.caloriesKcal),
          sodiumMg: String(estimate.sodiumMg),
        });
        setSource(estimate.source);
        setResolvedNameEn(estimate.nameEn);
      } else {
        setValues(EMPTY_FORM_VALUES);
        setSource("manual");
        setResolvedNameEn("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSave = async () => {
    const parsed = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, Number(values[field])]),
    ) as Record<NumericField, number>;

    const allValid =
      nameUk.trim() !== "" && NUMERIC_FIELDS.every((field) => Number.isFinite(parsed[field]) && parsed[field] >= 0);

    if (!allValid) {
      setError(uk.foods.form.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ingredient: Omit<Ingredient, "dateAdded"> = {
        nameUk: nameUk.trim(),
        nameEn: resolvedNameEn,
        source,
        ...parsed,
      };
      await addIngredient(ingredient);
      onSaved({ ...ingredient, dateAdded: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.foods.form.nameUkLabel}
        <input value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
      </label>
      <button type="button" onClick={handleLookup} disabled={lookupLoading || !nameUk}>
        {lookupLoading ? uk.foods.form.lookupLoading : uk.foods.form.lookupButton}
      </button>

      {lookupAttempted && (
        <p className="food-form-source">
          {uk.foods.form.sourceLabel}: {uk.foods.form.source[source]}
          {source === "manual" && ` — ${uk.foods.form.notFound}`}
        </p>
      )}

      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <input
            type="number"
            value={values[field]}
            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
          />
        </label>
      ))}

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={handleSave} disabled={saving}>
          {uk.foods.form.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

export default function FoodsScreen() {
  const { signedIn, initializing, signIn } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    listIngredients()
      .then(setIngredients)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn]);

  if (initializing) {
    return (
      <section className="screen">
        <h1>{uk.foods.title}</h1>
        <p>{uk.foods.loading}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="screen">
        <h1>{uk.foods.title}</h1>
        <p>{uk.foods.signIn.message}</p>
        <button type="button" onClick={() => void signIn()}>
          {uk.foods.signIn.button}
        </button>
      </section>
    );
  }

  const filtered = (ingredients ?? []).filter((i) => i.nameUk.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="screen">
      <h1>{uk.foods.title}</h1>

      {showAddForm ? (
        <AddFoodForm
          onSaved={(ingredient) => {
            setIngredients((prev) => [...(prev ?? []), ingredient]);
            setShowAddForm(false);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <>
          <input
            className="food-search"
            placeholder={uk.foods.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={() => setShowAddForm(true)}>
            {uk.foods.addButton}
          </button>

          {loadError && <p className="food-form-error">{loadError}</p>}
          {ingredients === null && !loadError && <p>{uk.foods.loading}</p>}
          {ingredients !== null && ingredients.length === 0 && <p>{uk.foods.empty}</p>}
          {ingredients !== null && ingredients.length > 0 && filtered.length === 0 && <p>{uk.foods.noResults}</p>}

          <ul className="food-list">
            {filtered.map((ingredient) => (
              <li key={ingredient.nameUk}>
                <strong>{ingredient.nameUk}</strong> — {ingredient.carbsG} г вуглеводів, ГІ {ingredient.gi}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
