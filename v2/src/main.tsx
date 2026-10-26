import { App as NativeApp } from "@capacitor/app"
import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"
import { navigate } from "wouter/use-browser-location"
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
else {
  setTimeout(checkForUpdate, 4000)
  // Invite links open the app (App Links): show the same screen the website would
  let last = ""
  const openLink = (url?: string) => {
    if (!url || url === last) return
    last = url
    setTimeout(() => (last = ""), 3000)
    try {
      const { pathname } = new URL(url)
      if (/^\/(join|t)\/[A-Za-z0-9_-]+$/.test(pathname)) navigate(pathname)
    } catch {
      // Not a URL we handle
    }
  }
  NativeApp.getLaunchUrl().then((launch) => openLink(launch?.url)).catch(() => {})
  NativeApp.addListener("appUrlOpen", (event) => openLink(event.url))
}
// Ask the browser not to evict our IndexedDB under storage pressure
navigator.storage?.persist?.().catch(() => {})
