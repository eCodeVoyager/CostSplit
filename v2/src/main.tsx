import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"
import App from "./App"
import { LAST_TRIP_KEY } from "./lib/nav"
import { isNative } from "./lib/server"
import { startSync } from "./lib/sync"
import { applyTheme } from "./lib/theme"
import { checkForUpdate } from "./lib/update"
import "./index.css"

applyTheme()

// Opening the app goes straight back to the trip you were in
try {
  const last = localStorage.getItem(LAST_TRIP_KEY)
  if (last && window.location.pathname === "/") window.history.replaceState(null, "", `/t/${last}`)
} catch {
  // Storage blocked: start on the trip list
}

createRoot(document.getElementById("root")!).render(<App />)

startSync()
// The Android app ships its files inside the APK; only the website needs a service worker
if (!isNative) registerSW({ immediate: true })
else setTimeout(checkForUpdate, 4000)
// Ask the browser not to evict our IndexedDB under storage pressure
navigator.storage?.persist?.().catch(() => {})
