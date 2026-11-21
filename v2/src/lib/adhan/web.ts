// The website can't wake up by itself, so here the azan plays only while
// CostSplit is open in a tab (the Android app plays it with the app closed).
// The built-in recordings are the Android app's own (res/raw), served by
// vite.config.ts and kept in the offline copy of the site (service worker), so
// the azan plays with no internet too.

import type { Salah } from "./calc"

const FILES = { default: "/adhan/adhan_default.ogg", fajr: "/adhan/adhan_fajr.ogg" }
/** The Fajr recording is a mosque field recording: the muezzin starts ~7 s in and ends at 3:10 */
const FAJR_START = 7.2
const FAJR_END = 190.5

let audio: HTMLAudioElement | null = null
const listeners = new Set<() => void>()
let playingNow: string = ""

const emit = () => listeners.forEach((l) => l())

export function webPlaying() {
  return playingNow
}

export function onWebPlaying(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * The built-in recording as an in-memory URL. Read through the service worker,
 * so it comes from the offline copy without internet; playing from memory also
 * avoids the range requests some browsers won't take from a service worker.
 */
const builtIn = new Map<string, Promise<string>>()
function builtInUrl(path: string): Promise<string> {
  let p = builtIn.get(path)
  if (!p) {
    p = fetch(path)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => {
        builtIn.delete(path)
        return path
      })
    builtIn.set(path, p)
  }
  return p
}

/** Loads both built-in recordings now, so they're ready (and cached) before they're needed */
export function warmUpWeb() {
  builtInUrl(FILES.default).catch(() => {})
  builtInUrl(FILES.fajr).catch(() => {})
}

export function stopWeb() {
  if (audio) {
    audio.pause()
    audio.src = ""
    audio = null
  }
  if (playingNow) {
    playingNow = ""
    emit()
  }
}

/**
 * Plays the azan for `prayer` (Fajr has its own): `src` (the home's voice) or
 * the built-in recording. Resolves false when the browser blocks sound.
 */
export async function playWeb(prayer: Salah | "test", volume: number, src?: string | null): Promise<boolean> {
  stopWeb()
  const fajr = prayer === "fajr"
  const a = new Audio(src ?? (await builtInUrl(fajr ? FILES.fajr : FILES.default)))
  a.volume = volume > 0 ? Math.min(1, volume / 100) : 1
  if (fajr && !src) {
    // Skip the street sound before the muezzin starts, stop when he ends
    const skip = () => {
      if (a.currentTime < FAJR_START) a.currentTime = FAJR_START
    }
    if (a.readyState >= 1) skip()
    else a.addEventListener("loadedmetadata", skip, { once: true })
    a.addEventListener("timeupdate", () => {
      if (a.currentTime >= FAJR_END) stopWeb()
    })
  }
  a.addEventListener("ended", () => stopWeb())
  audio = a
  try {
    await a.play()
    playingNow = prayer
    emit()
    return true
  } catch {
    // Autoplay blocked until someone taps the page
    audio = null
    return false
  }
}
