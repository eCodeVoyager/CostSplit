import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config"

// Run `npm run icons` after changing public/favicon.svg
export default defineConfig({
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: { background: "#1d5fbf" } },
    apple: { ...preset.apple, resizeOptions: { background: "#1d5fbf" } },
  },
  images: ["public/favicon.svg"],
})
