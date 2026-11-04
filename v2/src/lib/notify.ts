import { notificationId, type PlannedReminder } from "./reminders"
import { isNative } from "./server"

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications)

export type NotifyPermission = "granted" | "denied" | "prompt" | "unsupported"

export async function notifyPermission(): Promise<NotifyPermission> {
  if (isNative) {
    const { display } = await (await plugin()).checkPermissions()
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt"
  }
  if (!("Notification" in window)) return "unsupported"
  return Notification.permission === "default" ? "prompt" : Notification.permission
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (isNative) return (await (await plugin()).requestPermissions()).display === "granted"
  if (!("Notification" in window)) return false
  return (await Notification.requestPermission()) === "granted"
}

/** Replace every reminder this app scheduled with `list` (Android app only) */
export async function applyReminders(list: PlannedReminder[]) {
  if (!isNative) return
  const ln = await plugin()
  if ((await ln.checkPermissions()).display !== "granted") return
  const { notifications } = await ln.getPending()
  const ours = notifications.filter((n) => n.extra?.costsplit === "reminder")
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
  if (list.length === 0) return
  await ln.schedule({
    notifications: list.slice(0, 60).map((r) => ({
      id: notificationId(r.key),
      title: r.title,
      body: r.body,
      schedule: r.daily
        ? { on: { hour: r.at.getHours(), minute: r.at.getMinutes() }, allowWhileIdle: true }
        : { at: r.at, allowWhileIdle: true },
      extra: { costsplit: "reminder", url: r.url },
    })),
  })
}

/** Show a notification right now (someone added an expense, assigned you an item...) */
export async function showNow(title: string, body: string, url: string, tag: string) {
  if (isNative) {
    const ln = await plugin()
    if ((await ln.checkPermissions()).display !== "granted") return
    await ln.schedule({ notifications: [{ id: notificationId(`${tag}:${Date.now()}`), title, body, extra: { costsplit: "activity", url } }] })
    return
  }
  if (!("Notification" in window) || Notification.permission !== "granted") return
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  if (reg) await reg.showNotification(title, { body, tag, data: { url }, icon: "/pwa-192x192.png", badge: "/pwa-64x64.png" })
  else new Notification(title, { body, tag })
}

/** Tapping a notification opens its screen */
export async function onNotificationTap(open: (url: string) => void) {
  if (isNative) {
    const handle = await (await plugin()).addListener("localNotificationActionPerformed", (a) => {
      const url = a.notification.extra?.url
      if (typeof url === "string") open(url)
    })
    return () => handle.remove()
  }
  // The service worker (public/notify-sw.js) forwards taps to the open window
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === "costsplit:open" && typeof e.data.url === "string") open(e.data.url)
  }
  navigator.serviceWorker?.addEventListener("message", onMessage)
  return () => navigator.serviceWorker?.removeEventListener("message", onMessage)
}
