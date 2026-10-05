/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  /** Built-in sheets the connect window offers to accounts that can open them: the testers' sheet… */
  readonly VITE_SPREADSHEET_ID?: string;
  /** …mom's sheet… */
  readonly VITE_DEFAULT_SPREADSHEET_ID?: string;
  /** …the dev sheet… */
  readonly VITE_DEV_SPREADSHEET_ID?: string;
  /** …and any others, comma-separated. */
  readonly VITE_KNOWN_SPREADSHEET_IDS?: string;
  /** Absolute URL of the api/usda proxy — only needed in builds not served from it (the Android app). */
  readonly VITE_USDA_PROXY_URL?: string;
  /** Absolute URL of the api/translate proxy — likewise only for the Android app. */
  readonly VITE_TRANSLATE_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
