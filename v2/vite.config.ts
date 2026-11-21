/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { readFileSync } from "node:fs"
import path from "node:path"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import pkg from "./package.json" with { type: "json" }

/**
 * The azan recordings live once, in the Android app's res/raw (the phone plays
 * them natively). The website gets the same files at /adhan/*.ogg; Android
 * builds leave them out so live updates stay small.
 */
function adhanAudio(): Plugin {
  const dir = path.join(import.meta.dirname, "android", "app", "src", "main", "res", "raw")
  const files = ["adhan_default.ogg", "adhan_fajr.ogg"]
  let android = false
  return {
    name: "costsplit-adhan-audio",
    configResolved(config) {
      android = config.mode.startsWith("android")
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.match(/^\/adhan\/([a-z_]+\.ogg)$/)?.[1]
        if (!name || !files.includes(name)) return next()
        res.setHeader("Content-Type", "audio/ogg")
        res.end(readFileSync(path.join(dir, name)))
      })
    },
    generateBundle() {
      if (android) return
      for (const name of files) this.emitFile({ type: "asset", fileName: `adhan/${name}`, source: readFileSync(path.join(dir, name)) })
    },
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    adhanAudio(),
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
        // adhan/*.ogg: the built-in azan recordings, so the website plays the azan offline too (~2.5 MB)
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}", "adhan/*.ogg"],
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
