import { expenseImpact, isSpending, monthOf, type MealWeights } from "./balance"
import { convertToBase } from "./money"
import type { Expense, ID, PersonalExpense, Trip } from "./types"

export const ALL_TIME = "all"

export interface CategoryTotal {
  id: string
  /** My share of group spending in this category */
  shared: number
  /** My personal spending in this category */
  personal: number
  total: number
}

/**
 * What I really spent: my share of the group's spending plus my own personal
 * expenses. Personal entries never touch group balances; they're only added here.
 */
export interface MySpending {
  shared: number
  personal: number
  total: number
  byCategory: CategoryTotal[]
  /** Number of personal entries counted */
  count: number
}

export function personalBase(p: PersonalExpense, trip: Pick<Trip, "currency">) {
  return convertToBase(p.amount, p.currency, p.rate, trip.currency)
}

export function mySpending(
  period: string,
  meId: ID | null,
  trip: Pick<Trip, "currency">,
  expenses: Expense[],
  personal: PersonalExpense[],
  meals?: MealWeights
): MySpending {
  const inPeriod = (date: string) => period === ALL_TIME || monthOf(date) === period
  const cats = new Map<string, CategoryTotal>()
  const cat = (id: string) => {
    let c = cats.get(id)
    if (!c) {
      c = { id, shared: 0, personal: 0, total: 0 }
      cats.set(id, c)
    }
    return c
  }

  let shared = 0
  if (meId) {
    for (const e of expenses) {
      if (e.deleted || !isSpending(e) || !inPeriod(e.date)) continue
      const mine = expenseImpact(e, trip, meals).owed[meId] ?? 0
      if (!mine) continue
      shared += mine
      cat(e.category).shared += mine
    }
  }

  let own = 0
  let count = 0
  for (const p of personal) {
    if (p.deleted || !inPeriod(p.date)) continue
    const v = personalBase(p, trip)
    own += v
    count++
    cat(p.category).personal += v
  }

  const byCategory = [...cats.values()]
    .map((c) => ({ ...c, total: c.shared + c.personal }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
  return { shared, personal: own, total: shared + own, byCategory, count }
}
