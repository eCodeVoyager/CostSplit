import { registerPlugin } from "@capacitor/core"
import { isNative } from "../server"
import type { NativeConfig } from "./settings"

/** What the phone reports about the azan and everything that could stop it from playing */
export interface AdhanStatus {
  enabled: boolean
  /** Next thing scheduled: an azan, a notification or a reminder */
  next: { at: number; prayer: string; kind: "adhan" | "notify" | "remind" } | null
  /** Why nothing is scheduled ("no-location", "disabled", "nothing-on") */
  reason: string
  place: string
  playing: string
  lastPlayed: { at: number; prayer: string } | null
  notifications: boolean
  /** The azan notification channel isn't turned off */
  channel: boolean
  exactAlarms: boolean
  batteryUnrestricted: boolean
  /** The phone maker has its own "auto start" / "background" screen */
  autostartScreen: boolean
  manufacturer: string
  alarmVolume: number
  mediaVolume: number
  bluetooth: boolean
  /** Do Not Disturb is on (alarms still play) */
  dnd: boolean
  customSound: boolean
  customFajrSound: boolean
  sdk: number
}

export type SettingsTarget = "battery" | "exact" | "notifications" | "channel" | "autostart" | "app"

/** Native side: android/app/src/main/java/app/costsplit/AdhanPlugin.java */
interface AdhanPlugin {
  configure(options: { config: string }): Promise<AdhanStatus>
  status(): Promise<AdhanStatus>
  preview(options: { prayer: string }): Promise<void>
  stop(): Promise<void>
  /** Schedules a real azan in `seconds`, to check it plays with the app closed */
  testSoon(options: { seconds: number }): Promise<{ at: number }>
  openSettings(options: { target: SettingsTarget }): Promise<{ opened: boolean }>
  saveSound(options: { slot: "custom" | "custom_fajr"; data: string }): Promise<{ duration: number }>
  deleteSound(options: { slot: "custom" | "custom_fajr" }): Promise<void>
}

const Adhan = registerPlugin<AdhanPlugin>("Adhan")

let lastSent = ""

/** Hand the settings to the phone, which schedules the next azan (and every one after it) */
export async function configureNative(config: NativeConfig, force = false): Promise<AdhanStatus | null> {
  if (!isNative) return null
  const json = JSON.stringify(config)
  if (!force && json === lastSent) return Adhan.status().catch(() => null)
  const status = await Adhan.configure({ config: json })
  lastSent = json
  return status
}

export const nativeStatus = () => (isNative ? Adhan.status().catch(() => null) : Promise.resolve(null))
export const previewAdhan = (prayer: string) => Adhan.preview({ prayer })
export const stopAdhan = () => Adhan.stop()
export const testAdhanSoon = (seconds: number) => Adhan.testSoon({ seconds })
export const openAdhanSettings = (target: SettingsTarget) => Adhan.openSettings({ target })
export const deleteSound = (slot: "custom" | "custom_fajr") => Adhan.deleteSound({ slot })

/** Saves an audio file you picked as the azan (or the Fajr azan) */
export async function saveSound(slot: "custom" | "custom_fajr", file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error("That file is too big (about 8 minutes at most)")
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(new Error("Couldn't read that file"))
    reader.readAsDataURL(file)
  })
  return Adhan.saveSound({ slot, data })
}
