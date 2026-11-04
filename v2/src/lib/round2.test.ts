import { describe, expect, it } from "vitest"
import { autoFill, parseTyped, typedFromSaved } from "./autofill"
import { inboxEvents } from "./inbox"
import { notificationId, planReminders, type GroupSnapshot } from "./reminders"
import type { Bill, Expense, Payment, ShopItem } from "./types"

const row = { tripId: "t", createdAt: 0, updatedAt: 0, deleted: 0 as const, dirty: 0 as const }

describe("auto-fill: typed amounts stay, the rest is shared", () => {
  it("one person typed 5 of 100: the other three share 95", () => {
    const f = autoFill(10000, ["a", "b", "c", "d"], { a: 500 })
    expect(f.amounts).toEqual({ a: 500, b: 3167, c: 3167, d: 3166 })
    expect(f.left).toBe(0)
    expect([...f.auto]).toEqual(["b", "c", "d"])
  })

  it("5, 10 and 50 typed: the fourth gets the rest", () => {
    const f = autoFill(10000, ["a", "b", "c", "d"], { a: 500, b: 1000, c: 5000 })
    expect(f.amounts.d).toBe(3500)
    expect(f.left).toBe(0)
  })

  it("everyone typed: reports what's left or over", () => {
    expect(autoFill(10000, ["a", "b"], { a: 3000, b: 3000 }).left).toBe(4000)
    expect(autoFill(10000, ["a", "b"], { a: 8000, b: 3000 }).left).toBe(-1000)
    // Typed too much with someone blank: they get 0 and it's flagged
    const over = autoFill(10000, ["a", "b", "c"], { a: 11000 })
    expect(over.amounts).toEqual({ a: 11000, b: 0, c: 0 })
    expect(over.left).toBe(-1000)
  })

  it("nothing typed is an even split, totals always exact", () => {
    const f = autoFill(1000, ["a", "b", "c"], {})
    expect(Object.values(f.amounts).reduce((s, v) => s + v, 0)).toBe(1000)
  })

  it("blank means auto, 0 means nothing, junk is ignored", () => {
    expect(parseTyped("", "BDT")).toBeUndefined()
    expect(parseTyped(" 0 ", "BDT")).toBe(0)
    expect(parseTyped("12.5", "BDT")).toBe(1250)
    expect(parseTyped("abc", "BDT")).toBeUndefined()
  })

  it("loads saved amounts so a new total lands on the last person", () => {
    expect(typedFromSaved(900, { a: 300, b: 300, c: 300 }, "BDT")).toEqual({})
    const typed = typedFromSaved(1000, { a: 500, b: 300, c: 200 }, "BDT")
    expect(typed).toEqual({ a: "5", b: "3" })
    expect(autoFill(1200, ["a", "b", "c"], { a: 500, b: 300 }).amounts.c).toBe(400)
  })
})

describe("inbox", () => {
  const exp = (over: Partial<Expense>): Expense => ({
    ...row,
    id: Math.random().toString(36).slice(2),
    title: "Bazar",
    category: "groceries",
    amount: 1200,
    currency: "BDT",
    rate: 1,
    date: "2026-11-04",
    paidBy: { r: 1200 },
    splitMode: "equal",
    split: { me: 1, r: 1 },
    ...over,
  })

  it("lists only other people's recent changes, newest first", () => {
    const events = inboxEvents({
      meId: "me",
      since: 1000,
      expenses: [
        exp({ createdBy: "r", createdAt: 2000, updatedAt: 2000 }),
        exp({ createdBy: "me", createdAt: 3000, updatedAt: 3000 }),
        exp({ createdBy: "r", createdAt: 500, updatedAt: 500 }),
        exp({ createdBy: "me", createdAt: 1500, updatedAt: 200_000, updatedBy: "m" }),
        exp({ createdBy: "me", createdAt: 1500, updatedAt: 9000, updatedBy: "s", deleted: 1 }),
        exp({ createdAt: 5000, updatedAt: 5000 }), // older app version: unknown author, skipped
      ],
      payments: [{ ...row, id: "p1", from: "s", to: "me", amount: 300, date: "2026-11-04", createdAt: 4000, createdBy: "s" } as Payment],
      items: [
        { ...row, id: "i1", name: "Rice", done: 0, assignee: "me", assignedBy: "m", updatedAt: 6000 } as ShopItem,
        { ...row, id: "i2", name: "Oil", done: 0, createdBy: "m", createdAt: 7000 } as ShopItem,
        { ...row, id: "i3", name: "Soap", done: 0, createdBy: "m", createdAt: 7100 } as ShopItem,
      ],
    })
    expect(events.map((e) => e.kind)).toEqual([
      "expense-edited",
      "expense-deleted",
      "items-added",
      "item-assigned",
      "payment",
      "expense-added",
    ])
    const items = events.find((e) => e.kind === "items-added")
    expect(items?.kind === "items-added" && items.items.map((i) => i.name)).toEqual(["Oil", "Soap"])
  })

  it("urgent items stand out from ordinary additions", () => {
    const events = inboxEvents({
      meId: "me",
      since: 1000,
      expenses: [],
      payments: [],
      items: [
        { ...row, id: "g", name: "Gas cylinder", done: 0, urgent: 1, createdBy: "m", createdAt: 2000, updatedAt: 2000 } as ShopItem,
        { ...row, id: "o", name: "Oil", done: 0, createdBy: "m", createdAt: 2100, updatedAt: 2100 } as ShopItem,
        { ...row, id: "r", name: "Rice", done: 0, urgent: 1, createdBy: "me", createdAt: 1500, updatedAt: 3000, updatedBy: "s" } as ShopItem,
      ],
    })
    expect(events.map((e) => e.key)).toEqual(["urgent:r", "items:m:2100", "urgent:g"])
  })
})

describe("reminders", () => {
  const bill = (over: Partial<Bill>): Bill => ({
    ...row,
    id: "rent",
    title: "Rent",
    category: "rent",
    amount: 1500000,
    variable: false,
    dueDay: 5,
    splitMode: "equal",
    split: {},
    active: 1,
    ...over,
  })
  const group = (over: Partial<GroupSnapshot>): GroupSnapshot => ({
    trip: { id: "g", name: "Mess 5B", currency: "BDT", mealMode: true, kind: "home" },
    meId: "me",
    bills: [bill({})],
    billStatus: [],
    net: -30000,
    ...over,
  })

  it("plans due-day, overdue, next month, meal count and settle-up reminders", () => {
    const now = new Date(2026, 10, 3, 12, 0) // 3 Nov, noon
    const rent = bill({})
    const plan = planReminders(
      [
        group({
          billStatus: [
            { bill: rent, period: "2026-11", due: "2026-11-05", overdue: false },
            { bill: bill({ id: "net", title: "Internet" }), period: "2026-10", due: "2026-10-05", overdue: true },
          ],
        }),
      ],
      now
    )
    const keys = plan.map((r) => r.key)
    expect(keys).toContain("bill:rent:2026-11")
    expect(keys).toContain("overdue:net:2026-10")
    expect(keys).toContain("bill:rent:2026-12")
    expect(keys).toContain("meals:g")
    expect(keys).toContain("settle:g")
    const due = plan.find((r) => r.key === "bill:rent:2026-11")!
    expect(due.at.getDate()).toBe(5)
    expect(due.at.getHours()).toBe(9)
    expect(due.url).toBe("/t/g/bills")
    const settle = plan.find((r) => r.key === "settle:g")!
    expect(settle.at.getDay()).toBe(5) // a Friday
    expect(plan.find((r) => r.key === "meals:g")?.daily).toBe(true)
  })

  it("nothing for paid bills, groups I'm not in, or when I don't owe", () => {
    const now = new Date(2026, 10, 3, 12, 0)
    const paid = { ...row, id: "x" } as Expense
    const plan = planReminders(
      [
        group({ net: 500, trip: { id: "g", name: "Home", currency: "BDT", kind: "home" }, bills: [], billStatus: [{ bill: bill({}), period: "2026-11", due: "2026-11-05", overdue: false, paid }] }),
        group({ meId: null }),
      ],
      now
    )
    expect(plan).toEqual([])
  })

  it("reminds whoever is buying: on the needed day, urgent = today, one nudge for undated", () => {
    const now = new Date(2026, 10, 3, 12, 0) // 3 Nov, noon
    const item = (over: Partial<ShopItem>): ShopItem => ({ ...row, id: Math.random().toString(36).slice(2), name: "Rice", done: 0, assignee: "me", ...over })
    const plan = planReminders(
      [
        group({
          bills: [],
          net: 0,
          trip: { id: "g", name: "Mess 5B", currency: "BDT", kind: "home" },
          toBuy: [
            item({ id: "gas", name: "Gas cylinder", urgent: 1 }),
            item({ id: "oil", name: "Oil", needBy: "2026-11-06" }),
            item({ id: "egg", name: "Eggs", needBy: "2026-11-01" }),
            item({ id: "soap", name: "Soap" }),
            item({ id: "salt", name: "Salt" }),
          ],
        }),
      ],
      now
    )
    const byKey = new Map(plan.map((r) => [r.key, r]))
    // Urgent with no date: today, morning already gone, so this evening
    expect(byKey.get("buy:gas")?.title).toBe("Buy Gas cylinder (urgent) today")
    expect(byKey.get("buy:gas")?.at.getHours()).toBe(18)
    expect(byKey.get("buy:oil")?.at.getDate()).toBe(6)
    expect(byKey.get("buy:oil")?.at.getHours()).toBe(9)
    expect(byKey.get("buy:egg")?.title).toBe("Still to buy: Eggs")
    expect(byKey.get("buy:g")?.title).toBe("You're buying 2 things")
  })

  it("ids are stable and positive", () => {
    expect(notificationId("bill:rent:2026-11")).toBe(notificationId("bill:rent:2026-11"))
    expect(notificationId("a")).not.toBe(notificationId("b"))
    expect(notificationId("x")).toBeGreaterThan(0)
  })
})
