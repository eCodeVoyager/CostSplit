import { useSyncExternalStore } from "react"
import {
  buildParams,
  countryDefaults,
  METHODS,
  prayerTimes,
  recommendedHighLat,
  SALAH,
  type CalcParams,
  type HighLatRule,
  type MethodId,
  type Prayer,
  type Salah,
} from "./calc"
import { approxPlaceForZone, cityById, deviceZone, placeForZone, ZONE_PLACES, type Place } from "./places"

/** What happens at a prayer time */
export type Alert = "adhan" | "notify" | "off"
/**
 * Where the sound goes. auto: a connected Bluetooth speaker or headphones if
 * there is one, otherwise the phone's loud alarm speaker. alarm: always the
 * alarm stream (plays on silent and Do Not Disturb). media: the media stream
 * (follows Bluetooth and headphones).
 */
export type Output = "auto" | "alarm" | "media"

export type LocationSetting =
  | { mode: "auto" }
  | { mode: "city"; id: string }
  | { mode: "gps"; lat: number; lng: number; name: string; country: string }

export interface AdhanSettings {
  /** Auto azan: plays by itself five times a day (on by default) */
  enabled: boolean
  location: LocationSetting
  method: "auto" | MethodId
  asr: "auto" | "standard" | "hanafi"
  highLat: "auto" | HighLatRule
  prayers: Record<Salah, { alert: Alert; offset: number }>
  /** A notification at sunrise (end of Fajr time) */
  sunrise: boolean
  /** A notification this many minutes before each prayer (0 = none) */
  remindBefore: number
  /**
   * Azan for Dhuhr to Isha. "custom": the file saved on the phone (the home's
   * default voice, downloaded from the server, or a file you picked); "default":
   * the recording inside the app, which also plays until the file is there.
   */
  sound: "default" | "custom"
  /** Fajr has its own azan (with "as-salatu khayrun min an-nawm"), chosen the same way */
  fajrSound: "fajr" | "custom_fajr"
  /** What's in each file slot on the phone: the home's default voice or your own file */
  files: { custom: "" | "server" | "file"; custom_fajr: "" | "server" | "file" }
  output: Output
  /** Volume while the azan plays, % of the maximum (0 = leave the phone's volume alone) */
  volume: number
  /** Louder than the phone's maximum (audio boost) */
  boost: boolean
  /** Start quietly and rise over a few seconds */
  fadeIn: boolean
  /** Pressing a volume button stops the azan */
  volumeKeyStops: boolean
  /** Alarm-clock timing: the most reliable, shows the alarm icon in the status bar */
  alarmClock: boolean
  /** Days to move the Hijri date (moon sighting differs by country) */
  hijriOffset: number
}

export const DEFAULT_SETTINGS: AdhanSettings = {
  enabled: true,
  location: { mode: "auto" },
  method: "auto",
  asr: "auto",
  highLat: "auto",
  prayers: {
    fajr: { alert: "adhan", offset: 0 },
    dhuhr: { alert: "adhan", offset: 0 },
    asr: { alert: "adhan", offset: 0 },
    maghrib: { alert: "adhan", offset: 0 },
    isha: { alert: "adhan", offset: 0 },
  },
  sunrise: false,
  remindBefore: 0,
  sound: "custom",
  fajrSound: "custom_fajr",
  files: { custom: "", custom_fajr: "" },
  output: "auto",
  volume: 85,
  boost: false,
  fadeIn: false,
  volumeKeyStops: true,
  alarmClock: true,
  hijriOffset: 0,
}

const KEY = "costsplit:adhan"
const listeners = new Set<() => void>()

function read(): AdhanSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const saved = JSON.parse(raw) as Partial<AdhanSettings> & { v?: number }
    // 2.4.3: the home's voices (Omar Hisham, Mishary Alafasy) became the default for everyone
    if ((saved.v ?? 1) < 2) {
      saved.sound = "custom"
      saved.fajrSound = "custom_fajr"
    }
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      prayers: { ...DEFAULT_SETTINGS.prayers, ...saved.prayers },
      files: { ...DEFAULT_SETTINGS.files, ...saved.files },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

let current = read()

export const getAdhanSettings = () => current

export function updateAdhanSettings(patch: Partial<AdhanSettings> | ((s: AdhanSettings) => Partial<AdhanSettings>)) {
  const next = typeof patch === "function" ? patch(current) : patch
  current = { ...current, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...current, v: 2 }))
  } catch {
    // Private mode: applies for this visit
  }
  listeners.forEach((l) => l())
}

export function useAdhanSettings(): AdhanSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current
  )
}

export interface ResolvedPlace extends Place {
  /** How the place was chosen, for the screen ("approx": a nearby zone's city, minutes off) */
  source: "zone" | "approx" | "city" | "gps"
}

/** The place prayer times are for right now (null: time zone we can't place, ask for a city) */
export function resolvePlace(s: AdhanSettings, tz = deviceZone()): ResolvedPlace | null {
  const loc = s.location
  if (loc.mode === "gps") return { id: "gps", name: loc.name, country: loc.country, lat: loc.lat, lng: loc.lng, source: "gps" }
  if (loc.mode === "city") {
    const city = cityById(loc.id)
    if (city) return { ...city, source: "city" }
  }
  const zone = placeForZone(tz)
  if (zone) return { ...zone, source: "zone" }
  const near = approxPlaceForZone(tz)
  return near ? { ...near, source: "approx" } : null
}

export interface ResolvedMethod {
  method: MethodId
  asr: 1 | 2
  highLat: HighLatRule
}

export function resolveMethod(s: AdhanSettings, place: Pick<Place, "country" | "lat">): ResolvedMethod {
  const d = countryDefaults(place.country)
  return {
    method: s.method === "auto" ? d.method : s.method,
    asr: s.asr === "auto" ? d.asr : s.asr === "hanafi" ? 2 : 1,
    highLat: s.highLat === "auto" ? recommendedHighLat(place.lat) : s.highLat,
  }
}

export function paramsFor(s: AdhanSettings, place: Pick<Place, "country" | "lat">): CalcParams {
  const m = resolveMethod(s, place)
  const offsets: Partial<Record<Prayer, number>> = Object.fromEntries(SALAH.map((p) => [p, s.prayers[p].offset]))
  return buildParams(m.method, m.asr, m.highLat, offsets)
}

/** One day's times at a place, for the local date of `day` */
export function timesOn(day: Date, place: Pick<Place, "lat" | "lng" | "country">, s: AdhanSettings) {
  return prayerTimes(day.getFullYear(), day.getMonth() + 1, day.getDate(), place.lat, place.lng, paramsFor(s, place))
}

export interface NextPrayer {
  prayer: Salah
  at: number
}

/** The next of the five prayers after `now` (looks into tomorrow) */
export function nextPrayer(place: Pick<Place, "lat" | "lng" | "country">, s: AdhanSettings, now = new Date()): NextPrayer | null {
  for (let i = 0; i < 2; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const t = timesOn(day, place, s)
    for (const p of SALAH) if (t[p] > now.getTime()) return { prayer: p, at: t[p] }
  }
  return null
}

/** The prayer whose time it is now (from its start until the next one; Fajr ends at sunrise) */
export function currentPrayer(times: Record<Prayer, number>, now = Date.now()): Prayer | null {
  if (now < times.fajr) return "isha"
  if (now < times.sunrise) return "fajr"
  if (now < times.dhuhr) return null
  if (now < times.asr) return "dhuhr"
  if (now < times.maghrib) return "asr"
  if (now < times.isha) return "maghrib"
  return "isha"
}

export const PRAYER_NAMES: Record<Prayer, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
}

/** Friday's Dhuhr is Jumu'ah */
export const prayerName = (p: Prayer, at?: number) => (p === "dhuhr" && at !== undefined && new Date(at).getDay() === 5 ? "Jumu'ah" : PRAYER_NAMES[p])

export const methodName = (id: MethodId) => METHODS[id].name

/** Hijri date (Umm al-Qura calendar), moved by the offset for local moon sighting */
export function hijriDate(day: Date, offset: number): { text: string; month: number; dayOfMonth: number } | null {
  try {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offset, 12)
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d)
    const get = (t: string) => Number(parts.find((x) => x.type === t)?.value.replace(/\D/g, ""))
    const month = get("month")
    const dayOfMonth = get("day")
    const year = get("year")
    if (!month || !dayOfMonth || !year) return null
    return { text: `${dayOfMonth} ${HIJRI_MONTHS[month - 1]} ${year} AH`, month, dayOfMonth }
  } catch {
    return null
  }
}

const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  "Jumada al-Ula",
  "Jumada al-Akhirah",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qa'dah",
  "Dhu al-Hijjah",
]

/**
 * Everything the Android side needs to schedule the azan on its own, also
 * after a reboot or a time zone change with the app closed. Places are sent
 * already resolved (with their calculation parameters), so the phone never
 * needs this code to work out "auto".
 */
export function nativeConfig(s: AdhanSettings) {
  const entry = (p: Place) => ({ name: p.name, lat: p.lat, lng: p.lng, params: paramsFor(s, p) })
  const fixed = s.location.mode === "auto" ? null : resolvePlace(s)
  const tz = deviceZone()
  const approx = s.location.mode === "auto" && !placeForZone(tz) ? approxPlaceForZone(tz) : null
  return {
    version: 1,
    enabled: s.enabled,
    fixed: fixed ? entry(fixed) : null,
    // Time zone -> place, used while the location is on Auto
    zones:
      s.location.mode === "auto"
        ? { ...Object.fromEntries(ZONE_PLACES.map((p) => [p.id, entry(p)])), ...(approx ? { [tz]: entry(approx) } : {}) }
        : {},
    prayers: Object.fromEntries(SALAH.map((p) => [p, s.prayers[p].alert])),
    sunrise: s.sunrise,
    remindBefore: s.remindBefore,
    sound: s.sound,
    fajrSound: s.fajrSound,
    output: s.output,
    volume: s.volume,
    boost: s.boost,
    fadeIn: s.fadeIn,
    volumeKeyStops: s.volumeKeyStops,
    alarmClock: s.alarmClock,
  }
}

export type NativeConfig = ReturnType<typeof nativeConfig>
