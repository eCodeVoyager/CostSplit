// The home's azan voices: recordings on your own server (DATA_DIR/adhan), given
// only to signed-in members of a group, never published with the app. The
// Android app downloads them once into its file slots and plays them from
// there; until then (offline, signed out) the recordings inside the app play.

import { authHeaders, getSession } from "../auth"
import { apiUrl, hasServer, isNative } from "../server"
import { deleteSound, saveSound, type AdhanStatus } from "./native"
import { getAdhanSettings, updateAdhanSettings } from "./settings"

export type Slot = "custom" | "custom_fajr"

export const VOICES: Record<Slot, { remote: "azan" | "fajr"; name: string }> = {
  custom: { remote: "azan", name: "Omar Hisham Al Arabi" },
  custom_fajr: { remote: "fajr", name: "Mishary Rashid Alafasy" },
}

const canFetch = () => hasServer() && !!getSession() && navigator.onLine

async function fetchVoice(slot: Slot): Promise<Blob | null> {
  if (!canFetch()) return null
  const res = await fetch(apiUrl(`/adhan/${VOICES[slot].remote}`), { headers: authHeaders(), signal: AbortSignal.timeout(90_000) })
  return res.ok ? res.blob() : null
}

let running: Promise<boolean> | null = null

/**
 * Android: puts the home's voice into every slot the settings use that is still
 * empty. A slot holding your own file is never touched. True if anything changed.
 */
export function ensureVoices(status: AdhanStatus | null): Promise<boolean> {
  if (!isNative || !status || !canFetch()) return Promise.resolve(false)
  if (running) return running
  running = (async () => {
    const s = getAdhanSettings()
    const want: Slot[] = []
    if (s.sound === "custom" && !status.customSound) want.push("custom")
    if (s.fajrSound === "custom_fajr" && !status.customFajrSound) want.push("custom_fajr")
    let changed = false
    for (const slot of want) {
      const blob = await fetchVoice(slot).catch(() => null)
      if (!blob) continue
      await saveSound(slot, new File([blob], `${VOICES[slot].remote}.mp3`, { type: "audio/mpeg" }))
      updateAdhanSettings((cur) => ({ files: { ...cur.files, [slot]: "server" } }))
      changed = true
    }
    return changed
  })().finally(() => {
    running = null
  })
  return running
}

/** Back to the home's voice in a slot that holds your own file (it's downloaded again) */
export async function restoreHomeVoice(slot: Slot, status: AdhanStatus | null) {
  await deleteSound(slot).catch(() => {})
  updateAdhanSettings((cur) => ({
    files: { ...cur.files, [slot]: "" },
    ...(slot === "custom" ? { sound: "custom" as const } : { fajrSound: "custom_fajr" as const }),
  }))
  return ensureVoices(status ? { ...status, [slot === "custom" ? "customSound" : "customFajrSound"]: false } : status)
}

// Website: the home's voices are kept in the browser after the first download
// (Cache Storage, not the service worker's precache), so they play offline too
const VOICE_CACHE = "costsplit-adhan-voices"
const cacheKey = (slot: Slot) => `/voices/${VOICES[slot].remote}.mp3`

async function cachedVoice(slot: Slot): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(VOICE_CACHE)).match(cacheKey(slot))
    return hit ? await hit.blob() : null
  } catch {
    // No Cache Storage (private mode, old browser): download each visit
    return null
  }
}

async function keepVoice(slot: Slot, blob: Blob) {
  try {
    await (await caches.open(VOICE_CACHE)).put(cacheKey(slot), new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }))
  } catch {
    // Not kept: fine, it's downloaded again next visit
  }
}

/** Website: the home's voice as a playable URL (offline once downloaded), or null for the built-in one */
const webUrls = new Map<Slot, Promise<string | null>>()
export function webVoiceUrl(slot: Slot): Promise<string | null> {
  if (isNative) return Promise.resolve(null)
  let p = webUrls.get(slot)
  if (!p) {
    p = (async () => {
      let blob = await cachedVoice(slot)
      if (!blob && canFetch()) {
        blob = await fetchVoice(slot).catch(() => null)
        if (blob) await keepVoice(slot, blob)
      }
      return blob ? URL.createObjectURL(blob) : null
    })()
      .catch(() => null)
      .then((url) => {
        if (!url) webUrls.delete(slot)
        return url
      })
    webUrls.set(slot, p)
  }
  return p
}
