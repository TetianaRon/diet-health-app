import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { classifyGi } from "../lib/health";
import {
  addIngredient,
  listIngredients,
  mergeWithStarterFoods,
  setIngredientFavorite,
  setIngredientGlycemicFlag,
  sortFavoritesFirst,
  updateIngredient,
  type Ingredient,
  type IngredientSource,
} from "../lib/ingredients";
import {
  addDish,
  computeDishNutrition,
  dishContainsFlaggedIngredient,
  listDishes,
  setDishGlycemicFlag,
  updateDish,
  type Dish,
  type DishIngredientRef,
} from "../lib/dishes";
import { cycleGlycemicFlag, GLYCEMIC_FLAG_SYMBOL, type GlycemicFlag } from "../lib/glycemicFlag";
import { lookupExternalCandidates, translateEnToUk, translateUkToEn, type NutritionEstimate } from "../lib/nutrition";
import { mergeWithStarterDishes } from "../data/starter-dishes";

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

function AddFoodForm({
  availableFoods,
  existingNames,
  onSaved,
  onCancel,
}: {
  availableFoods: Ingredient[];
  existingNames: Set<string>;
  onSaved: (ingredient: Ingredient) => void;
  onCancel: () => void;
}) {
  // search is purely what's typed to find a match — never what gets saved.
  // saveNameUk is separate and always editable: previously it silently
  // reused the search text, so two different picks under one broad search
  // (e.g. "квасоля" → two different USDA beans) both saved under the exact
  // same name with no warning, one quietly overwriting the other. Splitting
  // the fields, defaulting saveNameUk to something specific when possible,
  // and warning on an actual name collision (see handleSave) fixes both.
  const [search, setSearch] = useState("");
  const [saveNameUk, setSaveNameUk] = useState("");
  const [resolvedNameEn, setResolvedNameEn] = useState("");
  const [values, setValues] = useState<FormValues>(EMPTY_FORM_VALUES);
  const [source, setSource] = useState<IngredientSource>("manual");
  // Always starts unchecked, even for a bundle/USDA-sourced estimate —
  // "we researched it" isn't the same as "a person confirmed it against a
  // trusted source." See the giVerified comment on the Ingredient type.
  const [giVerified, setGiVerified] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupAttempted, setLookupAttempted] = useState(false);
  const [candidates, setCandidates] = useState<NutritionEstimate[]>([]);
  // Parallel to candidates — each candidate's nameEn back-translated to
  // Ukrainian purely for display (mom doesn't read English, and USDA's own
  // descriptions are English-only). null entries mean translation failed or
  // hasn't resolved yet; the UI falls back to showing English alone for those.
  const [candidateNamesUk, setCandidateNamesUk] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Bundle matches are picked directly from the browsable suggestion list
  // below (handlePickSuggestion) — the "Знайти" button (handleLookup) is
  // only for names not in that list, and deliberately skips the bundle
  // itself (see lookupExternal) so it never silently resolves an ambiguous
  // name to a single guessed candidate. English (needed for the USDA query)
  // is resolved automatically via translation; it's still shown afterward as
  // a subtle secondary label (see .food-name-en) — a fallback cross-check,
  // not something she needs to read or supply herself.
  const applyEstimate = (
    estimate: (Omit<NutritionEstimate, "source"> & { source: IngredientSource }) | null,
    defaultSaveName: string,
  ) => {
    setLookupAttempted(true);
    setDuplicateWarning(null);
    setGiVerified(false); // a new pick hasn't been confirmed, even if a previous one was
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
      setSaveNameUk(defaultSaveName);
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
      const results = await lookupExternalCandidates(search);
      setCandidates(results);
      setCandidateNamesUk(results.map(() => null));
      if (results.length > 0) {
        setLookupAttempted(true);
        // Fire off independently, in the background — never block showing
        // the (already-usable, English) candidate list on translation, which
        // can be slow or fail per-candidate. Each one fills in as it resolves.
        results.forEach((candidate, i) => {
          void translateEnToUk(candidate.nameEn).then((nameUk) => {
            setCandidateNamesUk((prev) => {
              const next = [...prev];
              next[i] = nameUk;
              return next;
            });
          });
        });
      } else {
        applyEstimate(null, search);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLookupLoading(false);
    }
  };

  // Clicking a suggestion below skips the lookup round-trip entirely — we
  // already have the full entry in hand, whether it came from the bundle or
  // was already saved to the sheet. Its own name is already specific, so
  // it's a safe save-name default as-is.
  const handlePickSuggestion = (food: Ingredient) => {
    setCandidates([]);
    setCandidateNamesUk([]);
    applyEstimate(
      {
        nameEn: food.nameEn,
        carbsG: food.carbsG,
        gi: food.gi,
        fiberG: food.fiberG,
        sugarsG: food.sugarsG,
        proteinG: food.proteinG,
        fatG: food.fatG,
        caloriesKcal: food.caloriesKcal,
        sodiumMg: food.sodiumMg,
        source: food.source,
      },
      food.nameUk,
    );
  };

  // Only searches once something's actually typed — showing the entire
  // available list (bundle + everything already saved) by default made it
  // look like a list of pre-existing entries rather than a search, and
  // buried the point of typing a query at all. Searches the FULL available
  // list (not just the static bundle) specifically so an already-saved food
  // that isn't part of the bundle still turns up here — the whole reason
  // this existed was so a near-duplicate re-add is visible before it happens.
  const suggestions =
    lookupAttempted || !search.trim()
      ? []
      : availableFoods.filter((food) => food.nameUk.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    const parsed = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, Number(values[field])]),
    ) as Record<NumericField, number>;

    // Number("") is 0, not NaN — checking .trim() !== "" first is required,
    // otherwise a field left blank (e.g. an unfilled GI) would silently pass
    // as a valid 0 instead of being caught by validation.
    const allValid =
      saveNameUk.trim() !== "" &&
      NUMERIC_FIELDS.every(
        (field) => values[field].trim() !== "" && Number.isFinite(parsed[field]) && parsed[field] >= 0,
      );

    if (!allValid) {
      setError(uk.foods.form.validationError);
      return;
    }

    // Ambiguous searches (e.g. "квасоля") can surface several distinct
    // matches that would otherwise all default to the same save name — warn
    // instead of silently overwriting an existing entry. Editing the name
    // clears this (see the input's onChange below), so the warning can't go
    // stale against a name she's since changed.
    if (!duplicateWarning && existingNames.has(saveNameUk.trim().toLowerCase())) {
      setError(null);
      setDuplicateWarning(uk.foods.form.duplicateNameWarning(saveNameUk.trim()));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const ingredient: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag"> = {
        nameUk: saveNameUk.trim(),
        nameEn: resolvedNameEn,
        source,
        giVerified,
        ...parsed,
      };
      await addIngredient(ingredient);
      onSaved({ ...ingredient, dateAdded: new Date().toISOString().slice(0, 10), favorite: false, glycemicFlag: "none" });
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
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCandidates([]);
            setCandidateNamesUk([]);
          }}
          placeholder={uk.foods.form.nameUkPlaceholder}
        />
      </label>
      <p className="food-form-hint">{uk.foods.form.nameUkHint}</p>
      <button type="button" onClick={handleLookup} disabled={lookupLoading || !search}>
        {lookupLoading ? uk.foods.form.lookupLoading : uk.foods.form.lookupButton}
      </button>

      {!lookupAttempted && search.trim() !== "" && (
        <>
          <ul className="food-list">
            {suggestions.map((food) => (
              <li key={food.nameUk} className="food-list-item-with-action">
                <span>
                  <strong>{food.nameUk}</strong> <span className="food-name-en">({food.nameEn})</span> —{" "}
                  {food.carbsG} г вуглеводів, ГІ {food.gi} ({uk.health.gi[classifyGi(food.gi)]})
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
          {candidates.map((candidate, i) => {
            const nameUk = candidateNamesUk[i];
            return (
              <li key={i} className="food-list-item-with-action">
                <span>
                  {nameUk ? (
                    <>
                      <strong>{nameUk}</strong> <span className="food-name-en">({candidate.nameEn})</span>
                    </>
                  ) : (
                    <strong>{candidate.nameEn}</strong>
                  )}{" "}
                  — {candidate.carbsG} г вуглеводів
                  {candidate.gi !== null && `, ГІ ${candidate.gi} (${uk.health.gi[classifyGi(candidate.gi)]})`}
                </span>
                <button type="button" onClick={() => applyEstimate(candidate, nameUk ?? search)}>
                  {uk.foods.form.pickButton}
                </button>
              </li>
            );
          })}
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

      <label>
        {uk.foods.form.saveNameLabel}
        <input
          value={saveNameUk}
          onChange={(e) => {
            setSaveNameUk(e.target.value);
            setDuplicateWarning(null);
          }}
        />
      </label>
      <p className="food-form-hint">{uk.foods.form.saveNameHint}</p>

      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={values[field]}
            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
          />
        </label>
      ))}

      <label className="settings-checkbox">
        <input type="checkbox" checked={giVerified} onChange={(e) => setGiVerified(e.target.checked)} />
        {uk.foods.form.giVerifiedLabel}
      </label>

      {error && <p className="food-form-error">{error}</p>}
      {duplicateWarning && <p className="food-form-error">{duplicateWarning}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {duplicateWarning ? uk.foods.form.confirmOverwriteButton : uk.foods.form.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

// Direct field editing for an existing Ingredient — no search/lookup needed
// here, unlike AddFoodForm, since she's correcting values already in hand.
// A bundle-only ingredient (dateAdded === "", never actually saved) can
// still be "edited" — saving it is then the first save, same implicit-save
// principle as favoriting one (see handleToggleFavorite in FoodsScreen).
function EditIngredientForm({
  ingredient,
  onSaved,
  onCancel,
}: {
  ingredient: Ingredient;
  onSaved: (updated: Ingredient) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(ingredient.nameUk);
  const [nameEn, setNameEn] = useState(ingredient.nameEn);
  const [values, setValues] = useState<FormValues>({
    carbsG: String(ingredient.carbsG),
    gi: String(ingredient.gi),
    fiberG: String(ingredient.fiberG),
    sugarsG: String(ingredient.sugarsG),
    proteinG: String(ingredient.proteinG),
    fatG: String(ingredient.fatG),
    caloriesKcal: String(ingredient.caloriesKcal),
    sodiumMg: String(ingredient.sodiumMg),
  });
  const [giVerified, setGiVerified] = useState(ingredient.giVerified);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, Number(values[field])]),
    ) as Record<NumericField, number>;
    const allValid =
      nameUk.trim() !== "" &&
      NUMERIC_FIELDS.every(
        (field) => values[field].trim() !== "" && Number.isFinite(parsed[field]) && parsed[field] >= 0,
      );

    if (!allValid) {
      setError(uk.foods.editForm.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated: Ingredient = { ...ingredient, nameUk: nameUk.trim(), nameEn: nameEn.trim(), giVerified, ...parsed };
      if (ingredient.dateAdded) {
        await updateIngredient(ingredient.nameUk, updated);
      } else {
        await addIngredient(
          {
            nameUk: updated.nameUk,
            nameEn: updated.nameEn,
            carbsG: updated.carbsG,
            gi: updated.gi,
            fiberG: updated.fiberG,
            sugarsG: updated.sugarsG,
            proteinG: updated.proteinG,
            fatG: updated.fatG,
            caloriesKcal: updated.caloriesKcal,
            sodiumMg: updated.sodiumMg,
            source: updated.source,
            giVerified: updated.giVerified,
          },
          updated.favorite,
          updated.glycemicFlag,
        );
      }
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <h2>{uk.foods.editForm.title}</h2>
      <label>
        {uk.foods.editForm.nameUkLabel}
        <input value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
      </label>
      <label>
        {uk.foods.editForm.nameEnLabel}
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>

      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={values[field]}
            onChange={(e) => {
              setValues({ ...values, [field]: e.target.value });
              if (field === "gi") setGiVerified(false); // a changed GI invalidates any prior confirmation
            }}
          />
        </label>
      ))}

      <label className="settings-checkbox">
        <input type="checkbox" checked={giVerified} onChange={(e) => setGiVerified(e.target.checked)} />
        {uk.foods.form.giVerifiedLabel}
      </label>

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {uk.foods.editForm.saveButton}
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
function AddDishForm({
  availableDishes,
  onSaved,
  onCancel,
}: {
  availableDishes: Dish[];
  onSaved: (dish: Dish) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only searches once something's typed, and over the full available list
  // (bundle + whatever's already saved) — same reasoning as AddFoodForm's
  // suggestions: showing everything by default looked like a pre-existing
  // list rather than a search, and searching only the static bundle missed
  // an already-saved dish that isn't part of it.
  const matches = search.trim()
    ? availableDishes.filter((d) => d.nameUk.toLowerCase().includes(search.toLowerCase()))
    : [];

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
              вуглеводів, ≈ГІ {dish.gi}
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
  existingDish,
  onSaved,
  onCancel,
}: {
  ingredients: Ingredient[];
  // Present only when editing an already-composed Dish — pre-fills the form
  // from it and updates that row in place on save (or, if it was a
  // bundle-only dish never actually saved, this becomes its first save —
  // same implicit-save principle used elsewhere in this screen).
  existingDish?: Dish;
  onSaved: (dish: Dish) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(existingDish?.nameUk ?? "");
  const [rows, setRows] = useState<ComposeRow[]>(
    existingDish && existingDish.ingredients.length > 0
      ? existingDish.ingredients.map((ref) => ({ nameUk: ref.nameUk, grams: String(ref.grams) }))
      : [EMPTY_ROW],
  );
  const [yieldGrams, setYieldGrams] = useState(existingDish ? String(existingDish.yieldGrams) : "");
  const [giVerified, setGiVerified] = useState(existingDish?.giVerified ?? false);
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
      const dish: Omit<Dish, "dateAdded" | "glycemicFlag"> = {
        nameUk: nameUk.trim(),
        nameEn,
        ingredients: refs,
        yieldGrams: parsedYield,
        ...nutrition,
        source: existingDish?.source ?? "manual",
        giVerified,
      };
      const glycemicFlag = existingDish?.glycemicFlag ?? "none";
      if (existingDish?.dateAdded) {
        const updated: Dish = { ...dish, dateAdded: existingDish.dateAdded, glycemicFlag };
        await updateDish(existingDish.nameUk, updated);
        onSaved(updated);
      } else {
        await addDish(dish, glycemicFlag);
        onSaved({ ...dish, dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag });
      }
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
                      {ingredient.glycemicFlag !== "none" && (
                        <span aria-hidden="true" className={`glycemic-inline ${ingredient.glycemicFlag}`}>
                          {GLYCEMIC_FLAG_SYMBOL[ingredient.glycemicFlag]}{" "}
                        </span>
                      )}
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
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={row.grams}
                onChange={(e) => updateRow(index, { grams: e.target.value })}
              />
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
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={yieldGrams}
          onChange={(e) => setYieldGrams(e.target.value)}
        />
      </label>
      <p className="food-form-hint">{uk.dishes.composeForm.yieldHint}</p>

      {preview && (
        <>
          <p className="food-form-source">
            {uk.dishes.composeForm.preview(preview.carbsG, preview.caloriesKcal, preview.gi, giVerified ? "" : "≈")}
          </p>
          <p className="food-form-hint">{uk.dishes.approximateGiNote}</p>
        </>
      )}

      <label className="settings-checkbox">
        <input type="checkbox" checked={giVerified} onChange={(e) => setGiVerified(e.target.checked)} />
        {uk.foods.form.giVerifiedLabel}
      </label>

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
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);

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
        const toSave: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag"> = {
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
          giVerified: ingredient.giVerified,
        };
        await addIngredient(toSave, nextFavorite, ingredient.glycemicFlag);
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

  // Same implicit-save pattern as handleToggleFavorite, but cycling the
  // three-state glycemicFlag instead of toggling a boolean.
  const handleCycleIngredientFlag = async (ingredient: Ingredient) => {
    const nextFlag = cycleGlycemicFlag(ingredient.glycemicFlag);
    const isSaved = (ingredients ?? []).some(
      (i) => i.nameUk.trim().toLowerCase() === ingredient.nameUk.trim().toLowerCase(),
    );

    if (!isSaved) {
      try {
        const toSave: Omit<Ingredient, "dateAdded" | "favorite" | "glycemicFlag"> = {
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
          giVerified: ingredient.giVerified,
        };
        await addIngredient(toSave, ingredient.favorite, nextFlag);
        setIngredients((prev) => [
          ...(prev ?? []),
          { ...ingredient, dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag: nextFlag },
        ]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setIngredients((prev) =>
      (prev ?? []).map((i) => (i.nameUk === ingredient.nameUk ? { ...i, glycemicFlag: nextFlag } : i)),
    );
    try {
      await setIngredientGlycemicFlag(ingredient.nameUk, nextFlag);
    } catch (err) {
      setIngredients((prev) =>
        (prev ?? []).map((i) => (i.nameUk === ingredient.nameUk ? { ...i, glycemicFlag: ingredient.glycemicFlag } : i)),
      );
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  // Mirrors handleCycleIngredientFlag for Dishes: a bundle-only dish (never
  // saved) is implicitly saved on first flag, same principle as Favorites.
  const handleCycleDishFlag = async (dish: Dish) => {
    const nextFlag = cycleGlycemicFlag(dish.glycemicFlag);
    const isSaved = (dishes ?? []).some((d) => d.nameUk.trim().toLowerCase() === dish.nameUk.trim().toLowerCase());

    if (!isSaved) {
      try {
        const toSave: Omit<Dish, "dateAdded" | "glycemicFlag"> = {
          nameUk: dish.nameUk,
          nameEn: dish.nameEn,
          ingredients: dish.ingredients,
          yieldGrams: dish.yieldGrams,
          carbsG: dish.carbsG,
          gi: dish.gi,
          fiberG: dish.fiberG,
          sugarsG: dish.sugarsG,
          proteinG: dish.proteinG,
          fatG: dish.fatG,
          caloriesKcal: dish.caloriesKcal,
          sodiumMg: dish.sodiumMg,
          source: dish.source,
          giVerified: dish.giVerified,
        };
        await addDish(toSave, nextFlag);
        setDishes((prev) => [
          ...(prev ?? []),
          { ...dish, dateAdded: new Date().toISOString().slice(0, 10), glycemicFlag: nextFlag },
        ]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setDishes((prev) => (prev ?? []).map((d) => (d.nameUk === dish.nameUk ? { ...d, glycemicFlag: nextFlag } : d)));
    try {
      await setDishGlycemicFlag(dish.nameUk, nextFlag);
    } catch (err) {
      setDishes((prev) =>
        (prev ?? []).map((d) => (d.nameUk === dish.nameUk ? { ...d, glycemicFlag: dish.glycemicFlag } : d)),
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

  // Live cross-reference for the derived "contains a flagged ingredient"
  // hint — see dishContainsFlaggedIngredient in lib/dishes.ts.
  const ingredientFlagByName = new Map(
    availableIngredients.map((i) => [i.nameUk.trim().toLowerCase(), i.glycemicFlag]),
  );
  const lookupIngredientFlag = (nameUk: string): GlycemicFlag | null =>
    ingredientFlagByName.get(nameUk.trim().toLowerCase()) ?? null;

  // For AddFoodForm's duplicate-name warning — every name currently
  // resolvable (bundle + saved), not just what's saved, since a collision
  // with either one would mean the same silent-override problem.
  const existingIngredientNames = new Set(availableIngredients.map((i) => i.nameUk.trim().toLowerCase()));

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

      {editingIngredient && (
        <EditIngredientForm
          ingredient={editingIngredient}
          onSaved={(updated) => {
            setIngredients((prev) => {
              const withoutOld = (prev ?? []).filter(
                (i) => i.nameUk.trim().toLowerCase() !== editingIngredient.nameUk.trim().toLowerCase(),
              );
              return [...withoutOld, updated];
            });
            setEditingIngredient(null);
          }}
          onCancel={() => setEditingIngredient(null)}
        />
      )}

      {editingDish && (
        <ComposeDishForm
          ingredients={availableIngredients}
          existingDish={editingDish}
          onSaved={(updated) => {
            setDishes((prev) => {
              const withoutOld = (prev ?? []).filter(
                (d) => d.nameUk.trim().toLowerCase() !== editingDish.nameUk.trim().toLowerCase(),
              );
              return [...withoutOld, updated];
            });
            setEditingDish(null);
          }}
          onCancel={() => setEditingDish(null)}
        />
      )}

      {!editingIngredient && !editingDish && showAddForm && subTab === "ingredients" && (
        <AddFoodForm
          availableFoods={availableIngredients}
          existingNames={existingIngredientNames}
          onSaved={(ingredient) => {
            setIngredients((prev) => [...(prev ?? []), ingredient]);
            setShowAddForm(false);
            setSearch("");
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {!editingIngredient && !editingDish && showAddForm && subTab === "dishes" && dishAddMode === "starter" && (
        <>
          <button type="button" className="compose-cta" onClick={() => setDishAddMode("custom")}>
            {uk.dishes.composeLinkLabel}
          </button>
          <AddDishForm
            availableDishes={availableDishes}
            onSaved={(dish) => {
              setDishes((prev) => [...(prev ?? []), dish]);
              setShowAddForm(false);
              setSearch("");
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </>
      )}

      {!editingIngredient && !editingDish && showAddForm && subTab === "dishes" && dishAddMode === "custom" && (
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

      {!editingIngredient && !editingDish && !showAddForm && subTab === "ingredients" && (
        <>
          <input
            className="food-search"
            placeholder={uk.foods.searchPlaceholder}
            aria-label={uk.foods.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={() => setShowAddForm(true)}>
            {uk.foods.addButton}
          </button>
          <p className="food-list-hint">{uk.foods.giLegend}</p>

          {loadError && <p className="food-form-error">{loadError}</p>}
          {filteredIngredients.length === 0 && <p>{uk.foods.noResults}</p>}

          <ul className="food-list">
            {filteredIngredients.map((ingredient) => (
              <li key={ingredient.nameUk} className="food-list-item-with-action">
                <span>
                  <strong>{ingredient.nameUk}</strong> <span className="food-name-en">({ingredient.nameEn})</span> —{" "}
                  {ingredient.carbsG} г вуглеводів, {ingredient.giVerified ? "" : "≈"}ГІ {ingredient.gi} (
                  {uk.health.gi[classifyGi(ingredient.gi)]})
                </span>
                <div className="food-list-actions">
                  <button
                    type="button"
                    className="edit-toggle"
                    onClick={() => setEditingIngredient(ingredient)}
                    aria-label={uk.foods.editLabel}
                    title={uk.foods.editLabel}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={`glycemic-badge ${ingredient.glycemicFlag}`}
                    onClick={() => void handleCycleIngredientFlag(ingredient)}
                    aria-label={uk.foods.glycemicFlag.toggleLabel(ingredient.glycemicFlag)}
                    title={uk.foods.glycemicFlag.toggleLabel(ingredient.glycemicFlag)}
                  >
                    {GLYCEMIC_FLAG_SYMBOL[ingredient.glycemicFlag]}
                  </button>
                  <button
                    type="button"
                    className={ingredient.favorite ? "favorite-toggle active" : "favorite-toggle"}
                    onClick={() => void handleToggleFavorite(ingredient)}
                    aria-label={ingredient.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                    title={ingredient.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                  >
                    {ingredient.favorite ? "★" : "☆"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!editingIngredient && !editingDish && !showAddForm && subTab === "dishes" && (
        <>
          <input
            className="food-search"
            placeholder={uk.foods.searchPlaceholder}
            aria-label={uk.foods.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={() => setShowAddForm(true)}>
            {uk.dishes.addButton}
          </button>
          <p className="food-list-hint">{uk.foods.giLegend}</p>

          {loadError && <p className="food-form-error">{loadError}</p>}
          {filteredDishes.length === 0 && <p>{uk.dishes.noResults}</p>}

          <ul className="food-list">
            {filteredDishes.map((dish) => {
              const containsFlagged = dishContainsFlaggedIngredient(dish, lookupIngredientFlag);
              return (
                <li key={dish.nameUk}>
                  <div className="food-list-item-with-action">
                    <span>
                      <strong>{dish.nameUk}</strong> <span className="food-name-en">({dish.nameEn})</span> —{" "}
                      {dish.carbsG} г вуглеводів, {dish.giVerified ? "" : "≈"}ГІ {dish.gi} (
                      {uk.health.gi[classifyGi(dish.gi)]}) (на 100г)
                    </span>
                    <div className="food-list-actions">
                      <button
                        type="button"
                        className="edit-toggle"
                        onClick={() => setEditingDish(dish)}
                        aria-label={uk.dishes.editLabel}
                        title={uk.dishes.editLabel}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={`glycemic-badge ${dish.glycemicFlag}`}
                        onClick={() => void handleCycleDishFlag(dish)}
                        aria-label={uk.foods.glycemicFlag.toggleLabel(dish.glycemicFlag)}
                        title={uk.foods.glycemicFlag.toggleLabel(dish.glycemicFlag)}
                      >
                        {GLYCEMIC_FLAG_SYMBOL[dish.glycemicFlag]}
                      </button>
                    </div>
                  </div>

                  {containsFlagged && <p className="glycemic-hint">{uk.dishes.containsFlaggedIngredientHint}</p>}

                  {dish.glycemicFlag !== "none" && dish.ingredients.length > 0 && (
                    <div className="dish-ingredient-flags">
                      <p className="food-form-hint">{uk.dishes.flagIngredientsPrompt.title}</p>
                      <ul className="food-list">
                        {dish.ingredients.map((ref) => {
                          const ingredient = availableIngredients.find(
                            (i) => i.nameUk.trim().toLowerCase() === ref.nameUk.trim().toLowerCase(),
                          );
                          if (!ingredient) return null;
                          return (
                            <li key={ref.nameUk} className="food-list-item-with-action">
                              <span>{ingredient.nameUk}</span>
                              <button
                                type="button"
                                className={`glycemic-badge ${ingredient.glycemicFlag}`}
                                onClick={() => void handleCycleIngredientFlag(ingredient)}
                                aria-label={uk.foods.glycemicFlag.toggleLabel(ingredient.glycemicFlag)}
                                title={uk.foods.glycemicFlag.toggleLabel(ingredient.glycemicFlag)}
                              >
                                {GLYCEMIC_FLAG_SYMBOL[ingredient.glycemicFlag]}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
