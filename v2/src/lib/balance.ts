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

/**
 * Fewest payments that settle these nets (positive = gets money back).
 * Greedy: largest debtor pays largest creditor until everyone is at zero.
 * Works for any number of people; ties keep input order, so every device agrees.
 */
export function settleNets(nets: Record<ID, number>): Transfer[] {
  const entries = Object.entries(nets)
  const creditors = entries
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, left: v }))
    .sort((a, b) => b.left - a.left)
  const debtors = entries
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, left: -v }))
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

/** Greedy: largest debtor pays largest creditor until everyone is settled */
export function suggestTransfers(balances: MemberBalance[]): Transfer[] {
  return settleNets(Object.fromEntries(balances.map((b) => [b.memberId, b.net])))
}

/** Each person's net for one expense: paid minus share */
export function impactNets(impact: Pick<ExpenseImpact, "paid" | "owed">): Record<ID, number> {
  const nets: Record<ID, number> = {}
  for (const [id, v] of Object.entries(impact.paid)) nets[id] = (nets[id] ?? 0) + v
  for (const [id, v] of Object.entries(impact.owed)) nets[id] = (nets[id] ?? 0) - v
  return nets
}

/**
 * Who pays whom for this one expense, for any number of payers and sharers
 * ("Rafi → Ehsan ৳250, Mitu → Ehsan ৳150, Mitu → Sakib ৳100").
 */
export function expenseTransfers(impact: Pick<ExpenseImpact, "paid" | "owed">): Transfer[] {
  return settleNets(impactNets(impact))
}

/**
 * Who owes whom without combining debts across people: every expense is settled
 * on its own, payments are subtracted, and each pair is netted. Same totals per
 * person as the simplified list, but nobody pays someone they never shared with.
 */
export function directDebts(
  trip: Pick<Trip, "currency">,
  expenses: Expense[],
  payments: Payment[],
  meals?: MealWeights
): Transfer[] {
  // "a|b" with a < b -> positive: a owes b, negative: b owes a
  const pairs = new Map<string, number>()
  const owe = (from: ID, to: ID, amount: number) => {
    if (from === to || !amount) return
    const key = from < to ? `${from}|${to}` : `${to}|${from}`
    pairs.set(key, (pairs.get(key) ?? 0) + (from < to ? amount : -amount))
  }
  for (const e of expenses) {
    if (e.deleted) continue
    for (const t of expenseTransfers(expenseImpact(e, trip, meals))) owe(t.from, t.to, t.amount)
  }
  // A paid B back: A owes B that much less
  for (const p of payments) if (!p.deleted) owe(p.to, p.from, p.amount)

  const out: Transfer[] = []
  for (const [key, v] of pairs) {
    if (v === 0) continue
    const [a, b] = key.split("|")
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v })
  }
  return out.sort((x, y) => y.amount - x.amount)
}

export interface LedgerEntry {
  kind: "expense" | "payment"
  id: ID
  date: string
  createdAt: number
  /** What this person put in (paid for the group, or handed over), base minor units */
  paid: number
  /** Their share, or money they received */
  share: number
  /** Change to their balance: positive = gets more back, negative = owes more */
  effect: number
  /** Their balance after this item */
  running: number
  expense?: Expense
  payment?: Payment
}

/** Every expense and payment that moved one person's balance, oldest first, with a running total */
export function memberLedger(
  memberId: ID,
  trip: Pick<Trip, "currency">,
  expenses: Expense[],
  payments: Payment[],
  meals?: MealWeights
): LedgerEntry[] {
  const rows: Omit<LedgerEntry, "running">[] = []
  for (const e of expenses) {
    if (e.deleted) continue
    const { paid, owed } = expenseImpact(e, trip, meals)
    if (!(memberId in paid) && !(memberId in owed)) continue
    const p = paid[memberId] ?? 0
    const s = owed[memberId] ?? 0
    rows.push({ kind: "expense", id: e.id, date: e.date, createdAt: e.createdAt, paid: p, share: s, effect: p - s, expense: e })
  }
  for (const pay of payments) {
    if (pay.deleted || (pay.from !== memberId && pay.to !== memberId)) continue
    const out = pay.from === memberId
    rows.push({
      kind: "payment",
      id: pay.id,
      date: pay.date,
      createdAt: pay.createdAt,
      paid: out ? pay.amount : 0,
      share: out ? 0 : pay.amount,
      effect: out ? pay.amount : -pay.amount,
      payment: pay,
    })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  let running = 0
  return rows.map((r) => {
    running += r.effect
    return { ...r, running }
  })
}
