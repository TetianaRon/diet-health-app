// Історія — every day's records together, read-only (release 1.7): daily
// totals, weight, blood sugar + medicine, meals. Days that have any record,
// 14 at a time («Показати ще»), with its own on-screen order toggle.
import { useEffect, useState } from "react";
import { uk } from "../i18n/uk";
import { useAuth } from "../context/AuthContext";
import { formatDayMonthFromKey } from "../lib/dateFormat";
import { formatDecimal } from "../lib/numberFormat";
import { loadDayData, type DayData } from "../lib/dayData";
import { datesWithRecords, dayRecords, inOrder, previousDateKey } from "../lib/records";
import { groupIntoMeals, isSameLocalDate, localDateKey, sumKnownField } from "../lib/dailyLog";
import DayRecordsList from "./DayRecordsList";
import OrderToggle, { useDisplayOrder } from "./OrderToggle";
import { MealsWithItems } from "./MealsReadOnly";

const PAGE_DAYS = 14;

export default function HistoryScreen() {
  const { signedIn, initializing, signIn, sessionExpired } = useAuth();
  const [data, setData] = useState<DayData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleDays, setVisibleDays] = useState(PAGE_DAYS);
  const [order, setOrder] = useDisplayOrder("history");

  useEffect(() => {
    if (!signedIn || sessionExpired) return;
    setLoadError(null);
    loadDayData()
      .then(setData)
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [signedIn, sessionExpired]);

  if (initializing) {
    return (
      <section className="screen">
        <h1>{uk.history.title}</h1>
        <p>{uk.history.loading}</p>
      </section>
    );
  }

  if (!signedIn) {
    return (
      <section className="screen">
        <h1>{uk.history.title}</h1>
        <p>{uk.history.signIn.message}</p>
        <button type="button" onClick={() => void signIn()}>
          {uk.history.signIn.button}
        </button>
      </section>
    );
  }

  const todayKey = localDateKey(new Date());
  const yesterdayKey = previousDateKey(todayKey);
  const allDays = data
    ? datesWithRecords([
        ...data.logEntries.map((e) => e.timestamp),
        ...data.bloodSugar.map((e) => e.timestamp),
        ...data.intakes.map((e) => e.timestamp),
        ...data.weights.map((e) => `${e.date}T12:00:00`),
      ])
    : [];
  const shownDays = allDays.slice(0, visibleDays); // newest days first…
  const days = order === "newest" ? shownDays : [...shownDays].reverse(); // …in the chosen order

  const dayLabel = (key: string) => (key === todayKey ? uk.history.todayLabel : key === yesterdayKey ? uk.history.yesterdayLabel : formatDayMonthFromKey(key));

  return (
    <section className="screen">
      <div className="screen-title-row">
        <h1>{uk.history.title}</h1>
        <OrderToggle order={order} onChange={setOrder} />
      </div>

      {loadError && <p className="food-form-error">{loadError}</p>}
      {data === null && !loadError && <p>{uk.history.loading}</p>}
      {data !== null && allDays.length === 0 && <p>{uk.history.empty}</p>}

      {data &&
        days.map((key) => {
          const entries = data.logEntries.filter((e) => isSameLocalDate(e.timestamp, key));
          const meals = inOrder(groupIntoMeals(entries), order);
          const records = dayRecords(data.bloodSugar, data.intakes, key, order);
          const weight = data.weights.find((w) => w.date === key);
          const calories = Math.round(sumKnownField(entries, "caloriesKcal").total);
          const gl = Math.round(sumKnownField(entries, "gl").total);
          return (
            <div key={key} className="history-day">
              <h2>{dayLabel(key)}</h2>
              {entries.length > 0 && <p className="history-totals">{uk.history.totals(calories, gl)}</p>}
              {weight && <p className="history-weight">{uk.history.weight(formatDecimal(weight.weightKg))}</p>}
              {records.length > 0 && <DayRecordsList records={records} settings={data.settings} />}
              <MealsWithItems meals={meals} settings={data.settings} />
            </div>
          );
        })}

      {allDays.length > visibleDays && (
        <button type="button" className="button-secondary" onClick={() => setVisibleDays((n) => n + PAGE_DAYS)}>
          {uk.history.showMore}
        </button>
      )}
    </section>
  );
}
