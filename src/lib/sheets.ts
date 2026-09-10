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
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
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
  return data.access_token as string;
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

/** Prepares Google sign-in for whichever platform this is running on. */
export async function initGoogleAuth(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (!nativeRedirectListenerRegistered) {
      nativeRedirectListenerRegistered = true;
      App.addListener("appUrlOpen", (data) => void handleNativeRedirect(data.url));
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
