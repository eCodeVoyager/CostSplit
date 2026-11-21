import { App as NativeApp } from "@capacitor/app"
import { useEffect } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { SALAH } from "@/lib/adhan/calc"
import { configureNative } from "@/lib/adhan/native"
import { getAdhanSettings, nativeConfig, prayerName, resolvePlace, timesOn, useAdhanSettings, type AdhanSettings } from "@/lib/adhan/settings"
import { ensureVoices, webVoiceUrl } from "@/lib/adhan/voices"
import { playWeb } from "@/lib/adhan/web"
import { useSession } from "@/lib/auth"
import { prayerPath } from "@/lib/nav"
import { notifyPermission, requestNotifyPermission, showNow } from "@/lib/notify"
import { isNative } from "@/lib/server"

const INTRO_KEY = "costsplit:adhanIntro"
const ASKED_KEY = "costsplit:adhanNotifyAsked"

const once = (key: string) => {
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, "1")
    return true
  } catch {
    return false
  }
}

/**
 * Runs for the whole app. Android: hands the azan settings to the phone, which
 * plays the azan by itself from then on (again on every start and resume, in
 * case the phone dropped the alarm after a force stop). Website: plays the
 * azan while the page is open.
 */
export function AdhanHost() {
  const settings = useAdhanSettings()
  const [, navigate] = useLocation()

  const session = useSession()
  useEffect(() => {
    if (!isNative) return
    configureNative(nativeConfig(settings))
      .then((status) => {
        // The home's voices, once signed in (the built-in ones play until then)
        ensureVoices(status).catch(() => {})
        if (!status?.enabled || !once(INTRO_KEY)) return
        // On by default: say so once, with a way to change it
        toast("Azan is on", {
          description: `It plays at the five prayer times${status.place ? ` for ${status.place}` : ""}, even with the app closed. Change it in the Prayer tab.`,
          duration: 12_000,
          action: { label: "Prayer", onClick: () => navigate(prayerPath()) },
        })
        // The Stop button lives in a notification (Android 13+ asks for it once)
        if (once(ASKED_KEY)) {
          notifyPermission()
            .then((p) => (p === "prompt" ? requestNotifyPermission() : false))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [settings, navigate, session])

  // Alarms can be wiped by a force stop: coming back sets them again
  useEffect(() => {
    if (!isNative) return
    const handle = NativeApp.addListener("resume", () => {
      configureNative(nativeConfig(getAdhanSettings()), true)
        .then((status) => ensureVoices(status))
        .catch(() => {})
    })
    return () => {
      handle.then((h) => h.remove()).catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (isNative || !settings.enabled) return
    if (once(INTRO_KEY)) {
      const place = resolvePlace(settings)
      toast("Azan is on", {
        description: `It plays at the five prayer times${place ? ` for ${place.name}` : ""} while CostSplit is open. Change it in the Prayer tab.`,
        duration: 12_000,
        action: { label: "Prayer", onClick: () => navigate(prayerPath()) },
      })
    }
    return scheduleWeb(settings)
  }, [settings, navigate])

  return null
}

/** Website: a timer to the next prayer while the page is open */
function scheduleWeb(s: AdhanSettings) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const plan = () => {
    clearTimeout(timer)
    if (stopped) return
    const place = resolvePlace(s)
    if (!place) return
    const now = Date.now()
    let next: { prayer: (typeof SALAH)[number]; at: number } | null = null
    for (let i = 0; i < 2 && !next; i++) {
      const d = new Date()
      d.setDate(d.getDate() + i)
      const t = timesOn(d, place, s)
      for (const p of SALAH) {
        if (s.prayers[p].alert !== "off" && t[p] > now) {
          next = { prayer: p, at: t[p] }
          break
        }
      }
    }
    if (!next) return
    const target = next
    // Long timers drift in background tabs: wake up at most every 10 min to re-aim
    const wait = Math.min(target.at - now, 10 * 60_000)
    timer = setTimeout(async () => {
      if (stopped) return
      if (Date.now() < target.at - 1000) return plan()
      const name = prayerName(target.prayer, target.at)
      if (s.prayers[target.prayer].alert === "adhan") {
        const fajr = target.prayer === "fajr"
        const useHome = fajr ? s.fajrSound === "custom_fajr" : s.sound === "custom"
        const src = useHome ? await webVoiceUrl(fajr ? "custom_fajr" : "custom") : null
        const ok = await playWeb(target.prayer, s.volume, src)
        if (!ok) toast(`Time for ${name}`, { description: "Tap anywhere, then Play in the Prayer tab to hear the azan." })
      }
      showNow(`Time for ${name}`, place.name, prayerPath(), `adhan:${target.prayer}`).catch(() => {})
      timer = setTimeout(plan, 61_000)
    }, Math.max(0, wait))
  }
  plan()
  const onVisible = () => document.visibilityState === "visible" && plan()
  document.addEventListener("visibilitychange", onVisible)
  return () => {
    stopped = true
    clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisible)
  }
}
