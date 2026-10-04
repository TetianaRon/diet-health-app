import { useEffect, useMemo, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { uk } from "../i18n/uk";
import { classifyGl } from "../lib/health";
import type { IngredientNutrition, NutritionKey } from "../lib/dishes";
import { GLYCEMIC_FLAG_SYMBOL, type GlycemicFlag } from "../lib/glycemicFlag";
import { fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/dateFormat";
import type { Settings } from "../lib/settings";
import { countMealsByKind, mealKindOf, recommendMeal } from "../lib/mealRecommendation";
import {
  MEAL_TYPES,
  buildCustomLogEntry,
  buildLogEntry,
  computePortionNutrition,
  deleteMeal,
  groupIntoMeals,
  isSameLocalDate,
  localDateKey,
  saveMeal,
  suggestMealType,
  sumKnownField,
  type DailyLogEntry,
  type MealDraftItem,
  type MealGroup,
  type MealType,
} from "../lib/dailyLog";
import MealStatsLine from "./MealStatsLine";
import { DateTimeInput } from "./TimeInput";
import Breadcrumb from "./Breadcrumb";
import { formatStats } from "./MealStatsLine";
import { entryStatItems } from "../lib/mealStats";

export interface PickableFood {
  // `B…` / `I…` / `D…` — stored on the meal row (DailyLog.ItemId, 1.6).
  id: string;
  nameUk: string;
  nameEn: string;
  glycemicFlag: GlycemicFlag;
  per100g: IngredientNutrition;
  // Fields the person left blank when saving this food — carried into the
  // meal entry so its totals exclude them (see buildLogEntry).
  unknownFields: NutritionKey[];
}

export function toPickable(
  item: { id: string; nameUk: string; nameEn: string; glycemicFlag: GlycemicFlag; unknownFields: NutritionKey[] } & IngredientNutrition,
): PickableFood {
  const { id, nameUk, nameEn, glycemicFlag, unknownFields, carbsG, gi, fiberG, sugarsG, proteinG, fatG, caloriesKcal, sodiumMg } =
    item;
  return {
    id,
    nameUk,
    nameEn,
    glycemicFlag,
    unknownFields,
    per100g: { carbsG, gi, fiberG, sugarsG, proteinG, fatG, caloriesKcal, sodiumMg },
  };
}

// The 8 nutrition fields a custom entry can individually fill in or leave
// blank (= unknown) — see buildCustomLogEntry in dailyLog.ts. Module-level
// so the object identity is stable across renders (used as a useState
// initializer/reset value).
const CUSTOM_FIELDS: (keyof IngredientNutrition)[] = [
  "caloriesKcal",
  "carbsG",
  "fatG",
  "proteinG",
  "fiberG",
  "sugarsG",
  "sodiumMg",
  "gi",
];
const EMPTY_CUSTOM_VALUES: Record<keyof IngredientNutrition, string> = {
  carbsG: "",
  gi: "",
  fiberG: "",
  sugarsG: "",
  proteinG: "",
  fatG: "",
  caloriesKcal: "",
  sodiumMg: "",
};

// --- Add a dish to the meal being composed -------------------------------
//
// A step of its own (not an always-open panel) so "add this dish" and "save
// the whole meal" can never be mistaken for each other: this view has only
// dish-level buttons, the meal view has only meal-level ones. Nothing here
// touches the spreadsheet — it just hands a finished entry back to the
// editor's draft list.
function AddDishToMealForm({
  foods,
  mealType,
  timestamp,
  mealId,
  onAdd,
  onBack,
}: {
  foods: PickableFood[];
  mealType: MealType;
  timestamp: string; // ISO — re-stamped with the meal's final time on save anyway
  mealId: string;
  onAdd: (entry: DailyLogEntry) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickableFood | null>(null);
  const [portionGrams, setPortionGrams] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // "custom" is for a genuinely one-off item not in the database (restaurant
  // food, a homemade dish with no exact recipe) — never saved to Ingredients,
  // it only ever produces a DailyLog row.
  const [mode, setMode] = useState<"pick" | "custom">("pick");
  const [customName, setCustomName] = useState("");
  const [customValues, setCustomValues] = useState<Record<keyof IngredientNutrition, string>>(EMPTY_CUSTOM_VALUES);

  const switchMode = (next: "pick" | "custom") => {
    setMode(next);
    setError(null);
    setSelected(null);
    setSearch("");
    setCustomName("");
    setCustomValues(EMPTY_CUSTOM_VALUES);
  };

  const matches =
    !selected || search !== selected.nameUk
      ? foods.filter((f) => f.nameUk.toLowerCase().includes(search.toLowerCase()))
      : [];

  const handlePick = (food: PickableFood) => {
    setSelected(food);
    setSearch(food.nameUk);
  };

  // Number("") is 0, so a blank portion must be rejected explicitly.
  const parsedPortion = portionGrams.trim() === "" ? NaN : Number(portionGrams);
  const portionValid = Number.isFinite(parsedPortion) && parsedPortion > 0;

  let previewText: string | null = null;
  if (mode === "pick" && selected && portionValid) {
    const nutrition = computePortionNutrition(selected.per100g, parsedPortion);
    const glUnknown = selected.unknownFields.includes("gi") || selected.unknownFields.includes("carbsG");
    const gl = Math.round(((selected.per100g.gi * nutrition.carbsG) / 100) * 100) / 100;
    previewText = uk.today.form.preview(
      selected.unknownFields.includes("carbsG") ? uk.today.unknownValueLabel : uk.today.carbsValue(nutrition.carbsG),
      selected.unknownFields.includes("caloriesKcal")
        ? uk.today.unknownValueLabel
        : uk.today.caloriesValue(nutrition.caloriesKcal),
      glUnknown ? uk.today.unknownValueLabel : `${gl} (${uk.health.gl[classifyGl(gl)]})`,
    );
  }

  const filledCustomFields = CUSTOM_FIELDS.filter((field) => customValues[field].trim() !== "");
  const customFieldsValid = filledCustomFields.every((field) => Number.isFinite(Number(customValues[field])));

  const handleAdd = () => {
    if (mode === "pick") {
      if (!selected || !portionValid) {
        setError(uk.today.form.validationError);
        return;
      }
      onAdd(
        buildLogEntry(
          mealType,
          selected.nameUk,
          parsedPortion,
          selected.per100g,
          notes.trim(),
          mealId,
          timestamp,
          selected.unknownFields,
          selected.id,
        ),
      );
      return;
    }

    if (!customName.trim() || !portionValid || filledCustomFields.length === 0 || !customFieldsValid) {
      setError(uk.today.form.customValidationError);
      return;
    }
    const values: Partial<IngredientNutrition> = {};
    for (const field of filledCustomFields) values[field] = Number(customValues[field]);
    onAdd(buildCustomLogEntry(mealType, customName.trim(), parsedPortion, values, notes.trim(), mealId, timestamp));
  };

  return (
    <div className="food-form">
      <h2>{uk.today.mealEditor.addDish.title}</h2>

      <button type="button" className="button-secondary" onClick={() => switchMode(mode === "pick" ? "custom" : "pick")}>
        {mode === "pick" ? uk.today.form.switchToCustomButton : uk.today.form.switchToPickButton}
      </button>

      {mode === "pick" ? (
        <>
          <label>
            {uk.today.form.itemLabel}
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
              }}
              placeholder={uk.today.form.itemPlaceholder}
            />
          </label>

          {matches.length > 0 && (
            <ul className="food-list">
              {matches.slice(0, 20).map((food) => (
                <li key={food.id} className="food-list-item-with-action">
                  <span>
                    {food.glycemicFlag !== "none" && (
                      <span aria-hidden="true" className={`glycemic-inline ${food.glycemicFlag}`}>
                        {GLYCEMIC_FLAG_SYMBOL[food.glycemicFlag]}{" "}
                      </span>
                    )}
                    <strong>{food.nameUk}</strong> <span className="food-name-en">({food.nameEn})</span> —{" "}
                    {food.unknownFields.includes("carbsG")
                      ? `вуглеводи ${uk.today.unknownValueLabel}`
                      : `${food.per100g.carbsG} г вуглеводів/100г`}
                  </span>
                  <button type="button" onClick={() => handlePick(food)}>
                    {uk.foods.form.pickButton}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {search && matches.length === 0 && !selected && <p>{uk.today.form.noMatches}</p>}
        </>
      ) : (
        <label>
          {uk.today.form.customNameLabel}
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={uk.today.form.customNamePlaceholder}
          />
        </label>
      )}

      <label>
        {uk.today.form.portionLabel}
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={portionGrams}
          onChange={(e) => setPortionGrams(e.target.value)}
        />
      </label>

      {previewText && <p className="food-form-source">{previewText}</p>}

      {mode === "custom" && (
        <div className="food-form-custom-fields">
          <p className="food-form-source">{uk.today.form.customHint}</p>
          {CUSTOM_FIELDS.map((field) => (
            <label key={field}>
              {uk.today.form.customFieldLabels[field]}
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={customValues[field]}
                placeholder={uk.today.form.customFieldPlaceholder}
                onChange={(e) => setCustomValues((prev) => ({ ...prev, [field]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      <label>
        {uk.today.form.notesLabel}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uk.today.form.notesPlaceholder} />
      </label>

      {error && <p className="food-form-error">{error}</p>}

      <div className="food-form-actions">
        <button type="button" onClick={handleAdd}>
          {uk.today.mealEditor.addDish.addButton}
        </button>
        <button type="button" onClick={onBack}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

// --- Edit one dish already in the meal being composed --------------------
//
// Reuses buildCustomLogEntry to re-derive the row from typed values (GL and
// unknownFields recomputed the same way a custom entry's are), regardless of
// whether the dish was originally a database pick or already custom. Meal
// type and time aren't here — those belong to the meal, not the dish.
function EditDishForm({
  entry,
  onSave,
  onBack,
}: {
  entry: DailyLogEntry;
  onSave: (updated: DailyLogEntry) => void;
  onBack: () => void;
}) {
  const [itemName, setItemName] = useState(entry.itemName);
  const [portionGrams, setPortionGrams] = useState(String(entry.portionGrams));
  const [values, setValues] = useState<Record<keyof IngredientNutrition, string>>(() => {
    const initial = { ...EMPTY_CUSTOM_VALUES };
    for (const field of CUSTOM_FIELDS) {
      if (!entry.unknownFields.includes(field)) initial[field] = String(entry[field]);
    }
    return initial;
  });
  const [notes, setNotes] = useState(entry.notes);
  const [error, setError] = useState<string | null>(null);

  const parsedPortion = portionGrams.trim() === "" ? NaN : Number(portionGrams);
  const filledFields = CUSTOM_FIELDS.filter((field) => values[field].trim() !== "");
  const fieldsValid = filledFields.every((field) => Number.isFinite(Number(values[field])));

  const handleSave = () => {
    if (!itemName.trim() || !Number.isFinite(parsedPortion) || parsedPortion <= 0 || filledFields.length === 0 || !fieldsValid) {
      setError(uk.today.form.customValidationError);
      return;
    }
    const nutritionValues: Partial<IngredientNutrition> = {};
    for (const field of filledFields) nutritionValues[field] = Number(values[field]);
    onSave(
      buildCustomLogEntry(
        entry.mealType,
        itemName.trim(),
        parsedPortion,
        nutritionValues,
        notes.trim(),
        entry.mealId,
        entry.timestamp,
      ),
    );
  };

  return (
    <div className="food-form">
      <h2>{uk.today.mealEditor.editDish.title}</h2>
      <label>
        {uk.today.form.itemLabel}
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} />
      </label>
      <label>
        {uk.today.form.portionLabel}
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={portionGrams}
          onChange={(e) => setPortionGrams(e.target.value)}
        />
      </label>
      <div className="food-form-custom-fields">
        <p className="food-form-source">{uk.today.form.customHint}</p>
        {CUSTOM_FIELDS.map((field) => (
          <label key={field}>
            {uk.today.form.customFieldLabels[field]}
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={values[field]}
              placeholder={uk.today.form.customFieldPlaceholder}
              onChange={(e) => setValues((prev) => ({ ...prev, [field]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <label>
        {uk.today.form.notesLabel}
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={uk.today.form.notesPlaceholder} />
      </label>
      {error && <p className="food-form-error">{error}</p>}
      <div className="food-form-actions">
        <button type="button" onClick={handleSave}>
          {uk.today.mealEditor.editDish.saveButton}
        </button>
        <button type="button" onClick={onBack}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

// What would remain of a daily limit once the meal being composed is eaten —
// shown right under that limit's per-meal recommendation. Negative = exceeded.
function DailyLeft({ left, target, unit }: { left: number; target: number; unit: string }) {
  const over = left < 0;
  return (
    <span className={over ? "daily-left over-limit" : "daily-left"}>
      {over ? uk.today.recommendation.dailyOver(Math.round(-left * 10) / 10, unit) : uk.today.recommendation.dailyLeft(left, target, unit)}
    </span>
  );
}

// --- The meal editor itself ----------------------------------------------

interface DraftDish {
  key: number;
  entry: DailyLogEntry;
  // The saved row this dish came from — null for a dish added in this session.
  original: DailyLogEntry | null;
}

type View = { kind: "meal" } | { kind: "addDish" } | { kind: "editDish"; key: number };

// A dedicated full screen for composing (or editing) one meal: type, time, and
// its dishes. Everything is a draft until "Зберегти прийом їжі" — dishes are
// added/edited/removed in memory, then written to the sheet in one batch (see
// saveMeal), so cancelling really does discard everything. Deleting the whole
// meal is the one immediate action, behind its own confirmation.
export default function MealEditorScreen({
  original,
  foods,
  settings,
  allEntries,
  onSaved,
  onCancel,
}: {
  // The meal being edited, or null to compose a new one.
  original: MealGroup | null;
  foods: PickableFood[];
  settings: Settings | null;
  // Every loaded log entry — the recommendation needs what was eaten on the
  // meal's own day, excluding the meal itself.
  allEntries: DailyLogEntry[];
  // Called after the sheet was changed (saved or deleted) so the caller can re-read it.
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [mealId] = useState(() => original?.mealId ?? new Date().toISOString());
  const [mealType, setMealType] = useState<MealType>(() => original?.mealType ?? suggestMealType(new Date()));
  const [initialTime] = useState(() => toDatetimeLocalValue(original?.timestamp ?? new Date().toISOString()));
  const [timestamp, setTimestamp] = useState(initialTime);
  const nextKey = useRef(0);
  const [drafts, setDrafts] = useState<DraftDish[]>(() =>
    (original?.entries ?? []).map((entry) => ({ key: nextKey.current++, entry, original: entry })),
  );
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>({ kind: "meal" });
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState<"none" | "discard" | "deleteMeal">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCancel = () => {
    if (dirty) setConfirming("discard");
    else onCancel();
  };

  // Android's hardware/gesture back: step back out of a dish form first, then
  // treat it as Cancel — never leave the app with a half-composed meal.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (view.kind !== "meal") setView({ kind: "meal" });
    else requestCancel();
  };
  useEffect(() => {
    const listenerPromise = CapacitorApp.addListener("backButton", () => backRef.current());
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.kind]);

  const mealIso = timestamp.trim() !== "" ? fromDatetimeLocalValue(timestamp) : null;

  const draftGroup = useMemo(() => {
    if (drafts.length === 0) return null;
    const [group] = groupIntoMeals(drafts.map((d) => ({ ...d.entry, mealId })));
    return group;
  }, [drafts, mealId]);

  // What's already been eaten that day (this meal excluded) — the basis of
  // the recommendation. For a meal logged after the fact, "now" is the meal's
  // own time, so the time left in the day is measured from when it was eaten.
  const recommendation = useMemo(() => {
    if (!settings || !mealIso) return null;
    const dayKey = localDateKey(new Date(mealIso));
    const otherEntries = allEntries.filter((e) => e.mealId !== mealId && isSameLocalDate(e.timestamp, dayKey));
    const counts = countMealsByKind(groupIntoMeals(otherEntries));
    return recommendMeal({
      now: new Date(mealIso),
      kind: mealKindOf(mealType),
      settings,
      eatenFullMeals: counts.full,
      eatenSnacks: counts.snacks,
      eaten: {
        caloriesKcal: sumKnownField(otherEntries, "caloriesKcal").total,
        carbsG: sumKnownField(otherEntries, "carbsG").total,
        gl: sumKnownField(otherEntries, "gl").total,
      },
    });
  }, [settings, mealIso, allEntries, mealId, mealType]);

  const changeDrafts = (next: DraftDish[]) => {
    setDrafts(next);
    setDirty(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!mealIso) {
      setError(uk.today.mealEditor.timeError);
      return;
    }
    if (drafts.length === 0) {
      setError(uk.today.mealEditor.emptyMealError);
      return;
    }
    // Untouched time -> every existing dish keeps its own saved timestamp
    // (datetime-local drops seconds, so re-deriving it would nudge them all).
    const timeChanged = !original || timestamp !== initialTime;
    const newMealIso = timeChanged ? mealIso : original.timestamp;
    const items: MealDraftItem[] = drafts.map((d) => ({
      original: d.original,
      entry: {
        ...d.entry,
        mealType,
        mealId,
        timestamp: d.original && !timeChanged ? d.original.timestamp : newMealIso,
      },
    }));

    setSaving(true);
    setError(null);
    try {
      await saveMeal(original?.entries ?? [], items);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const handleDeleteMeal = async () => {
    if (!original) return;
    setSaving(true);
    setError(null);
    try {
      await deleteMeal(original.entries);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      setConfirming("none");
    }
  };

  const toggleSelected = (key: number) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const editorTitle = original ? uk.today.mealEditor.editTitle : uk.today.mealEditor.newTitle;
  // Leaving the meal itself goes through requestCancel, so unsaved changes still get the discard confirmation.
  const rootCrumb = { label: uk.tabs.today, onClick: requestCancel };
  const mealCrumb = { label: editorTitle, onClick: () => setView({ kind: "meal" }) };

  if (view.kind === "addDish") {
    return (
      <section className="screen">
        <Breadcrumb trail={[rootCrumb, mealCrumb]} current={uk.today.mealEditor.addDish.title} />
        <AddDishToMealForm
          foods={foods}
          mealType={mealType}
          timestamp={mealIso ?? new Date().toISOString()}
          mealId={mealId}
          onAdd={(entry) => {
            changeDrafts([...drafts, { key: nextKey.current++, entry, original: null }]);
            setView({ kind: "meal" });
          }}
          onBack={() => setView({ kind: "meal" })}
        />
      </section>
    );
  }

  const editTarget = view.kind === "editDish" ? drafts.find((d) => d.key === view.key) : undefined;
  if (editTarget) {
    return (
      <section className="screen">
        <Breadcrumb trail={[rootCrumb, mealCrumb]} current={uk.today.mealEditor.editDish.title} />
        <EditDishForm
          entry={editTarget.entry}
          onSave={(updated) => {
            changeDrafts(drafts.map((d) => (d.key === editTarget.key ? { ...d, entry: updated } : d)));
            setView({ kind: "meal" });
          }}
          onBack={() => setView({ kind: "meal" })}
        />
      </section>
    );
  }

  const liveGl = draftGroup ? Math.round(draftGroup.totals.gl * 10) / 10 : 0;
  const liveCalories = draftGroup ? Math.round(draftGroup.totals.caloriesKcal) : 0;
  const liveCarbs = draftGroup ? Math.round(draftGroup.totals.carbsG) : 0;
  const liveFat = draftGroup ? Math.round(draftGroup.totals.fatG * 10) / 10 : 0;

  return (
    <section className="screen meal-editor">
      <Breadcrumb trail={[rootCrumb]} current={editorTitle} />
      <h1>{editorTitle}</h1>

      <div className="food-form">
        <label>
          {uk.today.form.mealTypeLabel}
          <select
            value={mealType}
            onChange={(e) => {
              setMealType(e.target.value as MealType);
              setDirty(true);
            }}
          >
            {MEAL_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label>
          {uk.today.form.timestampLabel}
          <DateTimeInput
            ariaLabel={uk.today.form.timestampLabel}
            format={settings?.timeFormat ?? "24h"}
            value={timestamp}
            onChange={(value) => {
              setTimestamp(value);
              setDirty(true);
            }}
          />
        </label>
      </div>

      <h2 className="meal-editor-section">{uk.today.mealEditor.dishesTitle}</h2>
      {drafts.length === 0 ? (
        <p>{uk.today.mealEditor.noDishes}</p>
      ) : (
        <ul className="dish-rows">
          {drafts.map((d) => (
            <li key={d.key} className="dish-row">
              <input
                type="checkbox"
                className="dish-row-check"
                checked={selectedKeys.has(d.key)}
                aria-label={uk.today.mealEditor.selectDishLabel(d.entry.itemName)}
                onChange={() => toggleSelected(d.key)}
              />
              <span className="dish-row-text">
                <strong>{d.entry.itemName}</strong>
                <br />
                <span className="entry-time">{formatStats(entryStatItems(d.entry, settings))}</span>
              </span>
              <button
                type="button"
                className="edit-toggle"
                aria-label={uk.today.mealEditor.editDishLabel(d.entry.itemName)}
                title={uk.today.mealEditor.editDishLabel(d.entry.itemName)}
                onClick={() => setView({ kind: "editDish", key: d.key })}
              >
                ✎
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="meal-editor-dish-actions">
        <button type="button" className="button-secondary" onClick={() => setView({ kind: "addDish" })}>
          {uk.today.mealEditor.addDishButton}
        </button>
        {selectedKeys.size > 0 && (
          <button
            type="button"
            className="button-danger"
            onClick={() => {
              changeDrafts(drafts.filter((d) => !selectedKeys.has(d.key)));
              setSelectedKeys(new Set());
            }}
          >
            {uk.today.mealEditor.deleteSelectedButton(selectedKeys.size)}
          </button>
        )}
      </div>

      {draftGroup && (
        <>
          <p className="meal-editor-totals-label">{uk.today.mealEditor.totalsLabel}</p>
          <MealStatsLine meal={draftGroup} settings={settings} />
        </>
      )}

      {settings && recommendation && (
        <div className="recommendation-box">
          <h2>{uk.today.recommendation.title}</h2>
          <ul>
            {settings.showCaloriesProgress && (
              <li>
                {uk.today.recommendation.calories(liveCalories, recommendation.caloriesKcal)}
                <DailyLeft
                  left={recommendation.dailyLeft.caloriesKcal - liveCalories}
                  target={settings.dailyCaloriesTarget}
                  unit=" ккал"
                />
              </li>
            )}
            {settings.showCarbsProgress && (
              <li>
                {uk.today.recommendation.carbs(liveCarbs, recommendation.carbsG)}
                <DailyLeft
                  left={recommendation.dailyLeft.carbsG - liveCarbs}
                  target={settings.dailyCarbsTarget}
                  unit=" г"
                />
              </li>
            )}
            {settings.showGlycemicLoadProgress && (
              <li>
                {uk.today.recommendation.gl(liveGl, recommendation.gl)}
                <DailyLeft
                  left={Math.round((recommendation.dailyLeft.gl - liveGl) * 10) / 10}
                  target={settings.dailyGlycemicLoadTarget}
                  unit=""
                />
              </li>
            )}
            <li className={liveFat > recommendation.fatLimitG ? "over-limit" : undefined}>
              {uk.today.recommendation.fat(liveFat, recommendation.fatLimitG)}
            </li>
          </ul>
          <p className="recommendation-note">{uk.today.recommendation.basis(recommendation.mealsSharing, recommendation.shares.fullPercent, recommendation.shares.snackPercent)}</p>
          {recommendation.fewerFitBeforeBedtime && (
            <p className="recommendation-note">{uk.today.recommendation.fewerFitNote}</p>
          )}
          <p className="recommendation-note">{uk.today.recommendation.disclaimer}</p>
        </div>
      )}

      {error && <p className="food-form-error">{error}</p>}

      {confirming === "discard" && (
        <div className="today-warning">
          <p>{uk.today.mealEditor.discardConfirm}</p>
          <div className="food-form-actions">
            <button type="button" className="button-danger" onClick={onCancel}>
              {uk.today.mealEditor.discardYes}
            </button>
            <button type="button" onClick={() => setConfirming("none")}>
              {uk.today.mealEditor.discardNo}
            </button>
          </div>
        </div>
      )}

      {confirming === "deleteMeal" && (
        <div className="today-warning">
          <p>{uk.today.mealEditor.deleteMealConfirm}</p>
          <div className="food-form-actions">
            <button type="button" className="button-danger" onClick={() => void handleDeleteMeal()} disabled={saving}>
              {uk.today.mealEditor.deleteMealYes}
            </button>
            <button type="button" onClick={() => setConfirming("none")} disabled={saving}>
              {uk.foods.cancelButton}
            </button>
          </div>
        </div>
      )}

      {original && confirming !== "deleteMeal" && (
        <button
          type="button"
          className="button-danger meal-editor-delete"
          onClick={() => setConfirming("deleteMeal")}
          disabled={saving}
        >
          {uk.today.mealEditor.deleteMealButton}
        </button>
      )}

      <div className="meal-editor-footer">
        <div className="food-form-actions">
          <button type="button" onClick={() => void handleSave()} disabled={saving}>
            {uk.today.mealEditor.saveButton}
          </button>
          <button type="button" onClick={requestCancel} disabled={saving}>
            {uk.today.mealEditor.cancelButton}
          </button>
        </div>
      </div>
    </section>
  );
}

