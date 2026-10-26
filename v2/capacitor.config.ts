import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "app.costsplit",
  appName: "CostSplit",
  webDir: "dist-android",
  backgroundColor: "#f7f9fc",
  server: {
    // http://localhost is still a secure context, and it can call a plain-http
    // sync server (laptop over adb/Wi-Fi) without mixed-content errors.
    // Changing the scheme later would wipe app data (new origin), so keep it.
    androidScheme: "http",
    // Plain-http sync servers are allowed in debug builds only (see app/build.gradle)
  },
  plugins: {
    SystemBars: { insetsHandling: "css" },
  },
}

export default config
