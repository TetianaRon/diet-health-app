// Everything Сьогодні and Історія show, read in ONE request (values:batchGet)
// instead of one per tab — Google allows about 60 reads per minute per user,
// and these screens re-read on every app resume (release 1.7).
import { readRanges } from "./sheets";
import { parseTab, SCAN_LAST_COLUMN } from "./sheetRow";
import { INGREDIENTS_HEADERS, rowToIngredient, type Ingredient } from "./ingredients";
import { DISHES_HEADERS, rowToDish, type Dish } from "./dishes";
import { DAILY_LOG_HEADERS, rowToLogEntry, type DailyLogEntry } from "./dailyLog";
import { BLOOD_SUGAR_HEADERS, rowToBloodSugarEntry, type BloodSugarEntry } from "./bloodSugar";
import { parseSettingsRows, SETTINGS_RANGE, type Settings } from "./settings";
import { setTimeFormat } from "./dateFormat";
import { MEDICATION_LOG_RANGE, MEDICATIONS_RANGE, parseIntakes, parseMedications, type Medication, type MedicationIntake } from "./medications";
import { parseWeightEntries, WEIGHT_RANGE, type WeightEntry } from "./weight";

export interface DayData {
  ingredients: Ingredient[];
  dishes: Dish[];
  settings: Settings;
  logEntries: DailyLogEntry[];
  bloodSugar: BloodSugarEntry[];
  medications: Medication[];
  intakes: MedicationIntake[];
  weights: WeightEntry[];
}

const LONG = `A1:${SCAN_LAST_COLUMN}5000`;
const SHORT = `A1:${SCAN_LAST_COLUMN}1000`;

function parseRows<T>(tab: string, rows: unknown[][], headers: readonly string[], toItem: (row: unknown[], index: Map<string, number>) => T): T[] {
  const { columnIndex, dataRows } = parseTab(tab, rows, headers);
  return dataRows.filter((row) => row.length > 0).map((row) => toItem(row, columnIndex));
}

const CORE_TABS = [
  { tab: "Ingredients", range: SHORT },
  { tab: "Dishes", range: SHORT },
  { tab: "Settings", range: SETTINGS_RANGE },
  { tab: "DailyLog", range: LONG },
  { tab: "BloodSugar", range: LONG },
];
// Added in 1.7. On the first open after the update the screen can load
// before the silent upgrade has created them — asking for a tab that doesn't
// exist fails the whole batch, so then they're read as empty and the screen
// reloads once the upgrade has run (SheetHealthContext remounts it).
const NEW_TABS = [
  { tab: "Medications", range: MEDICATIONS_RANGE },
  { tab: "MedicationLog", range: MEDICATION_LOG_RANGE },
  { tab: "Weight", range: WEIGHT_RANGE },
];

async function readAll(): Promise<unknown[][][]> {
  try {
    return await readRanges([...CORE_TABS, ...NEW_TABS]);
  } catch (err) {
    if (!(err instanceof Error) || !/Unable to parse range/i.test(err.message)) throw err;
    const core = await readRanges(CORE_TABS);
    return [...core, ...NEW_TABS.map(() => [])];
  }
}

export async function loadDayData(): Promise<DayData> {
  const [ingredients, dishes, settings, log, sugar, meds, intakes, weights] = await readAll();
  const parsedSettings = parseSettingsRows(settings);
  // Same side effect as getSettings(): formatTime() follows the setting.
  setTimeFormat(parsedSettings.timeFormat);
  return {
    ingredients: parseRows("Ingredients", ingredients, INGREDIENTS_HEADERS, rowToIngredient),
    dishes: parseRows("Dishes", dishes, DISHES_HEADERS, rowToDish),
    settings: parsedSettings,
    logEntries: parseRows("DailyLog", log, DAILY_LOG_HEADERS, rowToLogEntry),
    bloodSugar: parseRows("BloodSugar", sugar, BLOOD_SUGAR_HEADERS, rowToBloodSugarEntry),
    medications: meds.length ? parseMedications(meds) : [],
    intakes: intakes.length ? parseIntakes(intakes) : [],
    weights: weights.length ? parseWeightEntries(weights) : [],
  };
}
