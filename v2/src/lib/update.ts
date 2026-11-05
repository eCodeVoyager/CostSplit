import { App as NativeApp } from "@capacitor/app"
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import changelog from "./changelog.json"
import { getPrefs } from "./review"
import { isNative, publicOrigin } from "./server"
import { planUpdate, type BundleInfo, type NativeInfo } from "./updatePlan"
import { compareVersions } from "./version"

export const APP_VERSION = __APP_VERSION__

/** dist/download/version.json, written by scripts/release.mjs */
export interface VersionInfo {
  version: string
  file?: string
  size?: number
  sha256?: string
  notes?: string[]
  /** Older apps than this must update (e.g. after a sync format change) */
  minVersion?: string
  /** Live update: the web part only, for apps whose native part is new enough */
  bundle?: BundleInfo
}

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: VersionInfo }
  | { status: "downloading"; info: VersionInfo; percent: number }
  | { status: "ready"; info: VersionInfo; path: string }
  | { status: "error"; info: VersionInfo; message: string }

/** Native side: android/app/src/main/java/app/costsplit/ApkUpdaterPlugin.java */
interface ApkUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>
  openInstallSettings(): Promise<void>
  download(options: { url: string; sha256?: string }): Promise<{ path: string }>
  install(options: { path: string }): Promise<void>
  addListener(event: "progress" | "bundleProgress", listener: (e: { percent: number }) => void): Promise<PluginListenerHandle>
  // Live updates (app 2.3.0 and newer)
  info(): Promise<NativeInfo & { versionCode?: number }>
  downloadBundle(options: { url: string; sha256: string; version: string }): Promise<{ path: string }>
  applyBundle(options: { path: string; version: string; now: boolean }): Promise<void>
  confirmBundle(): Promise<{ live: string }>
}
const ApkUpdater = registerPlugin<ApkUpdaterPlugin>("ApkUpdater")

let native: Promise<NativeInfo | null> | null = null
/** The installed APK's version and live update state; null on the website or an app older than 2.3.0 */
export function nativeInfo(fresh = false): Promise<NativeInfo | null> {
  if (!isNative) return Promise.resolve(null)
  if (!native || fresh) native = ApkUpdater.info().catch(() => null)
  return native
}

export type LiveState =
  | { status: "idle" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string; path: string }

let live: LiveState = { status: "idle" }
function setLive(next: LiveState) {
  live = next
  emit()
}

export function useLiveUpdate(): LiveState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => live
  )
}

/** Nothing half-typed on screen (no sheet or dialog open) */
const safeToReload = () => !document.querySelector('[role="dialog"], [role="alertdialog"]')

/**
 * Live update: download only the web part (about 1 MB), check it, and switch
 * to it the next time the app is put away or opened. No reinstall, no Play
 * Protect prompt. A version that fails to start is rolled back by the app.
 */
async function liveUpdate(info: VersionInfo, manual: boolean) {
  const bundle = info.bundle!
  if (live.status === "downloading") return
  if (!(live.status === "ready" && live.version === info.version)) {
    setLive({ status: "downloading", version: info.version, percent: 0 })
    const handle = await ApkUpdater.addListener("bundleProgress", ({ percent }) => {
      if (live.status === "downloading") setLive({ status: "downloading", version: info.version, percent })
    })
    try {
      const { path } = await ApkUpdater.downloadBundle({
        // The query string keeps a CDN from handing out an older zip of the same name
        url: `${publicOrigin()}/download/${bundle.file}?v=${bundle.sha256.slice(0, 12)}`,
        sha256: bundle.sha256,
        version: info.version,
      })
      // From the next start on, even if the app is closed before switching
      await ApkUpdater.applyBundle({ path, version: info.version, now: false })
      setLive({ status: "ready", version: info.version, path })
    } catch (err) {
      setLive({ status: "idle" })
      if (manual) toast.error("Couldn't download the update", { description: err instanceof Error ? err.message : String(err) })
      return
    } finally {
      handle.remove()
    }
  }
  if (isRequired(info)) {
    // This version can't sync any more: switch as soon as nothing is open
    const timer = setInterval(() => {
      if (safeToReload()) {
        clearInterval(timer)
        applyLiveNow()
      }
    }, 2000)
  } else if (manual) {
    toast.success(`CostSplit ${info.version} is ready`, {
      description: "It starts next time you open the app.",
      action: { label: "Restart now", onClick: () => applyLiveNow() },
    })
  }
}

/** Reload into the downloaded version right away */
export async function applyLiveNow() {
  if (live.status !== "ready") return
  await ApkUpdater.applyBundle({ path: live.path, version: live.version, now: true })
}

/** Away at least this long counts as "opening the app again" */
const AWAY_MS = 3 * 60 * 1000

/**
 * Android app: the running version tells the app it started fine (so a live
 * update is kept), and a downloaded update switches in the next time the app
 * is opened: a fresh start, or coming back after a few minutes away. A quick
 * trip to the photo picker or share sheet never reloads anything.
 */
export function startLiveUpdates() {
  if (!isNative) return
  // Rendered and running: this version is good
  const confirm = () => {
    if (document.getElementById("root")?.childElementCount) ApkUpdater.confirmBundle().catch(() => {})
    else setTimeout(confirm, 1000)
  }
  setTimeout(confirm, 1500)
  let pausedAt = 0
  NativeApp.addListener("pause", () => {
    pausedAt = Date.now()
  })
  NativeApp.addListener("resume", () => {
    if (pausedAt && Date.now() - pausedAt >= AWAY_MS && live.status === "ready" && safeToReload()) {
      applyLiveNow().catch(() => {})
    }
  })
}

let state: UpdateState = { status: "idle" }
let sheetOpen = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
function setState(next: UpdateState) {
  state = next
  emit()
}

export function useUpdate(): { state: UpdateState; open: boolean } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
  const o = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sheetOpen
  )
  return { state: s, open: o }
}

export function setUpdateSheet(open: boolean) {
  sheetOpen = open
  emit()
}

export const isRequired = (info: VersionInfo) => !!info.minVersion && compareVersions(APP_VERSION, info.minVersion) < 0

const SNOOZE_KEY = "costsplit:updateSnoozed"
// version.json is tiny; live updates make checking often worth it
const CHECK_EVERY_MS = 60 * 60 * 1000
let lastCheck = 0

/**
 * The APK is installed outside the Play Store, so the app looks for a newer
 * build on its own download page. Usually that's a live update (web part
 * only, switched in by itself). When the native part changed it downloads the
 * APK in the background and offers a one-tap install. `manual` = the user
 * tapped "Check for updates".
 */
export async function checkForUpdate({ manual = false } = {}) {
  const base = publicOrigin()
  if (!isNative || !base || !navigator.onLine) {
    if (manual) toast(isNative ? "Connect to the internet to check" : "The web app updates by itself")
    return
  }
  if (state.status === "downloading" || state.status === "ready") {
    if (manual) setUpdateSheet(true)
    return
  }
  if (manual && live.status === "ready") {
    toast.success(`CostSplit ${live.version} is ready`, {
      description: "It starts next time you open the app.",
      action: { label: "Restart now", onClick: () => applyLiveNow() },
    })
    return
  }
  if (!manual && Date.now() - lastCheck < CHECK_EVERY_MS) return
  lastCheck = Date.now()
  if (manual) setState({ status: "checking" })
  try {
    const res = await fetch(`${base}/download/version.json`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`No update info (${res.status})`)
    const info = (await res.json()) as VersionInfo
    const plan = planUpdate(info, APP_VERSION, await nativeInfo(true))
    if (plan === "latest") {
      setState({ status: "idle" })
      if (manual) toast.success(`You have the latest version (${APP_VERSION})`)
      return
    }
    if (plan === "live") {
      // Small and safe: always on its own, no sheet, no installer
      setState({ status: "idle" })
      await liveUpdate(info, manual)
      return
    }
    setState({ status: "available", info })
    const snoozed = safeGet(SNOOZE_KEY) === `${info.version}:${new Date().toDateString()}`
    // Download on its own (about 5 MB) so installing is one tap later
    if (getPrefs().autoUpdate || manual || isRequired(info)) await downloadUpdate()
    if (manual || isRequired(info) || !snoozed) setUpdateSheet(true)
  } catch (err) {
    if (manual) {
      setState({ status: "idle" })
      toast.error("Couldn't check for updates", { description: err instanceof Error ? err.message : String(err) })
    }
  }
}

export async function downloadUpdate() {
  if (state.status !== "available" && state.status !== "error") return
  const info = state.info
  const base = publicOrigin()
  setState({ status: "downloading", info, percent: 0 })
  const handle = await ApkUpdater.addListener("progress", ({ percent }) => {
    if (state.status === "downloading") setState({ status: "downloading", info, percent })
  })
  try {
    const { path } = await ApkUpdater.download({ url: `${base}/download/${info.file ?? "costsplit.apk"}`, sha256: info.sha256 })
    setState({ status: "ready", info, path })
  } catch (err) {
    setState({ status: "error", info, message: err instanceof Error ? err.message : String(err) })
  } finally {
    handle.remove()
  }
}

/** Opens Android's "Update CostSplit?" dialog. First time, Android asks to allow installs from CostSplit. */
export async function installUpdate(): Promise<"installing" | "needs-permission"> {
  if (state.status !== "ready") return "installing"
  const { allowed } = await ApkUpdater.canInstall()
  if (!allowed) {
    await ApkUpdater.openInstallSettings()
    return "needs-permission"
  }
  await ApkUpdater.install({ path: state.path })
  return "installing"
}

export function snoozeUpdate() {
  if ("info" in state) safeSet(SNOOZE_KEY, `${state.info.version}:${new Date().toDateString()}`)
  setUpdateSheet(false)
}

/**
 * Website: the service worker updates in the background. Reload into the new
 * version only when it's safe (no sheet or dialog open), so nothing half-typed
 * is lost; check for a new version every hour and whenever the app comes back.
 */
export async function startWebUpdates() {
  const { registerSW } = await import("virtual:pwa-register")
  let pending = false
  const safe = () => !document.querySelector('[role="dialog"], [role="alertdialog"]')
  const apply = () => {
    if (pending && (document.visibilityState === "hidden" || safe())) window.location.reload()
  }
  registerSW({
    immediate: true,
    onNeedReload() {
      pending = true
      apply()
      // Something is open: try again every few seconds and when the app is hidden
      const timer = setInterval(() => {
        apply()
        if (!pending) clearInterval(timer)
      }, 3000)
      document.addEventListener("visibilitychange", apply)
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return
      const check = async () => {
        if (registration.installing || !navigator.onLine) return
        const res = await fetch(swUrl, { cache: "no-store", headers: { "cache-control": "no-cache" } }).catch(() => null)
        if (res?.status === 200) await registration.update().catch(() => {})
      }
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check())
    },
  })
}

/** A lazy screen's file is gone because a new version was deployed: load the new version */
export function reloadOnStaleChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault()
    const key = "costsplit:staleReload"
    // Only once a minute, so a broken deploy can't loop
    if (Date.now() - Number(safeGet(key) ?? 0) < 60_000) return
    safeSet(key, String(Date.now()))
    window.location.reload()
  })
}

const SEEN_VERSION_KEY = "costsplit:seenVersion"

export interface Release {
  version: string
  title: string
  notes: string[]
}

/** Releases newer than the one this person last opened, newest first */
export function releasesSince(version: string | null): Release[] {
  return Object.entries(changelog as Record<string, { title: string; notes: string[] }>)
    .filter(([v]) => compareVersions(v, APP_VERSION) <= 0 && (!version || compareVersions(v, version) > 0))
    .sort(([a], [b]) => compareVersions(b, a))
    .map(([v, r]) => ({ version: v, ...r }))
}

/**
 * After an update, show what's new once. Someone opening the app for the first
 * time (no groups yet) doesn't need it.
 */
export function whatsNewFor(hasGroups: boolean): Release[] {
  const seen = safeGet(SEEN_VERSION_KEY)
  if (seen === APP_VERSION) return []
  // Versions before 2.1.0 didn't record this: anyone with groups is upgrading from 2.0.x
  if (!seen && !hasGroups) {
    markWhatsNewSeen()
    return []
  }
  const list = releasesSince(seen ?? "2.0.99")
  if (list.length === 0) markWhatsNewSeen()
  return list
}

export const markWhatsNewSeen = () => safeSet(SEEN_VERSION_KEY, APP_VERSION)

function safeGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode
  }
}
