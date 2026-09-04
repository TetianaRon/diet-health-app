import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import {
  addIngredient,
  listIngredients,
  mergeWithStarterFoods,
  setIngredientFavorite,
  sortFavoritesFirst,
  type Ingredient,
  type IngredientSource,
} from "../lib/ingredients";
import { addDish, computeDishNutrition, listDishes, type Dish, type DishIngredientRef } from "../lib/dishes";
import { lookupExternalCandidates, translateUkToEn, type NutritionEstimate } from "../lib/nutrition";
import { STARTER_DISHES, mergeWithStarterDishes } from "../data/starter-dishes";
import { STARTER_FOODS } from "../data/starter-foods";

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
  const [candidates, setCandidates] = useState<NutritionEstimate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // nameUk is the only field mom types. Bundle matches are picked directly
  // from the browsable suggestion list below (handlePickSuggestion) — the
  // "Знайти" button (handleLookup) is only for names not in that list, and
  // deliberately skips the bundle itself (see lookupExternal) so it never
  // silently resolves an ambiguous name to a single guessed candidate.
  // English (needed for the USDA query) is resolved automatically via
  // translation; it's still shown afterward as a subtle secondary label
  // (see .food-name-en) — a fallback cross-check, not something she needs
  // to read or supply herself.
  const applyEstimate = (estimate: NutritionEstimate | null) => {
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
  };

  // USDA returns several ranked candidates per query in one request (see
  // lookupExternalCandidates) — listed together below so you pick the right
  // one directly, same "browse, don't guess" pattern as the bundle
  // suggestion list. Nothing is auto-applied; a genuine miss (no results at
  // all) falls back to manual entry, same as before.
  const handleLookup = async () => {
    setLookupLoading(true);
    setError(null);
    try {
      const results = await lookupExternalCandidates(nameUk);
      setCandidates(results);
      if (results.length > 0) {
        setLookupAttempted(true);
      } else {
        applyEstimate(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupLoading(false);
    }
  };

  // Clicking a suggestion from the browsable bundle list below skips the
  // lookup round-trip entirely — we already have the full entry in hand.
  const handlePickSuggestion = (food: (typeof STARTER_FOODS)[number]) => {
    setNameUk(food.nameUk);
    setCandidates([]);
    applyEstimate({
      nameEn: food.nameEn,
      carbsG: food.carbsG,
      gi: food.gi,
      fiberG: food.fiberG,
      sugarsG: food.sugarsG,
      proteinG: food.proteinG,
      fatG: food.fatG,
      caloriesKcal: food.caloriesKcal,
      sodiumMg: food.sodiumMg,
      source: "starter",
    });
  };

  const suggestions = lookupAttempted
    ? []
    : STARTER_FOODS.filter((food) => food.nameUk.toLowerCase().includes(nameUk.toLowerCase()));

  const handleSave = async () => {
    const parsed = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, Number(values[field])]),
    ) as Record<NumericField, number>;

    // Number("") is 0, not NaN — checking .trim() !== "" first is required,
    // otherwise a field left blank (e.g. an unfilled GI) would silently pass
    // as a valid 0 instead of being caught by validation.
    const allValid =
      nameUk.trim() !== "" &&
      NUMERIC_FIELDS.every(
        (field) => values[field].trim() !== "" && Number.isFinite(parsed[field]) && parsed[field] >= 0,
      );

    if (!allValid) {
      setError(uk.foods.form.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ingredient: Omit<Ingredient, "dateAdded" | "favorite"> = {
        nameUk: nameUk.trim(),
        nameEn: resolvedNameEn,
        source,
        ...parsed,
      };
      await addIngredient(ingredient);
      onSaved({ ...ingredient, dateAdded: new Date().toISOString().slice(0, 10), favorite: false });
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
        <input
          value={nameUk}
          onChange={(e) => {
            setNameUk(e.target.value);
            setCandidates([]);
          }}
          placeholder={uk.foods.form.nameUkPlaceholder}
        />
      </label>
      <p className="food-form-hint">{uk.foods.form.nameUkHint}</p>
      <button type="button" onClick={handleLookup} disabled={lookupLoading || !nameUk}>
        {lookupLoading ? uk.foods.form.lookupLoading : uk.foods.form.lookupButton}
      </button>

      {!lookupAttempted && (
        <>
          <ul className="food-list">
            {suggestions.map((food) => (
              <li key={food.nameUk} className="food-list-item-with-action">
                <span>
                  <strong>{food.nameUk}</strong> <span className="food-name-en">({food.nameEn})</span> —{" "}
                  {food.carbsG} г вуглеводів, ГІ {food.gi}
                </span>
                <button type="button" onClick={() => handlePickSuggestion(food)}>
                  {uk.foods.form.pickButton}
                </button>
              </li>
            ))}
          </ul>
          {suggestions.length === 0 && <p>{uk.dishes.noResults}</p>}
        </>
      )}

      {lookupAttempted && candidates.length > 0 && (
        <ul className="food-list food-list-scroll">
          {candidates.map((candidate, i) => (
            <li key={i} className="food-list-item-with-action">
              <span>
                <strong>{candidate.nameEn}</strong> — {candidate.carbsG} г вуглеводів
                {candidate.gi !== null && `, ГІ ${candidate.gi}`}
              </span>
              <button type="button" onClick={() => applyEstimate(candidate)}>
                {uk.foods.form.pickButton}
              </button>
            </li>
          ))}
        </ul>
      )}

      {lookupAttempted && resolvedNameEn && (
        <p className="food-form-source">
          {uk.foods.form.sourceLabel}: {uk.foods.form.source[source]}
          <span className="food-name-en"> ({resolvedNameEn})</span>
        </p>
      )}

      {lookupAttempted && candidates.length === 0 && (
        <p className="food-form-source">
          {uk.foods.form.sourceLabel}: {uk.foods.form.source[source]} — {uk.foods.form.notFound}
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

// Browse the pre-computed starter bundle and add one as-is. Composing a
// custom multi-ingredient recipe is ComposeDishForm, below.
function AddDishForm({ onSaved, onCancel }: { onSaved: (dish: Dish) => void; onCancel: () => void }) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = STARTER_DISHES.filter((d) => d.nameUk.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async (dish: Omit<Dish, "dateAdded">) => {
    setSaving(true);
    setError(null);
    try {
      await addDish(dish);
      onSaved({ ...dish, dateAdded: new Date().toISOString().slice(0, 10) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.dishes.form.searchLabel}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={uk.dishes.form.searchPlaceholder}
        />
      </label>
      <p className="food-form-hint">{uk.dishes.form.hint}</p>

      {error && <p className="food-form-error">{error}</p>}

      <ul className="food-list">
        {matches.map((dish) => (
          <li key={dish.nameUk} className="food-list-item-with-action">
            <span>
              <strong>{dish.nameUk}</strong> <span className="food-name-en">({dish.nameEn})</span> — {dish.carbsG} г
              вуглеводів, ГІ {dish.gi}
            </span>
            <button type="button" onClick={() => void handleAdd(dish)} disabled={saving}>
              {uk.dishes.form.addButton}
            </button>
          </li>
        ))}
      </ul>
      {search && matches.length === 0 && <p>{uk.dishes.noResults}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

interface ComposeRow {
  nameUk: string;
  grams: string;
}

const EMPTY_ROW: ComposeRow = { nameUk: "", grams: "" };

// Compose a real multi-ingredient recipe from existing Ingredients rows —
// the "real" Dishes feature deferred since the Foods screen was first built.
// Nutrition is always computed via computeDishNutrition (pure, tested in
// dishes.test.ts), never hand-typed, matching how starter dishes are built.
function ComposeDishForm({
  ingredients,
  onSaved,
  onCancel,
}: {
  ingredients: Ingredient[];
  onSaved: (dish: Dish) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState("");
  const [rows, setRows] = useState<ComposeRow[]>([EMPTY_ROW]);
  const [yieldGrams, setYieldGrams] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedIngredients = sortFavoritesFirst(ingredients);

  const findIngredient = (name: string): Ingredient | null =>
    ingredients.find((i) => i.nameUk.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

  const updateRow = (index: number, patch: Partial<ComposeRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const resolvedRefs: DishIngredientRef[] = rows
    .filter((row) => findIngredient(row.nameUk) && Number(row.grams) > 0)
    .map((row) => ({ nameUk: findIngredient(row.nameUk)!.nameUk, grams: Number(row.grams) }));

  const parsedYield = Number(yieldGrams);
  const preview =
    resolvedRefs.length === rows.filter((r) => r.nameUk.trim()).length &&
    resolvedRefs.length > 0 &&
    Number.isFinite(parsedYield) &&
    parsedYield > 0
      ? computeDishNutrition(resolvedRefs, parsedYield, (name) => findIngredient(name))
      : null;

  const handleSave = async () => {
    const allResolved = rows.every((row) => row.nameUk.trim() === "" || findIngredient(row.nameUk));
    const filledRows = rows.filter((row) => row.nameUk.trim() !== "");
    const allValid =
      nameUk.trim() !== "" &&
      filledRows.length > 0 &&
      allResolved &&
      filledRows.every((row) => Number(row.grams) > 0) &&
      Number.isFinite(parsedYield) &&
      parsedYield > 0;

    if (!allValid) {
      setError(uk.dishes.composeForm.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const refs: DishIngredientRef[] = filledRows.map((row) => ({
        nameUk: findIngredient(row.nameUk)!.nameUk,
        grams: Number(row.grams),
      }));
      const nutrition = computeDishNutrition(refs, parsedYield, (name) => findIngredient(name));
      const nameEn = (await translateUkToEn(nameUk.trim())) ?? "";
      const dish: Omit<Dish, "dateAdded"> = {
        nameUk: nameUk.trim(),
        nameEn,
        ingredients: refs,
        yieldGrams: parsedYield,
        ...nutrition,
        source: "manual",
      };
      await addDish(dish);
      onSaved({ ...dish, dateAdded: new Date().toISOString().slice(0, 10) });
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
        <input value={nameUk} onChange={(e) => setNameUk(e.target.value)} placeholder={uk.dishes.composeForm.namePlaceholder} />
      </label>

      {rows.map((row, index) => {
        const resolvedIngredient = findIngredient(row.nameUk);
        // Full list by default (empty search matches everything), narrowing
        // as you type — hidden once the row already matches a picked item,
        // so the list doesn't linger under a finished selection.
        const suggestions =
          resolvedIngredient && row.nameUk.trim() === resolvedIngredient.nameUk
            ? []
            : sortedIngredients.filter((i) => i.nameUk.toLowerCase().includes(row.nameUk.trim().toLowerCase()));

        return (
          <div key={index} className="compose-row">
            <label>
              {uk.dishes.composeForm.ingredientLabel}
              <input
                value={row.nameUk}
                onChange={(e) => updateRow(index, { nameUk: e.target.value })}
                placeholder={uk.dishes.composeForm.ingredientPlaceholder}
              />
            </label>

            {suggestions.length > 0 && (
              <ul className="food-list food-list-scroll">
                {suggestions.map((ingredient) => (
                  <li key={ingredient.nameUk} className="food-list-item-with-action">
                    <span>
                      {ingredient.favorite && <span aria-hidden="true">★ </span>}
                      <strong>{ingredient.nameUk}</strong>{" "}
                      <span className="food-name-en">({ingredient.nameEn})</span>
                    </span>
                    <button type="button" onClick={() => updateRow(index, { nameUk: ingredient.nameUk })}>
                      {uk.foods.form.pickButton}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {row.nameUk.trim() !== "" && !resolvedIngredient && suggestions.length === 0 && (
              <p className="food-form-error">{uk.dishes.composeForm.unresolvedIngredient}</p>
            )}

            <label>
              {uk.dishes.composeForm.gramsLabel}
              <input type="number" value={row.grams} onChange={(e) => updateRow(index, { grams: e.target.value })} />
            </label>

            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(index)}>
                {uk.dishes.composeForm.removeIngredientButton}
              </button>
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => setRows((prev) => [...prev, EMPTY_ROW])}>
        {uk.dishes.composeForm.addIngredientButton}
      </button>

      <label>
        {uk.dishes.composeForm.yieldLabel}
        <input type="number" value={yieldGrams} onChange={(e) => setYieldGrams(e.target.value)} />
      </label>
      <p className="food-form-hint">{uk.dishes.composeForm.yieldHint}</p>

      {preview && (
        <p className="food-form-source">{uk.dishes.composeForm.preview(preview.carbsG, preview.caloriesKcal, preview.gi)}</p>
      )}

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {uk.dishes.composeForm.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

type FoodsSubTab = "ingredients" | "dishes";
type DishAddMode = "starter" | "custom";

export default function FoodsScreen() {
  const { signedIn, initializing, signIn } = useAuth();
  const [subTab, setSubTab] = useState<FoodsSubTab>("ingredients");
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [dishAddMode, setDishAddMode] = useState<DishAddMode>("starter");

  useEffect(() => {
    if (!signedIn) return;
    listIngredients()
      .then(setIngredients)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    listDishes()
      .then(setDishes)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn]);

  const switchSubTab = (tab: FoodsSubTab) => {
    setSubTab(tab);
    setShowAddForm(false);
    setDishAddMode("starter");
    setSearch("");
  };

  // A bundle-only ingredient (never saved to the personal sheet) has no row
  // for setIngredientFavorite to update — favoriting it is the one implicit
  // "add" the app performs, and only as a side effect of marking a favorite.
  const handleToggleFavorite = async (ingredient: Ingredient) => {
    const nextFavorite = !ingredient.favorite;
    const isSaved = (ingredients ?? []).some(
      (i) => i.nameUk.trim().toLowerCase() === ingredient.nameUk.trim().toLowerCase(),
    );

    if (!isSaved) {
      try {
        const toSave: Omit<Ingredient, "dateAdded" | "favorite"> = {
          nameUk: ingredient.nameUk,
          nameEn: ingredient.nameEn,
          carbsG: ingredient.carbsG,
          gi: ingredient.gi,
          fiberG: ingredient.fiberG,
          sugarsG: ingredient.sugarsG,
          proteinG: ingredient.proteinG,
          fatG: ingredient.fatG,
          caloriesKcal: ingredient.caloriesKcal,
          sodiumMg: ingredient.sodiumMg,
          source: ingredient.source,
        };
        await addIngredient(toSave, nextFavorite);
        setIngredients((prev) => [
          ...(prev ?? []),
          { ...ingredient, dateAdded: new Date().toISOString().slice(0, 10), favorite: nextFavorite },
        ]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setIngredients((prev) =>
      (prev ?? []).map((i) => (i.nameUk === ingredient.nameUk ? { ...i, favorite: nextFavorite } : i)),
    );
    try {
      await setIngredientFavorite(ingredient.nameUk, nextFavorite);
    } catch (err) {
      setIngredients((prev) =>
        (prev ?? []).map((i) => (i.nameUk === ingredient.nameUk ? { ...i, favorite: ingredient.favorite } : i)),
      );
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

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

  // The whole bundle is browsable/pickable by default, merged with whatever
  // is actually saved to the personal sheet — no need to "add" a bundle item
  // just to make it available for browsing, dish composition, or meal
  // logging. See mergeWithStarterFoods/mergeWithStarterDishes.
  const availableIngredients = mergeWithStarterFoods(ingredients ?? []);
  const availableDishes = mergeWithStarterDishes(dishes ?? []);

  const filteredIngredients = sortFavoritesFirst(
    availableIngredients.filter((i) => i.nameUk.toLowerCase().includes(search.toLowerCase())),
  );
  const filteredDishes = availableDishes.filter((d) => d.nameUk.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="screen">
      <h1>{uk.foods.title}</h1>

      <div className="food-subtabs">
        <button
          type="button"
          className={subTab === "ingredients" ? "food-subtab active" : "food-subtab"}
          onClick={() => switchSubTab("ingredients")}
        >
          {uk.foods.subTabs.ingredients}
        </button>
        <button
          type="button"
          className={subTab === "dishes" ? "food-subtab active" : "food-subtab"}
          onClick={() => switchSubTab("dishes")}
        >
          {uk.foods.subTabs.dishes}
        </button>
      </div>

      {showAddForm && subTab === "ingredients" && (
        <AddFoodForm
          onSaved={(ingredient) => {
            setIngredients((prev) => [...(prev ?? []), ingredient]);
            setShowAddForm(false);
            setSearch("");
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {showAddForm && subTab === "dishes" && dishAddMode === "starter" && (
        <>
          <AddDishForm
            onSaved={(dish) => {
              setDishes((prev) => [...(prev ?? []), dish]);
              setShowAddForm(false);
              setSearch("");
            }}
            onCancel={() => setShowAddForm(false)}
          />
          <button type="button" className="link-button" onClick={() => setDishAddMode("custom")}>
            {uk.dishes.composeLinkLabel}
          </button>
        </>
      )}

      {showAddForm && subTab === "dishes" && dishAddMode === "custom" && (
        <>
          <button type="button" className="link-button" onClick={() => setDishAddMode("starter")}>
            {uk.dishes.backToStarterLabel}
          </button>
          <ComposeDishForm
            ingredients={availableIngredients}
            onSaved={(dish) => {
              setDishes((prev) => [...(prev ?? []), dish]);
              setShowAddForm(false);
              setSearch("");
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </>
      )}

      {!showAddForm && subTab === "ingredients" && (
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
          {filteredIngredients.length === 0 && <p>{uk.foods.noResults}</p>}

          <ul className="food-list">
            {filteredIngredients.map((ingredient) => (
              <li key={ingredient.nameUk} className="food-list-item-with-action">
                <span>
                  <strong>{ingredient.nameUk}</strong> <span className="food-name-en">({ingredient.nameEn})</span> —{" "}
                  {ingredient.carbsG} г вуглеводів, ГІ {ingredient.gi}
                </span>
                <button
                  type="button"
                  className={ingredient.favorite ? "favorite-toggle active" : "favorite-toggle"}
                  onClick={() => void handleToggleFavorite(ingredient)}
                  aria-label={ingredient.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                  title={ingredient.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                >
                  {ingredient.favorite ? "★" : "☆"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!showAddForm && subTab === "dishes" && (
        <>
          <input
            className="food-search"
            placeholder={uk.foods.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={() => setShowAddForm(true)}>
            {uk.dishes.addButton}
          </button>

          {loadError && <p className="food-form-error">{loadError}</p>}
          {filteredDishes.length === 0 && <p>{uk.dishes.noResults}</p>}

          <ul className="food-list">
            {filteredDishes.map((dish) => (
              <li key={dish.nameUk}>
                <strong>{dish.nameUk}</strong> <span className="food-name-en">({dish.nameEn})</span> —{" "}
                {dish.carbsG} г вуглеводів, ГІ {dish.gi} (на 100г)
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
