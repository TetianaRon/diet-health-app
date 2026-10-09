// Blood sugar readings and medicine intakes in one timeline (release 1.7) —
// on Сьогодні (editable) and in Історія (read-only). Сьогодні also shows
// yesterday's records and the last of each from earlier days as small
// read-only groups (CompactRecordsList, 2.1.4). The former Цукор screen's "meals
// before this reading" expander is gone: the day's meals are on the same
// screen now (developer, 2026-10-04).
import { uk } from "../i18n/uk";
import { checkBloodSugarRange } from "../lib/health";
import { formatDateTime, formatTime } from "../lib/dateFormat";
import { formatDecimal } from "../lib/numberFormat";
import { intakeLabel, type MedicationIntake } from "../lib/medications";
import type { DayRecord } from "../lib/records";
import type { BloodSugarEntry } from "../lib/bloodSugar";
import type { Settings } from "../lib/settings";
import EditIconButton from "./EditIconButton";

function statusLabel(entry: BloodSugarEntry, settings: Settings): string | null {
  const check = checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax);
  if (check.tooLow) return uk.bloodSugar.status.tooLow;
  if (check.tooHigh) return uk.bloodSugar.status.tooHigh;
  return null;
}

export default function DayRecordsList({
  records,
  settings,
  onEditSugar,
  onEditIntake,
}: {
  records: DayRecord[];
  settings: Settings | null;
  onEditSugar?: (entry: BloodSugarEntry) => void;
  onEditIntake?: (intake: MedicationIntake) => void;
}) {
  return (
    <ul className="food-list records-list">
      {records.map((record, i) => {
        const time = formatTime(record.timestamp);
        if (record.kind === "medication") {
          return (
            <li key={`m-${record.timestamp}-${i}`} className="record-row">
              <div className="meal-header">
                <p>
                  <strong className="reading-time">{time}</strong> · {intakeLabel(record.intake)}
                </p>
                {onEditIntake && <EditIconButton label={uk.records.editMedicationLabel(time)} onClick={() => onEditIntake(record.intake)} />}
              </div>
              {record.intake.notes && <p className="food-name-en">{record.intake.notes}</p>}
            </li>
          );
        }
        const entry = record.entry;
        const flag = settings ? statusLabel(entry, settings) : null;
        return (
          <li key={`s-${entry.timestamp}-${i}`} className="record-row">
            <div className="meal-header">
              <p>
                <strong className="reading-time">{time}</strong> ·{" "}
                <strong>{uk.records.sugarLine(formatDecimal(entry.valueMmolL), uk.bloodSugar.context[entry.context])}</strong>
                {flag && <span className="blood-sugar-flag"> — {flag}</span>}
              </p>
              {onEditSugar && <EditIconButton label={uk.bloodSugar.editEntryLabel(time)} onClick={() => onEditSugar(entry)} />}
            </div>
            {entry.notes && <p className="food-name-en">{entry.notes}</p>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Small read-only records under a title, like yesterday's meals: «Учора»
 * (times only) and «Востаннє» (each with its date) on Сьогодні (2.1.4).
 */
export function CompactRecordsList({ records, title, withDate = false }: { records: DayRecord[]; title: string; withDate?: boolean }) {
  if (records.length === 0) return null;
  return (
    <div className="meals-compact">
      <p className="meals-compact-title">{title}</p>
      <ul className="food-list">
        {records.map((record, i) => {
          const when = withDate ? formatDateTime(record.timestamp) : formatTime(record.timestamp);
          const what =
            record.kind === "medication"
              ? intakeLabel(record.intake)
              : uk.records.sugarLine(formatDecimal(record.entry.valueMmolL), uk.bloodSugar.context[record.entry.context]);
          return (
            <li key={`${record.kind}-${record.timestamp}-${i}`} className="meal-compact-row">
              <span className="entry-time">{when}</span> · {what}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
