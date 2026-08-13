// Google Sheets client wrapper — the app's database and cross-device sync layer.
// Needs VITE_GOOGLE_CLIENT_ID and VITE_SPREADSHEET_ID (see .env.example and
// docs/technical-spec.md -> "Google Sheets API integration" for one-time setup).
//
// Auth uses Google Identity Services' token client (public SPA flow, no
// client secret) — see docs/technical-spec.md -> "Google auth approach".

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

interface TokenResponse {
  access_token?: string;
  error?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (options?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

/** Loads the Google Identity Services script and prepares the OAuth token client. */
export async function initGoogleAuth(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("initGoogleAuth: VITE_GOOGLE_CLIENT_ID is not set");
  }

  await loadGisScript();
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SHEETS_SCOPE,
    callback: () => {}, // overridden per-call in signIn()
  });
}

export function signIn(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("signIn: call initGoogleAuth() first"));
      return;
    }

    tokenClient.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error ?? "signIn: no access token returned"));
        return;
      }
      accessToken = response.access_token;
      resolve();
    };
    tokenClient.requestAccessToken();
  });
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
  const response = await fetch(`${SHEETS_API_BASE}/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    // fetch() only rejects on network failure, not HTTP error status — without
    // this check, a failed Sheets API call (bad range, permission error, etc.)
    // silently does nothing and callers proceed as if it had succeeded.
    const body = await response.text().catch(() => "");
    let message = `Sheets API request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message += ` — ${parsed.error.message}`;
    } catch {
      if (body) message += ` — ${body}`;
    }
    throw new Error(message);
  }

  return response;
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

/**
 * Updates one or more existing ranges in a single request, e.g. overwriting
 * specific Settings rows in place. Each `range` must include the tab name,
 * e.g. "Settings!B3".
 */
export async function batchUpdateRanges(updates: { range: string; values: unknown[][] }[]): Promise<void> {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID;
  await authorizedFetch(`${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    }),
  });
}
