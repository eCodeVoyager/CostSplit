import { expenseImpact, isSpending, monthOf, type MealWeights } from "./balance"
import type { Expense, ID, Trip } from "./types"

export interface MonthSummary {
  month: string
  /** Total spending (no loans or money in) */
  spent: number
  /** memberId -> share of spending */
  shares: Record<ID, number>
  /** memberId -> paid for spending */
  paid: Record<ID, number>
  byCategory: [string, number][]
  /** Bazar split by meals */
  mealBazar: number
  totalMeals: number
  /** Per meal, in base minor units (0 when nothing counted) */
  mealRate: number
  meals: Record<ID, number>
}

/** One month at a glance: what the home spent, who carried it, the meal rate */
export function summarizeMonth(
  month: string,
  trip: Pick<Trip, "currency">,
  expenses: Expense[],
  mealWeights: MealWeights
): MonthSummary {
  const shares: Record<ID, number> = {}
  const paid: Record<ID, number> = {}
  const cats = new Map<string, number>()
  let spent = 0
  let mealBazar = 0
  for (const e of expenses) {
    if (monthOf(e.date) !== month || !isSpending(e)) continue
    const impact = expenseImpact(e, trip, mealWeights)
    spent += impact.total
    cats.set(e.category, (cats.get(e.category) ?? 0) + impact.total)
    if (e.splitMode === "meals") mealBazar += impact.total
    for (const [id, v] of Object.entries(impact.owed)) shares[id] = (shares[id] ?? 0) + v
    for (const [id, v] of Object.entries(impact.paid)) paid[id] = (paid[id] ?? 0) + v
  }
  const meals = mealWeights.get(month) ?? {}
  const totalMeals = Object.values(meals).reduce((s, n) => s + n, 0)
  return {
    month,
    spent,
    shares,
    paid,
    byCategory: [...cats.entries()].sort((a, b) => b[1] - a[1]),
    mealBazar,
    totalMeals,
    mealRate: totalMeals > 0 ? Math.round(mealBazar / totalMeals) : 0,
    meals,
  }
}
