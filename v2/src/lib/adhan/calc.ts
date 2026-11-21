// Prayer times from the sun's position. No network, no library: the same
// formulas run on the phone in AdhanCalc.java, so what this screen shows is
// exactly when the Android app plays the azan. Keep the two in step.
//
// Times are computed for a calendar day at a place (latitude/longitude) and
// returned as instants (epoch ms, rounded to the minute), so they are right in
// any time zone.

export type Prayer = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha"
/** The five prayers that have an azan */
export type Salah = Exclude<Prayer, "sunrise">

export const PRAYERS: Prayer[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]
export const SALAH: Salah[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"]

export type HighLatRule = "none" | "middle" | "seventh" | "angle"

/** Everything the calculation needs, already resolved (no "auto" left) */
export interface CalcParams {
  /** Sun angle below the horizon at Fajr and Isha (degrees) */
  fajr: number
  isha: number
  /** Isha a fixed number of minutes after Maghrib instead of an angle (Umm al-Qura, Qatar) */
  ishaMinutes: number
  /** Maghrib at a sun angle instead of sunset (Tehran, Jafari) */
  maghribAngle: number
  /** Asr shadow length: 1 = standard (Shafi'i, Maliki, Hanbali), 2 = Hanafi */
  asr: 1 | 2
  highLat: HighLatRule
  /** Minutes added to each time (the method's own adjustments plus yours) */
  adjust: Record<Prayer, number>
}

const RAD = Math.PI / 180
const sin = (d: number) => Math.sin(d * RAD)
const cos = (d: number) => Math.cos(d * RAD)
const tan = (d: number) => Math.tan(d * RAD)
const asin = (x: number) => Math.asin(x) / RAD
const acos = (x: number) => Math.acos(x) / RAD
const atan2 = (y: number, x: number) => Math.atan2(y, x) / RAD
const acot = (x: number) => Math.atan(1 / x) / RAD
const fix = (a: number, b: number) => {
  const r = a - b * Math.floor(a / b)
  return r < 0 ? r + b : r
}
/** Hours from a to b going forward round the clock */
const hoursBetween = (a: number, b: number) => fix(b - a, 24)

/** Julian day at 0h UT of a calendar date */
export function julianDay(year: number, month: number, day: number) {
  if (month <= 2) {
    year -= 1
    month += 12
  }
  const a = Math.floor(year / 100)
  const b = 2 - a + Math.floor(a / 4)
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + b - 1524.5
}

/** Sun declination (degrees) and equation of time (hours) at a Julian day */
function sunPosition(jd: number) {
  const d = jd - 2451545.0
  const g = fix(357.529 + 0.98560028 * d, 360)
  const q = fix(280.459 + 0.98564736 * d, 360)
  const l = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360)
  const e = 23.439 - 0.00000036 * d
  const ra = fix(atan2(cos(e) * sin(l), cos(l)) / 15, 24)
  return { decl: asin(sin(e) * sin(l)), eqt: q / 15 - ra }
}

/** Sunrise/sunset: the sun's upper edge on the horizon, with refraction */
const RISE_SET_ANGLE = 0.833

/**
 * Times for one calendar day as instants. `year/month/day` is the date where
 * you are (month 1-12). A time that doesn't exist that day (Fajr in a northern
 * summer with no high-latitude rule) comes back as NaN.
 */
export function prayerTimes(year: number, month: number, day: number, lat: number, lng: number, p: CalcParams): Record<Prayer, number> {
  // Julian day of local noon-ish: times below are hours of "longitude time" (UT + lng/15)
  const jdate = julianDay(year, month, day) - lng / (15 * 24)

  const midDay = (t: number) => fix(12 - sunPosition(jdate + t / 24).eqt, 24)
  const sunAngleTime = (angle: number, t: number, before: boolean) => {
    const { decl } = sunPosition(jdate + t / 24)
    const noon = midDay(t)
    const h = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15
    return noon + (before ? -h : h)
  }
  const asrTime = (factor: number, t: number) => {
    const { decl } = sunPosition(jdate + t / 24)
    return sunAngleTime(-acot(factor + tan(Math.abs(lat - decl))), t, false)
  }

  // First guesses, then refine twice using the sun's position at each time
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 }
  for (let i = 0; i < 2; i++) {
    const g = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)
    t = {
      fajr: g(sunAngleTime(p.fajr, t.fajr, true), 5),
      sunrise: g(sunAngleTime(RISE_SET_ANGLE, t.sunrise, true), 6),
      dhuhr: midDay(t.dhuhr),
      asr: g(asrTime(p.asr, t.asr), 13),
      sunset: g(sunAngleTime(RISE_SET_ANGLE, t.sunset, false), 18),
      maghrib: p.maghribAngle > 0 ? g(sunAngleTime(p.maghribAngle, t.maghrib, false), 18) : 18,
      isha: p.ishaMinutes > 0 ? 18 : g(sunAngleTime(p.isha, t.isha, false), 18),
    }
  }
  // Final pass keeps NaN where the sun never reaches the angle
  const fajrRaw = sunAngleTime(p.fajr, t.fajr, true)
  const sunrise = sunAngleTime(RISE_SET_ANGLE, t.sunrise, true)
  const dhuhr = midDay(t.dhuhr)
  const asr = asrTime(p.asr, t.asr)
  const sunset = sunAngleTime(RISE_SET_ANGLE, t.sunset, false)
  let fajr = fajrRaw
  let maghrib = p.maghribAngle > 0 ? sunAngleTime(p.maghribAngle, t.maghrib, false) : sunset
  let isha = p.ishaMinutes > 0 ? maghrib + p.ishaMinutes / 60 : sunAngleTime(p.isha, t.isha, false)

  // Far north/south: Fajr and Isha are kept within a share of the night
  if (p.highLat !== "none" && Number.isFinite(sunrise) && Number.isFinite(sunset)) {
    const night = hoursBetween(sunset, sunrise)
    const share = (angle: number) => (p.highLat === "angle" ? angle / 60 : p.highLat === "seventh" ? 1 / 7 : 1 / 2)
    const fajrLimit = share(p.fajr) * night
    if (!Number.isFinite(fajr) || hoursBetween(fajr, sunrise) > fajrLimit) fajr = sunrise - fajrLimit
    if (p.ishaMinutes <= 0) {
      const ishaLimit = share(p.isha) * night
      if (!Number.isFinite(isha) || hoursBetween(sunset, isha) > ishaLimit) isha = sunset + ishaLimit
    }
    if (p.maghribAngle > 0) {
      const limit = share(p.maghribAngle) * night
      if (!Number.isFinite(maghrib) || hoursBetween(sunset, maghrib) > limit) maghrib = sunset + limit
    }
  }

  const base = Date.UTC(year, month - 1, day)
  const toInstant = (hours: number, prayer: Prayer) => {
    if (!Number.isFinite(hours)) return NaN
    const ms = base + (hours - lng / 15 + (p.adjust[prayer] ?? 0) / 60) * 3_600_000
    return Math.round(ms / 60_000) * 60_000
  }
  return {
    fajr: toInstant(fajr, "fajr"),
    sunrise: toInstant(sunrise, "sunrise"),
    dhuhr: toInstant(dhuhr, "dhuhr"),
    asr: toInstant(asr, "asr"),
    maghrib: toInstant(maghrib, "maghrib"),
    isha: toInstant(isha, "isha"),
  }
}

export type MethodId =
  | "karachi"
  | "mwl"
  | "isna"
  | "egypt"
  | "makkah"
  | "dubai"
  | "qatar"
  | "kuwait"
  | "singapore"
  | "turkey"
  | "tehran"
  | "moonsighting"

export interface Method {
  name: string
  hint: string
  fajr: number
  isha: number
  ishaMinutes?: number
  maghribAngle?: number
  /** The method's own minute adjustments (safety margins) */
  adjust?: Partial<Record<Prayer, number>>
}

export const METHODS: Record<MethodId, Method> = {
  karachi: { name: "Karachi (University of Islamic Sciences)", hint: "Bangladesh, Pakistan, India, Afghanistan", fajr: 18, isha: 18, adjust: { dhuhr: 1 } },
  mwl: { name: "Muslim World League", hint: "Europe, Far East, much of the world", fajr: 18, isha: 17, adjust: { dhuhr: 1 } },
  isna: { name: "ISNA (North America)", hint: "USA, Canada", fajr: 15, isha: 15, adjust: { dhuhr: 1 } },
  egypt: { name: "Egyptian General Authority", hint: "Egypt, Africa, Syria, Lebanon, Iraq", fajr: 19.5, isha: 17.5, adjust: { dhuhr: 1 } },
  makkah: { name: "Umm al-Qura, Makkah", hint: "Saudi Arabia (Isha 90 min after Maghrib)", fajr: 18.5, isha: 0, ishaMinutes: 90 },
  dubai: { name: "Dubai", hint: "United Arab Emirates", fajr: 18.2, isha: 18.2, adjust: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 } },
  qatar: { name: "Qatar", hint: "Qatar (Isha 90 min after Maghrib)", fajr: 18, isha: 0, ishaMinutes: 90 },
  kuwait: { name: "Kuwait", hint: "Kuwait", fajr: 18, isha: 17.5 },
  singapore: { name: "Singapore / Malaysia / Indonesia", hint: "MUIS, JAKIM, Kemenag", fajr: 20, isha: 18, adjust: { dhuhr: 1 } },
  turkey: { name: "Turkey (Diyanet)", hint: "Turkey", fajr: 18, isha: 17, adjust: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
  tehran: { name: "Tehran (Geophysics Institute)", hint: "Iran, Shia communities", fajr: 17.7, isha: 14, maghribAngle: 4.5 },
  moonsighting: { name: "Moonsighting Committee (18°)", hint: "UK and others, with safety minutes", fajr: 18, isha: 18, adjust: { dhuhr: 5, maghrib: 3 } },
}

export const METHOD_IDS = Object.keys(METHODS) as MethodId[]

/** Usual method and Asr for a country (ISO code), used when you leave them on Auto */
export function countryDefaults(country: string): { method: MethodId; asr: 1 | 2 } {
  const hanafi = ["BD", "PK", "IN", "AF", "UZ", "TJ", "KG", "KZ", "TM"].includes(country)
  const method: MethodId = (
    {
      BD: "karachi", PK: "karachi", IN: "karachi", AF: "karachi", NP: "karachi", LK: "karachi",
      SA: "makkah", YE: "makkah", AE: "dubai", QA: "qatar", KW: "kuwait", BH: "makkah", OM: "makkah",
      EG: "egypt", SD: "egypt", LY: "egypt", SY: "egypt", LB: "egypt", IQ: "egypt", JO: "egypt", PS: "egypt", IL: "egypt",
      TR: "turkey", IR: "tehran",
      MY: "singapore", SG: "singapore", BN: "singapore", ID: "singapore",
      US: "isna", CA: "isna",
      GB: "moonsighting", IE: "moonsighting",
    } as Record<string, MethodId>
  )[country] ?? "mwl"
  return { method, asr: hanafi ? 2 : 1 }
}

export function buildParams(method: MethodId, asr: 1 | 2, highLat: HighLatRule, offsets: Partial<Record<Prayer, number>>): CalcParams {
  const m = METHODS[method]
  const adjust = Object.fromEntries(PRAYERS.map((pr) => [pr, (m.adjust?.[pr] ?? 0) + (offsets[pr] ?? 0)])) as Record<Prayer, number>
  return { fajr: m.fajr, isha: m.isha, ishaMinutes: m.ishaMinutes ?? 0, maghribAngle: m.maghribAngle ?? 0, asr, highLat, adjust }
}

/** Middle of the night for northern places, seventh of the night above 48° (as most tables do) */
export const recommendedHighLat = (lat: number): HighLatRule => (Math.abs(lat) > 48 ? "seventh" : "middle")
