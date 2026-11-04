import { useLiveQuery } from "dexie-react-hooks"
import { computeBalances, mealWeights, suggestTransfers, type MemberBalance, type Transfer } from "@/lib/balance"
import { toISODate } from "@/lib/dates"
import { db, getKV, meKey } from "@/lib/db"
import { INBOX_DAYS, inboxEvents, seenKey } from "@/lib/inbox"
import { mySpending, type MySpending } from "@/lib/personal"
import type { Bill, ShopItem, Trip } from "@/lib/types"
import { billStatuses, type BillStatus } from "./useTripData"

export interface GroupSummary {
  trip: Trip
  meId: string | null
  names: Map<string, string>
  people: number
  /** Live expenses */
  count: number
  me?: MemberBalance
  /** Payments I should make */
  iOwe: Transfer[]
  bills: Bill[]
  billStatus: BillStatus[]
  /** My spending this month: share + personal */
  month: MySpending
  /** Open to-buy items assigned to me */
  toBuy: ShopItem[]
  /** Urgent items nobody has taken yet */
  urgentFree: ShopItem[]
  /** Other people's changes I haven't looked at */
  unread: number
  lastActivity: number
}

/** Every group on this phone, summarised for the dashboard and reminders. undefined while loading. */
export function useAllGroups(): GroupSummary[] | undefined {
  return useLiveQuery(async () => {
    const trips = (await db.trips.toArray()).filter((t) => !t.deleted)
    const month = toISODate().slice(0, 7)
    const rows = await Promise.all(
      trips.map(async (trip): Promise<GroupSummary> => {
        const [members, expenses, payments, meals, bills, items, personal, meId, seen] = await Promise.all([
          db.members.where("tripId").equals(trip.id).toArray(),
          db.expenses.where("tripId").equals(trip.id).toArray(),
          db.payments.where("tripId").equals(trip.id).toArray(),
          db.meals.where("tripId").equals(trip.id).toArray(),
          db.bills.where("tripId").equals(trip.id).toArray(),
          db.items.where("tripId").equals(trip.id).toArray(),
          db.personal.where("tripId").equals(trip.id).toArray(),
          getKV<string | null>(meKey(trip.id), null),
          getKV<number | null>(seenKey(trip.id), null),
        ])
        const live = expenses.filter((e) => !e.deleted)
        const livePayments = payments.filter((p) => !p.deleted)
        const weights = mealWeights(meals.filter((m) => !m.deleted))
        const balances = computeBalances(trip, members, live, livePayments, weights)
        const liveBills = bills.filter((b) => !b.deleted)
        const liveItems = items.filter((i) => !i.deleted)
        const unread =
          seen == null
            ? 0
            : inboxEvents({ meId, expenses, payments: livePayments, items: liveItems, since: Math.max(seen, Date.now() - INBOX_DAYS * 86_400_000) })
                .length
        return {
          trip,
          meId,
          names: new Map(members.map((m) => [m.id, m.name])),
          people: members.filter((m) => !m.deleted).length,
          count: live.length,
          me: balances.find((b) => b.memberId === meId),
          iOwe: meId ? suggestTransfers(balances).filter((t) => t.from === meId) : [],
          bills: liveBills,
          billStatus: billStatuses(liveBills, live),
          month: mySpending(month, meId, trip, live, personal.filter((p) => !p.deleted), weights),
          toBuy: meId ? liveItems.filter((i) => !i.done && i.assignee === meId) : [],
          urgentFree: liveItems.filter((i) => !i.done && i.urgent && !i.assignee),
          unread,
          lastActivity: Math.max(trip.updatedAt, ...live.map((e) => e.updatedAt)),
        }
      })
    )
    return rows.sort((a, b) => b.lastActivity - a.lastActivity)
  })
}
