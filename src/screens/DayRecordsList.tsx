// Blood sugar readings and medicine intakes in one timeline (release 1.7) —
// on Сьогодні (editable, with yesterday's last medicine small at the end of
// the list) and in Історія (read-only). The former Цукор screen's "meals
// before this reading" expander is gone: the day's meals are on the same
// screen now (developer, 2026-10-04).
import { uk } from "../i18n/uk";
import { checkBloodSugarRange } from "../lib/health";
import { formatTime } from "../lib/dateFormat";
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
  yesterdayLastIntake,
  yesterdayFirst = false,
  onEditSugar,
  onEditIntake,
}: {
  records: DayRecord[];
  settings: Settings | null;
  /** Shown small and read-only — yesterday's medicine affects today's sugar. */
  yesterdayLastIntake?: MedicationIntake | null;
  /** Oldest-first order puts yesterday's record before today's. */
  yesterdayFirst?: boolean;
  onEditSugar?: (entry: BloodSugarEntry) => void;
  onEditIntake?: (intake: MedicationIntake) => void;
}) {
  const yesterday = yesterdayLastIntake ? (
    <li key="yesterday" className="record-yesterday">
      {uk.records.yesterdayMedication(formatTime(yesterdayLastIntake.timestamp), intakeLabel(yesterdayLastIntake))}
    </li>
  ) : null;

  return (
    <ul className="food-list records-list">
      {yesterdayFirst && yesterday}
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
      {!yesterdayFirst && yesterday}
    </ul>
  );
}
