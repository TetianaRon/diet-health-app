// The weight bar on Сьогодні (release 1.7): latest weight and its trend —
// against the 30-day average, or the previous measurement when there are
// fewer than 3 (see weightTrend). Neutral styling on purpose: the app doesn't
// judge whether up or down is good.
import { uk } from "../i18n/uk";
import { formatDecimal } from "../lib/numberFormat";
import { localDateKey } from "../lib/dailyLog";
import { weightTrend, type WeightComparison, type WeightEntry } from "../lib/weight";

export function weightComparisonText(comparison: WeightComparison): string {
  const t = uk.weight;
  const diff = formatDecimal(Math.abs(comparison.diff));
  const lessOrMore = comparison.diff < 0 ? "less" : "more";
  if (comparison.kind === "average") {
    const average = formatDecimal(comparison.average);
    return comparison.diff === 0 ? t.sameAsAverage(average) : t.vsAverage(diff, lessOrMore, average);
  }
  const when = t.when(comparison.daysAgo);
  return comparison.diff === 0 ? t.sameAsPrevious(when) : t.vsPrevious(diff, lessOrMore, when);
}

export default function WeightBar({
  entries,
  onAdd,
  onEdit,
}: {
  entries: WeightEntry[];
  onAdd: () => void;
  onEdit: (entry: WeightEntry) => void;
}) {
  const trend = weightTrend(entries);
  // One weight per day: today's can only be edited, not added again.
  const todayEntry = entries.find((e) => e.date === localDateKey(new Date())) ?? null;

  return (
    <div className="weight-bar">
      <p className="weight-text">
        <strong>{uk.weight.label}: </strong>
        {trend ? (
          <>
            <strong>{uk.weight.value(formatDecimal(trend.latest.weightKg))}</strong>
            {trend.comparison && <span className="weight-trend"> · {weightComparisonText(trend.comparison)}</span>}
          </>
        ) : (
          <span className="weight-trend">{uk.weight.empty}</span>
        )}
      </p>
      <div className="weight-actions">
        {todayEntry ? (
          <button type="button" className="button-secondary" onClick={() => onEdit(todayEntry)}>
            {uk.weight.editButton}
          </button>
        ) : (
          <button type="button" className="button-secondary" onClick={onAdd}>
            {uk.weight.addButton}
          </button>
        )}
      </div>
    </div>
  );
}
