import { useEffect } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { useAllGroups } from "@/hooks/useAllGroups"
import { mealWeights } from "@/lib/balance"
import { db, getKV, meKey } from "@/lib/db"
import { describeEvent, inboxEvents, type InboxEvent } from "@/lib/inbox"
import { applyReminders, notifyPermission, onNotificationTap, requestNotifyPermission, showNow } from "@/lib/notify"
import { planReminders } from "@/lib/reminders"
import { getPrefs, usePrefs } from "@/lib/review"
import { isNative } from "@/lib/server"
import { onRemoteChanges } from "@/lib/sync"
import type { Expense, Payment, ShopItem } from "@/lib/types"

const ASKED_KEY = "costsplit:notifyAsked"

/** Worth interrupting someone for: things that touch their money or their to-buy list */
function concernsMe(ev: InboxEvent, meId: string | null) {
  if (!meId) return false
  switch (ev.kind) {
    case "expense-added":
    case "expense-edited":
    case "expense-deleted":
      return meId in ev.expense.paidBy || meId in ev.expense.split
    case "payment":
      return ev.payment.from === meId || ev.payment.to === meId
    case "item-assigned":
      return true
    case "item-urgent":
      // Everyone hears about it until someone takes it; then only the buyer
      return !ev.item.assignee || ev.item.assignee === meId
    case "items-added":
      return false
  }
}

/**
 * Runs in the background for the whole app: schedules reminders on the phone,
 * tells you when others change something that involves you, and opens the
 * right screen when a notification is tapped.
 */
export function NotificationsHost() {
  const [, navigate] = useLocation()
  const prefs = usePrefs()
  const groups = useAllGroups()

  useEffect(() => {
    let off: (() => void) | undefined
    onNotificationTap((url) => navigate(url))
      .then((f) => (off = f))
      .catch(() => {})
    return () => off?.()
  }, [navigate])

  // Ask once, the first time there's a group to remind about (Android 13+ needs it)
  useEffect(() => {
    if (!isNative || !groups?.length || !(prefs.notifyReminders || prefs.notifyActivity)) return
    try {
      if (localStorage.getItem(ASKED_KEY)) return
      localStorage.setItem(ASKED_KEY, "1")
    } catch {
      return
    }
    notifyPermission()
      .then((p) => (p === "prompt" ? requestNotifyPermission() : false))
      .catch(() => {})
  }, [groups?.length, prefs.notifyReminders, prefs.notifyActivity])

  // Reminders live on the phone, so they fire even with the app closed. Rebuilt whenever data changes.
  useEffect(() => {
    if (!isNative || groups === undefined) return
    const timer = setTimeout(() => {
      const plan = prefs.notifyReminders
        ? planReminders(
            groups.map((g) => ({ trip: g.trip, meId: g.meId, bills: g.bills, billStatus: g.billStatus, net: g.me?.net ?? null, toBuy: g.toBuy }))
          )
        : []
      applyReminders(plan).catch(() => {})
    }, 1500)
    return () => clearTimeout(timer)
  }, [groups, prefs.notifyReminders])

  useEffect(() => {
    const off = onRemoteChanges(async (tripId, changes) => {
        if (!getPrefs().notifyActivity) return
        const trip = await db.trips.get(tripId)
        if (!trip) return
        const [meId, members, meals] = await Promise.all([
          getKV<string | null>(meKey(tripId), null),
          db.members.where("tripId").equals(tripId).toArray(),
          db.meals.where("tripId").equals(tripId).toArray(),
        ])
        const rows = <T,>(name: string) => changes.filter((c) => c.table === name).map((c) => c.record as T)
        const events = inboxEvents({
          meId,
          expenses: rows<Expense>("expenses"),
          payments: rows<Payment>("payments"),
          items: rows<ShopItem>("items"),
          // Rows synced late (added offline yesterday) still count
          since: Date.now() - 86_400_000,
        }).filter((ev) => concernsMe(ev, meId))
        if (events.length === 0) return

        const ctx = { meId, names: new Map(members.map((m) => [m.id, m.name])), trip, meals: mealWeights(meals.filter((m) => !m.deleted)) }
        const lines = events.map((ev) => describeEvent(ev, ctx))
        const url = `/t/${tripId}?inbox`
        if (document.visibilityState === "visible") {
          toast(events.length === 1 ? lines[0].title : `${events.length} updates in ${trip.name}`, {
            description: events.length === 1 ? lines[0].body : lines.slice(0, 2).map((l) => l.title).join(" · "),
            action: { label: "View", onClick: () => navigate(url) },
          })
          return
        }
        if (events.length <= 2) {
          for (const [i, l] of lines.entries()) await showNow(`${trip.emoji} ${l.title}`, `${trip.name} · ${l.body}`, url, events[i].key)
        } else {
          await showNow(`${trip.emoji} ${events.length} updates in ${trip.name}`, lines.slice(0, 3).map((l) => l.title).join("\n"), url, tripId)
        }
      })
    return () => {
      off()
    }
  }, [navigate])

  return null
}
