/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_SPREADSHEET_ID: string;
  readonly VITE_DEFAULT_SPREADSHEET_ID: string;
  /** Absolute URL of the api/usda proxy — only needed in builds not served from it (the Android app). */
  readonly VITE_USDA_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
