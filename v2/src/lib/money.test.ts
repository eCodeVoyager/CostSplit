import { describe, expect, it } from "vitest"
import { computeBalances, expenseImpact, mealWeights, suggestTransfers } from "./balance"
import { summarizeMonth } from "./month"
import { allocate, convertToBase, minorToInput, parseAmount } from "./money"
import type { Expense, Member, Payment } from "./types"

const row = { tripId: "t", createdAt: 0, updatedAt: 0, deleted: 0 as const, dirty: 0 as const }
const member = (id: string): Member => ({ ...row, id, name: id.toUpperCase() })
const trip = { currency: "EUR" }

function expense(over: Partial<Expense>): Expense {
  return {
    ...row,
    id: Math.random().toString(36),
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

describe("parseAmount", () => {
  it("accepts dot, comma, spaces and sums", () => {
    expect(parseAmount("12.50", "EUR")).toBe(1250)
    expect(parseAmount("12,5", "EUR")).toBe(1250)
    expect(parseAmount("1 200", "EUR")).toBe(120000)
    expect(parseAmount("10+2.5", "EUR")).toBe(1250)
    expect(parseAmount("500", "JPY")).toBe(500)
  })

  it("rejects junk and non-positive values", () => {
    expect(parseAmount("", "EUR")).toBeNull()
    expect(parseAmount("abc", "EUR")).toBeNull()
    expect(parseAmount("0", "EUR")).toBeNull()
    expect(parseAmount("5-10", "EUR")).toBeNull()
  })

  it("round-trips through minorToInput", () => {
    expect(minorToInput(1250, "EUR")).toBe("12.5")
    expect(minorToInput(1200, "EUR")).toBe("12")
    expect(minorToInput(500, "JPY")).toBe("500")
  })
})

describe("allocate", () => {
  it("always sums to the total", () => {
    const parts = allocate(1000, { a: 1, b: 1, c: 1 })
    expect(parts).toEqual({ a: 334, b: 333, c: 333 })
    expect(Object.values(allocate(9999, { a: 3, b: 7, c: 1 })).reduce((s, v) => s + v, 0)).toBe(9999)
  })

  it("supports weights and ignores zero", () => {
    expect(allocate(900, { a: 2, b: 1, c: 0 })).toEqual({ a: 600, b: 300 })
  })
})

describe("convertToBase", () => {
  it("converts using units-per-base rate", () => {
    // 1 EUR = 130 BDT, so 1300 BDT = 10 EUR
    expect(convertToBase(130000, "BDT", 130, "EUR")).toBe(1000)
    expect(convertToBase(1000, "EUR", 130, "EUR")).toBe(1000)
  })
})

describe("balances", () => {
  const members = ["a", "b", "c", "d"].map(member)

  it("matches the v1 README example (1000 split by 4)", () => {
    const e = expense({ amount: 100000, paidBy: { a: 100000 }, split: { a: 1, b: 1, c: 1, d: 1 } })
    const balances = computeBalances(trip, members, [e], [])
    expect(balances.map((b) => b.net)).toEqual([75000, -25000, -25000, -25000])
    expect(suggestTransfers(balances)).toHaveLength(3)
  })

  it("handles several payers, shares and payments", () => {
    const e1 = expense({ amount: 1000, paidBy: { a: 600, b: 400 }, split: { a: 1, b: 1 } })
    const e2 = expense({ amount: 900, paidBy: { c: 900 }, splitMode: "shares", split: { a: 2, c: 1 } })
    const pay: Payment = { ...row, id: "p", from: "a", to: "c", amount: 200, date: "2026-07-02" }
    const balances = computeBalances(trip, members, [e1, e2], [pay])
    const net = Object.fromEntries(balances.map((b) => [b.memberId, b.net]))
    expect(net).toEqual({ a: 100 - 600 + 200, b: -100, c: 600 - 200, d: 0 })
    expect(balances.reduce((s, b) => s + b.net, 0)).toBe(0)
  })

  it("never loses a cent with awkward splits", () => {
    const e = expense({ amount: 1001, paidBy: { a: 1001 }, split: { a: 1, b: 1, c: 1 } })
    const { owed } = expenseImpact(e, trip)
    expect(Object.values(owed).reduce((s, v) => s + v, 0)).toBe(1001)
  })

  it("keeps removed members visible while they still owe", () => {
    const removed = { ...member("d"), deleted: 1 as const }
    const e = expense({ amount: 1000, paidBy: { a: 1000 }, split: { a: 1, d: 1 } })
    const balances = computeBalances(trip, [...members.slice(0, 3), removed], [e], [])
    expect(balances.find((b) => b.memberId === "d")?.net).toBe(-500)
  })

  it("settles everyone with the suggested transfers", () => {
    const e1 = expense({ amount: 12345, paidBy: { a: 12345 }, split: { a: 1, b: 1, c: 1, d: 1 } })
    const e2 = expense({ amount: 6789, paidBy: { b: 6789 }, split: { c: 1, d: 1 } })
    const balances = computeBalances(trip, members, [e1, e2], [])
    const payments: Payment[] = suggestTransfers(balances).map((t, i) => ({ ...row, id: `p${i}`, date: "", ...t }))
    expect(computeBalances(trip, members, [e1, e2], payments).every((b) => b.net === 0)).toBe(true)
  })
})

describe("household", () => {
  const members = ["a", "b", "c"].map(member)
  const meal = (memberId: string, date: string, count: number) => ({
    ...row,
    id: `${date}_${memberId}`,
    date,
    memberId,
    count,
  })

  it("splits bazar by meals eaten that month", () => {
    const weights = mealWeights([meal("a", "2026-10-01", 2), meal("b", "2026-10-01", 1), meal("a", "2026-10-02", 3)])
    // a ate 5, b ate 1, c ate 0 -> 600 split 500/100/0
    const bazar = expense({ date: "2026-10-05", amount: 600, paidBy: { c: 600 }, splitMode: "meals", split: { a: 1, b: 1, c: 1 } })
    const { owed } = expenseImpact(bazar, trip, weights)
    expect(owed).toEqual({ a: 500, b: 100 })
  })

  it("falls back to equal when no meals are counted that month", () => {
    const bazar = expense({ date: "2026-11-05", amount: 300, paidBy: { a: 300 }, splitMode: "meals", split: { a: 1, b: 1, c: 1 } })
    expect(expenseImpact(bazar, trip, new Map()).owed).toEqual({ a: 100, b: 100, c: 100 })
  })

  it("treats money in as the group's money held by the receiver", () => {
    const refund = expense({ kind: "income", amount: 900, paidBy: { a: 900 }, split: { a: 1, b: 1, c: 1 } })
    const net = Object.fromEntries(computeBalances(trip, members, [refund], []).map((b) => [b.memberId, b.net]))
    expect(net).toEqual({ a: -600, b: 300, c: 300 })
  })

  it("keeps loans and money in out of spending totals", () => {
    const bazar = expense({ date: "2026-10-03", amount: 300, paidBy: { a: 300 }, split: { a: 1, b: 1, c: 1 } })
    const loan = expense({ date: "2026-10-03", amount: 500, category: "loan", paidBy: { a: 500 }, split: { b: 1 } })
    const refund = expense({ date: "2026-10-04", kind: "income", amount: 100, paidBy: { b: 100 }, split: { a: 1 } })
    const s = summarizeMonth("2026-10", trip, [bazar, loan, refund], new Map())
    expect(s.spent).toBe(300)
    expect(s.shares).toEqual({ a: 100, b: 100, c: 100 })
  })

  it("hides moved-out members once they are settled", () => {
    const moved = { ...member("c"), archived: 1 as const }
    const e = expense({ amount: 300, paidBy: { a: 300 }, split: { a: 1, b: 1, c: 1 } })
    expect(computeBalances(trip, [...members.slice(0, 2), moved], [e], []).some((b) => b.memberId === "c")).toBe(true)
    const pay: Payment = { ...row, id: "p", from: "c", to: "a", amount: 100, date: "" }
    expect(computeBalances(trip, [...members.slice(0, 2), moved], [e], [pay]).some((b) => b.memberId === "c")).toBe(false)
  })
})
