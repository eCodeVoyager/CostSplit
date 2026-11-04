import type { ExpenseImpact } from "./balance"
import { monthOf } from "./balance"
import { getCategory } from "./categories"
import { addDays } from "./dates"
import { toMajor } from "./money"
import type { Expense, ID, Payment } from "./types"

/** One line in Activity */
export type ActivityItem =
  | { type: "expense"; date: string; createdAt: number; expense: Expense; impact: ExpenseImpact }
  | { type: "payment"; date: string; createdAt: number; payment: Payment }

export type ItemType = "expense" | "bill" | "loan" | "income" | "payment"
/** With people picked: did they pay, share it, or either */
export type PeopleRole = "any" | "paid" | "shared"
/** With several people picked: any of them, all of them together, or only them */
export type PeopleMatch = "any" | "all" | "only"
export type DatePreset = "all" | "this-month" | "last-month" | "7d" | "30d" | "custom"
/** How the item moved my balance */
export type MyImpact = "any" | "involved" | "owe" | "owed" | "uninvolved"
export type SortKey = "newest" | "oldest" | "amount-desc" | "amount-asc"

export interface ActivityFilter {
  /** Empty = every type */
  types: ItemType[]
  /** Empty = anyone */
  people: ID[]
  role: PeopleRole
  match: PeopleMatch
  /** Empty = every category */
  categories: string[]
  date: DatePreset
  /** YYYY-MM-DD, inclusive, for date = custom */
  from?: string
  to?: string
  /** Base currency minor units, inclusive */
  min?: number
  max?: number
  impact: MyImpact
  receipt: boolean
  note: boolean
  multiPayer: boolean
  byMeals: boolean
  edited: boolean
  sort: SortKey
}

export const DEFAULT_FILTER: ActivityFilter = {
  types: [],
  people: [],
  role: "any",
  match: "any",
  categories: [],
  date: "all",
  impact: "any",
  receipt: false,
  note: false,
  multiPayer: false,
  byMeals: false,
  edited: false,
  sort: "newest",
}

export const TYPE_LABELS: Record<ItemType, string> = {
  expense: "Expenses",
  bill: "Bills",
  payment: "Payments",
  loan: "Loans",
  income: "Money in",
}

export const DATE_LABELS: Record<DatePreset, string> = {
  all: "Any time",
  "this-month": "This month",
  "last-month": "Last month",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom",
}

export const IMPACT_LABELS: Record<MyImpact, string> = {
  any: "Anything",
  involved: "I'm in it",
  owe: "I owe",
  owed: "I get back",
  uninvolved: "Not me",
}

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  "amount-desc": "Highest amount",
  "amount-asc": "Lowest amount",
}

/** An edit made more than a minute after adding counts as "edited" */
const EDIT_GRACE_MS = 60_000

export function itemType(it: ActivityItem): ItemType {
  if (it.type === "payment") return "payment"
  const e = it.expense
  if (e.kind === "income") return "income"
  if (e.category === "loan") return "loan"
  if (e.billId) return "bill"
  return "expense"
}

/** Amount in base minor units */
export function itemAmount(it: ActivityItem): number {
  return it.type === "payment" ? it.payment.amount : it.impact.total
}

export function isEdited(row: { createdAt: number; updatedAt: number; updatedBy?: string }) {
  return !!row.updatedBy || row.updatedAt - row.createdAt > EDIT_GRACE_MS
}

function peopleOf(it: ActivityItem, role: PeopleRole): Set<ID> {
  if (it.type === "payment") {
    const { from, to } = it.payment
    // A payment isn't split between anyone, so "shared" never matches it
    return new Set(role === "paid" ? [from] : role === "shared" ? [] : [from, to])
  }
  const paid = Object.keys(it.impact.paid)
  const shared = Object.entries(it.impact.owed)
    .filter(([, v]) => v !== 0)
    .map(([id]) => id)
  return new Set(role === "paid" ? paid : role === "shared" ? shared : [...paid, ...shared])
}

export function inDateRange(date: string, f: Pick<ActivityFilter, "date" | "from" | "to">, today: string): boolean {
  switch (f.date) {
    case "all":
      return true
    case "this-month":
      return monthOf(date) === monthOf(today)
    case "last-month": {
      const [y, m] = today.split("-").map(Number)
      const d = new Date(y, m - 2, 1)
      return monthOf(date) === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    }
    case "7d":
      return date >= addDays(today, -6) && date <= today
    case "30d":
      return date >= addDays(today, -29) && date <= today
    case "custom":
      return (!f.from || date >= f.from) && (!f.to || date <= f.to)
  }
}

export interface FilterContext {
  meId: string | null
  /** YYYY-MM-DD */
  today: string
  names: Map<string, string>
  query?: string
  /** Base currency, so a typed number can match an amount */
  currency?: string
}

function matchesQuery(it: ActivityItem, q: string, ctx: FilterContext): boolean {
  const amount = ctx.currency ? String(toMajor(itemAmount(it), ctx.currency)) : ""
  // "500" finds ৳500 and ৳500.50
  if (/^\d+([.,]\d+)?$/.test(q) && amount.startsWith(q.replace(",", "."))) return true
  if (it.type === "payment") {
    const p = it.payment
    return [ctx.names.get(p.from), ctx.names.get(p.to), p.note].some((t) => t?.toLowerCase().includes(q))
  }
  const e = it.expense
  const people = [...Object.keys(e.paidBy), ...Object.keys(e.split)].map((id) => ctx.names.get(id) ?? "")
  return [e.title, e.note ?? "", getCategory(e.category).label, ...people].some((t) => t.toLowerCase().includes(q))
}

export function matchesFilter(it: ActivityItem, f: ActivityFilter, ctx: FilterContext): boolean {
  if (f.types.length && !f.types.includes(itemType(it))) return false
  if (!inDateRange(it.date, f, ctx.today)) return false

  const amount = itemAmount(it)
  if (f.min !== undefined && amount < f.min) return false
  if (f.max !== undefined && amount > f.max) return false

  if (f.people.length) {
    const who = peopleOf(it, f.role)
    if (f.match === "any" && !f.people.some((id) => who.has(id))) return false
    if (f.match === "all" && !f.people.every((id) => who.has(id))) return false
    if (f.match === "only" && (who.size !== f.people.length || !f.people.every((id) => who.has(id)))) return false
  }

  if (f.categories.length) {
    if (it.type === "payment" || !f.categories.includes(it.expense.category)) return false
  }

  if (f.impact !== "any") {
    const me = ctx.meId
    if (!me) return false
    if (it.type === "payment") {
      const involved = it.payment.from === me || it.payment.to === me
      if (f.impact === "involved" && !involved) return false
      if (f.impact === "uninvolved" && involved) return false
      // Paying back isn't new debt
      if (f.impact === "owe" || f.impact === "owed") return false
    } else {
      const { paid, owed } = it.impact
      const involved = me in paid || me in owed
      const mine = (paid[me] ?? 0) - (owed[me] ?? 0)
      if (f.impact === "involved" && !involved) return false
      if (f.impact === "uninvolved" && involved) return false
      if (f.impact === "owe" && mine >= 0) return false
      if (f.impact === "owed" && mine <= 0) return false
    }
  }

  if (f.receipt && !(it.type === "expense" ? it.expense.receipt : it.payment.proof)) return false
  if (f.note && !(it.type === "expense" ? it.expense.note : it.payment.note)) return false
  if (f.multiPayer && (it.type === "payment" || Object.keys(it.expense.paidBy).length < 2)) return false
  if (f.byMeals && (it.type === "payment" || it.expense.splitMode !== "meals")) return false
  if (f.edited && !isEdited(it.type === "expense" ? it.expense : it.payment)) return false

  const q = ctx.query?.trim().toLowerCase()
  return !q || matchesQuery(it, q, ctx)
}

export function sortItems(items: ActivityItem[], sort: SortKey): ActivityItem[] {
  const byDate = (a: ActivityItem, b: ActivityItem) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt
  const list = [...items]
  switch (sort) {
    case "newest":
      return list.sort(byDate)
    case "oldest":
      return list.sort((a, b) => -byDate(a, b))
    case "amount-desc":
      return list.sort((a, b) => itemAmount(b) - itemAmount(a) || byDate(a, b))
    case "amount-asc":
      return list.sort((a, b) => itemAmount(a) - itemAmount(b) || byDate(a, b))
  }
}

/** Filters that differ from the default, as removable chips */
export interface FilterChip {
  key: string
  label: string
  clear: (f: ActivityFilter) => ActivityFilter
}

export function filterChips(
  f: ActivityFilter,
  ctx: { names: Map<string, string>; meId: string | null; money: (minor: number) => string }
): FilterChip[] {
  const chips: FilterChip[] = []
  const who = (id: string) => (id === ctx.meId ? "You" : (ctx.names.get(id) ?? "?"))
  for (const t of f.types) {
    chips.push({ key: `type:${t}`, label: TYPE_LABELS[t], clear: (x) => ({ ...x, types: x.types.filter((v) => v !== t) }) })
  }
  if (f.people.length) {
    const verb = f.role === "paid" ? "Paid by" : f.role === "shared" ? "Shared by" : "With"
    const joiner = f.match === "all" ? " & " : f.match === "only" ? " & " : " or "
    const prefix = f.match === "only" ? "Only " : ""
    chips.push({
      key: "people",
      label: `${verb} ${prefix}${f.people.map(who).join(joiner)}`,
      clear: (x) => ({ ...x, people: [], role: "any", match: "any" }),
    })
  }
  for (const c of f.categories) {
    chips.push({ key: `cat:${c}`, label: getCategory(c).short, clear: (x) => ({ ...x, categories: x.categories.filter((v) => v !== c) }) })
  }
  if (f.date !== "all") {
    const label =
      f.date === "custom" ? `${f.from ?? "…"} → ${f.to ?? "…"}` : DATE_LABELS[f.date]
    chips.push({ key: "date", label, clear: (x) => ({ ...x, date: "all", from: undefined, to: undefined }) })
  }
  if (f.min !== undefined || f.max !== undefined) {
    const label =
      f.min !== undefined && f.max !== undefined
        ? `${ctx.money(f.min)}–${ctx.money(f.max)}`
        : f.min !== undefined
          ? `≥ ${ctx.money(f.min)}`
          : `≤ ${ctx.money(f.max!)}`
    chips.push({ key: "amount", label, clear: (x) => ({ ...x, min: undefined, max: undefined }) })
  }
  if (f.impact !== "any") chips.push({ key: "impact", label: IMPACT_LABELS[f.impact], clear: (x) => ({ ...x, impact: "any" }) })
  if (f.receipt) chips.push({ key: "receipt", label: "With photo", clear: (x) => ({ ...x, receipt: false }) })
  if (f.note) chips.push({ key: "note", label: "With note", clear: (x) => ({ ...x, note: false }) })
  if (f.multiPayer) chips.push({ key: "multi", label: "Several payers", clear: (x) => ({ ...x, multiPayer: false }) })
  if (f.byMeals) chips.push({ key: "meals", label: "By meals", clear: (x) => ({ ...x, byMeals: false }) })
  if (f.edited) chips.push({ key: "edited", label: "Edited", clear: (x) => ({ ...x, edited: false }) })
  if (f.sort !== "newest") chips.push({ key: "sort", label: SORT_LABELS[f.sort], clear: (x) => ({ ...x, sort: "newest" }) })
  return chips
}

export function isDefaultFilter(f: ActivityFilter) {
  return JSON.stringify(normalize(f)) === JSON.stringify(normalize(DEFAULT_FILTER))
}

function normalize(f: ActivityFilter): ActivityFilter {
  return {
    ...DEFAULT_FILTER,
    ...f,
    types: [...f.types].sort(),
    people: [...f.people].sort(),
    categories: [...f.categories].sort(),
    from: f.date === "custom" ? f.from : undefined,
    to: f.date === "custom" ? f.to : undefined,
  }
}

/** Same filter (ignoring order of picks)? Used to light up the quick chips. */
export function sameFilter(a: ActivityFilter, b: ActivityFilter) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

const filterKey = (tripId: string) => `costsplit:filter:${tripId}`

/** Filters are remembered per group on this device */
export function loadFilter(tripId: string): ActivityFilter {
  try {
    const raw = localStorage.getItem(filterKey(tripId))
    return raw ? { ...DEFAULT_FILTER, ...(JSON.parse(raw) as Partial<ActivityFilter>) } : DEFAULT_FILTER
  } catch {
    return DEFAULT_FILTER
  }
}

export function saveFilter(tripId: string, f: ActivityFilter) {
  try {
    if (isDefaultFilter(f)) localStorage.removeItem(filterKey(tripId))
    else localStorage.setItem(filterKey(tripId), JSON.stringify(f))
  } catch {
    // Private mode: the filter lasts for this visit
  }
}
