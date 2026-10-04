// Blood sugar readings and medicine intakes in one timeline (release 1.7) —
// on Сьогодні (editable, with yesterday's last medicine small at the end of
// the list) and in Історія (read-only). Each reading can still open the
// meals eaten before it (the feature from the former Цукор screen).
import { useState } from "react";
import { uk } from "../i18n/uk";
import { checkBloodSugarRange } from "../lib/health";
import { formatTime } from "../lib/dateFormat";
import { formatDecimal } from "../lib/numberFormat";
import { mealsBeforeTimestamp, type DailyLogEntry } from "../lib/dailyLog";
import { intakeLabel, type MedicationIntake } from "../lib/medications";
import type { DayRecord } from "../lib/records";
import type { BloodSugarEntry } from "../lib/bloodSugar";
import type { Settings } from "../lib/settings";

function statusLabel(entry: BloodSugarEntry, settings: Settings): string | null {
  const check = checkBloodSugarRange(entry.valueMmolL, settings.bloodSugarMin, settings.bloodSugarMax);
  if (check.tooLow) return uk.bloodSugar.status.tooLow;
  if (check.tooHigh) return uk.bloodSugar.status.tooHigh;
  return null;
}

function hoursBefore(mealTimestamp: string, readingTimestamp: string): string {
  const hours = (new Date(readingTimestamp).getTime() - new Date(mealTimestamp).getTime()) / (1000 * 60 * 60);
  return hours < 1 ? uk.bloodSugar.mealsBefore.lessThanHourAgo : uk.bloodSugar.mealsBefore.hoursAgo(hours);
}

export default function DayRecordsList({
  records,
  settings,
  logEntries,
  yesterdayLastIntake,
  yesterdayFirst = false,
  onEditSugar,
  onEditIntake,
}: {
  records: DayRecord[];
  settings: Settings | null;
  logEntries: DailyLogEntry[];
  /** Shown small and read-only — yesterday's medicine affects today's sugar. */
  yesterdayLastIntake?: MedicationIntake | null;
  /** Oldest-first order puts yesterday's record before today's. */
  yesterdayFirst?: boolean;
  onEditSugar?: (entry: BloodSugarEntry) => void;
  onEditIntake?: (intake: MedicationIntake) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

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
                {onEditIntake && (
                  <button
                    type="button"
                    className="button-secondary meal-edit-button"
                    aria-label={uk.records.editMedicationLabel(time)}
                    onClick={() => onEditIntake(record.intake)}
                  >
                    {uk.bloodSugar.editButton}
                  </button>
                )}
              </div>
              {record.intake.notes && <p className="food-name-en">{record.intake.notes}</p>}
            </li>
          );
        }
        const entry = record.entry;
        const flag = settings ? statusLabel(entry, settings) : null;
        const key = `s-${entry.timestamp}-${i}`;
        const isExpanded = expanded === key;
        const meals = isExpanded ? mealsBeforeTimestamp(logEntries, entry.timestamp) : [];
        return (
          <li key={key} className="record-row">
            <div className="meal-header">
              <p>
                <strong className="reading-time">{time}</strong> ·{" "}
                <strong>{uk.records.sugarLine(formatDecimal(entry.valueMmolL), uk.bloodSugar.context[entry.context])}</strong>
                {flag && <span className="blood-sugar-flag"> — {flag}</span>}
              </p>
              {onEditSugar && (
                <button
                  type="button"
                  className="button-secondary meal-edit-button"
                  aria-label={uk.bloodSugar.editEntryLabel(time)}
                  onClick={() => onEditSugar(entry)}
                >
                  {uk.bloodSugar.editButton}
                </button>
              )}
            </div>
            {entry.notes && <p className="food-name-en">{entry.notes}</p>}
            <button type="button" className="link-button" onClick={() => setExpanded(isExpanded ? null : key)}>
              {isExpanded ? "▾ " : "▸ "}
              {uk.bloodSugar.mealsBefore.toggleLabel}
            </button>
            {isExpanded &&
              (meals.length === 0 ? (
                <p className="food-form-hint">{uk.bloodSugar.mealsBefore.empty}</p>
              ) : (
                <ul className="food-list meals-before-list">
                  {meals.map((meal) => (
                    <li key={meal.mealId}>
                      <strong>{meal.mealType}</strong> ({meal.entries.map((e) => e.itemName).join(", ")}) —{" "}
                      {hoursBefore(meal.timestamp, entry.timestamp)}
                    </li>
                  ))}
                </ul>
              ))}
          </li>
        );
      })}
      {!yesterdayFirst && yesterday}
    </ul>
  );
}
