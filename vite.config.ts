import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Трекер Діабету",
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
});
