import { useEffect, useMemo, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { checkBloodSugarRange, checkFatLimit, mealGapWarning, mealsLeftToday } from "../lib/health";
import { listIngredients, mergeWithStarterFoods, sortFavoritesFirst, type Ingredient } from "../lib/ingredients";
import { listDishes, type Dish } from "../lib/dishes";
import { mergeWithStarterDishes } from "../data/starter-dishes";
import { getSettings, type Settings } from "../lib/settings";
import { wasLastReadFromCache } from "../lib/sheets";
import { formatTime } from "../lib/dateFormat";
import { scheduleMealReminder } from "../lib/reminderScheduler";
import { latestBloodSugarEntry, listBloodSugarEntries, type BloodSugarEntry } from "../lib/bloodSugar";
import {
  groupIntoMeals,
  isSameLocalDate,
  listLogEntries,
  localDateKey,
  sumKnownField,
  type DailyLogEntry,
  type MealGroup,
} from "../lib/dailyLog";
import MealEditorScreen, { toPickable, type PickableFood } from "./MealEditorScreen";
import MealStatsLine from "./MealStatsLine";

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

// One meal's dishes plus its combined total, so a multi-item meal reads as
// one thing rather than N unrelated rows. Each dish shows only its weight —
// the stats belong to the meal line below (a cleaner read); per-dish detail
// lives in the meal editor. Read-only on purpose: changing a meal goes
// through one Редагувати button per meal (see MealHeader).
//
// A custom/estimated dish may have some fields unknown — meal.totals already
// excludes them from the sum (see sumKnownField in dailyLog.ts), and
// hasUnknownValues (shown by MealStatsLine) is the visible caveat.
function MealItemsList({ meal, settings }: { meal: MealGroup; settings: Settings | null }) {
  return (
    <>
      <ul className="food-list">
        {meal.entries.map((entry, i) => (
          <li key={`${entry.timestamp}-${i}`}>
            <strong>{entry.itemName}</strong> — {uk.today.dishWeight(entry.portionGrams)}
          </li>
        ))}
      </ul>
      <MealStatsLine meal={meal} settings={settings} />
    </>
  );
}

// A meal's title row with its single Редагувати button.
function MealHeader({
  title,
  time,
  mealType,
  onEdit,
}: {
  title: string;
  time: string;
  mealType: string;
  onEdit: () => void;
}) {
  return (
    <div className="meal-header">
      <h2>
        {title} <span className="entry-time">· {time}</span>
      </h2>
      <button
        type="button"
        className="button-secondary meal-edit-button"
        aria-label={uk.today.editMealLabel(mealType)}
        onClick={onEdit}
      >
        {uk.today.editMealButton}
      </button>
    </div>
  );
}

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
  const { signedIn, initializing, signIn } = useAuth();
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [dishes, setDishes] = useState<Dish[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null);
  const [bloodSugarEntries, setBloodSugarEntries] = useState<BloodSugarEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // null = closed; { meal: null } = composing a new meal; { meal } = editing that one.
  const [editor, setEditor] = useState<{ meal: MealGroup | null } | null>(null);
  // True if any of the reads below fell back to cached data (see
  // wasLastReadFromCache() in sheets.ts) — reset at the start of each
  // refresh, then set by whichever read(s) actually used the cache.
  const [showingCachedData, setShowingCachedData] = useState(false);

  // Re-fetches just the log entries — used after the meal editor saves or
  // deletes, since either can change entries' identity (timestamp, type) in
  // ways that make patching local state in place fragile.
  const refreshEntries = () => {
    listLogEntries()
      .then(setEntries)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  };

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
  // Only today is shown here — the old "last 3 days" list was dropped to keep
  // this screen a clean read; past days will get their own History screen.
  const mealsLeft = settings ? mealsLeftToday(settings.mealsPerDay, todayMeals.length) : null;

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

  if (editor) {
    return (
      <MealEditorScreen
        original={editor.meal}
        foods={foods}
        settings={settings}
        allEntries={entries ?? []}
        onSaved={() => {
          setEditor(null);
          refreshEntries();
        }}
        onCancel={() => setEditor(null)}
      />
    );
  }

  return (
    <section className="screen">
      <h1>{uk.today.title}</h1>

      {loadError && <p className="food-form-error">{loadError}</p>}
      {showingCachedData && <p className="today-warning">{uk.today.offlineNotice}</p>}

      {mealsLeft && <p className="meals-left">{uk.today.mealsLeft(mealsLeft.left, mealsLeft.planned)}</p>}

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

      <button type="button" onClick={() => setEditor({ meal: null })}>
        {uk.today.addButton}
      </button>

      {entries === null && !loadError && <p>{uk.today.loading}</p>}
      {entries !== null && todayEntries.length === 0 && <p>{uk.today.empty}</p>}

      {todayMeals.map((meal) => (
        <div key={meal.mealId} className="today-meal-group">
          <MealHeader
            title={meal.mealType}
            time={formatTime(meal.timestamp)}
            mealType={meal.mealType}
            onEdit={() => setEditor({ meal })}
          />
          <MealItemsList meal={meal} settings={settings} />
        </div>
      ))}
    </section>
  );
}
