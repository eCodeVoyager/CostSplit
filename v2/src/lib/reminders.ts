import type { BillStatus } from "@/hooks/useTripData"
import { addDays, parseISODate, shiftMonth, shortDate, toISODate } from "./dates"
import { formatMoney } from "./money"
import type { Bill, ShopItem, Trip } from "./types"

/** A reminder the phone shows by itself at a set time, even when the app is closed */
export interface PlannedReminder {
  key: string
  title: string
  body: string
  at: Date
  /** In-app path to open when tapped */
  url: string
  /** Repeat at the same time every day */
  daily?: boolean
}

export interface GroupSnapshot {
  trip: Pick<Trip, "id" | "name" | "currency" | "mealMode" | "kind">
  meId: string | null
  bills: Bill[]
  billStatus: BillStatus[]
  /** My balance in this group (negative = I owe) */
  net: number | null
  /** Open to-buy items I said I'd buy (or was asked to) */
  toBuy?: ShopItem[]
}

const at = (iso: string, hour: number, minute = 0) => {
  const d = parseISODate(iso)
  d.setHours(hour, minute, 0, 0)
  return d
}

/** Bill due days (this month and next), overdue bills, the daily meal count and a weekly settle-up nudge */
export function planReminders(groups: GroupSnapshot[], now: Date = new Date()): PlannedReminder[] {
  const out: PlannedReminder[] = []
  const today = toISODate(now)
  const later = (d: Date) => d.getTime() > now.getTime() + 60_000

  for (const g of groups) {
    if (!g.meId) continue
    const base = `/t/${g.trip.id}`
    const money = (v: number) => formatMoney(v, g.trip.currency)

    for (const st of g.billStatus) {
      if (st.paid) continue
      const amount = st.bill.amount ? ` · ${money(st.bill.amount)}` : ""
      if (st.due >= today) {
        const when = at(st.due, 9)
        if (later(when)) {
          out.push({ key: `bill:${st.bill.id}:${st.period}`, title: `${st.bill.title} is due today`, body: `${g.trip.name}${amount}. Tap to pay.`, at: when, url: `${base}/bills` })
        }
      } else {
        // Overdue: one nudge tomorrow morning (rescheduled each time the app opens)
        out.push({
          key: `overdue:${st.bill.id}:${st.period}`,
          title: `${st.bill.title} is overdue`,
          body: `${g.trip.name}${amount}. Pay it or mark who paid.`,
          at: at(addDays(today, 1), 9),
          url: `${base}/bills`,
        })
      }
    }

    // Next month too, so the reminder still comes if nobody opens the app in between
    const next = shiftMonth(today.slice(0, 7), 1)
    for (const bill of g.bills) {
      if (!bill.active || bill.deleted) continue
      const due = `${next}-${String(bill.dueDay).padStart(2, "0")}`
      out.push({
        key: `bill:${bill.id}:${next}`,
        title: `${bill.title} is due today`,
        body: `${g.trip.name}${bill.amount ? ` · ${money(bill.amount)}` : ""}. Tap to pay.`,
        at: at(due, 9),
        url: `${base}/bills`,
      })
    }

    // Whoever is buying: on the day it's needed (urgent = today), or one evening nudge for the rest
    const undated: ShopItem[] = []
    for (const item of g.toBuy ?? []) {
      const need = item.needBy ?? (item.urgent ? today : undefined)
      const label = `${item.name}${item.urgent ? " (urgent)" : ""}`
      if (!need) {
        undated.push(item)
      } else if (need < today) {
        out.push({ key: `buy:${item.id}`, title: `Still to buy: ${label}`, body: `${g.trip.name}: it was needed by ${shortDate(need)}.`, at: at(addDays(today, 1), 9), url: `${base}/list` })
      } else {
        const morning = at(need, 9)
        const evening = at(need, 18)
        out.push({
          key: `buy:${item.id}`,
          title: `Buy ${label} today`,
          body: `${g.trip.name}: you said you'd buy it. Tick it off when it's done.`,
          at: later(morning) ? morning : later(evening) ? evening : at(addDays(today, 1), 9),
          url: `${base}/list`,
        })
      }
    }
    if (undated.length) {
      const evening = at(today, 18)
      out.push({
        key: `buy:${g.trip.id}`,
        title: `You're buying ${undated.length === 1 ? undated[0].name : `${undated.length} things`}`,
        body: `${g.trip.name}: ${undated.map((i) => i.name).slice(0, 5).join(", ")}`,
        at: later(evening) ? evening : at(addDays(today, 1), 18),
        url: `${base}/list`,
      })
    }

    if (g.trip.mealMode) {
      const tonight = at(today, 21, 30)
      out.push({
        key: `meals:${g.trip.id}`,
        title: "Count today's meals",
        body: `${g.trip.name}: it takes a few seconds and keeps the meal rate right.`,
        at: later(tonight) ? tonight : at(addDays(today, 1), 21, 30),
        url: `${base}/meals`,
        daily: true,
      })
    }

    if (g.net !== null && g.net < 0) {
      // Next Friday 8 pm
      const day = parseISODate(today)
      const ahead = (5 - day.getDay() + 7) % 7 || 7
      out.push({
        key: `settle:${g.trip.id}`,
        title: `You owe ${money(-g.net)} in ${g.trip.name}`,
        body: "Settle up when you can. Tap to see who to pay.",
        at: at(addDays(today, ahead), 20),
        url: `${base}/balances`,
      })
    }
  }
  return out
}

/** Stable positive 31-bit id for a notification key */
export function notificationId(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 1) || 1
}
