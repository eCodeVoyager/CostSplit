import { App as NativeApp } from "@capacitor/app"
import { createRoot } from "react-dom/client"
import { navigate } from "wouter/use-browser-location"
import App from "./App"
import { LAST_TRIP_KEY } from "./lib/nav"
import { isNative } from "./lib/server"
import { startSync } from "./lib/sync"
import { applyTheme } from "./lib/theme"
import { checkForUpdate, reloadOnStaleChunks, startWebUpdates } from "./lib/update"
import "./index.css"

applyTheme()
reloadOnStaleChunks()

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
if (!isNative) startWebUpdates().catch(() => {})
else {
  // Look for a newer APK on launch and whenever the app comes back (at most every few hours)
  setTimeout(() => checkForUpdate(), 4000)
  NativeApp.addListener("resume", () => checkForUpdate())
  // Invite links open the app (App Links): show the same screen the website would
  let last = ""
  const openLink = (url?: string) => {
    if (!url || url === last) return
    last = url
    setTimeout(() => (last = ""), 3000)
    try {
      const { pathname, searchParams } = new URL(url)
      // ?as=<person> is a personal invite: keep it so the app knows who is joining
      const as = searchParams.get("as")
      const query = as && /^[A-Za-z0-9_-]{8,64}$/.test(as) ? `?as=${as}` : ""
      if (/^\/(join|t)\/[A-Za-z0-9_-]+$/.test(pathname)) navigate(pathname + query)
    } catch {
      // Not a URL we handle
    }
  }
  NativeApp.getLaunchUrl().then((launch) => openLink(launch?.url)).catch(() => {})
  NativeApp.addListener("appUrlOpen", (event) => openLink(event.url))
}
// Ask the browser not to evict our IndexedDB under storage pressure
navigator.storage?.persist?.().catch(() => {})
