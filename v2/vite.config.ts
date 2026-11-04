/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import pkg from "./package.json" with { type: "json" }

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "CostSplit",
        short_name: "CostSplit",
        description: "Shared home and trip costs. Works offline.",
        theme_color: "#1d5fbf",
        background_color: "#f7f9fc",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        navigateFallback: "/index.html",
        // /download is its own static page, not part of the app
        navigateFallbackDenylist: [/^\/api\//, /^\/download/],
        globIgnores: ["download/**"],
        // Notification taps (public/notify-sw.js)
        importScripts: ["notify-sw.js"],
      },
    }),
  ],
  resolve: {
    alias: { "@": `${import.meta.dirname}/src` },
  },
  test: { include: ["src/**/*.test.ts"] },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8787", changeOrigin: true } },
  },
})
