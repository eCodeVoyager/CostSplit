import { describe, expect, it } from "vitest"
import { buildParams, countryDefaults, prayerTimes, recommendedHighLat } from "./calc"
import { CITIES, placeForZone, ZONE_PLACES } from "./places"
import { currentPrayer, DEFAULT_SETTINGS, nativeConfig, nextPrayer, paramsFor, prayerName, resolveMethod, resolvePlace, type AdhanSettings } from "./settings"

const hhmm = (at: number, tz: string) => new Date(at).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" })

describe("prayer times", () => {
  // Reference: the adhan library (Karachi, Hanafi) gives the same minutes; these
  // also match published Dhaka timetables within a minute or two.
  it("Dhaka, Karachi method, Hanafi Asr", () => {
    const t = prayerTimes(2026, 11, 21, 23.8103, 90.4125, buildParams("karachi", 2, "middle", {}))
    expect(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"].map((k) => hhmm(t[k as keyof typeof t], "Asia/Dhaka"))).toEqual([
      "04:58",
      "06:17",
      "11:45",
      "15:35",
      "17:11",
      "18:30",
    ])
  })

  it("Dhaka in June (long days)", () => {
    const t = prayerTimes(2026, 6, 21, 23.8103, 90.4125, buildParams("karachi", 2, "middle", {}))
    expect(hhmm(t.fajr, "Asia/Dhaka")).toBe("03:44")
    expect(hhmm(t.maghrib, "Asia/Dhaka")).toBe("18:48")
    expect(hhmm(t.isha, "Asia/Dhaka")).toBe("20:16")
  })

  it("Fajr before sunrise before Dhuhr ... in order, all on the same local day", () => {
    for (const p of [placeForZone("Asia/Dhaka")!, placeForZone("Europe/London")!, placeForZone("Australia/Sydney")!, placeForZone("Asia/Tokyo")!]) {
      const d = countryDefaults(p.country)
      const t = prayerTimes(2026, 3, 1, p.lat, p.lng, buildParams(d.method, d.asr, recommendedHighLat(p.lat), {}))
      const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha]
      for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1])
    }
  })

  it("Umm al-Qura: Isha 90 minutes after Maghrib", () => {
    const t = prayerTimes(2026, 11, 21, 21.4225, 39.8262, buildParams("makkah", 1, "middle", {}))
    expect(t.isha - t.maghrib).toBe(90 * 60_000)
  })

  it("Hanafi Asr is later than standard", () => {
    const std = prayerTimes(2026, 11, 21, 23.8103, 90.4125, buildParams("karachi", 1, "middle", {}))
    const hanafi = prayerTimes(2026, 11, 21, 23.8103, 90.4125, buildParams("karachi", 2, "middle", {}))
    expect(hanafi.asr - std.asr).toBeGreaterThan(30 * 60_000)
  })

  it("offsets move single prayers by whole minutes", () => {
    const base = prayerTimes(2026, 11, 21, 23.8103, 90.4125, buildParams("karachi", 2, "middle", {}))
    const moved = prayerTimes(2026, 11, 21, 23.8103, 90.4125, buildParams("karachi", 2, "middle", { maghrib: 3, fajr: -2 }))
    expect(moved.maghrib - base.maghrib).toBe(3 * 60_000)
    expect(moved.fajr - base.fajr).toBe(-2 * 60_000)
    expect(moved.dhuhr).toBe(base.dhuhr)
  })

  it("far north in summer: Fajr and Isha still exist with a high-latitude rule, not without", () => {
    const none = prayerTimes(2026, 6, 21, 59.9139, 10.7522, buildParams("mwl", 1, "none", {}))
    expect(Number.isNaN(none.fajr)).toBe(true)
    const seventh = prayerTimes(2026, 6, 21, 59.9139, 10.7522, buildParams("mwl", 1, "seventh", {}))
    expect(Number.isFinite(seventh.fajr)).toBe(true)
    expect(seventh.fajr).toBeLessThan(seventh.sunrise)
  })
})

describe("settings", () => {
  it("auto mode: city and method from the time zone", () => {
    const place = resolvePlace(DEFAULT_SETTINGS, "Asia/Dhaka")!
    expect(place.name).toBe("Dhaka")
    expect(resolveMethod(DEFAULT_SETTINGS, place)).toEqual({ method: "karachi", asr: 2, highLat: "middle" })
    expect(resolvePlace(DEFAULT_SETTINGS, "Asia/Calcutta")?.name).toBe("Kolkata")
    expect(resolvePlace(DEFAULT_SETTINGS, "Mars/Olympus")).toBeNull()
  })

  it("unknown zone: a known city with the same clock time in the same region, flagged as a guess", () => {
    const p = resolvePlace(DEFAULT_SETTINGS, "Europe/Andorra")!
    expect(p.source).toBe("approx")
    expect(p.id.startsWith("Europe/")).toBe(true)
    const asia = resolvePlace(DEFAULT_SETTINGS, "Asia/Chita")
    expect(asia?.id.startsWith("Asia/")).toBe(true)
  })

  it("picked city and location win over the time zone", () => {
    const city: AdhanSettings = { ...DEFAULT_SETTINGS, location: { mode: "city", id: "bd-sylhet" } }
    expect(resolvePlace(city, "Europe/London")?.name).toBe("Sylhet")
    const gps: AdhanSettings = { ...DEFAULT_SETTINGS, location: { mode: "gps", lat: 22.8, lng: 89.5, name: "Near Khulna", country: "BD" } }
    expect(resolvePlace(gps, "Europe/London")).toMatchObject({ name: "Near Khulna", source: "gps" })
  })

  it("explicit method and Asr override the country's", () => {
    const s: AdhanSettings = { ...DEFAULT_SETTINGS, method: "mwl", asr: "standard" }
    expect(resolveMethod(s, { country: "BD", lat: 23.8 })).toMatchObject({ method: "mwl", asr: 1 })
  })

  it("the Fajr azan is its own sound by default", () => {
    // The home's Fajr voice (Mishary Alafasy) by default; the built-in Fajr azan, never the regular one, until it's downloaded
    expect(DEFAULT_SETTINGS.fajrSound).toBe("custom_fajr")
    expect(DEFAULT_SETTINGS.sound).toBe("custom")
    expect(DEFAULT_SETTINGS.enabled).toBe(true)
    expect(Object.values(DEFAULT_SETTINGS.prayers).every((p) => p.alert === "adhan")).toBe(true)
  })

  it("native config: every zone resolved with its own parameters when on auto", () => {
    const cfg = nativeConfig(DEFAULT_SETTINGS)
    expect(cfg.fixed).toBeNull()
    expect(Object.keys(cfg.zones)).toHaveLength(ZONE_PLACES.length)
    expect(cfg.zones["Asia/Dhaka"].params).toEqual(paramsFor(DEFAULT_SETTINGS, placeForZone("Asia/Dhaka")!))
    expect(cfg.zones["Asia/Riyadh"].params.ishaMinutes).toBe(90)
    expect(cfg.prayers).toEqual({ fajr: "adhan", dhuhr: "adhan", asr: "adhan", maghrib: "adhan", isha: "adhan" })
    const fixed = nativeConfig({ ...DEFAULT_SETTINGS, location: { mode: "city", id: "bd-chattogram" } })
    expect(fixed.fixed?.name).toBe("Chattogram")
    expect(fixed.zones).toEqual({})
  })

  it("next and current prayer", () => {
    const dhaka = placeForZone("Asia/Dhaka")!
    // 2026-11-21 12:00 Dhaka = 06:00 UTC: Dhuhr (11:45) has started, Asr is next
    const noon = new Date(Date.UTC(2026, 10, 21, 6, 0))
    const t = prayerTimes(2026, 11, 21, dhaka.lat, dhaka.lng, paramsFor(DEFAULT_SETTINGS, dhaka))
    expect(currentPrayer(t, noon.getTime())).toBe("dhuhr")
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Dhaka") {
      expect(nextPrayer(dhaka, DEFAULT_SETTINGS, noon)?.prayer).toBe("asr")
    }
    expect(currentPrayer(t, t.fajr - 60_000)).toBe("isha")
    expect(currentPrayer(t, t.sunrise + 60_000)).toBeNull()
  })

  it("Friday Dhuhr is Jumu'ah", () => {
    expect(prayerName("dhuhr", new Date(2026, 10, 20, 12).getTime())).toBe("Jumu'ah")
    expect(prayerName("dhuhr", new Date(2026, 10, 21, 12).getTime())).toBe("Dhuhr")
  })

  it("cities: Bangladesh first, no duplicates", () => {
    expect(CITIES[0].country).toBe("BD")
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length)
    expect(new Set(CITIES.map((c) => c.name)).size).toBe(CITIES.length)
  })
})
