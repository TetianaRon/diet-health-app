import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// `npm run dev` only: serves POST /api/translate by running the real Vercel
// function (api/translate.js) with the local GOOGLE_TRANSLATE_API_KEY, so dev
// behaves like production. Never part of a build.
function devTranslateApi(apiKey: string): Plugin {
  return {
    name: "dev-translate-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/translate", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const vercelReq = Object.assign(req, { body: Buffer.concat(chunks).toString("utf8") });
        const vercelRes = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return vercelRes;
          },
          json(value: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(value));
          },
        });
        process.env.GOOGLE_TRANSLATE_API_KEY = apiKey;
        // @ts-expect-error — plain JS Vercel function, no type declarations
        const { default: handler } = await import("./api/translate.js");
        await handler(vercelReq, vercelRes);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // USDA key for local development only: `npm run dev` forwards /api/usda
  // straight to USDA with it (in production api/usda.js does this on Vercel).
  // Read with loadEnv's "" prefix, so it never reaches the client bundle.
  const env = loadEnv(mode, process.cwd(), "");
  const usdaKey = env.USDA_API_KEY || env.VITE_USDA_API_KEY || "";

  return {
  server: {
    proxy: {
      "/api/usda": {
        target: "https://api.nal.usda.gov",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/usda/, "/fdc/v1/foods/search") + (path.includes("?") ? "&" : "?") + "api_key=" + encodeURIComponent(usdaKey),
      },
    },
  },
  plugins: [
    react(),
    devTranslateApi(env.GOOGLE_TRANSLATE_API_KEY || ""),
    VitePWA({
      registerType: "autoUpdate",
      // Registered from src/lib/serviceWorker.ts, on the web only: inside the
      // Android app the worker kept serving the previous version's screens
      // after an update (2026-09-29). The Android build (`npm run
      // build:android`) ships a self-removing worker instead, which clears
      // the one already installed on existing phones.
      injectRegister: false,
      selfDestroying: mode === "android",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Трекер харчування",
        short_name: "Трекер",
        description: "Харчування, глікемічне навантаження та цукор у крові",
        lang: "uk",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#2f7a4f",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
};
});
