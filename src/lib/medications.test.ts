import { describe, expect, it } from "vitest";
import {
  intakeLabel,
  intakeToRow,
  medicationToRow,
  parseDose,
  parseIntakes,
  parseMedications,
  planIntakeUpdate,
  rowToIntake,
  rowToMedication,
  type Medication,
  type MedicationIntake,
} from "./medications";
import { buildColumnIndex } from "./sheetRow";

const med: Medication = { id: "M1", name: "Форксига", dose: 10, unit: "мг", notes: "", active: true, dateAdded: "2026-10-05" };
const intake: MedicationIntake = {
  timestamp: "2026-10-05T05:30:00.000Z",
  medicationId: "M1",
  medicationName: "Форксига",
  dose: 10,
  unit: "мг",
  notes: "",
};

describe("parseDose", () => {
  it("reads either separator, blank as null", () => {
    expect(parseDose("2,5")).toBe(2.5);
    expect(parseDose(10)).toBe(10);
    expect(parseDose("")).toBeNull();
    expect(parseDose("abc")).toBeNull();
  });
});

describe("rows", () => {
  it("round-trip medicines and intakes", () => {
    expect(rowToMedication(medicationToRow(med))).toEqual(med);
    expect(rowToIntake(intakeToRow(intake))).toEqual(intake);
  });

  it("treats a blank Active cell as still taking it", () => {
    expect(rowToMedication(["M2", "Аспірин", "", "", "", "", ""]).active).toBe(true);
    expect(rowToMedication(["M2", "Аспірин", "", "", "", false, ""]).active).toBe(false);
  });

  it("parse tabs with a readable-names row, skipping unnamed/blank rows", () => {
    const medRows = [["Id", "Name", "Dose", "Unit", "Notes", "Active", "DateAdded"], ["Ідентифікатор", "Назва", "Доза", "Одиниця", "Примітки", "Приймаю зараз", "Дата додавання"], medicationToRow(med), ["M9", "", "", "", "", "", ""]];
    expect(parseMedications(medRows)).toEqual([med]);
    const logRows = [["Timestamp", "MedicationId", "Medication", "Dose", "Unit", "Notes"], intakeToRow(intake), ["", "", "", "", "", ""]];
    expect(parseIntakes(logRows)).toEqual([intake]);
  });
});

describe("planIntakeUpdate", () => {
  it("finds the intake by time, medicine and dose", () => {
    const index = buildColumnIndex(["Timestamp", "MedicationId", "Medication", "Dose", "Unit", "Notes"]);
    const other = { ...intake, timestamp: "2026-10-04T19:00:00.000Z" };
    const update = planIntakeUpdate(intake, { ...intake, dose: 5 }, [intakeToRow(other, index), intakeToRow(intake, index)], index, 3);
    expect(update?.range).toBe("MedicationLog!A4:F4");
    expect(planIntakeUpdate({ ...intake, dose: 99 }, intake, [intakeToRow(intake, index)], index)).toBeNull();
  });
});

describe("intakeLabel", () => {
  it("shows the dose with a decimal comma, or just the name", () => {
    expect(intakeLabel(intake)).toBe("Форксига 10 мг");
    expect(intakeLabel({ ...intake, dose: 2.5 })).toBe("Форксига 2,5 мг");
    expect(intakeLabel({ ...intake, dose: null })).toBe("Форксига");
  });
});
