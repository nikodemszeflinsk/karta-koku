import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      // External registerSW.js (no inline script → strict CSP keeps working).
      injectRegister: "script",
      includeAssets: ["favicon.svg", "apple-touch-icon.png", "theme-init.js"],
      manifest: {
        name: "Sushi Chef Lab",
        short_name: "Chef Lab",
        description: "Prywatna akademia kulinarna dla kucharza sushi.",
        lang: "pl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f7f9",
        theme_color: "#f6f7f9",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Only the app shell is cached. API responses (private data) are never stored offline.
        globPatterns: ["**/*.{js,css,html,svg,png}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
