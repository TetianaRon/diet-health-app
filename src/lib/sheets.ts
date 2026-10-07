// Google Sheets client wrapper — the app's database and cross-device sync layer.
// Needs VITE_GOOGLE_CLIENT_ID (see .env.example and docs/technical-spec.md ->
// "Google Sheets API integration" for one-time setup). Which spreadsheet is
// used is chosen per device (see "Spreadsheet selection" below).
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
import { knownSheetIds } from "./sheetConnections";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { uk } from "../i18n/uk";
import { forgetDeviceCopies, getLocalMeta, getLocalTab, getOpenSpreadsheetId, listLocalChanges, openLocalDb, putLocalTabs, setLocalMeta } from "./localDb";
import { applyChanges, type RecordChange } from "./sync/merge";
import { sliceGrid, tabsOfRanges } from "./localDb/a1";
import { isLocalSheetId } from "./localModeId";

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
  expires_in?: number | string;
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
            /** The sign-in window failed to open (blocked) or was closed without signing in. */
            error_callback?: (error: { type: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
/** Rejects the sign-in in progress when Google's window can't open or is closed (else it would wait forever). */
let rejectPendingSignIn: ((err: Error) => void) | null = null;
let accessToken: string | null = null;

// --- Session expiry (1.5.4, 2026-10-02) ---
//
// Google access tokens last about an hour. On the web there's no refresh
// token (by design, see below), so after that every request failed with a
// generic error while the app still looked signed in. Now the app tracks
// when the web token runs out, and on expiry — or a 401 that a refresh
// can't fix, on either platform — it drops the token and tells listeners
// (AuthContext), which show a "sign in again" banner. Screens are NOT
// switched to their signed-out view: that would unmount e.g. a meal being
// typed. Renewal can't be silent on the web: Google's token popup is
// blocked by browsers unless it follows a click, so the banner's button
// does it (with prompt "" — no consent screen again).
let accessTokenExpiresAt: number | null = null;
let sessionExpired = false;
const sessionExpiredListeners = new Set<() => void>();

/** Thrown when Google keeps refusing requests as too many per minute, even after waiting and retrying. */
export class RateLimitError extends Error {
  constructor() {
    super(uk.errors.rateLimited);
    this.name = "RateLimitError";
  }
}

// Google allows about 60 reads per minute per user. When it answers 429
// ("too many requests"), wait and try again — 1 s, 2 s, 4 s, Google's own
// recommended exponential backoff — before giving up with a readable message
// (seen 2026-10-04: the raw English error ended up on the Today screen).
const RATE_LIMIT_RETRY_DELAYS_MS = [1000, 2000, 4000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown by requests made after the sign-in expired — the message asks to sign in again and retry. */
export class SessionExpiredError extends Error {
  constructor() {
    super(uk.auth.sessionExpiredError);
    this.name = "SessionExpiredError";
  }
}

/** Subscribes to "the sign-in expired"; returns the unsubscribe function. */
export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

function expireSession(): void {
  accessToken = null;
  accessTokenExpiresAt = null;
  if (sessionExpired) return;
  sessionExpired = true;
  for (const listener of sessionExpiredListeners) listener();
}

/** Milliseconds until the web token expires (a minute early, to be safe), or null when unknown / native. */
export function msUntilTokenExpiry(): number | null {
  return accessTokenExpiresAt === null ? null : accessTokenExpiresAt - Date.now();
}

/** Expires the session now if the web token's time is up — call when the page becomes visible again. */
export function checkTokenExpiry(): void {
  if (accessToken !== null && accessTokenExpiresAt !== null && Date.now() >= accessTokenExpiresAt) expireSession();
}

/**
 * Android opened without a connection (release 2.0): the stored refresh token
 * couldn't be exchanged, but the person is signed in — the app runs on the
 * device copy, and the first request once online gets a fresh access token.
 */
let offlineSession = false;

function startSession(token: string, expiresInSeconds?: number | string): void {
  accessToken = token;
  offlineSession = false;
  const seconds = Number(expiresInSeconds);
  accessTokenExpiresAt = Number.isFinite(seconds) && seconds > 0 ? Date.now() + (seconds - 60) * 1000 : null;
  sessionExpired = false;
}

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
  startSession(data.access_token as string);
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
    startSession(await exchangeCodeForToken(code, pending.verifier));
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
    try {
      await refreshAccessToken();
    } catch (err) {
      // fetch() throws a TypeError only when it can't reach Google at all.
      if (!(err instanceof TypeError) || !localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) throw err;
      offlineSession = true;
    }
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
    error_callback: () => {
      rejectPendingSignIn?.(new Error(uk.auth.signInWindowFailed));
      rejectPendingSignIn = null;
    },
  });
}

export function signIn(): Promise<void> {
  if (Capacitor.isNativePlatform()) return signInNative();
  // After an expiry, skip the consent screen she already went through.
  const options = sessionExpired ? { prompt: "" } : undefined;

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error("signIn: call initGoogleAuth() first"));
      return;
    }

    rejectPendingSignIn = reject;
    tokenClient.callback = (response) => {
      rejectPendingSignIn = null;
      if (response.error || !response.access_token) {
        reject(new Error(response.error ?? "signIn: no access token returned"));
        return;
      }
      startSession(response.access_token, response.expires_in);
      bindWebAccount().then(resolve, (err) => {
        signOut();
        reject(err);
      });
    };
    tokenClient.requestAccessToken(options);
  });
}

const WEB_ACCOUNT_STORAGE_KEY = "trackmymeals.webAccount";

/**
 * The web remembers its connected sheet for one Google account only (release
 * 2.0): someone else may use the same browser. When a different account signs
 * in, the previous person's sheet and recent-sheets list are forgotten before
 * any screen shows them. The account is Drive's opaque permission ID — no
 * email or name is stored.
 */
async function bindWebAccount(): Promise<void> {
  const response = await authorizedFetchUrl("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)");
  const data = (await response.json()) as { user?: { permissionId?: string } };
  const account = data.user?.permissionId;
  if (!account) throw new Error(uk.auth.accountCheckFailed);
  const previous = localStorage.getItem(WEB_ACCOUNT_STORAGE_KEY);
  if (previous && previous !== account) {
    if (!isLocalSheetId(getSpreadsheetId())) localStorage.removeItem(SPREADSHEET_ID_STORAGE_KEY);
    localStorage.removeItem(RECENT_SHEETS_STORAGE_KEY);
  }
  localStorage.setItem(WEB_ACCOUNT_STORAGE_KEY, account);
}

export function signOut(): void {
  accessToken = null;
  offlineSession = false;
  accessTokenExpiresAt = null;
  sessionExpired = false;
  // No-op if never set (e.g. on web) — removeItem on a missing key is safe.
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function isSignedIn(): boolean {
  return accessToken !== null || offlineSession;
}

// --- Spreadsheet selection ---
//
// Each device remembers its own connected spreadsheet (localStorage —
// private to the device, works the same in a browser tab and inside the
// Capacitor WebView). Since 1.7.1 there is no build-time fallback: a device
// that never connected one has none («Підключити таблицю»), instead of
// quietly landing in the testers' shared sheet.
const SPREADSHEET_ID_STORAGE_KEY = "trackmymeals.spreadsheetId";
/** sheetConnections.ts keeps the recent-sheets list under this key. */
const RECENT_SHEETS_STORAGE_KEY = "trackmymeals.recentSheets";

/** Pulls the spreadsheet ID out of a pasted Google Sheets URL, or returns the input as-is if it's already a bare ID. */
export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

/** The connected spreadsheet's ID, or "" when this device has none yet. */
export function getSpreadsheetId(): string {
  try {
    return localStorage.getItem(SPREADSHEET_ID_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setSpreadsheetId(urlOrId: string): void {
  localStorage.setItem(SPREADSHEET_ID_STORAGE_KEY, parseSpreadsheetId(urlOrId));
}

/** Thrown by any sheet request while no spreadsheet is connected. The message is user-facing (Ukrainian). */
export class NoSpreadsheetError extends Error {
  constructor() {
    super(uk.connectSheet.noSpreadsheetError);
    this.name = "NoSpreadsheetError";
  }
}

function requireSpreadsheetId(): string {
  const id = getSpreadsheetId();
  if (!id) throw new NoSpreadsheetError();
  return id;
}

/**
 * Spreadsheets built into the app (mom's, the testers' and the dev sheet,
 * plus any in VITE_KNOWN_SPREADSHEET_IDS). The connect window lists only
 * those the signed-in account can actually open (getSpreadsheetTitle) —
 * so access decides who sees which, without any emails in the app. Rule:
 * these sheets must be shared with specific people only, never "anyone
 * with the link" — their IDs are in the public app code.
 */
export function getKnownSpreadsheetIds(): string[] {
  return knownSheetIds([
    import.meta.env.VITE_DEFAULT_SPREADSHEET_ID,
    import.meta.env.VITE_KNOWN_SPREADSHEET_IDS,
    import.meta.env.VITE_SPREADSHEET_ID,
    import.meta.env.VITE_DEV_SPREADSHEET_ID,
  ]);
}

export function getSpreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/** Authorized fetch against an arbitrary absolute URL — the shared retry/error-handling logic behind both authorizedFetch (Sheets API) and the Drive API calls below. */
async function authorizedFetchUrl(url: string, init?: RequestInit): Promise<Response> {
  checkTokenExpiry();
  if (!accessToken && offlineSession) {
    // Opened offline: still offline, this throws a TypeError (callers fall back
    // to the device copy); a refresh token Google no longer accepts ends the session.
    if (!(await refreshAccessToken())) {
      offlineSession = false;
      expireSession();
      throw new SessionExpiredError();
    }
  }
  if (!accessToken) {
    if (sessionExpired) throw new SessionExpiredError();
    throw new Error("Not signed in — call signIn() first");
  }
  const doFetch = () =>
    fetch(url, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
    });

  let response = await doFetch();
  for (const delay of RATE_LIMIT_RETRY_DELAYS_MS) {
    if (response.status !== 429) break;
    await wait(delay);
    response = await doFetch();
  }
  if (response.status === 429) throw new RateLimitError();

  // A 401 usually just means the ~1hr access token expired mid-session —
  // e.g. the app sat backgrounded for a while. Try one silent refresh (a
  // no-op if there's no stored refresh token, which is the case on web)
  // before giving up, so a long-idle app doesn't need a full interactive
  // re-sign-in just to make its next request.
  if (response.status === 401 && (await refreshAccessToken())) {
    response = await doFetch();
  }

  // Still 401: the sign-in is gone (always the case on the web after the
  // hour; on Android only when the refresh token itself died).
  if (response.status === 401) {
    expireSession();
    throw new SessionExpiredError();
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
  // Working without Google: there is no spreadsheet to reach (release 2.0).
  if (isLocalSheetId(path.split(/[/:?]/)[0])) throw new Error(uk.localMode.noSheet);
  return authorizedFetchUrl(`${SHEETS_API_BASE}/${path}`, init);
}

// --- Reading: from the device first ---
//
// Every tab the app reads is kept on the device (localDb: SQLite, one database
// per spreadsheet). A tab whose copy is current for this session is read from
// the device with no request at all; otherwise the whole tab is fetched once,
// stored, and served from there. pullAllTabs() refreshes every tab in ONE
// request (values:batchGet) at start, on return to the app and from
// «Синхронізувати». A write marks the tabs it touched as not current, so the
// next read fetches them again. With no connection, reads fall back to the
// stored copy, however old (wasLastReadFromCache() tells the screens).
//
// Lookups that decide WHICH row a write goes to use readRangeLive(): another
// device may have changed the sheet since the last pull.

// Read the stored values, not their display text. The default (FORMATTED_VALUE)
// returns what the cell *shows*, which depends on the spreadsheet's locale: in
// mom's Ukrainian-locale sheet a stored 6.2 comes back as "6,2", Number("6,2")
// is NaN, and every decimal read as 0 (TRUE/FALSE likewise show as
// ІСТИНА/ХИБНІСТЬ). UNFORMATTED_VALUE returns real numbers and booleans in any
// locale. Dates/times come back as their displayed text (FORMATTED_STRING), so
// DateAdded and time settings parse as they always have.
const READ_OPTIONS = "valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING";

let lastReadWasFromCache = false;
/** Tabs whose device copy is current this session (cleared by writes and sheet switches). */
const currentTabs = new Set<string>();
let currentTabsSheet = "";

/** True if the most recent read fell back to the stored copy because the sheet couldn't be reached — check after fetching to decide whether to show an "offline" hint. */
export function wasLastReadFromCache(): boolean {
  return lastReadWasFromCache;
}

let oldCacheCleared = false;
/** The read cache before 2.0 kept tabs in localStorage ("trackmymeals.cache.…"); the device database replaced it. */
function clearOldReadCache(): void {
  if (oldCacheCleared) return;
  oldCacheCleared = true;
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith("trackmymeals.cache.")) localStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing to clear
  }
}

/** Opens the connected spreadsheet's device database, and forgets "current" tabs when the sheet changed. */
async function ensureLocalDb(spreadsheetId: string): Promise<void> {
  clearOldReadCache();
  if (currentTabsSheet !== spreadsheetId) {
    currentTabs.clear();
    currentTabsSheet = spreadsheetId;
  }
  if (getOpenSpreadsheetId() !== spreadsheetId) await openLocalDb(spreadsheetId);
}

function markTabsChanged(tabs: readonly string[]): void {
  tabs.forEach((t) => currentTabs.delete(t));
}

function markAllTabsChanged(): void {
  currentTabs.clear();
}

/** Fetches whole tabs in one request and stores them on the device. */
async function fetchAndStoreTabs(spreadsheetId: string, tabs: readonly string[]): Promise<Map<string, unknown[][]>> {
  const params = new URLSearchParams(READ_OPTIONS);
  for (const tab of tabs) params.append("ranges", tab);
  const response = await authorizedFetch(`${spreadsheetId}/values:batchGet?${params}`);
  const data = await response.json();
  const valueRanges = (data.valueRanges ?? []) as { values?: unknown[][] }[];
  const pulledAt = new Date().toISOString();
  const grids = new Map(tabs.map((tab, i) => [tab, valueRanges[i]?.values ?? []] as const));
  await putLocalTabs(tabs.map((tab) => ({ tab, rows: grids.get(tab)!, pulledAt })));
  tabs.forEach((t) => currentTabs.add(t));
  return grids;
}

/** Whole tabs, from the device where current, otherwise fetched (one request for all the missing ones). */
async function readTabs(tabs: readonly string[], fresh = false): Promise<Map<string, unknown[][]>> {
  const spreadsheetId = requireSpreadsheetId();
  await ensureLocalDb(spreadsheetId);
  const unique = [...new Set(tabs)];
  const result = new Map<string, unknown[][]>();
  if (isLocalSheetId(spreadsheetId)) {
    // Without Google the device database is the data: nothing to fetch — and
    // without it (another tab holds it) there is nothing to read.
    if (getOpenSpreadsheetId() !== spreadsheetId) throw new Error(uk.otherTab.title);
    for (const tab of unique) result.set(tab, (await getLocalTab(tab))?.rows ?? []);
    lastReadWasFromCache = false;
    return result;
  }
  const missing: string[] = [];
  for (const tab of unique) {
    const local = !fresh && currentTabs.has(tab) ? await getLocalTab(tab) : null;
    if (local) result.set(tab, local.rows);
    else missing.push(tab);
  }
  if (missing.length === 0) {
    lastReadWasFromCache = false;
    return withPendingChanges(result);
  }
  try {
    const fetched = await fetchAndStoreTabs(spreadsheetId, missing);
    fetched.forEach((rows, tab) => result.set(tab, rows));
    lastReadWasFromCache = false;
  } catch (err) {
    // Only a genuine network failure falls back: fetch() throws a TypeError when
    // it can't reach the server at all. An HTTP error (bad permissions, an
    // expired session) is a real problem a stored copy must never paper over.
    if (!(err instanceof TypeError)) throw err;
    for (const tab of missing) {
      const local = await getLocalTab(tab);
      if (!local) throw err;
      result.set(tab, local.rows);
    }
    lastReadWasFromCache = true;
  }
  return withPendingChanges(result);
}

/** Saves not yet synced, shown on top of the sheet's copy (release 2.0) — every read goes through this. */
async function withPendingChanges(grids: Map<string, unknown[][]>): Promise<Map<string, unknown[][]>> {
  const pending = (await listLocalChanges()) as RecordChange[];
  if (pending.length > 0) {
    for (const [tab, rows] of grids) grids.set(tab, applyChanges(tab, rows, pending));
  }
  return grids;
}

/**
 * Reads several ranges, from the device where current, otherwise in ONE request.
 * fresh: fetch every tab from the sheet regardless (the structure check must see the real sheet).
 */
export async function readRanges(requests: { tab: string; range: string }[], options: { fresh?: boolean } = {}): Promise<unknown[][][]> {
  if (requests.length === 0) return [];
  const grids = await readTabs(requests.map((r) => r.tab), options.fresh);
  return requests.map(({ tab, range }) => sliceGrid(grids.get(tab) ?? [], range));
}

/** Reads a range, e.g. readRange("Ingredients", "A1:L200") — from the device when its copy is current. */
export async function readRange(tab: string, range: string): Promise<unknown[][]> {
  return (await readRanges([{ tab, range }]))[0];
}

/** Reads a range straight from the sheet, never from the device — for finding the row a write goes to. */
export async function readRangeLive(tab: string, range: string): Promise<unknown[][]> {
  const spreadsheetId = requireSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}/values/${tab}!${range}?${READ_OPTIONS}`);
  const data = await response.json();
  return data.values ?? [];
}

/** Whole tabs straight from the sheet in ONE request, without storing them (sync decides against these). */
export async function fetchTabsLive(tabs: readonly string[]): Promise<Map<string, unknown[][]>> {
  const spreadsheetId = requireSpreadsheetId();
  const params = new URLSearchParams(READ_OPTIONS);
  for (const tab of tabs) params.append("ranges", tab);
  const response = await authorizedFetch(`${spreadsheetId}/values:batchGet?${params}`);
  const data = await response.json();
  const valueRanges = (data.valueRanges ?? []) as { values?: unknown[][] }[];
  return new Map(tabs.map((tab, i) => [tab, valueRanges[i]?.values ?? []] as const));
}

/** Opens the connected spreadsheet's device database (for modules that record saves). */
export async function openDeviceDatabase(): Promise<void> {
  await ensureLocalDb(requireSpreadsheetId());
}

/** Refreshes every given tab on the device in ONE request and records the sync time. */
export async function pullAllTabs(tabs: readonly string[]): Promise<void> {
  const spreadsheetId = requireSpreadsheetId();
  if (isLocalSheetId(spreadsheetId)) return;
  await ensureLocalDb(spreadsheetId);
  await fetchAndStoreTabs(spreadsheetId, tabs);
  await setLocalMeta("lastPullAt", new Date().toISOString());
}

/** «Вийти» on the web: no copy of the sheet stays on this device (saves not yet in the sheet stay). */
export async function forgetSheetCopies(): Promise<void> {
  markAllTabsChanged();
  await forgetDeviceCopies();
}

/** When the device copy was last refreshed from the sheet (ISO time), or null. */
export async function getLastPullAt(): Promise<string | null> {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return null;
  await ensureLocalDb(spreadsheetId);
  return getLocalMeta("lastPullAt");
}

function isBlankRow(row: unknown[]): boolean {
  return row.every((v) => v === undefined || v === null || String(v).trim() === "");
}

/**
 * Appends rows to a tab, e.g. writeRange("DailyLog", "A:J", [[...]]).
 * Refuses a blank row, and checks Google's reply actually reports written
 * cells — an append that writes nothing is still an HTTP 200, which is
 * exactly how mom's readings "saved" without ever reaching her sheet.
 */
export async function writeRange(tab: string, range: string, values: unknown[][]): Promise<void> {
  if (values.length === 0 || values.some(isBlankRow)) {
    throw new Error(`writeRange: refusing to append a blank row to ${tab}`);
  }
  const spreadsheetId = requireSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}/values/${tab}!${range}:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  markTabsChanged([tab]);
  const data = await response.json().catch(() => null);
  if (data?.updates?.updatedCells === 0) {
    throw new Error(`writeRange: Google reported no cells written to ${tab}`);
  }
}

/**
 * Updates one or more existing ranges in a single request, e.g. overwriting
 * specific Settings rows in place. Each `range` must include the tab name,
 * e.g. "Settings!B3".
 */
export async function batchUpdateRanges(updates: { range: string; values: unknown[][] }[]): Promise<void> {
  const spreadsheetId = requireSpreadsheetId();
  await authorizedFetch(`${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    }),
  });
  markTabsChanged(tabsOfRanges(updates.map((u) => u.range)));
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
  const spreadsheetId = requireSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}?fields=sheets.properties.title`);
  const data = await response.json();
  const sheets = (data.sheets ?? []) as { properties: { title: string } }[];
  return sheets.map((s) => s.properties.title);
}

/** The connected spreadsheet's own display name (its title in Drive/Sheets) — lets Settings show something more recognizable than a bare ID. */
export async function getSpreadsheetName(): Promise<string> {
  const spreadsheetId = requireSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}?fields=properties.title`);
  const data = await response.json();
  return String(data.properties?.title ?? "");
}

/**
 * A spreadsheet's title if the signed-in account can open it, else null
 * (no access, deleted, not a spreadsheet) — the access check behind the
 * connect window's built-in sheets. A lost sign-in still throws.
 */
export async function getSpreadsheetTitle(spreadsheetId: string): Promise<string | null> {
  try {
    const response = await authorizedFetch(`${encodeURIComponent(spreadsheetId)}?fields=properties.title`);
    const data = await response.json();
    return String(data.properties?.title ?? "");
  } catch (err) {
    if (err instanceof SessionExpiredError) throw err;
    return null;
  }
}

/**
 * Adds new tabs to the spreadsheet by title. Additive only — never touches
 * or removes any existing tab, including a blank spreadsheet's lone default
 * one, so it's safe to run against a sheet that already has other content.
 */
export async function addSheetTabs(titles: string[]): Promise<void> {
  if (titles.length === 0) return;
  await structuralBatchUpdate(titles.map((title) => ({ addSheet: { properties: { title } } })));
}

/**
 * Runs raw spreadsheets.batchUpdate requests (addSheet, duplicateSheet,
 * deleteDimension, appendDimension, ...) — the structural edits values
 * updates can't do. Google applies one call's requests atomically, in order.
 */
export async function structuralBatchUpdate(requests: object[]): Promise<void> {
  if (requests.length === 0) return;
  const spreadsheetId = requireSpreadsheetId();
  await authorizedFetch(`${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  markAllTabsChanged();
}

export interface TabGrid {
  sheetId: number;
  columnCount: number;
}

/** Each tab's numeric sheetId (what structural requests address a tab by) and current grid width, keyed by title. */
export async function getTabGrids(): Promise<Map<string, TabGrid>> {
  const spreadsheetId = requireSpreadsheetId();
  const response = await authorizedFetch(`${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
  const data = await response.json();
  const sheets = (data.sheets ?? []) as { properties: { sheetId: number; title: string; gridProperties?: { columnCount?: number } } }[];
  return new Map(
    sheets.map((s) => [s.properties.title, { sheetId: s.properties.sheetId, columnCount: s.properties.gridProperties?.columnCount ?? 26 }]),
  );
}

/**
 * Removes one row (1-based sheet row number) from a tab — the row itself, not
 * just its values, so the rows below move up. Final: only the spreadsheet's
 * version history can bring it back (release 1.9, deleting items).
 */
export async function deleteSheetRow(tab: string, rowNumber: number): Promise<void> {
  const grid = (await getTabGrids()).get(tab);
  if (!grid) throw new Error(`Tab ${tab} not found`);
  await structuralBatchUpdate([
    { deleteDimension: { range: { sheetId: grid.sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } },
  ]);
}

/** Removes several rows of one tab in one request; `rowNumbers` are 1-based, handled bottom-up so they stay valid. */
export async function deleteSheetRows(tab: string, rowNumbers: readonly number[]): Promise<void> {
  if (rowNumbers.length === 0) return;
  const grid = (await getTabGrids()).get(tab);
  if (!grid) throw new Error(`Tab ${tab} not found`);
  const sorted = [...new Set(rowNumbers)].sort((a, b) => b - a);
  await structuralBatchUpdate(
    sorted.map((n) => ({ deleteDimension: { range: { sheetId: grid.sheetId, dimension: "ROWS", startIndex: n - 1, endIndex: n } } })),
  );
}

/**
 * Creates a new spreadsheet in the app's Drive folder holding the given tabs
 * exactly (release 2.0: backup copies, and moving phone-only data to Google).
 * Returns its ID. Values are written as they are (RAW).
 */
export async function createSpreadsheetFromGrids(name: string, grids: ReadonlyMap<string, unknown[][]>): Promise<string> {
  const id = await createSpreadsheetInAppFolder(name);
  const tabs = [...grids.keys()];
  // Add the tabs, then remove the empty one Google creates with every new spreadsheet (sheetId 0).
  await authorizedFetch(`${id}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [...tabs.map((title) => ({ addSheet: { properties: { title } } })), { deleteSheet: { sheetId: 0 } }] }),
  });
  await authorizedFetch(`${id}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: tabs.filter((t) => (grids.get(t) ?? []).length > 0).map((t) => ({ range: `${t}!A1`, values: grids.get(t) })),
    }),
  });
  return id;
}

/** Moves a file the app created to Drive's trash (recoverable there for 30 days). */
export async function trashDriveFile(fileId: string): Promise<void> {
  await authorizedFetchUrl(`${DRIVE_API_BASE}/${encodeURIComponent(fileId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
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
/**
 * Spreadsheets this app can see in the user's Google Drive — with the
 * drive.file scope that is exactly the ones it created (or was given), so
 * no wider Drive access is needed. Most recently changed first.
 */
export async function listAppSpreadsheets(): Promise<{ id: string; title: string; modifiedTime: string }[]> {
  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const response = await authorizedFetchUrl(`${DRIVE_API_BASE}?q=${query}&orderBy=modifiedTime%20desc&pageSize=20&fields=files(id,name,modifiedTime)`);
  const data = await response.json();
  const files = (data.files ?? []) as { id: string; name?: string; modifiedTime?: string }[];
  return files.map((f) => ({ id: f.id, title: f.name ?? "", modifiedTime: f.modifiedTime ?? "" }));
}

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
