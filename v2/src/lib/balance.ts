import { allocate, convertToBase } from "./money"
import type { Expense, ID, Meal, Member, Payment, Trip } from "./types"

/** YYYY-MM -> memberId -> meals eaten that month */
export type MealWeights = Map<string, Record<ID, number>>

export const monthOf = (date: string) => date.slice(0, 7)

export function mealWeights(meals: Meal[]): MealWeights {
  const map: MealWeights = new Map()
  for (const m of meals) {
    if (m.deleted || m.count <= 0) continue
    const month = map.get(monthOf(m.date)) ?? {}
    month[m.memberId] = (month[m.memberId] ?? 0) + m.count
    map.set(monthOf(m.date), month)
  }
  return map
}

/** Counts as spending in totals and insights (loans and money in don't) */
export const isSpending = (e: Expense) => e.kind !== "income" && e.category !== "loan"

export interface ExpenseImpact {
  /** Amount in trip base minor units (always positive) */
  total: number
  /** Positive = paid for the group. Negative for income: they're holding the group's money */
  paid: Record<ID, number>
  /** Positive = share consumed. Negative for income: their cut of the money */
  owed: Record<ID, number>
}

function weightsFor(expense: Expense, meals?: MealWeights): Record<ID, number> {
  if (expense.splitMode !== "meals") return expense.split
  // Bazar by meals: only people allowed in `split` who ate that month
  const month = meals?.get(monthOf(expense.date)) ?? {}
  const eaten = Object.fromEntries(Object.entries(month).filter(([id, n]) => n > 0 && (expense.split[id] ?? 0) > 0))
  // Nobody counted yet this month: fall back to an equal split
  return Object.keys(eaten).length > 0 ? eaten : expense.split
}

/** What each member paid and owes for one expense, in trip base currency */
export function expenseImpact(expense: Expense, trip: Pick<Trip, "currency">, meals?: MealWeights): ExpenseImpact {
  const total = convertToBase(expense.amount, expense.currency, expense.rate, trip.currency)
  const sign = expense.kind === "income" ? -1 : 1
  const signed = (rec: Record<ID, number>) =>
    sign === 1 ? rec : Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, -v]))
  return {
    total,
    paid: signed(allocate(total, expense.paidBy)),
    owed: signed(allocate(total, weightsFor(expense, meals))),
  }
}

export interface MemberBalance {
  memberId: ID
  name: string
  /** Total paid for expenses */
  paid: number
  /** Total share consumed */
  share: number
  /** Positive = gets money back, negative = owes */
  net: number
  removed: boolean
}

export interface Transfer {
  from: ID
  to: ID
  amount: number
}

export function computeBalances(
  trip: Pick<Trip, "currency">,
  members: Member[],
  expenses: Expense[],
  payments: Payment[],
  meals?: MealWeights
): MemberBalance[] {
  const map = new Map<ID, MemberBalance>()
  const ensure = (id: ID) => {
    let b = map.get(id)
    if (!b) {
      b = { memberId: id, name: "Unknown", paid: 0, share: 0, net: 0, removed: true }
      map.set(id, b)
    }
    return b
  }

  members.forEach((m) => {
    const b = ensure(m.id)
    b.name = m.name
    b.removed = m.deleted === 1 || m.archived === 1
  })

  expenses.forEach((e) => {
    if (e.deleted) return
    const { paid, owed } = expenseImpact(e, trip, meals)
    Object.entries(paid).forEach(([id, v]) => {
      const b = ensure(id)
      b.paid += v
      b.net += v
    })
    Object.entries(owed).forEach(([id, v]) => {
      const b = ensure(id)
      b.share += v
      b.net -= v
    })
  })

  // A payment from A to B moves both of them towards zero
  payments.forEach((p) => {
    if (p.deleted) return
    ensure(p.from).net += p.amount
    ensure(p.to).net -= p.amount
  })

  // Removed or moved-out members stay visible until they're settled
  return [...map.values()].filter((b) => !b.removed || b.net !== 0)
}

/** Greedy: largest debtor pays largest creditor until everyone is settled */
export function suggestTransfers(balances: MemberBalance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.memberId, left: b.net }))
    .sort((a, b) => b.left - a.left)
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.memberId, left: -b.net }))
    .sort((a, b) => b.left - a.left)

  const transfers: Transfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left)
    if (amount > 0) transfers.push({ from: debtors[i].id, to: creditors[j].id, amount })
    debtors[i].left -= amount
    creditors[j].left -= amount
    if (debtors[i].left === 0) i++
    if (creditors[j].left === 0) j++
  }
  return transfers
}
