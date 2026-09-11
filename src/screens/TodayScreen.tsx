import { useEffect, useMemo, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { checkBloodSugarRange, checkFatLimit, classifyGl, mealGapWarning } from "../lib/health";
import { listIngredients, mergeWithStarterFoods, sortFavoritesFirst, type Ingredient } from "../lib/ingredients";
import { listDishes, type Dish, type IngredientNutrition } from "../lib/dishes";
import { GLYCEMIC_FLAG_SYMBOL, type GlycemicFlag } from "../lib/glycemicFlag";
import { mergeWithStarterDishes } from "../data/starter-dishes";
import { getSettings, type Settings } from "../lib/settings";
import { wasLastReadFromCache } from "../lib/sheets";
import { formatDayMonthFromKey, formatTime, fromDatetimeLocalValue, toDatetimeLocalValue } from "../lib/dateFormat";
import { scheduleMealReminder } from "../lib/reminderScheduler";
import { latestBloodSugarEntry, listBloodSugarEntries, type BloodSugarEntry } from "../lib/bloodSugar";
import {
  MEAL_TYPES,
  addLogEntry,
  buildCustomLogEntry,
  buildLogEntry,
  computePortionNutrition,
  deleteLogEntry,
  groupIntoMeals,
  isSameLocalDate,
  listLogEntries,
  localDateKey,
  moveLogEntryToMeal,
  recentDayGroups,
  suggestMealType,
  sumKnownField,
  updateLogEntry,
  type DailyLogEntry,
  type MealGroup,
  type MealType,
} from "../lib/dailyLog";

interface PickableFood {
  nameUk: string;
  nameEn: string;
  glycemicFlag: GlycemicFlag;
  per100g: IngredientNutrition;
}

function toPickable(
  item: { nameUk: string; nameEn: string; glycemicFlag: GlycemicFlag } & IngredientNutrition,
): PickableFood {
  const { nameUk, nameEn, glycemicFlag, carbsG, gi, fiberG, sugarsG, proteinG, fatG, caloriesKcal, sodiumMg } = item;
  return { nameUk, nameEn, glycemicFlag, per100g: { carbsG, gi, fiberG, sugarsG, proteinG, fatG, caloriesKcal, sodiumMg } };
}

function ProgressBar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="progress-row">
      <div className="progress-label">
        <span>{label}</span>
        <span>
          {Math.round(value)} / {target} {unit}
        </span>
      </div>
      <div className="progress-track">
        <div className={pct > 100 ? "progress-fill over" : "progress-fill"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Shared by Today's list and the recent-days history — one meal occasion's
// items plus its combined total, so a multi-item meal reads as one thing
// (matching mom's feedback that it didn't before) rather than N unrelated rows.
// A custom/estimated item (see AddLogEntryForm's "Власний запис" mode) may
// have some fields explicitly unknown rather than a real value — shown here
// as "невідомо" instead of a misleading "0", and meal.totals already
// excludes them from the sum (see sumKnownField in dailyLog.ts), so
// hasUnknownValues is purely a display caveat, not a correctness concern.
//
// siblingMeals is whichever OTHER meal occasions are visible in the same
// context (today's list, or one history day) — the candidates offered by
// each entry's "Перенести до іншого прийому" action. onEntryChanged
// re-fetches the whole entries list after an edit/delete/move succeeds:
// each of those can change an entry's own identity (timestamp, mealId), so
// patching local state in place would be more fragile than just re-reading
// — this list is never large enough for that to be a real cost.
function MealItemsList({
  meal,
  siblingMeals,
  onEntryChanged,
}: {
  meal: MealGroup;
  siblingMeals: MealGroup[];
  onEntryChanged: () => void;
}) {
  return (
    <>
      <ul className="food-list">
        {meal.entries.map((entry, i) => (
          <LogEntryRow
            key={`${entry.timestamp}-${i}`}
            entry={entry}
            siblingMeals={siblingMeals}
            onEntryChanged={onEntryChanged}
          />
        ))}
      </ul>
      <p className="today-meal-total">
        {uk.today.mealTotal(meal.totals.carbsG, meal.totals.caloriesKcal, meal.totals.gl)}
        {meal.hasUnknownValues && ` ${uk.today.mealHasUnknownSuffix}`}
      </p>
    </>
  );
}

// One logged item, with inline edit/move/delete actions. Each row owns its
// own action state so opening one entry's edit form doesn't affect its
// siblings in the same meal.
function LogEntryRow({
  entry,
  siblingMeals,
  onEntryChanged,
}: {
  entry: DailyLogEntry;
  siblingMeals: MealGroup[];
  onEntryChanged: () => void;
}) {
  const [action, setAction] = useState<"none" | "edit" | "move" | "delete">("none");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteLogEntry(entry.timestamp, entry.itemName, entry.mealId);
      onEntryChanged();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  if (action === "edit") {
    return (
      <li>
        <EditEntryForm
          entry={entry}
          onSaved={() => {
            setAction("none");
            onEntryChanged();
          }}
          onCancel={() => setAction("none")}
        />
      </li>
    );
  }

  if (action === "move") {
    return (
      <li>
        <MoveEntryForm
          entry={entry}
          siblingMeals={siblingMeals}
          onSaved={() => {
            setAction("none");
            onEntryChanged();
          }}
          onCancel={() => setAction("none")}
        />
      </li>
    );
  }

  if (action === "delete") {
    return (
      <li>
        <p>{uk.today.deleteConfirm(entry.itemName)}</p>
        {deleteError && <p className="food-form-error">{deleteError}</p>}
        <div className="food-form-actions">
          <button type="button" onClick={() => void handleDelete()} disabled={deleting}>
            {uk.today.deleteConfirmButton}
          </button>
          <button type="button" onClick={() => setAction("none")} disabled={deleting}>
            {uk.foods.cancelButton}
          </button>
        </div>
      </li>
    );
  }

  const carbsText = entry.unknownFields.includes("carbsG") ? uk.today.unknownValueLabel : uk.today.carbsValue(entry.carbsG);
  const caloriesText = entry.unknownFields.includes("caloriesKcal")
    ? uk.today.unknownValueLabel
    : uk.today.caloriesValue(entry.caloriesKcal);

  return (
    <li>
      <span className="entry-time">{formatTime(entry.timestamp)}</span> <strong>{entry.itemName}</strong> —{" "}
      {uk.today.entryMeta(entry.portionGrams, carbsText, caloriesText)}
      <span className="log-entry-actions">
        <button type="button" onClick={() => setAction("edit")}>
          {uk.today.editEntryButton}
        </button>
        <button type="button" onClick={() => setAction("move")}>
          {uk.today.moveEntryButton}
        </button>
        <button type="button" onClick={() => setAction("delete")}>
          {uk.today.deleteEntryButton}
        </button>
      </span>
    </li>
  );
}

// Edit an already-saved entry — reuses buildCustomLogEntry to re-derive the
// row from typed values (GL/unknownFields recomputed the same way a custom
// entry's are), regardless of whether the entry was originally a database
// pick or already custom. Keeps the entry's existing mealId — reassigning
// that is MoveEntryForm's job, not this form's, so the two actions stay
// simple and don't overlap.
function EditEntryForm({
  entry,
  onSaved,
  onCancel,
}: {
  entry: DailyLogEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(entry.mealType);
  const [timestamp, setTimestamp] = useState(() => toDatetimeLocalValue(entry.timestamp));
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedPortion = Number(portionGrams);
  const filledFields = CUSTOM_FIELDS.filter((field) => values[field].trim() !== "");
  const fieldsValid = filledFields.every((field) => Number.isFinite(Number(values[field])));

  const handleSave = async () => {
    if (
      !itemName.trim() ||
      !Number.isFinite(parsedPortion) ||
      parsedPortion <= 0 ||
      timestamp.trim() === "" ||
      filledFields.length === 0 ||
      !fieldsValid
    ) {
      setError(uk.today.form.customValidationError);
      return;
    }

    const nutritionValues: Partial<IngredientNutrition> = {};
    for (const field of filledFields) nutritionValues[field] = Number(values[field]);

    setSaving(true);
    setError(null);
    try {
      const updated = buildCustomLogEntry(
        mealType,
        itemName.trim(),
        parsedPortion,
        nutritionValues,
        notes.trim(),
        entry.mealId,
        fromDatetimeLocalValue(timestamp),
      );
      await updateLogEntry(entry.timestamp, entry.itemName, entry.mealId, updated);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <h3>{uk.today.editForm.title}</h3>
      <label>
        {uk.today.form.itemLabel}
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} />
      </label>
      <label>
        {uk.today.form.mealTypeLabel}
        <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {MEAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        {uk.today.form.timestampLabel}
        <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
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
        <button type="button" onClick={() => void handleSave()} disabled={saving}>
          {uk.today.editForm.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
}

// Reassigns an entry to an existing sibling meal occasion — the "two snacks
// 5 minutes apart should be one" case, without a dedicated multi-select
// merge UI (see the 2026-09-11 design decision).
function MoveEntryForm({
  entry,
  siblingMeals,
  onSaved,
  onCancel,
}: {
  entry: DailyLogEntry;
  siblingMeals: MealGroup[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [targetMealId, setTargetMealId] = useState(siblingMeals[0]?.mealId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (siblingMeals.length === 0) {
    return (
      <div className="food-form">
        <p>{uk.today.moveForm.noOtherMeals}</p>
        <div className="food-form-actions">
          <button type="button" onClick={onCancel}>
            {uk.foods.cancelButton}
          </button>
        </div>
      </div>
    );
  }

  const handleMove = async () => {
    const target = siblingMeals.find((m) => m.mealId === targetMealId);
    if (!target) {
      setError(uk.today.moveForm.validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await moveLogEntryToMeal(entry, target.mealId, target.mealType);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <h3>{uk.today.moveForm.title}</h3>
      <label>
        {uk.today.moveForm.targetLabel}
        <select value={targetMealId} onChange={(e) => setTargetMealId(e.target.value)}>
          {siblingMeals.map((m) => (
            <option key={m.mealId} value={m.mealId}>
              {m.mealType} · {formatTime(m.timestamp)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="food-form-error">{error}</p>}
      <div className="food-form-actions">
        <button type="button" onClick={() => void handleMove()} disabled={saving}>
          {uk.today.moveForm.moveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.foods.cancelButton}
        </button>
      </div>
    </div>
  );
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

function AddLogEntryForm({
  foods,
  onSaved,
  onCancel,
}: {
  foods: PickableFood[];
  onSaved: (entry: DailyLogEntry) => void;
  onCancel: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(() => suggestMealType(new Date()));
  // Defaults to "now" but is editable — mom may log a meal after the fact
  // (e.g. writing it down on paper first, then entering it later). Carries
  // over across items added in the same form session, same as mealType,
  // since a multi-item meal was eaten at one time regardless of entry order.
  const [timestamp, setTimestamp] = useState(() => toDatetimeLocalValue(new Date().toISOString()));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickableFood | null>(null);
  const [portionGrams, setPortionGrams] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A meal is often several items (e.g. buckwheat + an omelet + kefir at
  // breakfast) — the form stays open and just resets the item-picking fields
  // after each save, so mealType carries over instead of forcing it to be
  // re-picked for every single item. mealId is generated once per form
  // session (this component instance) and reused across every item saved
  // while it stays open, so they're grouped as one meal occasion — see
  // groupIntoMeals in lib/dailyLog.ts. Closing and reopening the form (a
  // fresh mount) starts a new meal, exactly matching "this is a different
  // sitting."
  const [mealId] = useState(() => new Date().toISOString());
  const [justSaved, setJustSaved] = useState(false);

  // "custom" is for a genuinely one-off item not in the database (restaurant
  // food, a homemade dish with no exact recipe) — the meal can freely mix
  // database-picked and custom items, since both share the same mealId
  // (see buildCustomLogEntry in dailyLog.ts). Custom entries are never
  // saved to Ingredients; they only ever produce a DailyLog row.
  const [mode, setMode] = useState<"pick" | "custom">("pick");
  const [customName, setCustomName] = useState("");
  const [customValues, setCustomValues] = useState<Record<keyof IngredientNutrition, string>>(EMPTY_CUSTOM_VALUES);

  const switchMode = (next: "pick" | "custom") => {
    setMode(next);
    setError(null);
    setJustSaved(false);
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

  const parsedPortion = Number(portionGrams);
  const previewNutrition =
    selected && Number.isFinite(parsedPortion) && parsedPortion > 0
      ? computePortionNutrition(selected.per100g, parsedPortion)
      : null;
  const previewGl =
    previewNutrition && selected ? Math.round(((selected.per100g.gi * previewNutrition.carbsG) / 100) * 100) / 100 : 0;

  const handleSave = async () => {
    if (!selected || !Number.isFinite(parsedPortion) || parsedPortion <= 0 || timestamp.trim() === "") {
      setError(uk.today.form.validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const entry = buildLogEntry(
        mealType,
        selected.nameUk,
        parsedPortion,
        selected.per100g,
        notes.trim(),
        mealId,
        fromDatetimeLocalValue(timestamp),
      );
      await addLogEntry(entry);
      onSaved(entry);
      // Reset only the item-picking fields — mealType carries over so the
      // next item (same meal) doesn't need it re-selected.
      setSelected(null);
      setSearch("");
      setPortionGrams("");
      setNotes("");
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const filledCustomFields = CUSTOM_FIELDS.filter((field) => customValues[field].trim() !== "");
  const customFieldsValid = filledCustomFields.every((field) => Number.isFinite(Number(customValues[field])));

  const handleSaveCustom = async () => {
    if (
      !customName.trim() ||
      !Number.isFinite(parsedPortion) ||
      parsedPortion <= 0 ||
      timestamp.trim() === "" ||
      filledCustomFields.length === 0 ||
      !customFieldsValid
    ) {
      setError(uk.today.form.customValidationError);
      return;
    }

    const values: Partial<IngredientNutrition> = {};
    for (const field of filledCustomFields) values[field] = Number(customValues[field]);

    setSaving(true);
    setError(null);
    try {
      const entry = buildCustomLogEntry(
        mealType,
        customName.trim(),
        parsedPortion,
        values,
        notes.trim(),
        mealId,
        fromDatetimeLocalValue(timestamp),
      );
      await addLogEntry(entry);
      onSaved(entry);
      setCustomName("");
      setCustomValues(EMPTY_CUSTOM_VALUES);
      setPortionGrams("");
      setNotes("");
      setJustSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="food-form">
      <label>
        {uk.today.form.mealTypeLabel}
        <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {MEAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label>
        {uk.today.form.timestampLabel}
        <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} />
      </label>

      <button type="button" className="food-form-mode-toggle" onClick={() => switchMode(mode === "pick" ? "custom" : "pick")}>
        {mode === "pick" ? uk.today.form.switchToCustomButton : uk.today.form.switchToPickButton}
      </button>

      {justSaved && <p className="food-form-source">{uk.today.addAnotherHint}</p>}

      {mode === "pick" ? (
        <>
          <label>
            {uk.today.form.itemLabel}
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelected(null);
                setJustSaved(false);
              }}
              placeholder={uk.today.form.itemPlaceholder}
            />
          </label>

          {matches.length > 0 && (
            <ul className="food-list">
              {matches.slice(0, 20).map((food) => (
                <li key={food.nameUk} className="food-list-item-with-action">
                  <span>
                    {food.glycemicFlag !== "none" && (
                      <span aria-hidden="true" className={`glycemic-inline ${food.glycemicFlag}`}>
                        {GLYCEMIC_FLAG_SYMBOL[food.glycemicFlag]}{" "}
                      </span>
                    )}
                    <strong>{food.nameUk}</strong> <span className="food-name-en">({food.nameEn})</span> —{" "}
                    {food.per100g.carbsG} г вуглеводів/100г
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
            onChange={(e) => {
              setCustomName(e.target.value);
              setJustSaved(false);
            }}
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

      {mode === "pick" && previewNutrition && (
        <p className="food-form-source">
          {uk.today.form.preview(previewNutrition.carbsG, previewNutrition.caloriesKcal, previewGl)} (
          {uk.health.gl[classifyGl(previewGl)]})
        </p>
      )}

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
        <button type="button" onClick={() => void (mode === "pick" ? handleSave() : handleSaveCustom())} disabled={saving}>
          {uk.today.form.saveButton}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {uk.today.doneButton}
        </button>
      </div>
    </div>
  );
}

export default function TodayScreen({
  autoOpenAddForm = false,
  onAutoOpenAddFormConsumed,
}: {
  autoOpenAddForm?: boolean;
  onAutoOpenAddFormConsumed?: () => void;
} = {}) {
  const { signedIn, initializing, signIn } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null);
  const [bloodSugarEntries, setBloodSugarEntries] = useState<BloodSugarEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // True if any of the reads below fell back to cached data (see
  // wasLastReadFromCache() in sheets.ts) — reset at the start of each
  // refresh, then set by whichever read(s) actually used the cache.
  const [showingCachedData, setShowingCachedData] = useState(false);

  // Re-fetches just the log entries — used after an edit/delete/move
  // succeeds (see LogEntryRow), since each of those can change an entry's
  // own identity in ways that make patching local state in place fragile.
  const refreshEntries = () => {
    listLogEntries()
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    if (autoOpenAddForm) {
      setShowAddForm(true);
      onAutoOpenAddFormConsumed?.();
    }
  }, [autoOpenAddForm, onAutoOpenAddFormConsumed]);

  useEffect(() => {
    if (!signedIn) return;

    const refresh = () => {
      setShowingCachedData(false);
      const flagIfCached = () => {
        if (wasLastReadFromCache()) setShowingCachedData(true);
      };
      listIngredients()
        .then((data) => {
          setIngredients(data);
          flagIfCached();
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
      listDishes()
        .then((data) => {
          setDishes(data);
          flagIfCached();
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
      getSettings()
        .then((data) => {
          setSettings(data);
          flagIfCached();
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
      listLogEntries()
        .then((data) => {
          setEntries(data);
          flagIfCached();
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
      listBloodSugarEntries()
        .then((data) => {
          setBloodSugarEntries(data);
          flagIfCached();
        })
        .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
    };

    refresh();

    // Re-reads on foreground so a meal logged on another device (e.g. the
    // computer) still reschedules the reminder correctly here — see the
    // "cross-device staleness" note in docs/build-log.md's 2026-09-09 entry.
    // @capacitor/app has a web implementation too (visibilitychange-based),
    // so this is safe to register outside the Android build as well.
    const listenerPromise = CapacitorApp.addListener("resume", refresh);
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [signedIn]);

  // (Re)schedules the meal reminder whenever the most recent log entry or the
  // relevant settings change — covers both "just logged a meal" (entries
  // changes) and "reopened the app" (the resume-triggered refresh above also
  // changes entries). No-op on non-native builds (see reminderScheduler.ts).
  useEffect(() => {
    if (!entries || !settings) return;
    const lastEntry = entries.reduce<DailyLogEntry | null>(
      (latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest),
      null,
    );
    if (lastEntry) void scheduleMealReminder(new Date(lastEntry.timestamp), settings);
  }, [entries, settings]);

  // Meal logging picks from the whole bundle, not just what's been saved to
  // the personal sheet — same principle as the Foods screen: nothing needs
  // to be individually "added" first just to be loggable for a meal.
  // Dishes first, then favorited ingredients, then the rest — the picker's
  // default (empty-search) view only shows the first 20 via .slice below, and
  // dishes are what most quick-adds actually are (a cooked meal), while
  // ingredients alone were drowning them out purely by outnumbering them.
  // Favorited ingredients still surface early for the genuinely as-eaten ones
  // (fruit, cottage cheese, a boiled egg) — Dishes has no favorite mechanism
  // yet to sort by, so it stays in bundle/sheet order for now.
  const foods = useMemo<PickableFood[]>(
    () => [
      ...mergeWithStarterDishes(dishes ?? []).map(toPickable),
      ...sortFavoritesFirst(mergeWithStarterFoods(ingredients ?? [])).map(toPickable),
    ],
    [ingredients, dishes],
  );

  const todayKey = localDateKey(new Date());
  const todayEntries = (entries ?? []).filter((e) => isSameLocalDate(e.timestamp, todayKey));
  // Chronological (oldest first) — matches how mom actually numbers her day
  // ("1 - Breakfast, 2 - Snack, 3 - Lunch, ..."), and groups items logged in
  // one sitting into one meal occasion instead of one row per item (see
  // groupIntoMeals) — a mealType like "Перекус" can legitimately repeat
  // several times a day, so grouping by mealId (not mealType) is what
  // actually keeps those separate.
  const todayMeals = groupIntoMeals(todayEntries).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  // Lightweight stopgap ahead of a proper History tab — mom asked to see
  // recent days without leaving Today, not a full history browsing UI yet.
  const historyGroups = recentDayGroups(entries ?? [], new Date(), 3);

  // sumKnownField excludes an entry from a specific total when that exact
  // field is unknown (a custom/estimated item — see AddLogEntryForm), rather
  // than letting its stored-as-0 value silently understate the total.
  const totalCarbs = sumKnownField(todayEntries, "carbsG").total;
  const totalCalories = sumKnownField(todayEntries, "caloriesKcal").total;
  const totalGl = sumKnownField(todayEntries, "gl").total;
  const totalFat = sumKnownField(todayEntries, "fatG").total;
  const totalSugars = sumKnownField(todayEntries, "sugarsG").total;
  const totalProtein = sumKnownField(todayEntries, "proteinG").total;
  const totalSodium = sumKnownField(todayEntries, "sodiumMg").total;
  // One combined caveat rather than a per-stat count — see the 2026-09-11
  // design decision: precise enough to flag "something's missing" without
  // cluttering every individual total with its own disclaimer.
  const todayUnknownCount = todayEntries.filter((e) => e.unknownFields.length > 0).length;

  // Per meal OCCASION, not per mealType-across-the-day — the fat limit is a
  // per-sitting rule (no gallbladder), so two separate small snacks each
  // under the limit shouldn't get silently summed together just because
  // they share the "Перекус" label, and a single over-limit snack shouldn't
  // get buried inside a combined daily "Перекус" total.
  const fatWarnings = todayMeals
    .map((meal) => {
      const check = settings ? checkFatLimit(meal.totals.fatG, settings.fatPerMealLimit) : null;
      return check?.exceeded ? uk.today.fatWarning(meal.mealType, check.overByGrams) : null;
    })
    .filter((w): w is string => w !== null);

  const lastEntry = (entries ?? []).reduce<DailyLogEntry | null>(
    (latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest),
    null,
  );
  const gapWarning =
    lastEntry && settings ? mealGapWarning(new Date(lastEntry.timestamp), new Date(), settings.maxGapHours) : null;

  const latestBloodSugar = bloodSugarEntries ? latestBloodSugarEntry(bloodSugarEntries) : null;
  const bloodSugarStatus =
    latestBloodSugar && settings
      ? checkBloodSugarRange(latestBloodSugar.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax)
      : null;

  if (initializing) {
    return (
      <section className="screen">
        <h1>{uk.today.title}</h1>
        <p>{uk.today.loading}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="screen">
        <h1>{uk.today.title}</h1>
        <p>{uk.today.signIn.message}</p>
        <button type="button" onClick={() => void signIn()}>
          {uk.today.signIn.button}
        </button>
      </section>
    );
  }

  return (
    <section className="screen">
      <h1>{uk.today.title}</h1>

      {loadError && <p className="food-form-error">{loadError}</p>}
      {showingCachedData && <p className="today-warning">{uk.today.offlineNotice}</p>}

      {settings && (settings.showCarbsProgress || settings.showCaloriesProgress || settings.showGlycemicLoadProgress) && (
        <div className="progress-block">
          {settings.showCarbsProgress && (
            <ProgressBar label={uk.today.progress.carbs} value={totalCarbs} target={settings.dailyCarbsTarget} unit="г" />
          )}
          {settings.showCaloriesProgress && (
            <ProgressBar
              label={uk.today.progress.calories}
              value={totalCalories}
              target={settings.dailyCaloriesTarget}
              unit="ккал"
            />
          )}
          {settings.showGlycemicLoadProgress && (
            <ProgressBar
              label={uk.today.progress.glycemicLoad}
              value={totalGl}
              target={settings.dailyGlycemicLoadTarget}
              unit=""
            />
          )}
        </div>
      )}

      {settings && (settings.showFatTotal || settings.showSugarsTotal || settings.showProteinTotal || settings.showSodiumTotal) && (
        <div className="today-totals">
          {settings.showFatTotal && <p>{uk.today.totals.fat(Math.round(totalFat))}</p>}
          {settings.showSugarsTotal && <p>{uk.today.totals.sugars(Math.round(totalSugars))}</p>}
          {settings.showProteinTotal && <p>{uk.today.totals.protein(Math.round(totalProtein))}</p>}
          {settings.showSodiumTotal && <p>{uk.today.totals.sodium(Math.round(totalSodium))}</p>}
        </div>
      )}

      {todayUnknownCount > 0 && <p className="today-warning">{uk.today.unknownValuesNotice(todayUnknownCount)}</p>}

      {latestBloodSugar && (
        <p className={bloodSugarStatus?.inRange ? "blood-sugar-latest" : "blood-sugar-latest out-of-range"}>
          {uk.bloodSugar.latestLabel}: {uk.today.latestBloodSugar(latestBloodSugar.valueMmolL, uk.bloodSugar.context[latestBloodSugar.context])}
        </p>
      )}

      {gapWarning?.shouldWarn && <p className="today-warning">{uk.today.mealGapWarning(gapWarning.hoursSinceLastMeal)}</p>}
      {fatWarnings.map((w) => (
        <p key={w} className="today-warning">
          {w}
        </p>
      ))}

      {showAddForm ? (
        <AddLogEntryForm
          foods={foods}
          onSaved={(entry) => {
            setEntries((prev) => [...(prev ?? []), entry]);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button type="button" onClick={() => setShowAddForm(true)}>
          {uk.today.addButton}
        </button>
      )}

      {entries === null && !loadError && <p>{uk.today.loading}</p>}
      {entries !== null && todayEntries.length === 0 && !showAddForm && <p>{uk.today.empty}</p>}

      {todayMeals.map((meal, i) => (
        <div key={meal.mealId} className="today-meal-group">
          <h2>
            {uk.today.mealHeading(i + 1, meal.mealType)} <span className="entry-time">· {formatTime(meal.timestamp)}</span>
          </h2>
          <MealItemsList
            meal={meal}
            siblingMeals={todayMeals.filter((m) => m.mealId !== meal.mealId)}
            onEntryChanged={refreshEntries}
          />
        </div>
      ))}

      <h2 className="history-title">{uk.today.historyTitle}</h2>
      {historyGroups.length === 0 && <p>{uk.today.historyEmpty}</p>}
      {historyGroups.map((group) => {
        const dayMeals = groupIntoMeals(group.entries).sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
        return (
          <div key={group.dateKey} className="today-meal-group">
            <h3>{formatDayMonthFromKey(group.dateKey)}</h3>
            {dayMeals.map((meal) => (
              <div key={meal.mealId} className="history-meal">
                <p className="history-meal-label">
                  <strong>{meal.mealType}</strong> · {formatTime(meal.timestamp)}
                </p>
                <MealItemsList
                  meal={meal}
                  siblingMeals={dayMeals.filter((m) => m.mealId !== meal.mealId)}
                  onEntryChanged={refreshEntries}
                />
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
