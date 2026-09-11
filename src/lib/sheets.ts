// Google Sheets client wrapper — the app's database and cross-device sync layer.
// Needs VITE_GOOGLE_CLIENT_ID and VITE_SPREADSHEET_ID (see .env.example and
// docs/technical-spec.md -> "Google Sheets API integration" for one-time setup).
//
// Auth branches by platform:
// - Web/PWA: Google Identity Services' token client (public SPA flow, no
//   client secret) — see docs/technical-spec.md -> "Google auth approach".
// - Android (Capacitor): GIS's flow can't complete inside an embedded
//   WebView — Google blocks OAuth there outright (an anti-phishing policy,
//   confirmed live as an "Error 400" during the 2026-09-10 Android build
//   session). Uses the system browser + Authorization Code + PKCE instead
//   (RFC 8252, Google's own recommended pattern for installed apps), via a
//   second OAuth client (VITE_GOOGLE_ANDROID_CLIENT_ID, "Android" type —
//   tried "Desktop app" type first, but Google's "secure response handling"
//   policy rejects a custom-scheme redirect_uri for that type since it can't
//   verify which app owns the scheme; "Android" type verifies via package
//   name + signing certificate instead, and — bonus — issues no client
//   secret at all, so this path ends up fully secret-free too. See
//   docs/technical-spec.md for the full story).
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files";
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
// drive.file (added for the "create a new spreadsheet from the app" flow —
// see createSpreadsheetInAppFolder below) only grants access to files this
// app itself creates or that the user opens through a Google file picker —
// it does NOT grant blanket access to the rest of Drive, and it doesn't
// affect the existing "connect an existing spreadsheet by pasting a link"
// flow at all, which relies entirely on the spreadsheets scope already
// granting full read/write on any spreadsheet the signed-in account can open.
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
// Matches the intent-filter added to android/app/src/main/AndroidManifest.xml
// and the custom_url_scheme already declared in strings.xml by Capacitor.
// Single slash (opaque URI, no host/authority) deliberately — Google's
// server-side redirect_uri validator for "Android" type clients rejected the
// double-slash form (ca.roncreator.trackmymeals://oauth2redirect) with
// "Error 400: invalid_request" citing its "secure response handling" policy;
// a single slash matches the convention Google's own AppAuth-Android library
// uses for this exact scenario.
const NATIVE_REDIRECT_URI = "ca.roncreator.trackmymeals:/oauth2redirect";

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

// --- Native (Android/Capacitor) sign-in: system browser + PKCE ---

let nativeRedirectListenerRegistered = false;
let pendingNativeSignIn: { verifier: string; resolve: () => void; reject: (err: Error) => void } | null = null;

// Persisted across app restarts (unlike accessToken, which is deliberately
// memory-only — see the file-top comment) so the app can silently re-sign-in
// on launch instead of requiring an interactive sign-in every time it's
// opened. Native-only: the web flow was never the source of this friction
// (a browser tab typically stays open across a session already), so it's
// left as-is rather than changing behavior nobody asked to change. Google
// expires these after 7 days while this app's OAuth consent screen remains
// in "Testing" publishing status — a real Google policy, not a bug here;
// moving to "In production" (a separate step from Play Store distribution)
// would lift that, but needs its own verification review.
const REFRESH_TOKEN_STORAGE_KEY = "trackmymeals.refreshToken";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function exchangeCodeForToken(code: string, verifier: string): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // No client_secret — "Android" type OAuth clients don't have one;
    // verification happens via the app's package name + signing certificate
    // instead (that's what makes the custom-scheme redirect_uri acceptable
    // to Google in the first place — see the top-of-file comment).
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: NATIVE_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Token exchange failed: ${response.status}${body ? ` — ${body}` : ""}`);
  }

  const data = await response.json();
  if (!data.access_token) throw new Error("Token exchange: no access_token returned");
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refresh_token);
  return data.access_token as string;
}

/**
 * Silently exchanges the stored refresh token for a new access token — no
 * browser, no user interaction. Used both at app launch (to restore a
 * session without an interactive sign-in) and by authorizedFetch on a 401
 * (to recover from an expired access token mid-session, e.g. after the app
 * sat backgrounded for over an hour). Returns false (and clears the stored
 * refresh token, since it's presumably invalid/revoked/expired) rather than
 * throwing, so callers can fall back to a normal interactive sign-in.
 */
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) return false;

  const clientId = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });

  if (!response.ok) {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    return false;
  }

  const data = await response.json();
  if (!data.access_token) {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    return false;
  }
  accessToken = data.access_token as string;
  return true;
}

/** Handles the redirect back into the app after the system browser completes sign-in. */
async function handleNativeRedirect(url: string): Promise<void> {
  if (!url.startsWith(NATIVE_REDIRECT_URI)) return; // not our redirect — ignore

  const pending = pendingNativeSignIn;
  pendingNativeSignIn = null;
  await Browser.close().catch(() => {}); // best-effort; the tab may already be closing itself
  if (!pending) return; // stray/duplicate redirect with nothing waiting on it

  try {
    const params = new URL(url).searchParams;
    const error = params.get("error");
    const code = params.get("code");
    if (error) throw new Error(`Google sign-in error: ${error}`);
    if (!code) throw new Error("Google sign-in: no authorization code returned");
    accessToken = await exchangeCodeForToken(code, pending.verifier);
    pending.resolve();
  } catch (err) {
    pending.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

function signInNative(): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const clientId = import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID;
        if (!clientId) throw new Error("signIn: VITE_GOOGLE_ANDROID_CLIENT_ID is not set");

        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);

        const authUrl = new URL(AUTH_ENDPOINT);
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", NATIVE_REDIRECT_URI);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", SHEETS_SCOPE);
        authUrl.searchParams.set("code_challenge", challenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        // access_type=offline requests a refresh token; prompt=consent forces
        // Google to actually issue one — without it, Google only returns a
        // refresh token on a user's very first-ever authorization of this
        // client+scope, silently omitting it on every sign-in after that.
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");

        pendingNativeSignIn = { verifier, resolve, reject };
        await Browser.open({ url: authUrl.toString() });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    })();
  });
}

// --- Web (GIS) sign-in ---

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

/** Prepares Google sign-in for whichever platform this is running on. On native, also attempts a silent sign-in from a stored refresh token — check isSignedIn() after this resolves. */
export async function initGoogleAuth(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (!nativeRedirectListenerRegistered) {
      nativeRedirectListenerRegistered = true;
      App.addListener("appUrlOpen", (data) => void handleNativeRedirect(data.url));
    }
    await refreshAccessToken();
    return;
  }

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
  if (Capacitor.isNativePlatform()) return signInNative();

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
  // No-op if never set (e.g. on web) — removeItem on a missing key is safe.
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

// --- Spreadsheet selection ---
//
// VITE_SPREADSHEET_ID is a single value baked into the build at compile
// time — fine while this app had exactly one user, but every install (this
// developer's phone, mom's phone, ...) shares one binary, so a build-time
// value can only ever point everyone at the same spreadsheet. A per-device
// override, entered once in Settings and kept in localStorage (persists
// across app restarts, private to this device, no new dependency needed —
// works the same in a browser tab and inside the Capacitor WebView), lets
// each install point at its own spreadsheet while the env var remains a
// reasonable default for local development.
const SPREADSHEET_ID_STORAGE_KEY = "trackmymeals.spreadsheetId";

/** Pulls the spreadsheet ID out of a pasted Google Sheets URL, or returns the input as-is if it's already a bare ID. */
export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

export function getSpreadsheetId(): string {
  return localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY) || import.meta.env.VITE_SPREADSHEET_ID;
}

export function setSpreadsheetId(urlOrId: string): void {
  localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, parseSpreadsheetId(urlOrId));
}

/** Mom's real sheet — the "connect Mom's sheet" button points here, if configured. */
export function getMomSpreadsheetId(): string {
  return import.meta.env.VITE_DEFAULT_SPREADSHEET_ID;
}

/**
 * The stable test sheet real testers connect to — same value
 * VITE_SPREADSHEET_ID already falls back to when no per-device override is
 * set (see getSpreadsheetId above), just exposed as an explicit one-tap
 * button too. Kept matching whatever the currently-released app build
 * expects — schema changes during active development target
 * getDevSpreadsheetId() below instead, never this one, so testers on the
 * released build are never affected by in-progress work.
 */
export function getTestSpreadsheetId(): string {
  return import.meta.env.VITE_SPREADSHEET_ID;
}

/**
 * The spreadsheet actual schema/data changes get tried against during
 * active development — separate from getTestSpreadsheetId() specifically so
 * in-progress schema work never risks breaking what real testers are using
 * with the currently-released build (added 2026-09-11, after the
 * header-based reorder-resilience refactor made schema experiments on a
 * shared sheet feel materially riskier).
 */
export function getDevSpreadsheetId(): string {
  return import.meta.env.VITE_DEV_SPREADSHEET_ID;
}

export function getSpreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/** Authorized fetch against an arbitrary absolute URL — the shared retry/error-handling logic behind both authorizedFetch (Sheets API) and the Drive API calls below. */
async function authorizedFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  if (!accessToken) {
    throw new Error("Not signed in — call signIn() first");
  }
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    });

  let response = await doFetch();

  // A 401 usually just means the ~1hr access token expired mid-session —
  // e.g. the app sat backgrounded for a while. Try one silent refresh (a
  // no-op if there's no stored refresh token, which is the case on web)
  // before giving up, so a long-idle app doesn't need a full interactive
  // re-sign-in just to make its next request.
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await doFetch();
  }

  if (!response.ok) {
    // fetch() only rejects on network failure, not HTTP error status — without
    // this check, a failed Sheets API call (bad range, permission error, etc.)
    // silently does nothing and callers proceed as if it had succeeded.
    const body = await response.text().catch(() => "");
    let message = `Google API request failed: ${response.status}`;
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

async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  return authorizedFetchUrl(`${SHEETS_API_BASE}/${path}`, init);
}

// --- Offline read fallback ---
//
// Writes deliberately still fail outright with no connection (queueing and
// replaying writes safely — handling conflicts, retries, partial failures —
// is a real sync-engine project of its own, not something to bolt on
// quickly; a clear "try again" error beats a write that silently never
// actually saved). Reads are different: falling back to whatever was last
// successfully fetched is safe (nothing to lose) and means the app stays
// usable — viewing today's log, targets, history — when the connection
// drops, instead of going blank. Scoped per spreadsheet (via getSpreadsheetId())
// so switching which sheet a device points at can't show stale data from
// the wrong one.
const READ_CACHE_PREFIX = "trackmymeals.cache.";
let lastReadWasFromCache = false;

function readCacheKey(tab: string, range: string): string {
  return `${READ_CACHE_PREFIX}${getSpreadsheetId()}:${tab}:${range}`;
}

/** True if the most recent readRange() call fell back to cached data instead of a live fetch — check after fetching to decide whether to show an "offline" hint. */
export function wasLastReadFromCache(): boolean {
  return lastReadWasFromCache;
}

/** Reads a range, e.g. readRange("Ingredients", "A1:L200"). Falls back to the last successful read for this exact tab/range if the network is unreachable — see the comment above. */
export async function readRange(tab: string, range: string): Promise<unknown[][]> {
  const spreadsheetId = getSpreadsheetId();
  const key = readCacheKey(tab, range);
  try {
    const response = await authorizedFetch(`${spreadsheetId}/values/${tab}!${range}`);
    const data = await response.json();
    const values = data.values ?? [];
    localStorage.setItem(key, JSON.stringify(values));
    lastReadWasFromCache = false;
    return values;
  } catch (err) {
    // Only fall back for a genuine network failure — fetch() itself throws a
    // TypeError when it can't reach the server at all (no connectivity, DNS
    // failure, CORS block). An HTTP error status (bad permissions, a bad
    // range, an expired session that couldn't be refreshed) resolves fine
    // and is surfaced by authorizedFetch as a plain Error instead — that's a
    // real problem a stale cache should never quietly paper over.
    if (err instanceof TypeError) {
      const cached = localStorage.getItem(key);
      if (cached) {
        lastReadWasFromCache = true;
        return JSON.parse(cached);
      }
    }
    throw err;
  }
}

/** Appends rows to a tab, e.g. writeRange("DailyLog", "A:J", [[...]]). */
export async function writeRange(tab: string, range: string, values: unknown[][]): Promise<void> {
  const spreadsheetId = getSpreadsheetId();
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
  const spreadsheetId = getSpreadsheetId();
  await authorizedFetch(`${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    }),
  });
}

// --- Blank-spreadsheet initialization ---
//
// A genuinely blank Google Sheet only has its own single default tab —
// connecting one fails every read this app makes (each data module
// hardcodes its own tab name/range), confirmed as a real gap once real
// testers connected a fresh sheet rather than the pre-built template (see
// docs/build-log.md, 2026-09-11). See spreadsheetInit.ts for the flow that
// uses these two primitives.

/** Lists a spreadsheet's existing tab (sheet) titles. */
export async function listSheetTitles(): Promise<string[]> {
  const spreadsheetId = getSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}?fields=sheets.properties.title`);
  const data = await response.json();
  const sheets = (data.sheets ?? []) as { properties: { title: string } }[];
  return sheets.map((s) => s.properties.title);
}

/** The connected spreadsheet's own display name (its title in Drive/Sheets) — lets Settings show something more recognizable than a bare ID. */
export async function getSpreadsheetName(): Promise<string> {
  const spreadsheetId = getSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}?fields=properties.title`);
  const data = await response.json();
  return String(data.properties?.title ?? "");
}

/**
 * Adds new tabs to the spreadsheet by title. Additive only — never touches
 * or removes any existing tab, including a blank spreadsheet's lone default
 * one, so it's safe to run against a sheet that already has other content.
 */
export async function addSheetTabs(titles: string[]): Promise<void> {
  if (titles.length === 0) return;
  const spreadsheetId = getSpreadsheetId();
  await authorizedFetch(`${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: titles.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
}

// --- Creating a brand-new spreadsheet from the app ---
//
// Lets someone start using this app without first building a spreadsheet by
// hand (the flow above already covers the "I already have a spreadsheet"
// case). New files go inside a single app-owned Drive folder rather than
// Drive's root, using the drive.file scope (see SHEETS_SCOPE above) — the
// narrowest scope that can do this, since it only grants access to files
// this app itself creates. The caller is responsible for calling
// spreadsheetInit.ts's initializeSpreadsheet() afterward to populate the new
// (still blank) file's tabs — this module only creates the empty file.

const APP_FOLDER_NAME = "Track My Meals";

async function findAppFolder(): Promise<string | null> {
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${APP_FOLDER_NAME}' and 'root' in parents and trashed=false`,
  );
  const response = await authorizedFetchUrl(`${DRIVE_API_BASE}?q=${query}&fields=files(id)`);
  const data = await response.json();
  const files = (data.files ?? []) as { id: string }[];
  return files[0]?.id ?? null;
}

async function createAppFolder(): Promise<string> {
  const response = await authorizedFetchUrl(DRIVE_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: ["root"] }),
  });
  const data = await response.json();
  return data.id as string;
}

/** Finds this app's Drive folder (by its fixed name, in Drive root), creating it on first use. */
async function findOrCreateAppFolder(): Promise<string> {
  const existing = await findAppFolder();
  return existing ?? createAppFolder();
}

/**
 * Creates a brand-new, blank spreadsheet with the given name inside this
 * app's Drive folder, and returns its ID. The file is blank (a single
 * default tab, no data) exactly like any other new Google Sheet — the
 * caller must still call initializeSpreadsheet() to give it this app's 5
 * tabs, same as connecting any other blank spreadsheet.
 */
export async function createSpreadsheetInAppFolder(name: string): Promise<string> {
  const folderId = await findOrCreateAppFolder();
  const response = await authorizedFetchUrl(DRIVE_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet", parents: [folderId] }),
  });
  const data = await response.json();
  return data.id as string;
}
