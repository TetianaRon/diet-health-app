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
  computeDishUnknownFields,
  dishContainsFlaggedIngredient,
  listDishes,
  resolveItemRef,
  setDishGlycemicFlag,
  updateDish,
  type Dish,
  type DishIngredientRef,
  type NutritionKey,
} from "../lib/dishes";
import { cycleGlycemicFlag, GLYCEMIC_FLAG_SYMBOL, type GlycemicFlag } from "../lib/glycemicFlag";
import {
  isTranslationLimitedToday,
  lookupExternalCandidates,
  translateEnToUkMany,
  translateUkToEn,
  TRANSLATED_CANDIDATE_COUNT,
  type NutritionEstimate,
} from "../lib/nutrition";
import { mergeWithStarterDishes } from "../data/starter-dishes";
import Breadcrumb, { type Crumb } from "./Breadcrumb";
import DuplicateNameNotice, { type NamedItem } from "./DuplicateNameNotice";
import { findNameMatch, isBuiltInId, suggestFreeName } from "../lib/itemIds";

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

// A blank field is saved as "unknown" rather than blocked — someone may not
// be able to find a value (GI is often the hard one) or may only care about
// calories. Stored as 0 (a safe, writable default) but recorded in the row's
// unknownFields, so nothing downstream ever reads it as a real zero: a meal
// entry inherits the gap (see buildLogEntry) and a dish built from it does
// too (see computeDishUnknownFields). Non-blank fields still have to be real
// non-negative numbers — only *blank* is allowed, not garbage.
function parseFormValues(values: FormValues): {
  parsed: Record<NumericField, number>;
  unknownFields: NutritionKey[];
  valid: boolean;
} {
  const unknownFields = NUMERIC_FIELDS.filter((field) => values[field].trim() === "");
  const parsed = Object.fromEntries(
    NUMERIC_FIELDS.map((field) => [field, unknownFields.includes(field) ? 0 : Number(values[field])]),
  ) as Record<NumericField, number>;
  const valid = NUMERIC_FIELDS.every((field) => Number.isFinite(parsed[field]) && parsed[field] >= 0);
  return { parsed, unknownFields, valid };
}

function formValuesFromItem(item: { unknownFields: NutritionKey[] } & Record<NumericField, number>): FormValues {
  return Object.fromEntries(
    NUMERIC_FIELDS.map((field) => [field, item.unknownFields.includes(field) ? "" : String(item[field])]),
  ) as FormValues;
}

// One-line "carbs, GI" summary for a list row — "невідомо" (never a
// misleading 0) for a field the person left blank.
function foodMetaText(item: { carbsG: number; gi: number; giVerified: boolean; unknownFields: NutritionKey[] }): string {
  const carbs = item.unknownFields.includes("carbsG")
    ? `вуглеводи ${uk.today.unknownValueLabel}`
    : `${item.carbsG} г вуглеводів`;
  const gi = item.unknownFields.includes("gi")
    ? `ГІ ${uk.today.unknownValueLabel}`
    : `${item.giVerified ? "" : "≈"}ГІ ${item.gi} (${uk.health.gi[classifyGi(item.gi)]})`;
  return `${carbs}, ${gi}`;
}

// Saving a built-in item (favouriting, flagging or editing it) stores her own
// copy: a new `I…` / `D…` row whose BasedOn is the built-in ID, which then
// takes the built-in item's place in lists (see mergeBuiltInsById).
async function saveIngredientCopy(item: Ingredient): Promise<Ingredient> {
  const { id, basedOn: _basedOn, dateAdded: _dateAdded, favorite, glycemicFlag, ...fields } = item;
  return addIngredient({ ...fields, basedOn: id }, favorite, glycemicFlag);
}

async function saveDishCopy(dish: Dish, glycemicFlag: GlycemicFlag): Promise<Dish> {
  const { id, basedOn: _basedOn, dateAdded: _dateAdded, glycemicFlag: _flag, ...fields } = dish;
  return addDish({ ...fields, basedOn: id }, glycemicFlag);
}

function AddFoodForm({
  availableFoods,
  existingItems,
  onSaved,
  onCancel,
  onUseExisting,
}: {
  availableFoods: Ingredient[];
  // Every item a new name could be confused with (built-in + saved,
  // ingredients and dishes) — see DuplicateNameNotice.
  existingItems: NamedItem[];
  onSaved: (ingredient: Ingredient) => void;
  onCancel: () => void;
  onUseExisting: (item: NamedItem) => void;
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
  // Why the last "Знайти" found nothing to list, when it wasn't a genuine
  // miss — shown instead of «Не знайдено», which used to cover both.
  const [lookupProblem, setLookupProblem] = useState<"translation-limited" | "failed" | null>(null);
  // The free translator's daily limit — it's the translation that's limited,
  // not the search: English words still go straight to USDA.
  const [translationLimited, setTranslationLimited] = useState(isTranslationLimitedToday);
  const [error, setError] = useState<string | null>(null);
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
    estimate: (Omit<NutritionEstimate, "source"> & { source: IngredientSource; unknownFields?: NutritionKey[] }) | null,
    defaultSaveName: string,
  ) => {
    setLookupAttempted(true);
    setGiVerified(false); // a new pick hasn't been confirmed, even if a previous one was
    if (estimate) {
      const unknown = estimate.unknownFields ?? [];
      const show = (field: NumericField, value: number | null) =>
        value === null || unknown.includes(field) ? "" : String(value);
      setValues({
        carbsG: show("carbsG", estimate.carbsG),
        gi: show("gi", estimate.gi),
        fiberG: show("fiberG", estimate.fiberG),
        sugarsG: show("sugarsG", estimate.sugarsG),
        proteinG: show("proteinG", estimate.proteinG),
        fatG: show("fatG", estimate.fatG),
        caloriesKcal: show("caloriesKcal", estimate.caloriesKcal),
        sodiumMg: show("sodiumMg", estimate.sodiumMg),
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
    setLookupProblem(null);
    try {
      const result = await lookupExternalCandidates(search);
      const results = result.kind === "found" ? result.candidates : [];
      setCandidates(results);
      setCandidateNamesUk(results.map(() => null));
      if (result.kind === "found") {
        setLookupAttempted(true);
        // In the background — never block showing the (already-usable,
        // English) candidate list on translation, which can be slow or fail.
        // Only the top ones, in one request: the rest stay in English (see
        // the list below).
        void translateEnToUkMany(results.slice(0, TRANSLATED_CANDIDATE_COUNT).map((c) => c.nameEn)).then((namesUk) => {
          setCandidateNamesUk((prev) => prev.map((name, i) => namesUk[i] ?? name));
          setTranslationLimited(isTranslationLimitedToday());
        });
      } else if (result.kind === "none") {
        applyEstimate(null, search);
      } else {
        setLookupProblem(result.kind);
      }
    } finally {
      setTranslationLimited(isTranslationLimitedToday());
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
        unknownFields: food.unknownFields,
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

  const nameMatch = findNameMatch(saveNameUk, existingItems);

  const handleSave = async () => {
    // Blank is a deliberate "unknown", not an error (see parseFormValues) —
    // Number("") is 0, so blanks are detected via .trim() there and recorded
    // in unknownFields instead of silently passing as a real 0.
    const { parsed, unknownFields, valid } = parseFormValues(values);

    if (saveNameUk.trim() === "" || !valid) {
      setError(uk.foods.form.validationError);
      return;
    }

    // Ambiguous searches (e.g. "квасоля") can surface several distinct
    // matches that would all default to the same save name — the
    // duplicate-name check below the field has to be resolved first.
    if (nameMatch) return;

    setSaving(true);
    setError(null);
    try {
      const saved = await addIngredient({
        nameUk: saveNameUk.trim(),
        nameEn: resolvedNameEn,
        source,
        giVerified: giVerified && !unknownFields.includes("gi"),
        unknownFields,
        ...parsed,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      {translationLimited && <p className="food-form-notice">{uk.foods.form.translationLimitedNotice}</p>}
      <label>
        {uk.foods.form.nameUkLabel}
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCandidates([]);
            setCandidateNamesUk([]);
            setLookupProblem(null);
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
              <li key={food.id} className="food-list-item-with-action">
                <span>
                  <strong>{food.nameUk}</strong> <span className="food-name-en">({food.nameEn})</span> —{" "}
                  {foodMetaText({ ...food, giVerified: true })}
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

      {lookupProblem && (
        <p className="food-form-notice">
          {lookupProblem === "translation-limited"
            ? uk.foods.form.translationLimitedSearch
            : uk.foods.form.searchFailed}
        </p>
      )}

      {lookupAttempted && candidates.length > 0 && (
        <ul className="food-list food-list-scroll">
          {candidates.slice(0, TRANSLATED_CANDIDATE_COUNT).map((candidate, i) => {
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
          {candidates.length > TRANSLATED_CANDIDATE_COUNT && (
            <li className="food-list-note">{uk.foods.form.untranslatedNote}</li>
          )}
          {candidates.slice(TRANSLATED_CANDIDATE_COUNT).map((candidate, i) => (
            <li key={`en-${i}`} className="food-list-item-with-action food-list-item-muted">
              <span>
                {candidate.nameEn} — {candidate.carbsG} г вуглеводів
                {candidate.gi !== null && `, ГІ ${candidate.gi} (${uk.health.gi[classifyGi(candidate.gi)]})`}
              </span>
              <button type="button" onClick={() => applyEstimate(candidate, search)}>
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

      {lookupAttempted && candidates.length === 0 && !lookupProblem && (
        <p className="food-form-source">
          {uk.foods.form.sourceLabel}: {uk.foods.form.source[source]} — {uk.foods.form.notFound}
        </p>
      )}

      <label>
        {uk.foods.form.saveNameLabel}
        <input
          value={saveNameUk}
          onChange={(e) => setSaveNameUk(e.target.value)}
        />
      </label>
      {nameMatch && (
        <DuplicateNameNotice
          match={nameMatch}
          suggestedName={suggestFreeName(saveNameUk, existingItems.map((i) => i.nameUk))}
          onRename={setSaveNameUk}
          onUseExisting={onUseExisting}
        />
      )}
      <p className="food-form-hint">{uk.foods.form.saveNameHint}</p>

      <p className="food-form-hint">{uk.foods.form.unknownHint}</p>
      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={values[field]}
            placeholder={uk.foods.form.unknownPlaceholder}
            onChange={(e) => setValues({ ...values, [field]: e.target.value })}
          />
        </label>
      ))}

      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={giVerified}
          disabled={values.gi.trim() === ""}
          onChange={(e) => setGiVerified(e.target.checked)}
        />
        {uk.foods.form.giVerifiedLabel}
      </label>

      {error && <p className="food-form-error">{error}</p>}
      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving || nameMatch !== null}>
          {uk.foods.form.saveButton}
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
  existingItems,
  onSaved,
  onCancel,
}: {
  ingredient: Ingredient;
  existingItems: NamedItem[];
  onSaved: (updated: Ingredient) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(ingredient.nameUk);
  const [nameEn, setNameEn] = useState(ingredient.nameEn);
  const [values, setValues] = useState<FormValues>(() => formValuesFromItem(ingredient));
  const [giVerified, setGiVerified] = useState(ingredient.giVerified);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatch = findNameMatch(nameUk, existingItems, ingredient.id);

  const handleSave = async () => {
    const { parsed, unknownFields, valid } = parseFormValues(values);

    if (nameUk.trim() === "" || !valid) {
      setError(uk.foods.editForm.validationError);
      return;
    }
    if (nameMatch) return;

    setSaving(true);
    setError(null);
    try {
      const updated: Ingredient = {
        ...ingredient,
        nameUk: nameUk.trim(),
        nameEn: nameEn.trim(),
        giVerified: giVerified && !unknownFields.includes("gi"),
        unknownFields,
        ...parsed,
      };
      if (isBuiltInId(ingredient.id)) {
        // Editing a built-in item saves her own copy, which takes its place.
        onSaved(await saveIngredientCopy(updated));
      } else {
        await updateIngredient(updated);
        onSaved(updated);
      }
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
      {nameMatch && (
        <DuplicateNameNotice
          match={nameMatch}
          suggestedName={suggestFreeName(nameUk, existingItems.map((i) => i.nameUk))}
          onRename={setNameUk}
        />
      )}
      <label>
        {uk.foods.editForm.nameEnLabel}
        <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>

      <p className="food-form-hint">{uk.foods.form.unknownHint}</p>
      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={values[field]}
            placeholder={uk.foods.form.unknownPlaceholder}
            onChange={(e) => {
              setValues({ ...values, [field]: e.target.value });
              if (field === "gi") setGiVerified(false); // a changed GI invalidates any prior confirmation
            }}
          />
        </label>
      ))}

      <label className="settings-checkbox">
        <input
          type="checkbox"
          checked={giVerified}
          disabled={values.gi.trim() === ""}
          onChange={(e) => setGiVerified(e.target.checked)}
        />
        {uk.foods.form.giVerifiedLabel}
      </label>

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

  const handleAdd = async (dish: Dish) => {
    if (!isBuiltInId(dish.id)) {
      onSaved(dish); // already one of her saved dishes — nothing to add
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveDishCopy(dish, dish.glycemicFlag));
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
          <li key={dish.id} className="food-list-item-with-action">
            <span>
              <strong>{dish.nameUk}</strong> <span className="food-name-en">({dish.nameEn})</span> —{" "}
              {foodMetaText({ ...dish, giVerified: false })}
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
  // The picked ingredient's ID; cleared when the name is typed over, so a
  // typed name is then matched by name (see findIngredient below).
  id?: string;
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
  existingItems,
  existingDish,
  onSaved,
  onCancel,
  onUseExisting,
}: {
  ingredients: Ingredient[];
  existingItems: NamedItem[];
  // Present only when editing an already-composed Dish — pre-fills the form
  // from it and updates that row in place on save (or, if it was a
  // bundle-only dish never actually saved, this becomes its first save —
  // same implicit-save principle used elsewhere in this screen).
  existingDish?: Dish;
  onSaved: (dish: Dish) => void;
  onCancel: () => void;
  /** Only for a new dish: «Це він — використати наявний» closes the form and shows that item. */
  onUseExisting?: (item: NamedItem) => void;
}) {
  const [nameUk, setNameUk] = useState(existingDish?.nameUk ?? "");
  const [rows, setRows] = useState<ComposeRow[]>(
    existingDish && existingDish.ingredients.length > 0
      ? existingDish.ingredients.map((ref) => ({ id: ref.id, nameUk: resolveItemRef(ref, ingredients)?.nameUk ?? ref.nameUk, grams: String(ref.grams) }))
      : [EMPTY_ROW],
  );
  const [yieldGrams, setYieldGrams] = useState(existingDish ? String(existingDish.yieldGrams) : "");
  const [giVerified, setGiVerified] = useState(existingDish?.giVerified ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedIngredients = sortFavoritesFirst(ingredients);

  const findIngredient = (row: { id?: string; nameUk: string }): Ingredient | null => resolveItemRef(row, ingredients);

  const nameMatch = findNameMatch(nameUk, existingItems, existingDish?.id);

  const updateRow = (index: number, patch: Partial<ComposeRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const toRef = (row: ComposeRow): DishIngredientRef | null => {
    const ingredient = findIngredient(row);
    return ingredient && Number(row.grams) > 0 ? { id: ingredient.id, nameUk: ingredient.nameUk, grams: Number(row.grams) } : null;
  };
  const resolvedRefs: DishIngredientRef[] = rows.map(toRef).filter((ref): ref is DishIngredientRef => ref !== null);

  const parsedYield = Number(yieldGrams);
  const preview =
    resolvedRefs.length === rows.filter((r) => r.nameUk.trim()).length &&
    resolvedRefs.length > 0 &&
    Number.isFinite(parsedYield) &&
    parsedYield > 0
      ? computeDishNutrition(resolvedRefs, parsedYield, findIngredient)
      : null;

  const previewUnknown = preview ? computeDishUnknownFields(resolvedRefs, findIngredient) : [];

  const handleSave = async () => {
    const allResolved = rows.every((row) => row.nameUk.trim() === "" || findIngredient(row));
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
    if (nameMatch) return;

    setSaving(true);
    setError(null);
    try {
      const refs = filledRows.map(toRef).filter((ref): ref is DishIngredientRef => ref !== null);
      const nutrition = computeDishNutrition(refs, parsedYield, findIngredient);
      const unknownFields = computeDishUnknownFields(refs, findIngredient);
      const nameEn = (await translateUkToEn(nameUk.trim())) ?? "";
      const dish: Omit<Dish, "dateAdded" | "glycemicFlag" | "id" | "basedOn"> = {
        nameUk: nameUk.trim(),
        nameEn,
        ingredients: refs,
        yieldGrams: parsedYield,
        ...nutrition,
        source: existingDish?.source ?? "manual",
        giVerified: giVerified && !unknownFields.includes("gi"),
        unknownFields,
      };
      const glycemicFlag = existingDish?.glycemicFlag ?? "none";
      if (existingDish && !isBuiltInId(existingDish.id)) {
        const updated: Dish = { ...dish, id: existingDish.id, basedOn: existingDish.basedOn, dateAdded: existingDish.dateAdded, glycemicFlag };
        await updateDish(updated);
        onSaved(updated);
      } else {
        // A new dish, or a built-in one being edited (saved as her copy).
        onSaved(await addDish({ ...dish, basedOn: existingDish?.id ?? "" }, glycemicFlag));
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
      {nameMatch && (
        <DuplicateNameNotice
          match={nameMatch}
          suggestedName={suggestFreeName(nameUk, existingItems.map((i) => i.nameUk))}
          onRename={setNameUk}
          onUseExisting={existingDish ? undefined : onUseExisting}
        />
      )}

      {rows.map((row, index) => {
        const resolvedIngredient = findIngredient(row);
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
                onChange={(e) => updateRow(index, { nameUk: e.target.value, id: undefined })}
                placeholder={uk.dishes.composeForm.ingredientPlaceholder}
              />
            </label>

            {suggestions.length > 0 && (
              <ul className="food-list food-list-scroll">
                {suggestions.map((ingredient) => (
                  <li key={ingredient.id} className="food-list-item-with-action">
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
                    <button type="button" onClick={() => updateRow(index, { id: ingredient.id, nameUk: ingredient.nameUk })}>
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
          {previewUnknown.length > 0 && (
            <p className="today-warning">
              {uk.dishes.composeForm.unknownFromIngredients(
                previewUnknown.map((field) => uk.foods.form.fields[field]).join(", "),
              )}
            </p>
          )}
        </>
      )}

      <label className="settings-checkbox">
        <input type="checkbox" checked={giVerified} onChange={(e) => setGiVerified(e.target.checked)} />
        {uk.foods.form.giVerifiedLabel}
      </label>

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={() => void handleSave()} disabled={saving || nameMatch !== null}>
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
  const { signedIn, initializing, signIn, sessionExpired } = useAuth();
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
    // Also after a renewed sign-in (sessionExpired true -> false): reload,
    // and clear the "sign in again" error the failed load left behind.
    if (!signedIn || sessionExpired) return;
    setLoadError(null);
    listIngredients()
      .then(setIngredients)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    listDishes()
      .then(setDishes)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn, sessionExpired]);

  const switchSubTab = (tab: FoodsSubTab) => {
    setSubTab(tab);
    setShowAddForm(false);
    setDishAddMode("starter");
    setSearch("");
  };

  // A built-in ingredient (never saved to the personal sheet) has no row for
  // setIngredientFavorite to update — favouriting it saves her copy, the one
  // implicit "add" the app performs (same for flags below).
  const replaceIngredient = (updated: Ingredient, replacesId: string) =>
    setIngredients((prev) => [...(prev ?? []).filter((i) => i.id !== replacesId && i.id !== updated.id), updated]);

  const handleToggleFavorite = async (ingredient: Ingredient) => {
    const nextFavorite = !ingredient.favorite;
    if (isBuiltInId(ingredient.id)) {
      try {
        replaceIngredient(await saveIngredientCopy({ ...ingredient, favorite: nextFavorite }), ingredient.id);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setIngredients((prev) => (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, favorite: nextFavorite } : i)));
    try {
      await setIngredientFavorite(ingredient.id, nextFavorite);
    } catch (err) {
      setIngredients((prev) => (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, favorite: ingredient.favorite } : i)));
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCycleIngredientFlag = async (ingredient: Ingredient) => {
    const nextFlag = cycleGlycemicFlag(ingredient.glycemicFlag);
    if (isBuiltInId(ingredient.id)) {
      try {
        replaceIngredient(await saveIngredientCopy({ ...ingredient, glycemicFlag: nextFlag }), ingredient.id);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setIngredients((prev) => (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, glycemicFlag: nextFlag } : i)));
    try {
      await setIngredientGlycemicFlag(ingredient.id, nextFlag);
    } catch (err) {
      setIngredients((prev) =>
        (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, glycemicFlag: ingredient.glycemicFlag } : i)),
      );
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  // Mirrors handleCycleIngredientFlag for Dishes.
  const handleCycleDishFlag = async (dish: Dish) => {
    const nextFlag = cycleGlycemicFlag(dish.glycemicFlag);
    if (isBuiltInId(dish.id)) {
      try {
        const saved = await saveDishCopy(dish, nextFlag);
        setDishes((prev) => [...(prev ?? []), saved]);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    setDishes((prev) => (prev ?? []).map((d) => (d.id === dish.id ? { ...d, glycemicFlag: nextFlag } : d)));
    try {
      await setDishGlycemicFlag(dish.id, nextFlag);
    } catch (err) {
      setDishes((prev) => (prev ?? []).map((d) => (d.id === dish.id ? { ...d, glycemicFlag: dish.glycemicFlag } : d)));
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
  const lookupIngredientFlag = (ref: DishIngredientRef): GlycemicFlag | null =>
    resolveItemRef(ref, availableIngredients)?.glycemicFlag ?? null;

  // For the duplicate-name check — every item a new name could be confused
  // with: built-in and saved, ingredients and dishes (they share the meal picker).
  const existingItems: NamedItem[] = [
    ...availableIngredients.map((i) => ({ ...i, kind: "ingredient" as const })),
    ...availableDishes.map((d) => ({ ...d, kind: "dish" as const })),
  ];
  // «Це він — використати наявний»: close the form and show that item in its list.
  const showExistingItem = (item: NamedItem) => {
    setShowAddForm(false);
    setDishAddMode("starter");
    setSubTab(item.kind === "dish" ? "dishes" : "ingredients");
    setSearch(item.nameUk);
  };

  // While an add/edit form is open it replaces the title and sub-tabs with a
  // breadcrumb at the top — the way back must never depend on scrolling down
  // to the form's own Cancel button.
  const closeAddForm = () => {
    setShowAddForm(false);
    setDishAddMode("starter");
  };
  const listCrumb = (label: string, close: () => void): Crumb => ({ label, onClick: close });
  let breadcrumb: { trail: Crumb[]; current: string } | null = null;
  if (editingIngredient) {
    breadcrumb = {
      trail: [listCrumb(uk.foods.subTabs.ingredients, () => setEditingIngredient(null))],
      current: uk.foods.editForm.title,
    };
  } else if (editingDish) {
    breadcrumb = {
      trail: [listCrumb(uk.foods.subTabs.dishes, () => setEditingDish(null))],
      current: uk.dishes.editTitle,
    };
  } else if (showAddForm && subTab === "ingredients") {
    breadcrumb = { trail: [listCrumb(uk.foods.subTabs.ingredients, closeAddForm)], current: uk.foods.addButton };
  } else if (showAddForm && subTab === "dishes") {
    breadcrumb =
      dishAddMode === "custom"
        ? {
            trail: [
              listCrumb(uk.foods.subTabs.dishes, closeAddForm),
              listCrumb(uk.dishes.addButton, () => setDishAddMode("starter")),
            ],
            current: uk.dishes.customRecipeCrumb,
          }
        : { trail: [listCrumb(uk.foods.subTabs.dishes, closeAddForm)], current: uk.dishes.addButton };
  }

  return (
    <section className="screen">
      {breadcrumb ? (
        <Breadcrumb trail={breadcrumb.trail} current={breadcrumb.current} />
      ) : (
        <>
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
        </>
      )}

      {editingIngredient && (
        <EditIngredientForm
          ingredient={editingIngredient}
          existingItems={existingItems}
          onSaved={(updated) => {
            replaceIngredient(updated, editingIngredient.id);
            setEditingIngredient(null);
          }}
          onCancel={() => setEditingIngredient(null)}
        />
      )}

      {editingDish && (
        <ComposeDishForm
          ingredients={availableIngredients}
          existingItems={existingItems}
          existingDish={editingDish}
          onSaved={(updated) => {
            setDishes((prev) => [...(prev ?? []).filter((d) => d.id !== editingDish.id && d.id !== updated.id), updated]);
            setEditingDish(null);
          }}
          onCancel={() => setEditingDish(null)}
        />
      )}

      {!editingIngredient && !editingDish && showAddForm && subTab === "ingredients" && (
        <AddFoodForm
          availableFoods={availableIngredients}
          existingItems={existingItems}
          onUseExisting={showExistingItem}
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
              setDishes((prev) => [...(prev ?? []).filter((d) => d.id !== dish.id), dish]);
              setShowAddForm(false);
              setSearch("");
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </>
      )}

      {!editingIngredient && !editingDish && showAddForm && subTab === "dishes" && dishAddMode === "custom" && (
        <>
          <ComposeDishForm
            ingredients={availableIngredients}
            existingItems={existingItems}
            onUseExisting={showExistingItem}
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
              <li key={ingredient.id} className="food-list-item-with-action">
                <span>
                  <strong>{ingredient.nameUk}</strong> <span className="food-name-en">({ingredient.nameEn})</span> —{" "}
                  {foodMetaText(ingredient)}
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
                <li key={dish.id}>
                  <div className="food-list-item-with-action">
                    <span>
                      <strong>{dish.nameUk}</strong> <span className="food-name-en">({dish.nameEn})</span> —{" "}
                      {foodMetaText(dish)} (на 100г)
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
                        {dish.ingredients.map((ref, refIndex) => {
                          const ingredient = resolveItemRef(ref, availableIngredients);
                          if (!ingredient) return null;
                          return (
                            <li key={`${ingredient.id}-${refIndex}`} className="food-list-item-with-action">
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
