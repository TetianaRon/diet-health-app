// The spreadsheet tabs the app uses. Kept free of imports so any module
// (sync included) can use it without import cycles.
// Medications, MedicationLog and Weight since 1.7, Deleted since 2.0 — on an
// existing sheet they're created silently by the upgrade (a missing tab is additive).
export const REQUIRED_TABS = ["Ingredients", "Dishes", "DailyLog", "BloodSugar", "Medications", "MedicationLog", "Weight", "Deleted", "Settings"] as const;
