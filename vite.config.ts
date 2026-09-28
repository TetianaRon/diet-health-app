import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
    VitePWA({
      registerType: "autoUpdate",
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
