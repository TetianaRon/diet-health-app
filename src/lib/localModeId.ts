// The "spreadsheet" a phone uses when it works without Google (release 2.0):
// its data lives only in the device database named after this ID. Kept free of
// imports so the lowest layers (sheets.ts) can check it without import cycles.
export const LOCAL_SHEET_ID = "local";

export function isLocalSheetId(spreadsheetId: string): boolean {
  return spreadsheetId === LOCAL_SHEET_ID;
}
