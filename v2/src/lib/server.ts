const KEY = "costsplit:server"

/** Baked in at build time; empty means "same origin as the web app" */
const BUILT_IN = normalize(import.meta.env.VITE_SERVER_URL ?? "")
/** Public web address (S3/CDN or the server itself) */
const PUBLIC_URL = normalize(import.meta.env.VITE_PUBLIC_URL ?? "")

/** True inside the Android app (Capacitor injects this global before our code runs) */
export const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

export const SYNC_BUILD_ENABLED = import.meta.env.VITE_SYNC !== "off"

function normalize(url: string) {
  return url.trim().replace(/\/+$/, "")
}

export function getServerUrl(): string {
  try {
    return localStorage.getItem(KEY) ?? BUILT_IN
  } catch {
    return BUILT_IN
  }
}

export function saveServerUrl(url: string) {
  try {
    localStorage.setItem(KEY, normalize(url))
  } catch {
    // Storage blocked: keep using the built-in server
  }
}

/** The native app has no "same origin" server, so it needs an explicit URL */
export function hasServer() {
  return SYNC_BUILD_ENABLED && (!isNative || getServerUrl() !== "")
}

export function apiUrl(path: string) {
  return `${getServerUrl()}/api${path}`
}

/**
 * Where invite links and the download page live. The app has no web address of
 * its own (it runs from http://localhost), so it uses the configured one.
 */
export function publicOrigin() {
  if (PUBLIC_URL) return PUBLIC_URL
  return isNative ? getServerUrl() : window.location.origin
}

export const isAndroidBrowser = !isNative && /android/i.test(navigator.userAgent)

export async function checkServer(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${normalize(url) || window.location.origin}/api/health`, {
      signal: AbortSignal.timeout(6000),
    })
    return res.ok
  } catch {
    return false
  }
}
