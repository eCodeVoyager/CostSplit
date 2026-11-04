import { describe, expect, it } from "vitest"
import {
  computeBalances,
  directDebts,
  expenseImpact,
  expenseTransfers,
  memberLedger,
  settleNets,
  suggestTransfers,
} from "./balance"
import { DEFAULT_FILTER, filterChips, matchesFilter, sortItems, type ActivityFilter, type ActivityItem } from "./filters"
import { mySpending } from "./personal"
import { expenseWarnings, paymentWarnings } from "./review"
import type { Expense, Member, Payment, PersonalExpense } from "./types"

const row = { tripId: "t", createdAt: 0, updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
const member = (id: string): Member => ({ ...row, id, name: id.toUpperCase() })
const trip = { currency: "EUR" }
let seq = 0

function expense(over: Partial<Expense>): Expense {
  return {
    ...row,
    id: `e${++seq}`,
    title: "x",
    category: "food",
    amount: 0,
    currency: "EUR",
    rate: 1,
    date: "2026-07-01",
    paidBy: {},
    splitMode: "equal",
    split: {},
    ...over,
  }
}

const payment = (over: Partial<Payment>): Payment => ({ ...row, id: `p${++seq}`, from: "", to: "", amount: 0, date: "2026-07-02", ...over })
const sumBy = (list: { from: string; to: string; amount: number }[], id: string) =>
  list.reduce((s, t) => s + (t.to === id ? t.amount : 0) - (t.from === id ? t.amount : 0), 0)

describe("who owes whom for one expense", () => {
  it("handles several payers and several sharers", () => {
    // A paid 60, B paid 40, all four share 25 each
    const e = expense({ amount: 10000, paidBy: { a: 6000, b: 4000 }, split: { a: 1, b: 1, c: 1, d: 1 } })
    const transfers = expenseTransfers(expenseImpact(e, trip))
    expect(transfers.reduce((s, t) => s + t.amount, 0)).toBe(5000)
    expect(sumBy(transfers, "a")).toBe(3500)
    expect(sumBy(transfers, "b")).toBe(1500)
    expect(sumBy(transfers, "c")).toBe(-2500)
    expect(sumBy(transfers, "d")).toBe(-2500)
    // Nobody pays themselves, payers never pay
    expect(transfers.every((t) => t.from !== t.to && !["a", "b"].includes(t.from))).toBe(true)
  })

  it("one payer, five sharers: everyone else pays the payer", () => {
    const e = expense({ amount: 1000, paidBy: { a: 1000 }, split: { a: 1, b: 1, c: 1, d: 1, e: 1 } })
    expect(expenseTransfers(expenseImpact(e, trip))).toEqual([
      { from: "b", to: "a", amount: 200 },
      { from: "c", to: "a", amount: 200 },
      { from: "d", to: "a", amount: 200 },
      { from: "e", to: "a", amount: 200 },
    ])
  })

  it("money in: whoever received it pays the others their cut", () => {
    const e = expense({ kind: "income", amount: 900, paidBy: { a: 900 }, split: { a: 1, b: 1, c: 1 } })
    expect(expenseTransfers(expenseImpact(e, trip))).toEqual([
      { from: "a", to: "b", amount: 300 },
      { from: "a", to: "c", amount: 300 },
    ])
  })

  it("settleNets never needs more than n-1 payments", () => {
    const nets = { a: 700, b: -300, c: -250, d: 150, e: -300 }
    const t = settleNets(nets)
    expect(t.length).toBeLessThanOrEqual(4)
    for (const [id, v] of Object.entries(nets)) expect(sumBy(t, id)).toBe(v)
  })
})

describe("direct debts", () => {
  const members = ["a", "b", "c"].map(member)
  const expenses = [
    expense({ amount: 900, paidBy: { a: 900 }, split: { a: 1, b: 1, c: 1 } }),
    expense({ amount: 600, paidBy: { b: 600 }, split: { b: 1, c: 1 } }),
  ]
  const payments = [payment({ from: "c", to: "a", amount: 100 })]

  it("adds up to the same balances as the simplified list", () => {
    const balances = computeBalances(trip, members, expenses, payments)
    const direct = directDebts(trip, expenses, payments)
    for (const b of balances) expect(sumBy(direct, b.memberId)).toBe(b.net)
    for (const b of balances) expect(sumBy(suggestTransfers(balances), b.memberId)).toBe(b.net)
  })

  it("keeps debts between the people who shared, netted per pair", () => {
    const direct = directDebts(trip, expenses, payments)
    // c owes a 300 - 100 paid back; b owes a 300 but a owes b nothing, so b -> a 300; c owes b 300
    expect(direct).toContainEqual({ from: "b", to: "a", amount: 300 })
    expect(direct).toContainEqual({ from: "c", to: "b", amount: 300 })
    expect(direct).toContainEqual({ from: "c", to: "a", amount: 200 })
  })
})

describe("member ledger", () => {
  it("ends at the member's balance and lists every item", () => {
    const members = ["a", "b"].map(member)
    const expenses = [
      expense({ amount: 1000, paidBy: { a: 1000 }, split: { a: 1, b: 1 }, date: "2026-07-01" }),
      expense({ amount: 400, paidBy: { b: 400 }, split: { a: 1, b: 1 }, date: "2026-07-03" }),
      expense({ amount: 999, paidBy: { b: 999 }, split: { b: 1 }, date: "2026-07-04" }),
    ]
    const payments = [payment({ from: "b", to: "a", amount: 100, date: "2026-07-05" })]
    const ledger = memberLedger("a", trip, expenses, payments)
    expect(ledger.map((l) => l.effect)).toEqual([500, -200, -100])
    expect(ledger.at(-1)?.running).toBe(computeBalances(trip, members, expenses, payments).find((b) => b.memberId === "a")?.net)
  })
})

describe("activity filters", () => {
  const today = "2026-07-20"
  const ctx = { meId: "a", today, names: new Map([["a", "Ana"], ["b", "Ben"], ["c", "Cy"]]), currency: "EUR" }
  const item = (e: Expense): ActivityItem => ({ type: "expense", date: e.date, createdAt: e.createdAt, expense: e, impact: expenseImpact(e, trip) })
  const ab = item(expense({ title: "Lunch", amount: 2000, paidBy: { a: 2000 }, split: { a: 1, b: 1 }, date: "2026-07-19" }))
  const abc = item(expense({ title: "Rent", category: "rent", amount: 90000, paidBy: { b: 90000 }, split: { a: 1, b: 1, c: 1 }, date: "2026-06-05" }))
  const bc = item(expense({ title: "Taxi", category: "transport", amount: 1500, paidBy: { c: 1500 }, split: { b: 1, c: 1 }, date: "2026-07-10", receipt: "f1" }))
  const pay: ActivityItem = { type: "payment", date: "2026-07-18", createdAt: 0, payment: payment({ from: "b", to: "a", amount: 1000 }) }
  const all = [ab, abc, bc, pay]
  const run = (f: Partial<ActivityFilter>, query?: string) =>
    all.filter((it) => matchesFilter(it, { ...DEFAULT_FILTER, ...f }, { ...ctx, query })).length

  it("people: any one / all together / only them", () => {
    expect(run({ people: ["a", "c"], role: "shared", match: "any" })).toBe(3)
    expect(run({ people: ["a", "c"], role: "shared", match: "all" })).toBe(1)
    expect(run({ people: ["a", "b"], role: "shared", match: "only" })).toBe(1) // Lunch
    expect(run({ people: ["a", "b"], match: "only" })).toBe(2) // Lunch + the payment b→a
    expect(run({ people: ["b"], role: "paid" })).toBe(2) // rent + payment from b
  })

  it("my part, type, category, dates, amounts, extras", () => {
    expect(run({ impact: "owe" })).toBe(1) // rent
    expect(run({ impact: "owed" })).toBe(1) // lunch
    expect(run({ impact: "uninvolved" })).toBe(1) // taxi
    expect(run({ types: ["payment"] })).toBe(1)
    expect(run({ categories: ["rent", "transport"] })).toBe(2)
    expect(run({ date: "this-month" })).toBe(3)
    expect(run({ date: "last-month" })).toBe(1)
    expect(run({ date: "7d" })).toBe(2)
    expect(run({ date: "custom", from: "2026-07-01", to: "2026-07-15" })).toBe(1)
    expect(run({ min: 1500, max: 2000 })).toBe(2)
    expect(run({ receipt: true })).toBe(1)
  })

  it("search matches people, titles and amounts", () => {
    expect(run({}, "ben")).toBe(4)
    expect(run({}, "taxi")).toBe(1)
    expect(run({}, "900")).toBe(1)
  })

  it("sorts by amount and builds removable chips", () => {
    expect(sortItems(all, "amount-desc")[0]).toBe(abc)
    expect(sortItems(all, "oldest")[0]).toBe(abc)
    const f = { ...DEFAULT_FILTER, people: ["a", "b"], match: "all" as const, categories: ["rent"] }
    const chips = filterChips(f, { names: ctx.names, meId: "a", money: (v) => String(v) })
    expect(chips.map((c) => c.label)).toEqual(["With You & Ben", "Rent"])
    expect(chips[0].clear(f).people).toEqual([])
  })
})

describe("review warnings", () => {
  const existing = [
    expense({ id: "old", title: "Bazar", category: "groceries", amount: 50000, paidBy: { b: 50000 }, split: { a: 1, b: 1 }, date: "2026-07-19" }),
    ...[1, 2, 3, 4, 5].map((i) => expense({ category: "groceries", amount: 1000 * i, date: "2026-06-01" })),
  ]
  const draft = {
    kind: "expense" as const,
    title: "Bazar",
    category: "groceries",
    amount: 50000,
    currency: "EUR",
    rate: 1,
    date: "2026-07-20",
    paidBy: { a: 50000 },
    split: { a: 1, b: 1 },
  }

  it("spots duplicates and unusually big amounts", () => {
    const w = expenseWarnings(draft, existing, trip, "2026-07-20")
    expect(w.find((x) => x.kind === "duplicate")).toBeTruthy()
    expect(w.find((x) => x.kind === "large")).toBeTruthy()
    // Editing the same expense is not a duplicate of itself
    expect(expenseWarnings({ ...draft, id: "old" }, existing, trip, "2026-07-20").some((x) => x.kind === "duplicate")).toBe(false)
  })

  it("explains splits that don't move any balance", () => {
    const w = expenseWarnings({ ...draft, amount: 100, split: { a: 1 } }, [], trip, "2026-07-20")
    expect(w).toContainEqual({ kind: "self-only", id: "a" })
    const n = expenseWarnings({ ...draft, amount: 100, split: { b: 1 } }, [], trip, "2026-07-20")
    expect(n).toContainEqual({ kind: "payer-not-sharing", ids: ["a"] })
    // Loans are meant to be paid back in full
    expect(expenseWarnings({ ...draft, category: "loan", amount: 100, split: { b: 1 } }, [], trip, "2026-07-20")).toEqual([])
  })

  it("flags future dates and paying back too much", () => {
    expect(expenseWarnings({ ...draft, amount: 1, date: "2026-07-25" }, [], trip, "2026-07-20")).toContainEqual({ kind: "future", date: "2026-07-25" })
    const w = paymentWarnings({ from: "b", to: "a", amount: 800, date: "2026-07-20" }, [], { a: 500, b: -500 }, "2026-07-20")
    expect(w).toContainEqual({ kind: "overpay", extra: 300 })
  })
})

describe("my spending", () => {
  it("adds my share of the group to my personal expenses, by category", () => {
    const expenses = [
      expense({ category: "food", amount: 3000, paidBy: { b: 3000 }, split: { a: 1, b: 1, c: 1 }, date: "2026-07-03" }),
      expense({ category: "loan", amount: 5000, paidBy: { b: 5000 }, split: { a: 1 }, date: "2026-07-03" }),
      expense({ category: "food", amount: 999, paidBy: { b: 999 }, split: { b: 1 }, date: "2026-07-03" }),
    ]
    const personal: PersonalExpense[] = [
      { ...row, id: "p1", title: "My lunch", category: "food", amount: 500, currency: "EUR", rate: 1, date: "2026-07-04" },
      { ...row, id: "p2", title: "Phone", category: "internet", amount: 1500, currency: "EUR", rate: 1, date: "2026-07-05" },
      { ...row, id: "p3", title: "June", category: "food", amount: 700, currency: "EUR", rate: 1, date: "2026-06-30" },
    ]
    const s = mySpending("2026-07", "a", trip, expenses, personal)
    expect(s.shared).toBe(1000)
    expect(s.personal).toBe(2000)
    expect(s.total).toBe(3000)
    expect(s.byCategory).toHaveLength(2)
    expect(s.byCategory).toContainEqual({ id: "internet", shared: 0, personal: 1500, total: 1500 })
    expect(s.byCategory).toContainEqual({ id: "food", shared: 1000, personal: 500, total: 1500 })
    expect(mySpending("all", "a", trip, expenses, personal).personal).toBe(2700)
  })
})
