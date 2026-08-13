// Google Sheets client wrapper — the app's database and cross-device sync layer.
// Needs VITE_GOOGLE_CLIENT_ID and VITE_SPREADSHEET_ID (see .env.example and
// docs/technical-spec.md -> "Google Sheets API integration" for one-time setup).

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

let accessToken: string | null = null;

/** Loads the Google Identity Services script and prepares the OAuth token client. */
export function initGoogleAuth(): void {
  throw new Error("initGoogleAuth: not implemented yet — needs VITE_GOOGLE_CLIENT_ID configured");
}

export function signIn(): Promise<void> {
  throw new Error("signIn: not implemented yet");
}

export function signOut(): void {
  accessToken = null;
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) {
    throw new Error("Not signed in — call signIn() first");
  }
  return fetch(`${SHEETS_API_BASE}/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
}

/** Reads a range, e.g. readRange("Ingredients", "A1:L200"). */
export async function readRange(tab: string, range: string): Promise<unknown[][]> {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;
  const response = await authorizedFetch(`${spreadsheetId}/values/${tab}!${range}`);
  const data = await response.json();
  return data.values ?? [];
}

/** Appends rows to a tab, e.g. writeRange("DailyLog", "A:J", [[...]]). */
export async function writeRange(tab: string, range: string, values: unknown[][]): Promise<void> {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;
  await authorizedFetch(`${spreadsheetId}/values/${tab}!${range}:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
}
