// Medicine diary (release 1.7, spec → "Daily records and the new Today"):
// her medicines, entered once (Medications tab), and each intake
// (MedicationLog tab). A plain diary — no dose suggestions, no warnings
// (not a medical app). Same header-name row mapping as the other tabs.
import { newRecordId } from "./itemIds";
import { upsertRecord } from "./recordStore";
import { buildColumnIndex, buildRow, cell, columnLetter, parseTab, SCAN_LAST_COLUMN, type ColumnIndex } from "./sheetRow";

export interface Medication {
  id: string; // M1, M2… (see itemIds.ts)
  name: string;
  dose: number | null; // the usual dose; null = not set
  unit: string; // мг, таб., мл…
  notes: string;
  active: boolean; // still taking it — inactive ones are hidden from the picker
  dateAdded: string;
}

export interface MedicationIntake {
  /** Row ID (release 2.0), shared across devices; absent only on a row not yet given one. */
  id?: string;
  timestamp: string; // ISO — when it was taken (editable)
  medicationId: string;
  medicationName: string; // readable snapshot
  dose: number | null;
  unit: string;
  notes: string;
}

export const MEDICATIONS_HEADERS = ["Id", "Name", "Dose", "Unit", "Notes", "Active", "DateAdded", "UpdatedAt"] as const;
export const MEDICATION_LOG_HEADERS = ["Timestamp", "MedicationId", "Medication", "Dose", "Unit", "Notes", "Id", "UpdatedAt"] as const;
const MEDS_INDEX = buildColumnIndex(MEDICATIONS_HEADERS);
const LOG_INDEX = buildColumnIndex(MEDICATION_LOG_HEADERS);
export const MEDICATIONS_RANGE = `A1:${SCAN_LAST_COLUMN}500`;
export const MEDICATION_LOG_RANGE = `A1:${SCAN_LAST_COLUMN}5000`;

/** A dose typed or stored with either decimal separator; blank → null. */
export function parseDose(value: unknown): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  return value === true || String(value).trim().toUpperCase() === "TRUE";
}

export function rowToMedication(row: unknown[], columnIndex: ColumnIndex = MEDS_INDEX): Medication {
  return {
    id: String(cell(row, columnIndex, "Id") ?? "").trim(),
    name: String(cell(row, columnIndex, "Name") ?? "").trim(),
    dose: parseDose(cell(row, columnIndex, "Dose")),
    unit: String(cell(row, columnIndex, "Unit") ?? "").trim(),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
    active: toBoolean(cell(row, columnIndex, "Active"), true),
    dateAdded: String(cell(row, columnIndex, "DateAdded") ?? ""),
  };
}

export function medicationToRow(m: Medication, columnIndex: ColumnIndex = MEDS_INDEX): unknown[] {
  return buildRow(
    { Id: m.id, Name: m.name, Dose: m.dose ?? "", Unit: m.unit, Notes: m.notes, Active: m.active, DateAdded: m.dateAdded },
    columnIndex,
  );
}

export function rowToIntake(row: unknown[], columnIndex: ColumnIndex = LOG_INDEX): MedicationIntake {
  return {
    timestamp: String(cell(row, columnIndex, "Timestamp") ?? ""),
    medicationId: String(cell(row, columnIndex, "MedicationId") ?? "").trim(),
    medicationName: String(cell(row, columnIndex, "Medication") ?? "").trim(),
    dose: parseDose(cell(row, columnIndex, "Dose")),
    unit: String(cell(row, columnIndex, "Unit") ?? "").trim(),
    notes: String(cell(row, columnIndex, "Notes") ?? ""),
    id: String(cell(row, columnIndex, "Id") ?? "").trim() || undefined,
  };
}

/** The MedicationLog fields of an intake (header → value). */
export function intakeFields(i: MedicationIntake): Record<string, unknown> {
  return {
      Timestamp: i.timestamp,
      MedicationId: i.medicationId,
      Medication: i.medicationName,
      Dose: i.dose ?? "",
      Unit: i.unit,
      Notes: i.notes,
    Id: i.id || null, // missing id → nothing written, so a rewrite keeps the row's ID
  };
}

export function intakeToRow(i: MedicationIntake, columnIndex: ColumnIndex = LOG_INDEX): unknown[] {
  return buildRow(intakeFields(i), columnIndex);
}

/** Her medicine list from the tab as read (header row first). */
export function parseMedications(rows: unknown[][]): Medication[] {
  const { columnIndex, dataRows } = parseTab("Medications", rows, MEDICATIONS_HEADERS);
  return dataRows
    .filter((r) => r.length > 0)
    .map((r) => rowToMedication(r, columnIndex))
    .filter((m) => m.name !== "");
}

/** Intakes from the tab as read (header row first). */
export function parseIntakes(rows: unknown[][]): MedicationIntake[] {
  const { columnIndex, dataRows } = parseTab("MedicationLog", rows, MEDICATION_LOG_HEADERS);
  return dataRows
    .filter((r) => r.length > 0)
    .map((r) => rowToIntake(r, columnIndex))
    .filter((i) => i.timestamp !== "");
}

/** Adds a medicine to her list with the next free `M…` ID and returns it as saved. */
// Saves go to the device first and reach the sheet with the next sync (recordStore.ts, release 2.0).
export async function addMedication(m: Omit<Medication, "id" | "dateAdded" | "active">): Promise<Medication> {
  const saved: Medication = { ...m, id: newRecordId("medication"), active: true, dateAdded: new Date().toISOString().slice(0, 10) };
  await upsertRecord("Medications", saved.id, { Name: saved.name, Dose: saved.dose ?? "", Unit: saved.unit, Notes: saved.notes, Active: saved.active, DateAdded: saved.dateAdded });
  return saved;
}

export async function addIntake(intake: MedicationIntake): Promise<MedicationIntake> {
  const saved: MedicationIntake = { ...intake, id: intake.id ?? newRecordId("intake") };
  await upsertRecord("MedicationLog", saved.id!, intakeFields(saved));
  return saved;
}

/**
 * The write replacing `original` with `updated`, or null if it isn't in the
 * sheet any more. Intakes have no row ID, so the row is found by content
 * (time + medicine + dose) — the same approach as blood sugar readings.
 */
export function planIntakeUpdate(
  original: MedicationIntake,
  updated: MedicationIntake,
  dataRows: unknown[][],
  columnIndex: ColumnIndex,
  firstDataRow = 2,
): { range: string; values: unknown[][] } | null {
  const rowIndex = dataRows.findIndex((row) => {
    const e = rowToIntake(row, columnIndex);
    return e.timestamp === original.timestamp && e.medicationName === original.medicationName && e.dose === original.dose;
  });
  if (rowIndex < 0) return null;
  const rowNumber = rowIndex + firstDataRow;
  const lastCol = columnLetter(Math.max(...columnIndex.values()));
  return { range: `MedicationLog!A${rowNumber}:${lastCol}${rowNumber}`, values: [intakeToRow(updated, columnIndex)] };
}

/** Rewrites one intake in place. Throws if it can't be found (e.g. changed on another device meanwhile). */
export async function updateIntake(original: MedicationIntake, updated: MedicationIntake): Promise<void> {
  if (!original.id) throw new Error("MedicationLog entry has no ID yet — sync first");
  await upsertRecord("MedicationLog", original.id, intakeFields({ ...updated, id: original.id }));
}

/** "Форксига 10 мг" — the name, with dose and unit when there is a dose. */
export function intakeLabel(i: Pick<MedicationIntake, "medicationName" | "dose" | "unit">): string {
  if (i.dose === null) return i.medicationName;
  return `${i.medicationName} ${String(i.dose).replace(".", ",")}${i.unit ? ` ${i.unit}` : ""}`;
}
