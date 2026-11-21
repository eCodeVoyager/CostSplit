import {
  AlarmClock,
  BatteryCharging,
  Bell,
  BellOff,
  ChevronLeft,
  CircleCheck,
  LocateFixed,
  MapPin,
  Minus,
  MoonStar,
  Play,
  Plus,
  Smartphone,
  Square,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  Volume2,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Link } from "wouter"
import { Chip, SectionTitle, Segmented } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { METHOD_IDS, METHODS, PRAYERS, SALAH, type HighLatRule, type MethodId, type Prayer, type Salah } from "@/lib/adhan/calc"
import {
  configureNative,
  nativeStatus,
  openAdhanSettings,
  previewAdhan,
  saveSound,
  stopAdhan,
  testAdhanSoon,
  type AdhanStatus,
  type SettingsTarget,
} from "@/lib/adhan/native"
import { CITIES, COUNTRY_NAMES, deviceZone, type Place } from "@/lib/adhan/places"
import {
  currentPrayer,
  hijriDate,
  methodName,
  nativeConfig,
  nextPrayer,
  prayerName,
  resolveMethod,
  resolvePlace,
  timesOn,
  updateAdhanSettings,
  useAdhanSettings,
  type AdhanSettings,
  type Alert,
  type Output,
} from "@/lib/adhan/settings"
import { prepareAzanFile } from "@/lib/adhan/trim"
import { ensureVoices, restoreHomeVoice, VOICES, webVoiceUrl, type Slot } from "@/lib/adhan/voices"
import { useSession } from "@/lib/auth"
import { onWebPlaying, playWeb, stopWeb, webPlaying } from "@/lib/adhan/web"
import { notifyPermission, requestNotifyPermission } from "@/lib/notify"
import { isNative } from "@/lib/server"
import { cn } from "@/lib/utils"

const time = (at: number) => (Number.isFinite(at) ? new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "–")

function untilText(at: number, now: number) {
  const min = Math.max(0, Math.round((at - now) / 60_000))
  if (min < 1) return "now"
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `in ${h} h ${m} min` : `in ${m} min`
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** The phone's view: what's scheduled, what's playing, and what could stop the azan */
function useNativeStatus(settings: AdhanSettings) {
  const [status, setStatus] = useState<AdhanStatus | null>(null)
  const refresh = useCallback(() => {
    nativeStatus().then((s) => s && setStatus(s))
  }, [])

  useEffect(() => {
    if (!isNative) return
    configureNative(nativeConfig(settings))
      .then((s) => s && setStatus(s))
      .catch(() => {})
  }, [settings])

  useEffect(() => {
    if (!isNative) return
    // Back from a settings screen (battery, notifications): check again
    const onVisible = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [refresh])

  const playing = status?.playing
  useEffect(() => {
    if (!isNative || !playing) return
    const id = setInterval(refresh, 1500)
    return () => clearInterval(id)
  }, [playing, refresh])

  return { status, refresh }
}

function useWebPlaying() {
  const [playing, setPlaying] = useState(webPlaying())
  useEffect(() => {
    const off = onWebPlaying(() => setPlaying(webPlaying()))
    return () => {
      off()
    }
  }, [])
  return playing
}

/** Prayer times and the azan. A tab inside a home/trip, or its own page (`standalone`). */
export default function PrayerScreen({ standalone }: { standalone?: boolean }) {
  const settings = useAdhanSettings()
  const { status, refresh } = useNativeStatus(settings)
  const content = <PrayerContent settings={settings} status={status} refresh={refresh} />
  if (!standalone) return <div className="pt-3 pb-6">{content}</div>
  return (
    <div className="pt-safe mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <header className="-mx-2 flex h-14 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11" asChild>
          <Link href="/" aria-label="Back">
            <ChevronLeft className="size-5" />
          </Link>
        </Button>
        <h1 className="text-[17px] font-semibold">Prayer times</h1>
      </header>
      {content}
    </div>
  )
}

function PrayerContent({ settings, status, refresh }: { settings: AdhanSettings; status: AdhanStatus | null; refresh: () => void }) {
  const now = useNow(15_000)
  const place = resolvePlace(settings)
  const [day, setDay] = useState<"today" | "tomorrow">("today")
  const date = useMemo(() => {
    const d = new Date(now)
    if (day === "tomorrow") d.setDate(d.getDate() + 1)
    return d
  }, [now, day])
  const times = place ? timesOn(date, place, settings) : null
  const todayTimes = place ? timesOn(new Date(now), place, settings) : null
  const next = place ? nextPrayer(place, settings, new Date(now)) : null
  const current = todayTimes && day === "today" ? currentPrayer(todayTimes, now) : null
  const hijri = hijriDate(date, settings.hijriOffset)

  return (
    <div>
      <Hero place={place} next={next} now={now} hijri={hijri?.text ?? null} source={place?.source} />

      {hijri?.month === 9 && times && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Sehri ends</p>
            <p className="text-lg font-semibold tabular">{time(times.fajr)}</p>
          </div>
          <div className="rounded-2xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">Iftar</p>
            <p className="text-lg font-semibold tabular">{time(times.maghrib)}</p>
          </div>
        </div>
      )}

      {times && (
        <>
          <SectionTitle
            action={
              <div className="w-44">
                <Segmented
                  label="Day"
                  value={day}
                  onChange={setDay}
                  options={[
                    { value: "today", label: "Today" },
                    { value: "tomorrow", label: "Tomorrow" },
                  ]}
                />
              </div>
            }
          >
            {date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}
          </SectionTitle>
          <TimesList times={times} current={current} settings={settings} />
        </>
      )}

      <AutoCard settings={settings} status={status} refresh={refresh} />
      {isNative && status && <Reliability status={status} settings={settings} refresh={refresh} />}
      <SoundSettings settings={settings} status={status} refresh={refresh} />
      <ReminderSettings settings={settings} />
      <PlaceSettings settings={settings} place={place} />
      <CalcSettings settings={settings} place={place} />

      <p className="mt-6 px-1 text-[11px] leading-relaxed text-muted-foreground">
        Times are calculated on your phone from the sun's position, no internet needed. Check them against your local mosque once
        and use “Adjust minutes” if they differ. Azan voices: Omar Hisham Al Arabi and, for Fajr, Mishary Rashid Alafasy (shared with
        your home's members from your own server, not published with the app). Built-in, offline: Adam-synagda (Wikimedia Commons,
        CC0); Fajr by Sheikh Hamed, Masgid Mahmoudeya, Cairo, from “Voices and Faces of the Adhan” by Anna Kipervaser, On Look Films
        (University of Cambridge, CC BY-NC-ND 3.0).
      </p>
    </div>
  )
}

function Hero({
  place,
  next,
  now,
  hijri,
  source,
}: {
  place: Place | null
  next: { prayer: Salah; at: number } | null
  now: number
  hijri: string | null
  source?: "zone" | "approx" | "city" | "gps"
}) {
  if (!place) {
    return (
      <div className="rounded-2xl bg-negative-soft p-4 text-negative">
        <p className="flex items-center gap-2 font-semibold">
          <MapPin className="size-4" aria-hidden /> Where are you?
        </p>
        <p className="mt-1 text-sm">
          Time zone {deviceZone()} isn't one we know a city for. Pick your city or use your location below, then the azan can play.
        </p>
      </div>
    )
  }
  return (
    <section aria-label="Next prayer" className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm">
      <div className="flex items-center justify-between gap-2 text-xs opacity-85">
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {place.name}
          {source === "zone" ? " · from time zone" : source === "approx" ? " · rough guess" : source === "gps" ? " · your location" : ""}
        </span>
        {hijri && <span className="shrink-0">{hijri}</span>}
      </div>
      {source === "approx" && (
        <p className="mt-2 rounded-lg bg-primary-foreground/15 px-2.5 py-1.5 text-xs">
          Your time zone ({deviceZone()}) has no city in the list, so these times are for {place.name} and may be minutes off. Pick your
          city or use your location below.
        </p>
      )}
      {next && (
        <>
          <p className="mt-3 text-sm opacity-85">Next · {prayerName(next.prayer, next.at)}</p>
          <p className="text-4xl font-bold tabular">{time(next.at)}</p>
          <p className="text-sm opacity-85">{untilText(next.at, now)}</p>
        </>
      )}
    </section>
  )
}

const ALERT_ICON: Record<Alert, LucideIcon> = { adhan: Volume2, notify: Bell, off: BellOff }
const ALERT_LABEL: Record<Alert, string> = { adhan: "Azan", notify: "Notify", off: "Off" }
const NEXT_ALERT: Record<Alert, Alert> = { adhan: "notify", notify: "off", off: "adhan" }

function TimesList({ times, current, settings }: { times: Record<Prayer, number>; current: Prayer | null; settings: AdhanSettings }) {
  const setAlert = (p: Salah, alert: Alert) =>
    updateAdhanSettings((s) => ({ prayers: { ...s.prayers, [p]: { ...s.prayers[p], alert } } }))
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {PRAYERS.map((p) => {
        const isSalah = p !== "sunrise"
        const alert: Alert = isSalah ? settings.prayers[p as Salah].alert : settings.sunrise ? "notify" : "off"
        const Icon = ALERT_ICON[alert]
        return (
          <li key={p} className={cn("flex min-h-14 items-center gap-3 pl-4", current === p && "bg-accent")}>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-medium", !isSalah && "text-muted-foreground")}>{prayerName(p, times[p])}</span>
              {current === p && <span className="block text-xs text-accent-foreground">Now</span>}
            </span>
            <span className="text-lg font-semibold tabular">{time(times[p])}</span>
            <button
              type="button"
              onClick={() => (isSalah ? setAlert(p as Salah, NEXT_ALERT[alert]) : updateAdhanSettings({ sunrise: !settings.sunrise }))}
              aria-label={`${prayerName(p)}: ${ALERT_LABEL[alert]}. Tap to change.`}
              className={cn(
                "flex h-14 w-18 flex-col items-center justify-center gap-0.5 text-[11px] font-medium active:bg-accent",
                alert === "adhan" ? "text-primary" : alert === "notify" ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="size-5" aria-hidden />
              {ALERT_LABEL[alert]}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function statusLine(settings: AdhanSettings, status: AdhanStatus | null) {
  if (!settings.enabled) return "Off. Prayer times still show here."
  if (!isNative) return "Plays while CostSplit is open in this browser. The Android app plays it with the app closed."
  if (!status) return "Setting up…"
  if (status.reason === "no-location") return "Pick your city below so the azan can play."
  if (status.reason === "nothing-on") return "Every prayer is set to Off."
  if (!status.next) return "Nothing scheduled yet."
  const what = status.next.kind === "adhan" ? "azan" : status.next.kind === "remind" ? "reminder" : "notification"
  const name = status.next.prayer === "test" ? "Test" : prayerName(status.next.prayer as Prayer, status.next.at)
  return `Next: ${name} ${what} at ${time(status.next.at)}. Plays with the app closed and the screen off.`
}

function AutoCard({ settings, status, refresh }: { settings: AdhanSettings; status: AdhanStatus | null; refresh: () => void }) {
  const webNow = useWebPlaying()
  const playing = isNative ? status?.playing : webNow
  const [testAt, setTestAt] = useState<number | null>(null)

  const play = async (prayer: Salah) => {
    if (isNative) {
      await previewAdhan(prayer).catch(() => toast.error("Couldn't play the azan"))
      setTimeout(refresh, 600)
    } else {
      const fajr = prayer === "fajr"
      const useHome = fajr ? settings.fajrSound === "custom_fajr" : settings.sound === "custom"
      const src = useHome ? await webVoiceUrl(fajr ? "custom_fajr" : "custom") : null
      if (!(await playWeb(prayer, settings.volume, src))) toast.error("The browser blocked the sound. Tap again.")
    }
  }
  const stop = async () => {
    if (isNative) {
      await stopAdhan().catch(() => {})
      setTimeout(refresh, 400)
    } else stopWeb()
  }
  const test = async () => {
    try {
      const { at } = await testAdhanSoon(60)
      setTestAt(at)
      toast("Test azan in 1 minute", { description: "Close the app and lock the phone. It should play by itself." })
    } catch {
      toast.error("Couldn't set the test")
    }
  }

  return (
    <>
      <SectionTitle>Auto azan</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="adhan-auto" className="min-w-0">
            <span className="block font-medium">Play the azan 5 times a day</span>
            <span className="block text-xs text-muted-foreground">{statusLine(settings, status)}</span>
          </label>
          <Switch id="adhan-auto" checked={settings.enabled} onCheckedChange={(enabled) => updateAdhanSettings({ enabled })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {playing ? (
            <Button variant="destructive" className="col-span-2 h-11" onClick={stop}>
              <Square /> Stop azan
            </Button>
          ) : (
            <>
              <Button variant="outline" className="h-11" onClick={() => play("dhuhr")}>
                <Play /> Azan
              </Button>
              <Button variant="outline" className="h-11" onClick={() => play("fajr")}>
                <Play /> Fajr azan
              </Button>
            </>
          )}
          {isNative && (
            <Button variant="ghost" className="col-span-2 h-11 text-primary" onClick={test}>
              <Timer /> {testAt && testAt > Date.now() ? `Test set for ${time(testAt)}` : "Test with the app closed (1 min)"}
            </Button>
          )}
        </div>
        {isNative && status?.lastPlayed && (
          <p className="text-xs text-muted-foreground">
            Last played: {prayerName(status.lastPlayed.prayer as Prayer, status.lastPlayed.at)} at {time(status.lastPlayed.at)},{" "}
            {new Date(status.lastPlayed.at).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
          </p>
        )}
      </div>
    </>
  )
}

const MAKER_HINT: Record<string, string> = {
  xiaomi: "Security app → Autostart: turn on CostSplit. Also Battery saver → No restrictions.",
  redmi: "Security app → Autostart: turn on CostSplit. Also Battery saver → No restrictions.",
  poco: "Security app → Autostart: turn on CostSplit. Also Battery saver → No restrictions.",
  oppo: "Allow Auto launch (or Auto startup) for CostSplit.",
  realme: "Allow Auto launch (or Auto startup) for CostSplit.",
  oneplus: "Allow Auto launch for CostSplit.",
  vivo: "Allow Background startup / Autostart for CostSplit.",
  iqoo: "Allow Background startup / Autostart for CostSplit.",
  huawei: "App launch: set CostSplit to Manage manually and allow all three.",
  honor: "App launch: set CostSplit to Manage manually and allow all three.",
  tecno: "Phone Master → Auto-start: turn on CostSplit.",
  infinix: "Phone Master → Auto-start: turn on CostSplit.",
  itel: "Phone Master → Auto-start: turn on CostSplit.",
  samsung: "Battery → Background usage limits: keep CostSplit out of Sleeping / Deep sleeping apps.",
}

/** Everything that can keep the azan from playing on this phone, each with a fix */
function Reliability({ status, settings, refresh }: { status: AdhanStatus; settings: AdhanSettings; refresh: () => void }) {
  const open = (target: SettingsTarget) => openAdhanSettings(target).catch(() => {})
  const allowNotifications = async () => {
    const p = await notifyPermission().catch(() => "denied")
    if (p === "prompt") await requestNotifyPermission().catch(() => false)
    else open("notifications")
    refresh()
  }
  const maker = status.manufacturer.toLowerCase()
  const hint = Object.entries(MAKER_HINT).find(([k]) => maker.includes(k))?.[1]
  const quietPhone = settings.volume === 0 && (settings.output === "media" ? status.mediaVolume : status.alarmVolume) < 30

  const rows: { ok: boolean; icon: LucideIcon; title: string; text: string; fix?: () => void; fixLabel?: string }[] = [
    {
      ok: status.notifications,
      icon: Bell,
      title: "Notifications",
      text: status.notifications ? "Allowed: Stop shows on the lock screen." : "Blocked: the azan still plays, but there's no Stop button.",
      fix: allowNotifications,
      fixLabel: "Allow",
    },
    ...(status.notifications && !status.channel
      ? [{ ok: false, icon: Bell, title: "Azan notifications", text: "Turned off for the Azan channel.", fix: () => open("channel"), fixLabel: "Open" }]
      : []),
    {
      ok: status.exactAlarms,
      icon: AlarmClock,
      title: "On-time alarms",
      text: status.exactAlarms ? "Allowed: plays on the minute." : "Not allowed: the azan may come minutes late.",
      fix: () => open("exact"),
      fixLabel: "Allow",
    },
    {
      ok: status.batteryUnrestricted,
      icon: BatteryCharging,
      title: "Battery",
      text: status.batteryUnrestricted ? "Unrestricted: battery saver won't hold the azan back." : "Battery saver can delay or skip the azan. One tap fixes it.",
      fix: () => open("battery"),
      fixLabel: "Allow",
    },
    ...(status.autostartScreen || hint
      ? [
          {
            ok: true,
            icon: Smartphone,
            title: `${status.manufacturer || "Phone"} settings`,
            text: hint ?? "Allow CostSplit to start in the background (auto start).",
            fix: () => open(status.autostartScreen ? "autostart" : "app"),
            fixLabel: "Open",
          },
        ]
      : []),
    ...(quietPhone
      ? [
          {
            ok: false,
            icon: Volume2,
            title: "Volume",
            text: "Your phone's volume is very low and the azan uses it. Set a volume under Sound.",
          },
        ]
      : []),
  ]
  const problems = rows.filter((r) => !r.ok).length

  return (
    <>
      <SectionTitle>{problems ? `Make sure it plays · ${problems} to fix` : "Make sure it plays"}</SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center gap-3 p-3">
            <span
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
                r.ok ? "bg-accent text-accent-foreground" : "bg-negative-soft text-negative"
              )}
            >
              {r.ok ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{r.title}</span>
              <span className="block text-xs text-muted-foreground">{r.text}</span>
            </span>
            {r.fix && (!r.ok || r.fixLabel === "Open") && (
              <Button size="sm" variant={r.ok ? "outline" : "default"} className="h-9" onClick={r.fix}>
                {r.fixLabel}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Don't force stop CostSplit. If your phone clears apps from Recents, lock CostSplit there (long-press its card). Opening the app sets
        the azan again if the phone dropped it.
      </p>
    </>
  )
}

const OUTPUT_TEXT: Record<Output, string> = {
  auto: "Bluetooth speaker or headphones when one is connected, otherwise the phone's loud alarm speaker.",
  alarm: "Phone's alarm speaker: the loudest, and it plays on silent and in Do Not Disturb.",
  media: "Media sound: goes to Bluetooth or headphones when connected, otherwise the phone speaker.",
}

function SoundSettings({ settings, status, refresh }: { settings: AdhanSettings; status: AdhanStatus | null; refresh: () => void }) {
  return (
    <>
      <SectionTitle>Sound</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Plays through</span>
          <Segmented<Output>
            label="Plays through"
            value={settings.output}
            onChange={(output) => updateAdhanSettings({ output })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "alarm", label: "Loud speaker" },
              { value: "media", label: "Bluetooth" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {OUTPUT_TEXT[settings.output]}
            {isNative && status?.bluetooth ? " Bluetooth is connected now." : ""}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="adhan-volume-on" className="min-w-0">
              <span className="block text-sm font-medium">Set volume for the azan</span>
              <span className="block text-xs text-muted-foreground">
                {settings.volume > 0 ? `${settings.volume}% while it plays, then back to yours` : "Uses the phone's volume as it is"}
              </span>
            </label>
            <Switch
              id="adhan-volume-on"
              checked={settings.volume > 0}
              onCheckedChange={(on) => updateAdhanSettings({ volume: on ? 85 : 0 })}
            />
          </div>
          {settings.volume > 0 && (
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={settings.volume}
              onChange={(e) => updateAdhanSettings({ volume: Number(e.target.value) })}
              aria-label="Azan volume"
              className="h-10 w-full accent-primary"
            />
          )}
        </div>

        {isNative && (
          <ToggleRow
            id="adhan-boost"
            title="Extra loud"
            hint="Boosts the sound past the phone's maximum. Can crackle on small speakers."
            checked={settings.boost}
            onChange={(boost) => updateAdhanSettings({ boost })}
          />
        )}
        {isNative && (
          <ToggleRow
            id="adhan-fade"
            title="Start softly"
            hint="Rises to full volume over 8 seconds"
            checked={settings.fadeIn}
            onChange={(fadeIn) => updateAdhanSettings({ fadeIn })}
          />
        )}
        {isNative && (
          <ToggleRow
            id="adhan-keys"
            title="Volume button stops it"
            hint="Press volume up or down to stop the azan. Calls always stop it."
            checked={settings.volumeKeyStops}
            onChange={(volumeKeyStops) => updateAdhanSettings({ volumeKeyStops })}
          />
        )}

        {isNative && (
          <>
            <SoundChoice
              title="Azan (Dhuhr, Asr, Maghrib, Isha)"
              useFile={settings.sound === "custom"}
              setUseFile={(on) => updateAdhanSettings({ sound: on ? "custom" : "default" })}
              slot="custom"
              owner={settings.files.custom}
              status={status}
              refresh={refresh}
            />
            <SoundChoice
              title="Fajr azan"
              hint="Fajr has its own azan, with “As-salatu khayrun min an-nawm” (prayer is better than sleep)."
              useFile={settings.fajrSound === "custom_fajr"}
              setUseFile={(on) => updateAdhanSettings({ fajrSound: on ? "custom_fajr" : "fajr" })}
              slot="custom_fajr"
              owner={settings.files.custom_fajr}
              status={status}
              refresh={refresh}
            />
          </>
        )}
      </div>
    </>
  )
}

function ToggleRow({ id, title, hint, checked, onChange }: { id: string; title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

/**
 * One azan slot: the home's voice (default, downloaded from your server), the
 * recording inside the app, or your own file. The file slot holds either the
 * home's voice or your file; the built-in one always plays while it's empty.
 */
function SoundChoice({
  title,
  hint,
  useFile,
  setUseFile,
  slot,
  owner,
  status,
  refresh,
}: {
  title: string
  hint?: string
  useFile: boolean
  setUseFile: (on: boolean) => void
  slot: Slot
  owner: "" | "server" | "file"
  status: AdhanStatus | null
  refresh: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<"" | "file" | "voice">("")
  const session = useSession()
  const hasFile = slot === "custom" ? !!status?.customSound : !!status?.customFajrSound
  // A file saved by 2.4.2 (before the home's voices) counts as yours
  const mine = hasFile && owner !== "server"
  const voice = VOICES[slot]

  const pick = async (file: File) => {
    setBusy("file")
    try {
      // Silence at the start and end cut off, long gaps shortened, volume raised
      const prepared = await prepareAzanFile(file).catch(() => null)
      const { duration } = await saveSound(slot, prepared?.file ?? file)
      updateAdhanSettings((s) => ({ files: { ...s.files, [slot]: "file" } }))
      setUseFile(true)
      refresh()
      const length = `${Math.floor(duration / 60000)}:${String(Math.round(duration / 1000) % 60).padStart(2, "0")}`
      const cut = prepared && prepared.cut >= 1 ? ` · ${Math.round(prepared.cut)} s of silence cut` : ""
      toast.success("Azan saved", { description: `${file.name} · ${length}${cut}` })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't use that file")
    } finally {
      setBusy("")
    }
  }

  const homeVoice = async () => {
    setUseFile(true)
    if (hasFile && !mine) return
    setBusy("voice")
    try {
      // The slot is empty (or holds your file): fetch the home's voice into it
      const ok = mine ? await restoreHomeVoice(slot, status) : await ensureVoices(status)
      if (!ok && !session) toast("Sign in to get this voice", { description: "Until then the built-in azan plays." })
      else if (!ok) toast.error("Couldn't download it. Check your connection.")
    } finally {
      setBusy("")
      refresh()
    }
  }

  const pending = useFile && !hasFile
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">{title}</span>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        <Chip selected={useFile && !mine} onClick={homeVoice}>
          {busy === "voice" ? "Downloading…" : voice.name}
        </Chip>
        <Chip selected={!useFile} onClick={() => setUseFile(false)}>
          Built-in
        </Chip>
        {mine && (
          <Chip selected={useFile} onClick={() => setUseFile(true)}>
            My file
          </Chip>
        )}
        <Chip onClick={() => fileRef.current?.click()} aria-label="Choose an audio file">
          <Upload className="size-4" aria-hidden /> {busy === "file" ? "Saving…" : mine ? "Replace" : "My own file"}
        </Chip>
        {mine && (
          <Chip
            aria-label="Remove my file"
            onClick={async () => {
              // Back to the home's voice
              await restoreHomeVoice(slot, status).catch(() => false)
              refresh()
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Chip>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {pending
          ? session
            ? `Getting ${voice.name}'s azan… the built-in one plays until it's on this phone.`
            : `Sign in to get ${voice.name}'s azan. Until then the built-in one plays.`
          : "Your own file: any MP3, M4A or OGG on this phone. Silence at the start and end is cut and the volume raised."}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) pick(file)
          e.target.value = ""
        }}
      />
    </div>
  )
}

function ReminderSettings({ settings }: { settings: AdhanSettings }) {
  return (
    <>
      <SectionTitle>Reminders</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Before each prayer</span>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15, 20, 30].map((m) => (
              <Chip key={m} selected={settings.remindBefore === m} onClick={() => updateAdhanSettings({ remindBefore: m })}>
                {m ? `${m} min` : "Off"}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">A notification before the azan, to finish what you're doing and make wudu.</p>
        </div>
        <ToggleRow
          id="adhan-sunrise"
          title="Sunrise"
          hint="A notification when Fajr time ends"
          checked={settings.sunrise}
          onChange={(sunrise) => updateAdhanSettings({ sunrise })}
        />
      </div>
    </>
  )
}

const R = (deg: number) => (deg * Math.PI) / 180
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const x = Math.sin(R(b.lat - a.lat) / 2) ** 2 + Math.cos(R(a.lat)) * Math.cos(R(b.lat)) * Math.sin(R(b.lng - a.lng) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function PlaceSettings({ settings, place }: { settings: AdhanSettings; place: Place | null }) {
  const mode = settings.location.mode
  const [locating, setLocating] = useState(false)
  const tz = deviceZone()

  const locate = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn't available here")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        const here = { lat: Math.round(coords.latitude * 1e4) / 1e4, lng: Math.round(coords.longitude * 1e4) / 1e4 }
        // Name it after the nearest known city; its country picks the usual method
        const near = [...CITIES].sort((a, b) => distanceKm(here, a) - distanceKm(here, b))[0]
        const km = near ? distanceKm(here, near) : Infinity
        updateAdhanSettings({
          location: {
            mode: "gps",
            ...here,
            name: km < 40 ? `Near ${near.name}` : "My location",
            country: km < 600 ? near.country : (place?.country ?? ""),
          },
        })
        toast.success("Location saved", { description: "Used for prayer times only. It stays on this phone." })
      },
      () => {
        setLocating(false)
        toast.error("Couldn't get your location", { description: "Allow location for CostSplit, or pick a city." })
      },
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 10 * 60_000 }
    )
  }

  return (
    <>
      <SectionTitle>Location</SectionTitle>
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <Segmented<"auto" | "city" | "gps">
          label="Location"
          value={mode}
          onChange={(m) => {
            if (m === "auto") updateAdhanSettings({ location: { mode: "auto" } })
            else if (m === "city") updateAdhanSettings({ location: { mode: "city", id: place && CITIES.some((c) => c.id === place.id) ? place.id : CITIES[0].id } })
            else locate()
          }}
          options={[
            { value: "auto", label: "Time zone" },
            { value: "city", label: "City" },
            { value: "gps", label: "My location" },
          ]}
        />
        {mode === "auto" && (
          <p className="text-xs text-muted-foreground">
            {place ? `Your phone is set to ${tz}, so times are for ${place.name}. Travelling? It follows the phone's time zone.` : `No city known for ${tz}. Pick one.`}{" "}
            For your own town, pick it or use your location (one degree east or west is 4 minutes).
          </p>
        )}
        {mode === "city" && (
          <select
            aria-label="City"
            value={settings.location.mode === "city" ? settings.location.id : ""}
            onChange={(e) => updateAdhanSettings({ location: { mode: "city", id: e.target.value } })}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <optgroup label="Bangladesh">
              {CITIES.filter((c) => c.id.startsWith("bd-")).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="World">
              {CITIES.filter((c) => !c.id.startsWith("bd-")).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {COUNTRY_NAMES[c.country] ? `, ${COUNTRY_NAMES[c.country]}` : ""}
                </option>
              ))}
            </optgroup>
          </select>
        )}
        {mode === "gps" && settings.location.mode === "gps" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {settings.location.name} ({settings.location.lat.toFixed(3)}, {settings.location.lng.toFixed(3)})
            </p>
            <Button size="sm" variant="outline" className="h-9" onClick={locate} disabled={locating}>
              <LocateFixed /> {locating ? "Finding…" : "Update"}
            </Button>
          </div>
        )}
        {mode !== "gps" && locating && <p className="text-xs text-muted-foreground">Finding your location…</p>}
      </div>
    </>
  )
}

function Stepper({ value, onChange, min, max, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button size="icon" variant="outline" className="size-9" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`${label}: less`} disabled={value <= min}>
        <Minus />
      </Button>
      <span className="w-14 text-center text-sm font-medium tabular">{format ? format(value) : value}</span>
      <Button size="icon" variant="outline" className="size-9" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`${label}: more`} disabled={value >= max}>
        <Plus />
      </Button>
    </div>
  )
}

function CalcSettings({ settings, place }: { settings: AdhanSettings; place: Place | null }) {
  const resolved = place ? resolveMethod(settings, place) : null
  const minutes = (v: number) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)} min`)
  return (
    <>
      <SectionTitle>Calculation</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <label htmlFor="adhan-method" className="text-sm font-medium">
            Method
          </label>
          <select
            id="adhan-method"
            value={settings.method}
            onChange={(e) => updateAdhanSettings({ method: e.target.value as "auto" | MethodId })}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="auto">Auto{resolved && settings.method === "auto" ? `: ${methodName(resolved.method)}` : " (usual for your country)"}</option>
            {METHOD_IDS.map((id) => (
              <option key={id} value={id}>
                {METHODS[id].name}
              </option>
            ))}
          </select>
          {resolved && <p className="text-xs text-muted-foreground">{METHODS[resolved.method].hint}</p>}
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Asr</span>
          <Segmented<AdhanSettings["asr"]>
            label="Asr"
            value={settings.asr}
            onChange={(asr) => updateAdhanSettings({ asr })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "standard", label: "Standard" },
              { value: "hanafi", label: "Hanafi" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            {resolved ? `Now: ${resolved.asr === 2 ? "Hanafi (later Asr, usual in Bangladesh, Pakistan, India)" : "Standard: Shafi'i, Maliki, Hanbali"}` : ""}
          </p>
        </div>

        {place && Math.abs(place.lat) > 45 && (
          <div className="space-y-2">
            <label htmlFor="adhan-highlat" className="text-sm font-medium">
              Far north or south
            </label>
            <select
              id="adhan-highlat"
              value={settings.highLat}
              onChange={(e) => updateAdhanSettings({ highLat: e.target.value as "auto" | HighLatRule })}
              className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="auto">Auto</option>
              <option value="middle">Middle of the night</option>
              <option value="seventh">One seventh of the night</option>
              <option value="angle">Angle based</option>
            </select>
            <p className="text-xs text-muted-foreground">How Fajr and Isha are set when the sky never gets fully dark in summer.</p>
          </div>
        )}

        <div className="space-y-2">
          <span className="text-sm font-medium">Adjust minutes</span>
          <p className="text-xs text-muted-foreground">Match your local mosque or Islamic Foundation timetable.</p>
          <ul className="divide-y">
            {SALAH.map((p) => (
              <li key={p} className="flex items-center justify-between py-1.5">
                <span className="text-sm">{prayerName(p)}</span>
                <Stepper
                  label={`${prayerName(p)} minutes`}
                  value={settings.prayers[p].offset}
                  min={-30}
                  max={30}
                  format={minutes}
                  onChange={(offset) => updateAdhanSettings((s) => ({ prayers: { ...s.prayers, [p]: { ...s.prayers[p], offset } } }))}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <MoonStar className="size-4" aria-hidden /> Hijri date
            </span>
            <span className="block text-xs text-muted-foreground">Move it by a day or two for local moon sighting</span>
          </span>
          <Stepper
            label="Hijri date days"
            value={settings.hijriOffset}
            min={-2}
            max={2}
            format={(v) => (v === 0 ? "0" : `${v > 0 ? "+" : "−"}${Math.abs(v)} d`)}
            onChange={(hijriOffset) => updateAdhanSettings({ hijriOffset })}
          />
        </div>
      </div>
    </>
  )
}
