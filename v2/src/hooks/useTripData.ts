import { useLiveQuery } from "dexie-react-hooks"
import { createContext, useContext, useMemo } from "react"
import {
  computeBalances,
  mealWeights,
  suggestTransfers,
  type MealWeights,
  type MemberBalance,
  type Transfer,
} from "@/lib/balance"
import { toISODate } from "@/lib/dates"
import { db, getKV, meKey } from "@/lib/db"
import type { Bill, Expense, GroupKind, Meal, Member, Payment, ShopItem, Trip } from "@/lib/types"

export interface BillStatus {
  bill: Bill
  /** YYYY-MM */
  period: string
  /** The expense that paid it, if any */
  paid?: Expense
  /** YYYY-MM-DD */
  due: string
  overdue: boolean
}

export interface TripData {
  trip: Trip
  kind: GroupKind
  /** People who can be picked for new expenses (not moved out), in the order added */
  members: Member[]
  /** Everyone still in the group, including moved-out people */
  everyone: Member[]
  /** Includes removed members, for names on old expenses */
  names: Map<string, string>
  /** Newest first */
  expenses: Expense[]
  payments: Payment[]
  bills: Bill[]
  /** This month's bills (and last month's if still unpaid) */
  billStatus: BillStatus[]
  meals: Meal[]
  /** date -> memberId -> count */
  mealsByDay: Map<string, Record<string, number>>
  mealWeights: MealWeights
  items: ShopItem[]
  meId: string | null
  balances: MemberBalance[]
  transfers: Transfer[]
  /** Unsynced local changes */
  pending: number
}

const byCreated = (a: { createdAt: number }, b: { createdAt: number }) => a.createdAt - b.createdAt
const newestFirst = (a: { date: string; createdAt: number }, b: { date: string; createdAt: number }) =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt

export function shiftMonth(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function billStatuses(bills: Bill[], expenses: Expense[]): BillStatus[] {
  const today = toISODate()
  const current = today.slice(0, 7)
  const previous = shiftMonth(current, -1)
  const paidBy = new Map(expenses.filter((e) => e.billId && e.period).map((e) => [`${e.billId}:${e.period}`, e]))
  const out: BillStatus[] = []
  for (const bill of bills) {
    if (!bill.active) continue
    const created = toISODate(new Date(bill.createdAt))
    for (const period of [previous, current]) {
      const paid = paidBy.get(`${bill.id}:${period}`)
      // Last month only matters if the bill existed then and is still unpaid
      if (period === previous && (paid || created.slice(0, 7) >= current)) continue
      const due = `${period}-${String(bill.dueDay).padStart(2, "0")}`
      // A bill added after its due day (new home on the 26th, rent due the 5th) isn't late yet
      out.push({ bill, period, paid, due, overdue: !paid && due < today && created <= due })
    }
  }
  return out.sort((a, b) => Number(!!a.paid) - Number(!!b.paid) || a.due.localeCompare(b.due))
}

/** undefined while loading, null when the group isn't on this device */
export function useTripQuery(tripId: string): TripData | null | undefined {
  const raw = useLiveQuery(async () => {
    const trip = await db.trips.get(tripId)
    if (!trip) return null
    const [members, expenses, payments, bills, meals, items, meId] = await Promise.all([
      db.members.where("tripId").equals(tripId).toArray(),
      db.expenses.where("tripId").equals(tripId).toArray(),
      db.payments.where("tripId").equals(tripId).toArray(),
      db.bills.where("tripId").equals(tripId).toArray(),
      db.meals.where("tripId").equals(tripId).toArray(),
      db.items.where("tripId").equals(tripId).toArray(),
      getKV<string | null>(meKey(tripId), null),
    ])
    return { trip, members, expenses, payments, bills, meals, items, meId }
  }, [tripId])

  return useMemo(() => {
    if (raw === undefined || raw === null) return raw
    const { trip, members, expenses, payments, bills, meals, items, meId } = raw
    const everyone = members.filter((m) => !m.deleted).sort(byCreated)
    const active = everyone.filter((m) => !m.archived)
    const liveExpenses = expenses.filter((e) => !e.deleted).sort(newestFirst)
    const livePayments = payments.filter((p) => !p.deleted).sort(newestFirst)
    const liveMeals = meals.filter((m) => !m.deleted)
    const weights = mealWeights(liveMeals)
    const balances = computeBalances(trip, members, liveExpenses, livePayments, weights)
    const mealsByDay = new Map<string, Record<string, number>>()
    for (const m of liveMeals) mealsByDay.set(m.date, { ...mealsByDay.get(m.date), [m.memberId]: m.count })
    const liveBills = bills.filter((b) => !b.deleted).sort((a, b) => a.dueDay - b.dueDay || byCreated(a, b))
    const pending = [trip, ...members, ...expenses, ...payments, ...bills, ...meals, ...items].filter((r) => r.dirty).length

    return {
      trip,
      kind: trip.kind ?? "trip",
      members: active,
      everyone,
      names: new Map(
        members.map((m) => [m.id, m.deleted ? `${m.name} (removed)` : m.archived ? `${m.name} (moved out)` : m.name])
      ),
      expenses: liveExpenses,
      payments: livePayments,
      bills: liveBills,
      billStatus: billStatuses(liveBills, liveExpenses),
      meals: liveMeals,
      mealsByDay,
      mealWeights: weights,
      items: items.filter((i) => !i.deleted).sort((a, b) => a.done - b.done || byCreated(a, b)),
      meId: meId && active.some((m) => m.id === meId) ? meId : null,
      balances,
      transfers: suggestTransfers(balances),
      pending,
    }
  }, [raw])
}

export const TripContext = createContext<TripData | null>(null)

export function useTrip(): TripData {
  const data = useContext(TripContext)
  if (!data) throw new Error("useTrip must be used inside a group screen")
  return data
}
