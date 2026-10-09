import SignInPanel from "./SignInPanel";
import DeleteItem from "./DeleteItem";
import { deleteIngredient } from "../lib/ingredients";
import { deleteDish, dishesUsingIngredient } from "../lib/dishes";
import GiSuggestions from "./GiSuggestions";
import { verifiedEntry } from "../data/builtInFoods";
import { searchFoods } from "../lib/foodSearch";
import { fieldDecimal, formatDecimal } from "../lib/numberFormat";
import VerifiedInfoDialog from "./VerifiedInfoDialog";
import { builtInMatch, giSourceEntry } from "../lib/builtInStatus";
import type { VerifiedFoodEntry } from "../data/verifiedFoods";
import { useEffect, useState } from "react";
import { LABEL_KEYS, type LabelKey } from "../lib/labels";
import { carryUpward, dishAsIngredient, recipeCandidates } from "../lib/recipeGraph";
import { uk } from "../i18n/uk";
import MathInput from "./MathInput";
import { evaluateInput } from "../lib/mathInput";
import { useBackHandler } from "../lib/useBackHandler";
import { useAuth } from "../context/AuthContext";
import { classifyGi } from "../lib/health";
import {
  addIngredient,
  listIngredients,
  mergeWithBuiltInFoods,
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
  unknownGiCarbShare,
  dishContainsFlaggedIngredient,
  listDishes,
  resolveItemRef,
  setDishGlycemicFlag,
  setDishFavorite,
  updateDish,
  updateDishes,
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
import Breadcrumb, { type Crumb } from "./Breadcrumb";
import { SetChecklist, SetsList } from "./DatabaseSets";
import { copyFromDatabase, coveredDatabaseIds, databaseCopyFields, idsNeedingCopies } from "../lib/databaseItems";
import { onOpenSetsRequest, takeOpenSetsRequest } from "../lib/openSets";
import { DATABASE_SETS } from "../data/databaseSets";
import DuplicateNameNotice, { type NamedItem } from "./DuplicateNameNotice";
import { findNameMatch, isBuiltInId, suggestFreeName } from "../lib/itemIds";
import PackAmountFields, { measureFromPackFields, type PackFields } from "./PackAmountFields";
import ProductMeasureFields, { isMeasure, measureFromProductFields, productFieldsFromMeasure, type ProductFields } from "./ProductMeasureFields";
import PortionSizesFields, { sizeRowsFrom, sizesFromRows, type SizeRow } from "./PortionSizesFields";
import WeighedPiecesFields, { weighedPair } from "./WeighedPiecesFields";
import { gramsPerMl, pieceGrams, round2, toStoredValues, toTypedValues, valuesAmount, PER_100G, type Basis, type Measure } from "../lib/measure";
import { measureOf, refFactor } from "../lib/dishes";

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
    NUMERIC_FIELDS.map((field) => [field, unknownFields.includes(field) ? 0 : (evaluateInput(values[field]) ?? NaN)]),
  ) as Record<NumericField, number>;
  const valid = NUMERIC_FIELDS.every((field) => Number.isFinite(parsed[field]) && parsed[field] >= 0);
  return { parsed, unknownFields, valid };
}

function formValuesFromItem(item: { unknownFields: NutritionKey[] } & Record<NumericField, number>): FormValues {
  return Object.fromEntries(
    NUMERIC_FIELDS.map((field) => [field, item.unknownFields.includes(field) ? "" : fieldDecimal(item[field])]),
  ) as FormValues;
}

// The values as the pack states them («на 30 г», «на 12 шт.»), for the editor (2.0.1).
function typedFormValues(item: Ingredient): FormValues {
  const typed = toTypedValues(item, measureOf(item));
  const shown = Object.fromEntries(NUMERIC_FIELDS.map((field) => [field, field === "gi" ? item.gi : round2(typed[field])])) as Record<NumericField, number>;
  return formValuesFromItem({ ...shown, unknownFields: item.unknownFields });
}

// «Буде збережено на 100 г: …» under the fields when the values were typed for another amount (2.0.1).
function PackSummary({ pack, values }: { pack: ProductFields; values: FormValues }) {
  const measure = measureFromProductFields(pack);
  if (!isMeasure(measure)) return <p className="food-form-error">{measure.problem}</p>;
  const { parsed, unknownFields, valid } = parseFormValues(values);
  if (!valid || measure.valuesPer === null) return null;
  const stored = toStoredValues(parsed, measure);
  const carbs = unknownFields.includes("carbsG") ? `вуглеводи ${uk.today.unknownValueLabel}` : uk.today.carbsValue(round2(stored.carbsG));
  const calories = unknownFields.includes("caloriesKcal") ? `калорії ${uk.today.unknownValueLabel}` : uk.today.caloriesValue(round2(stored.caloriesKcal));
  return <p className="food-form-source">{uk.foods.pack.storedPreview(measure.basis, carbs, calories)}</p>;
}

/** The size unit that matches a basis (2.1.2): a new size starts in the item's main unit. */
function basisUnit(basis: Basis): SizeRow["unit"] {
  return basis === "piece" ? "pieces" : basis === "100ml" ? "ml" : "grams";
}

// Which units her portion sizes can use: grams unless counted per piece without a weight, pieces when per piece or weighed.
function sizeUnits(pack: ProductFields): { allowGrams: boolean; allowPieces: boolean; allowMl: boolean; preferredUnit: SizeRow["unit"] } {
  const measure = measureFromProductFields(pack);
  const weighed = isMeasure(measure) && pieceGrams(measure) !== null;
  const density = isMeasure(measure) && gramsPerMl(measure) !== null;
  return {
    allowGrams: pack.main === "100g" || weighed || density,
    allowPieces: pack.main === "piece" || weighed,
    allowMl: pack.main === "100ml" || density,
    preferredUnit: basisUnit(pack.main),
  };
}

// «Значення на 30 г» above the value fields.
function valuesHeading(pack: ProductFields): string | null {
  const measure = measureFromProductFields(pack);
  return isMeasure(measure) ? uk.foods.pack.valuesHeading(uk.foods.pack.amount(valuesAmount(measure), measure.basis)) : null;
}

// One-line "carbs, GI" summary for a list row — "невідомо" (never a
// misleading 0) for a field the person left blank.
function foodMetaText(
  item: { carbsG: number; gi: number; giVerified: boolean; unknownFields: NutritionKey[]; ingredients?: unknown[] } & Partial<Measure>,
  entry: VerifiedFoodEntry | null = null,
): string {
  const carbs = item.unknownFields.includes("carbsG")
    ? `вуглеводи ${uk.today.unknownValueLabel}`
    : `${formatDecimal(Math.round(item.carbsG * 10) / 10)} г вуглеводів`;
  // A database product says what kind of GI it has (since 1.8): «умовне» or «не застосовується»;
  // its value has a cited source (ⓘ), so no «≈» — that mark stays for values entered without one.
  const gi =
    entry?.gi.status === "notApplicable"
      ? uk.verified.giNotApplicable
      : item.unknownFields.includes("gi")
        ? `ГІ ${uk.today.unknownValueLabel}`
        : entry?.gi.status === "conventional"
          ? `ГІ ${item.gi} (${uk.verified.giStatus.conventional})`
          : entry?.state === "dry"
            ? `ГІ ${item.gi} (${uk.verified.afterCooking}, ${uk.health.gi[classifyGi(item.gi)]})`
            : `${item.giVerified || entry ? "" : "≈"}ГІ ${item.gi} (${uk.health.gi[classifyGi(item.gi)]})`;
  // A dish saved from a custom entry has no recipe: its piece is the whole portion.
  // Per 100 g is the unspoken default; per 100 ml (2.1.1) and per piece are said.
  const perPiece =
    item.basis === "100ml"
      ? ` ${uk.foods.pack.per("100ml")}`
      : item.basis !== "piece"
        ? ""
        : item.ingredients?.length === 0
          ? ` ${uk.dishes.fixedForm.perPortion}`
          : ` ${uk.foods.pack.per("piece")}`;
  return `${carbs}${perPiece}, ${gi}`;
}

/** The GI's database source to store: kept only while the GI still equals that entry's (1.9). */
function giFromIfStill(giFrom: string, gi: number, unknownFields: NutritionKey[]): string {
  const entry = giFrom ? verifiedEntry(giFrom) : null;
  return entry && !unknownFields.includes("gi") && entry.gi.value === gi ? entry.id : "";
}

// ⓘ for a product whose values come unchanged from the verified database, «неперевірено» for everything else.
// Her own item whose GI came from the database (1.9) keeps «неперевірено» for its nutrients and gets ⓘ for the GI.
function SourceBadge({
  entry,
  giEntry = null,
  name,
  onOpen,
}: {
  entry: VerifiedFoodEntry | null;
  giEntry?: VerifiedFoodEntry | null;
  name: string;
  onOpen: (entry: VerifiedFoodEntry, giOnly?: boolean) => void;
}) {
  if (!entry) {
    return (
      <>
        <span className="unverified-tag" title={uk.verified.unverifiedHint}>
          {uk.verified.unverified}
        </span>
        {giEntry && (
          <button
            type="button"
            className="info-button"
            aria-label={uk.giSuggest.taken(giEntry.nameUk)}
            title={uk.giSuggest.taken(giEntry.nameUk)}
            onClick={() => onOpen(giEntry, true)}
          >
            ⓘ ГІ
          </button>
        )}
      </>
    );
  }
  return (
    <button type="button" className="info-button" aria-label={uk.verified.infoLabel(name)} title={uk.verified.infoLabel(name)} onClick={() => onOpen(entry)}>
      ⓘ
    </button>
  );
}

// Saving a built-in item (favouriting, flagging or editing it) stores her own
// copy: a new `I…` / `D…` row whose BasedOn is the built-in ID, which then
// takes the built-in item's place in lists (see mergeBuiltInsById).
async function saveIngredientCopy(item: Ingredient): Promise<Ingredient> {
  const { id, basedOn: _basedOn, dateAdded: _dateAdded, favorite, glycemicFlag, ...fields } = item;
  return addIngredient({ ...fields, basedOn: id, basedOnValues: databaseCopyFields(id)?.basedOnValues ?? "" }, favorite, glycemicFlag);
}

async function saveDishCopy(dish: Dish, glycemicFlag: GlycemicFlag): Promise<Dish> {
  const { id, basedOn: _basedOn, dateAdded: _dateAdded, glycemicFlag: _flag, ...fields } = dish;
  return addDish({ ...fields, basedOn: id }, glycemicFlag);
}

function AddFoodForm({
  availableFoods,
  labels,
  existingItems,
  onSaved,
  onCancel,
  onUseExisting,
}: {
  availableFoods: Ingredient[];
  /** Labels chosen above the form (2.1). */
  labels: LabelKey[];
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
  const [pack, setPack] = useState<ProductFields>(() => productFieldsFromMeasure(PER_100G));
  const [sizeRows, setSizeRows] = useState<SizeRow[]>([]);
  const [source, setSource] = useState<IngredientSource>("manual");
  // Always starts unchecked, even for a bundle/USDA-sourced estimate —
  // "we researched it" isn't the same as "a person confirmed it against a
  // trusted source." See the giVerified comment on the Ingredient type.
  const [giVerified, setGiVerified] = useState(false);
  // The database entry the GI was taken from (a picked database product or a GI suggestion), else "".
  const [giFrom, setGiFrom] = useState("");
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
    setGiFrom("");
    setPack((prev) => ({ ...productFieldsFromMeasure(PER_100G), weighedPieces: prev.weighedPieces, weighedGrams: prev.weighedGrams, densityMl: prev.densityMl, densityGrams: prev.densityGrams })); // database and USDA values are per 100 g
    if (estimate) {
      const unknown = estimate.unknownFields ?? [];
      const show = (field: NumericField, value: number | null) =>
        value === null || unknown.includes(field) ? "" : fieldDecimal(value);
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
    // A database product (or her copy of one) brings its GI's source along.
    const entry = builtInMatch(food);
    setGiFrom(entry ? entry.id : giSourceEntry(food)?.id ?? "");
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
      : searchFoods(search, availableFoods, (food) => verifiedEntry(food.basedOn || food.id));

  const nameMatch = findNameMatch(saveNameUk, existingItems);

  const handleSave = async () => {
    // Blank is a deliberate "unknown", not an error (see parseFormValues) —
    // Number("") is 0, so blanks are detected via .trim() there and recorded
    // in unknownFields instead of silently passing as a real 0.
    const { parsed, unknownFields, valid } = parseFormValues(values);
    const measure = measureFromProductFields(pack);

    if (saveNameUk.trim() === "" || !valid) {
      setError(uk.foods.form.validationError);
      return;
    }
    if (!isMeasure(measure)) {
      setError(measure.problem);
      return;
    }
    const portionSizes = sizesFromRows(sizeRows);
    if (!Array.isArray(portionSizes)) {
      setError(portionSizes.problem);
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
        ...toStoredValues(parsed, measure),
        giFrom: giFromIfStill(giFrom, parsed.gi, unknownFields),
        ...measure,
        portionSizes,
        labels,
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
                  <strong>{food.nameUk}</strong> {food.nameEn && <span className="food-name-en">({food.nameEn})</span>} —{" "}
                  {foodMetaText({ ...food, giVerified: true }, builtInMatch(food))}
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
                      <strong>{nameUk}</strong> {candidate.nameEn && <span className="food-name-en">({candidate.nameEn})</span>}
                    </>
                  ) : (
                    <strong>{candidate.nameEn}</strong>
                  )}{" "}
                  — {formatDecimal(candidate.carbsG)} г вуглеводів
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
                {candidate.nameEn} — {formatDecimal(candidate.carbsG)} г вуглеводів
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

      <ProductMeasureFields fields={pack} onChange={setPack} />
      {valuesHeading(pack) && <h3 className="pack-values-heading">{valuesHeading(pack)}</h3>}
      <p className="food-form-hint">{uk.foods.form.unknownHint}</p>
      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <MathInput
            value={values[field]}
            placeholder={uk.foods.form.unknownPlaceholder}
            onChange={(v) => {
              setValues({ ...values, [field]: v });
              if (field === "gi") setGiFrom(""); // a GI typed by hand has no database source
            }}
          />
          {field === "gi" && (
            <GiSuggestions
              name={saveNameUk || search}
              giValue={values.gi}
              giFrom={giFrom}
              onTake={(entry) => {
                setValues({ ...values, gi: String(entry.gi.value) });
                setGiFrom(entry.id);
                setGiVerified(false);
              }}
            />
          )}
        </label>
      ))}

      <PackSummary pack={pack} values={values} />
      <PortionSizesFields rows={sizeRows} onChange={setSizeRows} {...sizeUnits(pack)} />

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
  labels,
  existingItems,
  onSaved,
  onCancel,
}: {
  ingredient: Ingredient;
  /** Labels chosen above the form (2.1). */
  labels: LabelKey[];
  existingItems: NamedItem[];
  onSaved: (updated: Ingredient) => void;
  onCancel: () => void;
}) {
  const [nameUk, setNameUk] = useState(ingredient.nameUk);
  const [nameEn, setNameEn] = useState(ingredient.nameEn);
  const [values, setValues] = useState<FormValues>(() => typedFormValues(ingredient));
  const [pack, setPack] = useState<ProductFields>(() => productFieldsFromMeasure(measureOf(ingredient)));
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(() => sizeRowsFrom(ingredient.portionSizes));
  const [giVerified, setGiVerified] = useState(ingredient.giVerified);
  const [giFrom, setGiFrom] = useState(ingredient.giFrom);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A database product (or an unchanged copy) already has its GI's source — no suggestions there.
  const isDatabaseValues = builtInMatch(ingredient) !== null;

  const nameMatch = findNameMatch(nameUk, existingItems, ingredient.id);

  const handleSave = async () => {
    const { parsed, unknownFields, valid } = parseFormValues(values);
    const measure = measureFromProductFields(pack);

    if (nameUk.trim() === "" || !valid) {
      setError(uk.foods.editForm.validationError);
      return;
    }
    if (!isMeasure(measure)) {
      setError(measure.problem);
      return;
    }
    const portionSizes = sizesFromRows(sizeRows);
    if (!Array.isArray(portionSizes)) {
      setError(portionSizes.problem);
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
        ...toStoredValues(parsed, measure),
        giFrom: giFromIfStill(isDatabaseValues ? ingredient.basedOn || ingredient.id : giFrom, parsed.gi, unknownFields),
        ...measure,
        portionSizes,
        labels,
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

      <ProductMeasureFields fields={pack} onChange={setPack} />
      {valuesHeading(pack) && <h3 className="pack-values-heading">{valuesHeading(pack)}</h3>}
      <p className="food-form-hint">{uk.foods.form.unknownHint}</p>
      {NUMERIC_FIELDS.map((field) => (
        <label key={field}>
          {uk.foods.form.fields[field]}
          <MathInput
            value={values[field]}
            placeholder={uk.foods.form.unknownPlaceholder}
            onChange={(v) => {
              setValues({ ...values, [field]: v });
              if (field === "gi") {
                setGiVerified(false); // a changed GI invalidates any prior confirmation
                setGiFrom(""); // …and has no database source
              }
            }}
          />
          {field === "gi" && !isDatabaseValues && (
            <GiSuggestions
              name={nameUk}
              giValue={values.gi}
              giFrom={giFrom}
              onTake={(entry) => {
                setValues({ ...values, gi: String(entry.gi.value) });
                setGiFrom(entry.id);
                setGiVerified(false);
              }}
            />
          )}
        </label>
      ))}

      <PackSummary pack={pack} values={values} />
      <PortionSizesFields rows={sizeRows} onChange={setSizeRows} databaseSizes={ingredient.portionSizes.filter((p) => p.fromDatabase)} {...sizeUnits(pack)} />

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


interface ComposeRow {
  // The picked ingredient's ID; cleared when the name is typed over, so a
  // typed name is then matched by name (see findIngredient below).
  id?: string;
  nameUk: string;
  // The amount in grams or in pieces (2.0.1: a product counted per piece goes in by count).
  amount: string;
  unit: "grams" | "pieces" | "ml";
}

const EMPTY_ROW: ComposeRow = { nameUk: "", amount: "", unit: "grams" };

/** Which units a recipe line can use for this product: grams unless it's counted per piece without a weight, pieces when it's per piece or has a piece weight. */
function rowUnits(ingredient: Ingredient | null): { grams: boolean; pieces: boolean; ml: boolean } {
  if (!ingredient) return { grams: true, pieces: false, ml: false };
  const measure = measureOf(ingredient);
  const weight = pieceGrams(measure);
  const density = gramsPerMl(measure);
  return {
    grams: ingredient.basis === "100g" || weight !== null || density !== null,
    pieces: ingredient.basis === "piece" || weight !== null,
    ml: ingredient.basis === "100ml" || density !== null,
  };
}

/** The units a recipe line can be typed in, in the order offered (2.1.1). */
function rowUnitList(ingredient: Ingredient | null): ("grams" | "ml" | "pieces")[] {
  const units = rowUnits(ingredient);
  return (["grams", "ml", "pieces"] as const).filter((u) => units[u]);
}

// Compose a real multi-ingredient recipe from existing Ingredients rows —
// the "real" Dishes feature deferred since the Foods screen was first built.
// Nutrition is always computed via computeDishNutrition (pure, tested in
// dishes.test.ts), never hand-typed, matching how starter dishes are built.
function ComposeDishForm({
  ingredients,
  labels,
  existingItems,
  existingDish,
  onSaved,
  onCancel,
  onUseExisting,
}: {
  ingredients: Ingredient[];
  /** Labels chosen above the form (2.1). */
  labels: LabelKey[];
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
      ? existingDish.ingredients.map((ref) => ({
          id: ref.id,
          nameUk: resolveItemRef(ref, ingredients)?.nameUk ?? ref.nameUk,
          amount: fieldDecimal(ref.pieces ?? ref.ml ?? ref.grams),
          unit: ref.pieces ? ("pieces" as const) : ref.ml ? ("ml" as const) : ("grams" as const),
        }))
      : [EMPTY_ROW],
  );
  // The yield: a weight, a count («Вийшло 10 млинців»), a volume (2.1.2) or several; the main one decides how the dish is measured (2.0.1).
  const [yieldFields, setYieldFields] = useState<PackFields>(() => ({
    main: existingDish?.basis ?? "100g",
    grams: existingDish && existingDish.yieldGrams > 0 ? fieldDecimal(existingDish.yieldGrams) : "",
    pieces: existingDish?.yieldPieces ? fieldDecimal(existingDish.yieldPieces) : "",
    ml: existingDish?.yieldMl ? fieldDecimal(existingDish.yieldMl) : "",
  }));
  const [giVerified, setGiVerified] = useState(existingDish?.giVerified ?? false);
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(() => sizeRowsFrom(existingDish?.portionSizes ?? []));
  const [weighedPieces, setWeighedPieces] = useState(existingDish?.weighedPieces ? fieldDecimal(existingDish.weighedPieces) : "");
  const [weighedGrams, setWeighedGrams] = useState(existingDish?.weighedGrams ? fieldDecimal(existingDish.weighedGrams) : "");
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
    const amount = evaluateInput(row.amount) ?? NaN;
    if (!ingredient || !(amount > 0)) return null;
    const ref: DishIngredientRef =
      row.unit === "pieces"
        ? { id: ingredient.id, nameUk: ingredient.nameUk, grams: 0, pieces: amount }
        : row.unit === "ml"
          ? { id: ingredient.id, nameUk: ingredient.nameUk, grams: 0, ml: amount }
          : { id: ingredient.id, nameUk: ingredient.nameUk, grams: amount };
    return refFactor(ref, measureOf(ingredient)) === null ? null : ref;
  };
  const resolvedRefs: DishIngredientRef[] = rows.map(toRef).filter((ref): ref is DishIngredientRef => ref !== null);

  const yieldMeasure = measureFromPackFields(yieldFields);
  const weighedNow = weighedPair(weighedPieces, weighedGrams);
  const dishHasPieceWeight =
    (!("problem" in weighedNow) && weighedNow.weighedPieces !== null) || (yieldMeasure !== null && pieceGrams(yieldMeasure) !== null);
  // Weight and volume of the batch both measured: it can be logged in ml and in g (2.1.2).
  const dishHasDensity = yieldMeasure !== null && gramsPerMl(yieldMeasure) !== null;
  const dishNutrition = (refs: DishIngredientRef[], y: Measure & { yieldMl: number | null }) =>
    computeDishNutrition(refs, y.weighedGrams ?? 0, findIngredient, y.basis === "piece" ? y.weighedPieces : null, y.basis === "100ml" ? y.yieldMl : null);
  const preview =
    resolvedRefs.length === rows.filter((r) => r.nameUk.trim()).length && resolvedRefs.length > 0 && yieldMeasure
      ? dishNutrition(resolvedRefs, yieldMeasure)
      : null;

  const previewUnknown = preview ? computeDishUnknownFields(resolvedRefs, findIngredient) : [];
  // A small unknown-GI share that the dish GI leaves out (≤ 5%, see SMALL_UNKNOWN_GI_SHARE) — said, not hidden.
  const omittedGiShare = preview && !previewUnknown.includes("gi") ? unknownGiCarbShare(resolvedRefs, findIngredient) : 0;

  const handleSave = async () => {
    const allResolved = rows.every((row) => row.nameUk.trim() === "" || findIngredient(row));
    const filledRows = rows.filter((row) => row.nameUk.trim() !== "");
    const allValid =
      nameUk.trim() !== "" &&
      filledRows.length > 0 &&
      allResolved &&
      filledRows.every((row) => toRef(row) !== null) &&
      yieldMeasure !== null;

    if (!allValid || !yieldMeasure) {
      setError(uk.dishes.composeForm.validationError);
      return;
    }
    const portionSizes = sizesFromRows(sizeRows);
    if (!Array.isArray(portionSizes)) {
      setError(portionSizes.problem);
      return;
    }
    const weighed = weighedPair(weighedPieces, weighedGrams);
    if ("problem" in weighed) {
      setError(weighed.problem);
      return;
    }
    if (nameMatch) return;

    setSaving(true);
    setError(null);
    try {
      const refs = filledRows.map(toRef).filter((ref): ref is DishIngredientRef => ref !== null);
      const nutrition = dishNutrition(refs, yieldMeasure);
      const unknownFields = computeDishUnknownFields(refs, findIngredient);
      const nameEn = (await translateUkToEn(nameUk.trim())) ?? "";
      const dish: Omit<Dish, "dateAdded" | "glycemicFlag" | "id" | "basedOn"> = {
        nameUk: nameUk.trim(),
        nameEn,
        ingredients: refs,
        yieldGrams: yieldMeasure.weighedGrams ?? 0,
        basis: yieldMeasure.basis,
        yieldPieces: yieldMeasure.weighedPieces,
        yieldMl: yieldMeasure.yieldMl,
        ...weighed,
        portionSizes,
        labels,
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
            : searchFoods(row.nameUk, sortedIngredients, (i) => verifiedEntry(i.basedOn || i.id));

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
                      {ingredient.nameEn && <span className="food-name-en">({ingredient.nameEn})</span>}
                      {/* Picked, it joins her «Продукти» when the recipe is saved (2.2). */}
                      {isBuiltInId(ingredient.id) && <span className="food-recipe-mark"> {uk.databaseSets.fromDatabase}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateRow(index, { id: ingredient.id, nameUk: ingredient.nameUk, unit: ingredient.basis === "piece" ? "pieces" : ingredient.basis === "100ml" ? "ml" : "grams" })}
                    >
                      {uk.foods.form.pickButton}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {row.nameUk.trim() !== "" && !resolvedIngredient && suggestions.length === 0 && (
              <p className="food-form-error">{uk.dishes.composeForm.unresolvedIngredient}</p>
            )}

            <div className="compose-amount">
              <label>
                {row.unit === "pieces" ? uk.dishes.composeForm.amountLabel : row.unit === "ml" ? uk.dishes.composeForm.mlLabel : uk.dishes.composeForm.gramsLabel}
                <MathInput
                  value={row.amount}
                  onChange={(v) => updateRow(index, { amount: v })}
                />
              </label>
              {rowUnitList(resolvedIngredient).length > 1 && (
                <div className="compose-unit" role="radiogroup">
                  {rowUnitList(resolvedIngredient).map((unit) => (
                    <label key={unit} className="pack-option">
                      <input type="radio" checked={row.unit === unit} onChange={() => updateRow(index, { unit })} />
                      {unit === "grams" ? uk.dishes.composeForm.amountUnitGrams : unit === "ml" ? uk.dishes.composeForm.amountUnitMl : uk.dishes.composeForm.amountUnitPieces}
                    </label>
                  ))}
                </div>
              )}
              {rowUnitList(resolvedIngredient).length === 1 && row.unit !== "grams" && (
                <span className="compose-unit">{row.unit === "ml" ? uk.dishes.composeForm.amountUnitMl : uk.dishes.composeForm.amountUnitPieces}</span>
              )}
            </div>

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

      <PackAmountFields
        fields={yieldFields}
        onChange={setYieldFields}
        legend={uk.dishes.composeForm.yieldLegend}
        gramsLabel={uk.dishes.composeForm.yieldGramsLabel}
        piecesLabel={uk.dishes.composeForm.yieldPiecesLabel}
        mlLabel={uk.dishes.composeForm.yieldMlLabel}
        hints={{ grams: uk.dishes.composeForm.yieldGramsHint, pieces: uk.dishes.composeForm.yieldPiecesHint, ml: uk.dishes.composeForm.yieldMlHint }}
      />
      <p className="food-form-hint">{uk.dishes.composeForm.yieldHint}</p>
      <WeighedPiecesFields
        pieces={weighedPieces}
        grams={weighedGrams}
        onChange={(pieces, grams) => {
          setWeighedPieces(pieces);
          setWeighedGrams(grams);
        }}
        hint={uk.dishes.composeForm.weighedHint}
      />
      <PortionSizesFields
        rows={sizeRows}
        onChange={setSizeRows}
        allowGrams={yieldFields.main === "100g" || dishHasPieceWeight || dishHasDensity}
        allowPieces={yieldFields.main === "piece" || dishHasPieceWeight}
        allowMl={yieldFields.main === "100ml" || dishHasDensity}
        preferredUnit={basisUnit(yieldFields.main)}
      />

      {preview && (
        <>
          <p className="food-form-source">
            {uk.dishes.composeForm.preview(preview.carbsG, preview.caloriesKcal, preview.gi, giVerified ? "" : "≈", yieldMeasure?.basis)}
          </p>
          <p className="food-form-hint">{uk.dishes.approximateGiNote}</p>
          {omittedGiShare > 0 && <p className="food-form-hint">{uk.dishes.composeForm.smallUnknownGi(Math.max(1, Math.round(omittedGiShare * 100)))}</p>}
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

// One «Продукти» list (release 2.1, spec → "One product list (2.1)"): every
// item, typed or composed, with filter chips by label; one editor where
// «Значення: вказані / за рецептом» picks the form. Switching an existing item
// keeps its ID — the save writes the other side's fields to the same row.
type ListFilter = "all" | "favorite" | LabelKey | "recipe";
const FILTERS: ListFilter[] = ["all", "favorite", "ingredient", "dish", "drink", "sauce", "snack", "recipe"];
type Editing = { mode: "typed"; item: Ingredient } | { mode: "recipe"; item: Dish };

/** A typed item seen as a composed one with an empty recipe (same ID) — for «Значення: за рецептом». */
function ingredientAsDish(item: Ingredient): Dish {
  return {
    id: item.id,
    basedOn: item.basedOn,
    nameUk: item.nameUk,
    nameEn: item.nameEn,
    ingredients: [],
    yieldGrams: 0,
    basis: "100g",
    yieldPieces: null,
    weighedPieces: item.weighedPieces,
    weighedGrams: item.weighedGrams,
    portionSizes: item.portionSizes.filter((s) => !s.fromDatabase),
    labels: item.labels,
    carbsG: item.carbsG,
    gi: item.gi,
    fiberG: item.fiberG,
    sugarsG: item.sugarsG,
    proteinG: item.proteinG,
    fatG: item.fatG,
    caloriesKcal: item.caloriesKcal,
    sodiumMg: item.sodiumMg,
    source: "manual",
    dateAdded: item.dateAdded,
    glycemicFlag: item.glycemicFlag,
    giVerified: false,
    unknownFields: item.unknownFields,
  };
}

function LabelsField({ labels, onChange }: { labels: LabelKey[]; onChange: (labels: LabelKey[]) => void }) {
  return (
    <fieldset className="labels-field">
      <legend>
        {uk.foods.labels.legend} <span className="pack-optional">{uk.foods.pack.optional}</span>
      </legend>
      <div className="label-chips">
        {LABEL_KEYS.map((key) => (
          <label key={key} className={labels.includes(key) ? "label-chip active" : "label-chip"}>
            <input
              type="checkbox"
              checked={labels.includes(key)}
              onChange={(e) => onChange(e.target.checked ? [...labels, key] : labels.filter((k) => k !== key))}
            />
            {uk.foods.labels.names[key]}
          </label>
        ))}
      </div>
      <p className="food-form-hint">{uk.foods.labels.hint}</p>
    </fieldset>
  );
}

function ValuesModeSwitch({ mode, onChange }: { mode: "typed" | "recipe"; onChange: (mode: "typed" | "recipe") => void }) {
  return (
    <div className="values-mode" role="radiogroup" aria-label={uk.foods.valuesMode.legend}>
      <span className="values-mode-legend">{uk.foods.valuesMode.legend}:</span>
      {(["typed", "recipe"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? "food-subtab active" : "food-subtab"}
          onClick={() => onChange(m)}
        >
          {uk.foods.valuesMode[m]}
        </button>
      ))}
    </div>
  );
}

export default function FoodsScreen() {
  const { signedIn, initializing, sessionExpired } = useAuth();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<"typed" | "recipe" | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [labelsDraft, setLabelsDraft] = useState<LabelKey[]>([]);
  // After a save, the items made with it that were recalculated (changes carry upward, 2.1).
  const [carriedNote, setCarriedNote] = useState<string | null>(null);
  // A composed item opened from a typed item's «used in» list: Android's back returns to that item.
  const [openedFrom, setOpenedFrom] = useState<Ingredient | null>(null);
  useEffect(() => {
    if (!editing) setOpenedFrom(null);
  }, [editing]);
  useBackHandler(editing !== null && openedFrom !== null, () => {
    const item = openedFrom;
    if (item) startEditing({ mode: "typed", item });
  });
  const [infoEntry, setInfoEntry] = useState<{ entry: VerifiedFoodEntry; giOnly: boolean } | null>(null);
  // «Набори з бази» (2.2): the list of sets, or one set's checklist; opened from the button or the first-run offer.
  const [sets, setSets] = useState<"list" | { setId: string } | null>(() => (takeOpenSetsRequest() ? "list" : null));
  const [setsNote, setSetsNote] = useState<string | null>(null);
  useEffect(
    () =>
      onOpenSetsRequest(() => {
        takeOpenSetsRequest();
        setSets("list");
      }),
    [],
  );
  const openInfo = (entry: VerifiedFoodEntry, giOnly = false) => setInfoEntry({ entry, giOnly });

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

  const startEditing = (next: Editing) => {
    setEditing(next);
    setLabelsDraft(next.item.labels ?? []);
  };
  const startAdding = (mode: "typed" | "recipe") => {
    setAdding(mode);
    setLabelsDraft(mode === "recipe" ? ["dish"] : []);
  };
  // «Значення: вказані / за рецептом» on an open form: the same item in the other form, same ID; nothing saved yet.
  const switchMode = (mode: "typed" | "recipe") => {
    if (adding) {
      setAdding(mode);
      return;
    }
    if (!editing || editing.mode === mode) return;
    const labels = labelsDraft;
    setEditing(
      editing.mode === "typed"
        ? { mode: "recipe", item: { ...ingredientAsDish(editing.item), labels } }
        : { mode: "typed", item: { ...dishAsIngredient(editing.item), labels } },
    );
  };

  // Every composed item made with the saved one is recalculated and saved
  // too, inner ones first (changes carry upward, 2.1); the list says which.
  const carryChange = async (changedId: string, nextIngredients: Ingredient[], nextDishes: Dish[]) => {
    const updated = carryUpward(changedId, nextDishes, mergeWithBuiltInFoods(nextIngredients));
    if (updated.length === 0) {
      setCarriedNote(null);
      return;
    }
    const byId = new Map(updated.map((d) => [d.id, d]));
    setDishes(nextDishes.map((d) => byId.get(d.id) ?? d));
    setCarriedNote(uk.foods.carriedUpward(updated.map((d) => d.nameUk)));
    try {
      await updateDishes(updated);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  // Saved as the other kind (a switch): the item leaves one list and joins the other.
  const placeIngredient = (updated: Ingredient, replacesId: string) => {
    const nextIngredients = [...(ingredients ?? []).filter((i) => i.id !== replacesId && i.id !== updated.id), updated];
    const nextDishes = (dishes ?? []).filter((d) => d.id !== updated.id);
    setIngredients(nextIngredients);
    setDishes(nextDishes);
    void carryChange(updated.id, nextIngredients, nextDishes);
  };
  const placeDish = (updated: Dish, replacesId: string) => {
    const nextDishes = [...(dishes ?? []).filter((d) => d.id !== replacesId && d.id !== updated.id), updated];
    const nextIngredients = (ingredients ?? []).filter((i) => i.id !== updated.id);
    setDishes(nextDishes);
    setIngredients(nextIngredients);
    void carryChange(updated.id, nextIngredients, nextDishes);
  };

  const handleToggleFavorite = async (ingredient: Ingredient) => {
    const nextFavorite = !ingredient.favorite;
    if (isBuiltInId(ingredient.id)) {
      try {
        placeIngredient(await saveIngredientCopy({ ...ingredient, favorite: nextFavorite }), ingredient.id);
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

  const handleToggleDishFavorite = async (dish: Dish) => {
    const nextFavorite = !dish.favorite;
    setDishes((prev) => (prev ?? []).map((d) => (d.id === dish.id ? { ...d, favorite: nextFavorite } : d)));
    try {
      await setDishFavorite(dish.id, nextFavorite);
    } catch (err) {
      setDishes((prev) => (prev ?? []).map((d) => (d.id === dish.id ? { ...d, favorite: dish.favorite } : d)));
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  // A database item becomes hers (2.2): from a search's «З бази», or picked as a recipe line.
  const addFromDatabase = async (ids: readonly string[]) => {
    const need = idsNeedingCopies(ids, mergeWithBuiltInFoods(ingredients ?? []));
    if (need.length === 0) return;
    try {
      const copies = await copyFromDatabase(need);
      setIngredients((prev) => [...(prev ?? []), ...copies]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCycleIngredientFlag = async (ingredient: Ingredient) => {
    const nextFlag = cycleGlycemicFlag(ingredient.glycemicFlag);
    if (isBuiltInId(ingredient.id)) {
      try {
        placeIngredient(await saveIngredientCopy({ ...ingredient, glycemicFlag: nextFlag }), ingredient.id);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    setIngredients((prev) => (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, glycemicFlag: nextFlag } : i)));
    try {
      await setIngredientGlycemicFlag(ingredient.id, nextFlag);
    } catch (err) {
      setIngredients((prev) => (prev ?? []).map((i) => (i.id === ingredient.id ? { ...i, glycemicFlag: ingredient.glycemicFlag } : i)));
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  };

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
        <SignInPanel buttonLabel={uk.foods.signIn.button} />
      </section>
    );
  }

  // The database is browsable/pickable together with her own items (see
  // mergeWithBuiltInFoods); built-in cooked foods are typed items.
  const availableIngredients = mergeWithBuiltInFoods(ingredients ?? []);
  const availableDishes = dishes ?? [];

  const matchesFilter = (labels: LabelKey[] | undefined, composed: boolean, favorite = false) =>
    filter === "all" || (filter === "favorite" ? favorite : filter === "recipe" ? composed : (labels ?? []).includes(filter));
  // Composed items first (what most meals are), then typed ones — favourites first while browsing, best match first while searching (1.9).
  const shownDishes = searchFoods(search, availableDishes, () => null).filter((d) => matchesFilter(d.labels, true, d.favorite));
  // Her «Продукти» are her own rows (2.2); the database comes in as sets, or from a search.
  const searchedIngredients = (
    search.trim() ? searchFoods(search, availableIngredients, (i) => verifiedEntry(i.basedOn || i.id)) : sortFavoritesFirst(availableIngredients)
  ).filter((i) => matchesFilter(i.labels, false, i.favorite));
  const shownIngredients = searchedIngredients.filter((i) => !isBuiltInId(i.id));
  const databaseMatches = search.trim() && filter !== "favorite" ? searchedIngredients.filter((i) => isBuiltInId(i.id)) : [];
  const coveredIds = coveredDatabaseIds(ingredients ?? []);

  const lookupIngredientFlag = (ref: DishIngredientRef): GlycemicFlag | null => resolveItemRef(ref, availableIngredients)?.glycemicFlag ?? null;

  // For the duplicate-name check — every item a new name could be confused with.
  const existingItems: NamedItem[] = [
    ...availableIngredients.map((i) => ({ ...i, kind: "ingredient" as const })),
    ...availableDishes.map((d) => ({ ...d, kind: "dish" as const })),
  ];
  // «Це він — використати наявний»: close the form and show that item in the list.
  const showExistingItem = (item: NamedItem) => {
    setAdding(null);
    setFilter("all");
    setSearch(item.nameUk);
  };

  const closeForm = () => {
    setAdding(null);
    setEditing(null);
  };
  let breadcrumb: { trail: Crumb[]; current: string } | null = null;
  if (sets === "list") breadcrumb = { trail: [{ label: uk.foods.title, onClick: () => setSets(null) }], current: uk.databaseSets.title };
  else if (sets)
    breadcrumb = {
      trail: [
        { label: uk.foods.title, onClick: () => setSets(null) },
        { label: uk.databaseSets.title, onClick: () => setSets("list") },
      ],
      current: DATABASE_SETS.find((set) => set.id === sets.setId)?.nameUk ?? uk.databaseSets.title,
    };
  else if (editing) breadcrumb = { trail: [{ label: uk.foods.title, onClick: () => setEditing(null) }], current: uk.foods.editForm.title };
  else if (adding) breadcrumb = { trail: [{ label: uk.foods.title, onClick: () => setAdding(null) }], current: uk.foods.addButton };

  const formMode = editing?.mode ?? adding;
  // A database item that isn't hers yet can't switch: editing it saves her copy first.
  const canSwitch = adding !== null || (editing !== null && !isBuiltInId(editing.item.id));

  return (
    <section className="screen">
      {breadcrumb ? (
        <Breadcrumb trail={breadcrumb.trail} current={breadcrumb.current} />
      ) : (
        <h1>{uk.foods.title}</h1>
      )}

      {sets === "list" && (
        <>
          {setsNote && <p className="food-form-notice">{setsNote}</p>}
          <SetsList
            covered={coveredIds}
            onOpen={(setId) => {
              setSetsNote(null);
              setSets({ setId });
            }}
          />
        </>
      )}
      {sets && sets !== "list" && (
        <SetChecklist
          key={sets.setId}
          setId={sets.setId}
          covered={coveredIds}
          onAdded={(copies) => {
            setIngredients((prev) => [...(prev ?? []), ...copies]);
            setSetsNote(uk.databaseSets.added(copies.length));
            setSets("list");
          }}
          onCancel={() => setSets("list")}
        />
      )}

      {formMode && (
        <>
          {canSwitch && <ValuesModeSwitch mode={formMode} onChange={switchMode} />}
          {canSwitch && editing && <p className="food-form-hint">{uk.foods.valuesMode.switchHint}</p>}
          <LabelsField labels={labelsDraft} onChange={setLabelsDraft} />
        </>
      )}

      {editing?.mode === "typed" && (
        <EditIngredientForm
          key={`typed-${editing.item.id}`}
          ingredient={editing.item}
          labels={labelsDraft}
          existingItems={existingItems}
          onSaved={(updated) => {
            placeIngredient(updated, editing.item.id);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.mode === "typed" && !isBuiltInId(editing.item.id) && (
        <DeleteItem
          kind="ingredient"
          name={editing.item.nameUk}
          isCopy={editing.item.basedOn !== ""}
          usedIn={dishesUsingIngredient(editing.item, availableDishes)}
          onConfirm={async () => {
            await deleteIngredient(editing.item.id);
            setIngredients((prev) => (prev ?? []).filter((i) => i.id !== editing.item.id));
            setEditing(null);
          }}
          onEditDish={(dish) => {
            setOpenedFrom(editing.item);
            startEditing({ mode: "recipe", item: dish });
          }}
        />
      )}

      {editing?.mode === "recipe" && (
        <ComposeDishForm
          key={`recipe-${editing.item.id}`}
          ingredients={[...availableIngredients, ...recipeCandidates(editing.item.id, availableDishes).map(dishAsIngredient)]}
          labels={labelsDraft}
          existingItems={existingItems}
          existingDish={editing.item}
          onSaved={(updated) => {
            placeDish(updated, editing.item.id);
            setEditing(null);
            void addFromDatabase(updated.ingredients.map((ref) => ref.id ?? ""));
          }}
          onCancel={() => setEditing(null)}
        />
      )}
      {editing?.mode === "recipe" && !isBuiltInId(editing.item.id) && (
        <DeleteItem
          kind="dish"
          name={editing.item.nameUk}
          usedIn={dishesUsingIngredient(editing.item, availableDishes)}
          onEditDish={(dish) => startEditing({ mode: "recipe", item: dish })}
          onConfirm={async () => {
            await deleteDish(editing.item.id);
            setDishes((prev) => (prev ?? []).filter((d) => d.id !== editing.item.id));
            setEditing(null);
          }}
        />
      )}

      {!editing && adding === "typed" && (
        <AddFoodForm
          availableFoods={availableIngredients}
          labels={labelsDraft}
          existingItems={existingItems}
          onUseExisting={showExistingItem}
          onSaved={(ingredient) => {
            setIngredients((prev) => [...(prev ?? []), ingredient]);
            closeForm();
            setSearch("");
          }}
          onCancel={closeForm}
        />
      )}
      {!editing && adding === "recipe" && (
        <ComposeDishForm
          ingredients={[...availableIngredients, ...availableDishes.map(dishAsIngredient)]}
          labels={labelsDraft}
          existingItems={existingItems}
          onUseExisting={showExistingItem}
          onSaved={(dish) => {
            setDishes((prev) => [...(prev ?? []), dish]);
            closeForm();
            setSearch("");
            void addFromDatabase(dish.ingredients.map((ref) => ref.id ?? ""));
          }}
          onCancel={closeForm}
        />
      )}

      {!formMode && !sets && (
        <>
          <input
            className="food-search"
            placeholder={uk.foods.searchPlaceholder}
            aria-label={uk.foods.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="food-filters" role="group" aria-label={uk.foods.filters.label}>
            {FILTERS.map((f) => (
              <button key={f} type="button" className={filter === f ? "food-subtab active" : "food-subtab"} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {uk.foods.filters[f]}
              </button>
            ))}
          </div>
          <div className="food-add-buttons">
            <button type="button" onClick={() => startAdding("typed")}>
              {uk.foods.addButton}
            </button>
            <button type="button" className="button-secondary" onClick={() => startAdding("recipe")}>
              {uk.foods.addRecipeButton}
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setSetsNote(null);
                setSets("list");
              }}
            >
              {uk.databaseSets.addButton}
            </button>
          </div>
          <p className="food-list-hint">{uk.foods.giLegend}</p>

          {loadError && <p className="food-form-error">{loadError}</p>}
          {carriedNote && <p className="food-form-notice">{carriedNote}</p>}
          {shownDishes.length === 0 && shownIngredients.length === 0 && databaseMatches.length === 0 && <p>{uk.foods.noResults}</p>}

          <ul className="food-list">
            {shownDishes.map((dish) => {
              const containsFlagged = dishContainsFlaggedIngredient(dish, lookupIngredientFlag);
              return (
                <li key={dish.id}>
                  <div className="food-list-item-with-action">
                    <span>
                      <strong>{dish.nameUk}</strong> {dish.nameEn && <span className="food-name-en">({dish.nameEn})</span>} — {foodMetaText(dish)}
                      {dish.basis === "100g" && ` (${uk.foods.pack.per("100g")})`} <span className="food-recipe-mark">{uk.foods.recipeMark}</span>
                    </span>
                    <div className="food-list-actions">
                      <button type="button" className="edit-toggle" onClick={() => startEditing({ mode: "recipe", item: dish })} aria-label={uk.dishes.editLabel} title={uk.dishes.editLabel}>
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
                      <button
                        type="button"
                        className={dish.favorite ? "favorite-toggle active" : "favorite-toggle"}
                        onClick={() => void handleToggleDishFavorite(dish)}
                        aria-label={dish.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                        title={dish.favorite ? uk.foods.unfavoriteLabel : uk.foods.favoriteLabel}
                      >
                        {dish.favorite ? "★" : "☆"}
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
            {shownIngredients.map((ingredient) => {
              const entry = builtInMatch(ingredient);
              const giEntry = entry ? null : giSourceEntry(ingredient);
              return (
                <li key={ingredient.id} className="food-list-item-with-action">
                  <span>
                    <strong>{ingredient.nameUk}</strong> {ingredient.nameEn && <span className="food-name-en">({ingredient.nameEn})</span>} —{" "}
                    {foodMetaText(ingredient, entry ?? giEntry)} <SourceBadge entry={entry} giEntry={giEntry} name={ingredient.nameUk} onOpen={openInfo} />
                  </span>
                  <div className="food-list-actions">
                    <button type="button" className="edit-toggle" onClick={() => startEditing({ mode: "typed", item: ingredient })} aria-label={uk.foods.editLabel} title={uk.foods.editLabel}>
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
              );
            })}
          </ul>

          {databaseMatches.length > 0 && (
            <>
              <h2>{uk.databaseSets.searchDatabaseTitle}</h2>
              <ul className="food-list">
                {databaseMatches.slice(0, 20).map((item) => (
                  <li key={item.id} className="food-list-item-with-action">
                    <span>
                      <strong>{item.nameUk}</strong> — {foodMetaText(item, builtInMatch(item))}{" "}
                      <SourceBadge entry={builtInMatch(item)} giEntry={null} name={item.nameUk} onOpen={openInfo} />
                    </span>
                    <button type="button" onClick={() => void addFromDatabase([item.id])}>
                      {uk.databaseSets.addOne}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {infoEntry && <VerifiedInfoDialog entry={infoEntry.entry} giOnly={infoEntry.giOnly} onClose={() => setInfoEntry(null)} />}
    </section>
  );
}
