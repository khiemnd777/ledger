import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  envDir: "../../",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/pocket-192.png", "icons/pocket-512.png"],
      manifest: {
        name: "SỔ TAY — Quản lý bán áo bằng QR",
        short_name: "SỔ TAY",
        description: "Quản lý bán áo bằng QR ngay trên điện thoại.",
        theme_color: "#172033",
        background_color: "#F7F7F5",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        lang: "vi",
        categories: ["business", "shopping", "productivity"],
        icons: [
          { src: "/icons/pocket-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/pocket-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/pocket-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/__/],
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "so-tay-fonts",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false, suppressWarnings: true },
    }),
  ],
  resolve: {
    alias: {
      "@pocket/domain": resolve(__dirname, "../../packages/domain/src/index.ts"),
      "@pocket/local-db": resolve(__dirname, "../../packages/local-db/src/index.ts"),
      "@pocket/qr": resolve(__dirname, "../../packages/qr/src/index.ts"),
      "@pocket/sync-engine": resolve(__dirname, "../../packages/sync-engine/src/index.ts"),
      "@pocket/firebase": resolve(__dirname, "../../packages/firebase/src/index.ts"),
      "@pocket/ui": resolve(__dirname, "../../packages/ui/src/index.tsx"),
    },
  },
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 750 },
});
