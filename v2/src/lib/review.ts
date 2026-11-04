import { useSyncExternalStore } from "react"
import { isSpending } from "./balance"
import { addDays, parseISODate } from "./dates"
import { convertToBase } from "./money"
import type { Expense, ID, Payment, Trip } from "./types"

/** Things worth a second look before saving, so mistakes are caught before anyone's balance changes */
export type ReviewWarning =
  | { kind: "duplicate"; expense: Expense }
  | { kind: "duplicate-payment"; payment: Payment }
  | { kind: "future"; date: string }
  | { kind: "old"; days: number }
  /** Paid but not sharing: they get the full amount back */
  | { kind: "payer-not-sharing"; ids: ID[] }
  /** One person paid and is the only one sharing: no balance changes */
  | { kind: "self-only"; id: ID }
  /** Much bigger than usual for the category */
  | { kind: "large"; typical: number }
  | { kind: "foreign"; currency: string; rate: number }
  /** Paying back more than they owe */
  | { kind: "overpay"; extra: number }

export interface ExpenseDraft {
  /** Set when editing */
  id?: string
  kind: "expense" | "income"
  title: string
  category: string
  amount: number
  currency: string
  rate: number
  date: string
  paidBy: Record<ID, number>
  split: Record<ID, number>
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

const daysBetween = (a: string, b: string) => Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000)

export function expenseWarnings(
  draft: ExpenseDraft,
  expenses: Expense[],
  trip: Pick<Trip, "currency">,
  today: string
): ReviewWarning[] {
  const out: ReviewWarning[] = []
  const base = convertToBase(draft.amount, draft.currency, draft.rate, trip.currency)
  const title = draft.title.trim().toLowerCase()
  const others = expenses.filter((e) => !e.deleted && e.id !== draft.id)

  // Same amount within 2 days, or same title and amount within a week
  const dup = others.find((e) => {
    if ((e.kind ?? "expense") !== draft.kind) return false
    if (convertToBase(e.amount, e.currency, e.rate, trip.currency) !== base) return false
    const gap = Math.abs(daysBetween(e.date, draft.date))
    return gap <= 2 || (gap <= 7 && !!title && e.title.trim().toLowerCase() === title)
  })
  if (dup) out.push({ kind: "duplicate", expense: dup })

  if (draft.date > today) out.push({ kind: "future", date: draft.date })
  else if (draft.date < addDays(today, -60)) out.push({ kind: "old", days: daysBetween(draft.date, today) })

  const payers = Object.keys(draft.paidBy).filter((id) => draft.paidBy[id] > 0)
  const sharers = Object.keys(draft.split).filter((id) => draft.split[id] > 0)
  if (payers.length === 1 && sharers.length === 1 && payers[0] === sharers[0]) {
    out.push({ kind: "self-only", id: payers[0] })
  } else if (draft.category !== "loan" && draft.kind !== "income") {
    // A loan is meant to be paid back in full, so that's expected there
    const notSharing = payers.filter((id) => !sharers.includes(id))
    if (notSharing.length) out.push({ kind: "payer-not-sharing", ids: notSharing })
  }

  if (draft.kind !== "income" && draft.category !== "loan") {
    const sample = others
      .filter((e) => isSpending(e) && e.category === draft.category)
      .slice(0, 50)
      .map((e) => convertToBase(e.amount, e.currency, e.rate, trip.currency))
    if (sample.length >= 5) {
      const typical = median(sample)
      if (typical > 0 && base > typical * 5) out.push({ kind: "large", typical })
    }
  }

  if (draft.currency !== trip.currency) out.push({ kind: "foreign", currency: draft.currency, rate: draft.rate })
  return out
}

export function paymentWarnings(
  draft: { from: ID; to: ID; amount: number; date: string },
  payments: Payment[],
  /** memberId -> net balance (positive = gets back) */
  nets: Record<ID, number>,
  today: string
): ReviewWarning[] {
  const out: ReviewWarning[] = []
  const dup = payments.find(
    (p) =>
      !p.deleted &&
      p.from === draft.from &&
      p.to === draft.to &&
      p.amount === draft.amount &&
      Math.abs(daysBetween(p.date, draft.date)) <= 2
  )
  if (dup) out.push({ kind: "duplicate-payment", payment: dup })
  // Paying more than the payer owes leaves them owed money
  const owes = Math.max(0, -(nets[draft.from] ?? 0))
  if (owes > 0 && draft.amount > owes) out.push({ kind: "overpay", extra: draft.amount - owes })
  if (draft.date > today) out.push({ kind: "future", date: draft.date })
  return out
}

/** Device preferences (not synced): how this phone behaves */
export interface Prefs {
  /** Show a summary to confirm before anything is saved */
  review: boolean
  /** Tell me when someone else adds, changes or deletes something */
  notifyActivity: boolean
  /** Bill due days, meal count, settle-up nudges (Android app) */
  notifyReminders: boolean
  /** Download new versions in the background so installing is one tap (Android app) */
  autoUpdate: boolean
}

const PREFS_KEY = "costsplit:prefs"
const DEFAULT_PREFS: Prefs = { review: true, notifyActivity: true, notifyReminders: true, autoUpdate: true }
const listeners = new Set<() => void>()

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

let prefs = readPrefs()

export const getPrefs = () => prefs

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...prefs, [key]: value }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode: applies for this visit
  }
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => prefs
  )
}
