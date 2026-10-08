// Сьогодні — one surface for entering and reading the day (release 1.7,
// spec → "Daily records and the new Today"). Top to bottom: daily status,
// weight bar, blood sugar + medicine in one timeline (yesterday's last
// medicine small and read-only), today's meals (yesterday's as a compact
// read-only list). An on-screen order toggle decides newest/oldest first;
// yesterday's records sit at the end of their block (or the start, oldest
// first). Everything is read in one batch request (loadDayData).
import { canOfferLocalMode } from "../lib/localMode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { syncIfStale } from "../lib/sync";
import { App as CapacitorApp } from "@capacitor/app";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { checkFatLimit, mealGapWarning, mealsLeftToday } from "../lib/health";
import { mergeWithBuiltInFoods, sortFavoritesFirst } from "../lib/ingredients";
import { wasLastReadFromCache } from "../lib/sheets";
import { formatTime } from "../lib/dateFormat";
import { scheduleMealReminder } from "../lib/reminderScheduler";
import { loadDayData, type DayData } from "../lib/dayData";
import { dayRecords, inOrder, lastIntakeOfDay, previousDateKey } from "../lib/records";
import { groupIntoMeals, isSameLocalDate, localDateKey, sumKnownField, type DailyLogEntry, type MealGroup } from "../lib/dailyLog";
import type { BloodSugarEntry } from "../lib/bloodSugar";
import type { MedicationIntake } from "../lib/medications";
import type { WeightEntry } from "../lib/weight";
import ReminderAccessNotice from "./ReminderAccessNotice";
import MealEditorScreen, { toPickable, type PickableFood } from "./MealEditorScreen";
import MealStatsLine from "./MealStatsLine";
import Breadcrumb from "./Breadcrumb";
import BloodSugarForm from "./BloodSugarForm";
import MedicationIntakeForm from "./MedicationIntakeForm";
import WeightForm from "./WeightForm";
import WeightBar from "./WeightBar";
import DayRecordsList from "./DayRecordsList";
import OrderToggle, { useDisplayOrder } from "./OrderToggle";
import { CompactMealsList } from "./MealsReadOnly";
import EditIconButton from "./EditIconButton";

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

// One meal's dishes plus its combined total. Read-only on purpose: changing
// a meal goes through one edit (pencil) button per meal (see MealHeader).
function MealItemsList({ meal, settings }: { meal: MealGroup; settings: DayData["settings"] | null }) {
  return (
    <>
      <ul className="food-list">
        {meal.entries.map((entry, i) => (
          <li key={`${entry.timestamp}-${i}`}>
            <strong>{entry.itemName}</strong> — {uk.today.dishAmount(entry.unknownFields.includes("portionGrams") ? null : entry.portionGrams, entry.portionPieces, entry.portionSize)}
          </li>
        ))}
      </ul>
      <MealStatsLine meal={meal} settings={settings} />
    </>
  );
}

function MealHeader({ title, time, mealType, onEdit }: { title: string; time: string; mealType: string; onEdit: () => void }) {
  return (
    <div className="meal-header">
      <h2>
        {title} <span className="entry-time">· {time}</span>
      </h2>
      <EditIconButton label={uk.today.editMealLabel(mealType)} onClick={onEdit} />
    </div>
  );
}

type RecordForm =
  | { kind: "sugar"; original?: BloodSugarEntry }
  | { kind: "medication"; original?: MedicationIntake }
  | { kind: "weight"; original?: WeightEntry };

export default function TodayScreen({
  autoOpenAddForm = false,
  onAutoOpenAddFormConsumed,
  onEditorOpenChange,
}: {
  autoOpenAddForm?: boolean;
  onAutoOpenAddFormConsumed?: () => void;
  // Lets the app shell hide the tab bar/gear while the meal editor is open,
  // so it behaves as its own screen and a stray tab tap can't discard a draft.
  onEditorOpenChange?: (open: boolean) => void;
} = {}) {
  const { signedIn, initializing, signIn, sessionExpired, startWithoutGoogle } = useAuth();
  const [data, setData] = useState<DayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = closed; { meal: null } = composing a new meal; { meal } = editing that one.
  const [editor, setEditor] = useState<{ meal: MealGroup | null } | null>(null);
  const [form, setForm] = useState<RecordForm | null>(null);
  const [showingCachedData, setShowingCachedData] = useState(false);
  const [order, setOrder] = useDisplayOrder("today");

  const refresh = useCallback(() => {
    setShowingCachedData(false);
    loadDayData()
      .then((loaded) => {
        setData(loaded);
        setLoadError(null);
        if (wasLastReadFromCache()) setShowingCachedData(true);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (autoOpenAddForm) {
      setEditor({ meal: null });
      onAutoOpenAddFormConsumed?.();
    }
  }, [autoOpenAddForm, onAutoOpenAddFormConsumed]);

  useEffect(() => {
    onEditorOpenChange?.(editor !== null);
    return () => onEditorOpenChange?.(false);
  }, [editor, onEditorOpenChange]);

  useEffect(() => {
    // Also after a renewed sign-in (sessionExpired true -> false).
    if (!signedIn || sessionExpired) return;
    setLoadError(null);
    refresh();
    // Re-reads on foreground so records from another device (e.g. the
    // computer) show here and the reminder reschedules correctly.
    // The device copy is refreshed first when it is more than 5 minutes old (release 2.0).
    const onResume = () => void syncIfStale().catch(() => undefined).finally(refresh);
    const listenerPromise = CapacitorApp.addListener("resume", onResume);
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [signedIn, sessionExpired, refresh]);

  const entries = data?.logEntries ?? null;
  const settings = data?.settings ?? null;

  // (Re)schedules the meal reminder whenever the latest meal or the settings change.
  useEffect(() => {
    if (!entries || !settings) return;
    const lastEntry = entries.reduce<DailyLogEntry | null>((latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest), null);
    if (lastEntry) void scheduleMealReminder(new Date(lastEntry.timestamp), settings);
  }, [entries, settings]);

  // Meal logging picks from her dishes first, then all products (built-in
  // database + her own, favourites first) — nothing needs to be "added" first
  // just to be loggable. Built-in cooked foods are products since 1.8.
  const foods = useMemo<PickableFood[]>(
    () => [
      ...(data?.dishes ?? []).map(toPickable),
      ...sortFavoritesFirst(mergeWithBuiltInFoods(data?.ingredients ?? [])).map(toPickable),
    ],
    [data],
  );

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
        {canOfferLocalMode() && (
          <button type="button" className="button-secondary" onClick={() => void startWithoutGoogle()}>
            {uk.localMode.startButton}
          </button>
        )}
      </section>
    );
  }

  if (editor) {
    return (
      <MealEditorScreen
        original={editor.meal}
        foods={foods}
        settings={settings}
        allEntries={entries ?? []}
        onSaved={() => {
          setEditor(null);
          refresh();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  // The add/edit forms for records are their own screen with a breadcrumb back.
  if (form) {
    const close = () => setForm(null);
    const saved = () => {
      setForm(null);
      refresh();
    };
    // A new sugar/medicine record starts from one «+ Додати»; the type is picked here.
    const isNewRecord = !form.original && form.kind !== "weight";
    const title = isNewRecord
      ? uk.records.addTitle
      : form.kind === "sugar"
        ? uk.bloodSugar.editTitle
        : form.kind === "medication"
          ? uk.medication.editTitle
          : form.original
            ? uk.weight.editTitle
            : uk.weight.addTitle;
    return (
      <section className="screen">
        <Breadcrumb trail={[{ label: uk.today.title, onClick: close }]} current={title} />
        {isNewRecord && (
          <div className="record-type-switch" role="radiogroup" aria-label={uk.records.typeLabel}>
            {(["sugar", "medication"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                className={form.kind === kind ? "record-type-option active" : "record-type-option"}
                onClick={() => setForm({ kind })}
              >
                {kind === "sugar" ? uk.records.typeSugar : uk.records.typeMedication}
              </button>
            ))}
          </div>
        )}
        {form.kind === "sugar" && <BloodSugarForm original={form.original} settings={settings} onSaved={saved} onCancel={close} />}
        {form.kind === "medication" && (
          <MedicationIntakeForm
            original={form.original}
            medications={data?.medications ?? []}
            settings={settings}
            onSaved={saved}
            onMedicationAdded={(m) => setData((prev) => (prev ? { ...prev, medications: [...prev.medications, m] } : prev))}
            onCancel={close}
          />
        )}
        {form.kind === "weight" && <WeightForm original={form.original} onSaved={saved} onCancel={close} />}
      </section>
    );
  }

  const todayKey = localDateKey(new Date());
  const yesterdayKey = previousDateKey(todayKey);
  const allEntries = entries ?? [];
  const todayEntries = allEntries.filter((e) => isSameLocalDate(e.timestamp, todayKey));
  const todayMeals = inOrder(groupIntoMeals(todayEntries), order);
  const yesterdayMeals = inOrder(groupIntoMeals(allEntries.filter((e) => isSameLocalDate(e.timestamp, yesterdayKey))), order);
  const records = dayRecords(data?.bloodSugar ?? [], data?.intakes ?? [], todayKey, order);
  const yesterdayLastIntake = lastIntakeOfDay(data?.intakes ?? [], yesterdayKey);
  const mealsLeft = settings ? mealsLeftToday(settings.mealsPerDay, todayMeals.length) : null;

  // sumKnownField leaves out an entry whose field is unknown rather than counting it as 0.
  const totalCarbs = sumKnownField(todayEntries, "carbsG").total;
  const totalCalories = sumKnownField(todayEntries, "caloriesKcal").total;
  const totalGl = sumKnownField(todayEntries, "gl").total;
  const totalFat = sumKnownField(todayEntries, "fatG").total;
  const totalSugars = sumKnownField(todayEntries, "sugarsG").total;
  const totalProtein = sumKnownField(todayEntries, "proteinG").total;
  const totalSodium = sumKnownField(todayEntries, "sodiumMg").total;
  const todayUnknownCount = todayEntries.filter((e) => e.unknownFields.length > 0).length;

  // Per meal occasion — the fat limit is a per-sitting rule (no gallbladder).
  const fatWarnings = todayMeals
    .map((meal) => {
      const check = settings ? checkFatLimit(meal.totals.fatG, settings.fatPerMealLimit) : null;
      return check?.exceeded ? uk.today.fatWarning(meal.mealType, check.overByGrams) : null;
    })
    .filter((w): w is string => w !== null);

  const lastEntry = allEntries.reduce<DailyLogEntry | null>((latest, e) => (!latest || e.timestamp > latest.timestamp ? e : latest), null);
  const gapWarning = lastEntry && settings ? mealGapWarning(new Date(lastEntry.timestamp), new Date(), settings.maxGapHours) : null;

  const yesterdayMealsList = <CompactMealsList meals={yesterdayMeals} settings={settings} title={uk.yesterday.mealsTitle} />;

  return (
    <section className="screen">
      <div className="screen-title-row">
        <h1>{uk.today.title}</h1>
        <OrderToggle order={order} onChange={setOrder} />
      </div>

      {/* On phones the groups stack; on a computer (index.css, ≥1000px) the
          day's status and records sit in a column beside the meals. */}
      <div className="today-layout">
        <div className="today-summary">
          <ReminderAccessNotice />
          {loadError && <p className="food-form-error">{loadError}</p>}
          {showingCachedData && <p className="today-warning">{uk.today.offlineNotice}</p>}

          {mealsLeft && <p className="meals-left">{uk.today.mealsLeft(mealsLeft.left, mealsLeft.planned)}</p>}

          {settings && (settings.showCarbsProgress || settings.showCaloriesProgress || settings.showGlycemicLoadProgress) && (
            <div className="progress-block">
              {settings.showCarbsProgress && <ProgressBar label={uk.today.progress.carbs} value={totalCarbs} target={settings.dailyCarbsTarget} unit="г" />}
              {settings.showCaloriesProgress && (
                <ProgressBar label={uk.today.progress.calories} value={totalCalories} target={settings.dailyCaloriesTarget} unit="ккал" />
              )}
              {settings.showGlycemicLoadProgress && (
                <ProgressBar label={uk.today.progress.glycemicLoad} value={totalGl} target={settings.dailyGlycemicLoadTarget} unit="" />
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
          {gapWarning?.shouldWarn && <p className="today-warning">{uk.today.mealGapWarning(gapWarning.hoursSinceLastMeal)}</p>}
          {fatWarnings.map((w) => (
            <p key={w} className="today-warning">
              {w}
            </p>
          ))}

          {data && (
            <WeightBar entries={data.weights} onAdd={() => setForm({ kind: "weight" })} onEdit={(entry) => setForm({ kind: "weight", original: entry })} />
          )}

          <div className="records-block">
            <div className="block-header">
              <h2>{uk.records.title}</h2>
              <div className="block-actions">
                <button type="button" className="button-secondary" onClick={() => setForm({ kind: "sugar" })}>
                  {uk.records.add}
                </button>
              </div>
            </div>
            {data && records.length === 0 && <p className="food-form-hint">{uk.records.empty}</p>}
            {data && (
              <DayRecordsList
                records={records}
                settings={settings}
                yesterdayLastIntake={yesterdayLastIntake}
                yesterdayFirst={order === "oldest"}
                onEditSugar={(entry) => setForm({ kind: "sugar", original: entry })}
                onEditIntake={(intake) => setForm({ kind: "medication", original: intake })}
              />
            )}
          </div>
        </div>

        <div className="today-meals">
          <button type="button" className="today-add" onClick={() => setEditor({ meal: null })}>
            {uk.today.addButton}
          </button>
          {data === null && !loadError && <p>{uk.today.loading}</p>}

          {order === "oldest" && yesterdayMealsList}
          {data !== null && todayEntries.length === 0 && <p>{uk.today.empty}</p>}
          {todayMeals.map((meal) => (
            <div key={meal.mealId} className="today-meal-group">
              <MealHeader title={meal.mealType} time={formatTime(meal.timestamp)} mealType={meal.mealType} onEdit={() => setEditor({ meal })} />
              <MealItemsList meal={meal} settings={settings} />
            </div>
          ))}
          {order === "newest" && yesterdayMealsList}
        </div>
      </div>
    </section>
  );
}
