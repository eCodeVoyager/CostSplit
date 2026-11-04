import { expenseImpact, type MealWeights } from "./balance"
import { shortDate } from "./dates"
import { isEdited } from "./filters"
import { formatMoney } from "./money"
import type { Expense, ID, Payment, ShopItem, Trip } from "./types"

/** Something another person did that you'd want to know about */
export type InboxEvent =
  | { kind: "expense-added" | "expense-edited" | "expense-deleted"; key: string; at: number; by: ID; expense: Expense }
  | { kind: "payment"; key: string; at: number; by: ID; payment: Payment }
  | { kind: "item-assigned"; key: string; at: number; by: ID; item: ShopItem }
  /** Someone needs this right away */
  | { kind: "item-urgent"; key: string; at: number; by: ID; item: ShopItem }
  | { kind: "items-added"; key: string; at: number; by: ID; items: ShopItem[] }

export interface InboxInput {
  meId: ID | null
  /** Live and deleted rows */
  expenses: Expense[]
  payments: Payment[]
  items: ShopItem[]
  /** Only things after this time (ms) */
  since: number
}

/**
 * Other people's changes, newest first. Only rows that say who made them
 * (added with this version or later) are included, and never your own.
 */
export function inboxEvents({ meId, expenses, payments, items, since }: InboxInput): InboxEvent[] {
  const out: InboxEvent[] = []
  const other = (id?: ID): id is ID => !!id && id !== meId

  for (const e of expenses) {
    if (e.deleted) {
      if (other(e.updatedBy) && e.updatedAt > since) {
        out.push({ kind: "expense-deleted", key: `del:${e.id}`, at: e.updatedAt, by: e.updatedBy, expense: e })
      }
      continue
    }
    if (other(e.createdBy) && e.createdAt > since) {
      out.push({ kind: "expense-added", key: `add:${e.id}`, at: e.createdAt, by: e.createdBy, expense: e })
    }
    if (other(e.updatedBy) && e.updatedAt > since && isEdited(e)) {
      out.push({ kind: "expense-edited", key: `edit:${e.id}`, at: e.updatedAt, by: e.updatedBy, expense: e })
    }
  }

  for (const p of payments) {
    if (!p.deleted && other(p.createdBy) && p.createdAt > since) {
      out.push({ kind: "payment", key: `pay:${p.id}`, at: p.createdAt, by: p.createdBy, payment: p })
    }
  }

  const added = new Map<ID, ShopItem[]>()
  for (const i of items) {
    if (i.deleted || i.done) continue
    if (meId && i.assignee === meId && other(i.assignedBy) && i.updatedAt > since) {
      out.push({ kind: "item-assigned", key: `assign:${i.id}`, at: i.updatedAt, by: i.assignedBy, item: i })
    }
    if (i.urgent && other(i.updatedBy ?? i.createdBy) && i.updatedAt > since) {
      out.push({ kind: "item-urgent", key: `urgent:${i.id}`, at: i.updatedAt, by: (i.updatedBy ?? i.createdBy)!, item: i })
    } else if (other(i.createdBy) && i.createdAt > since) {
      added.set(i.createdBy, [...(added.get(i.createdBy) ?? []), i])
    }
  }
  // "Mitu added rice, oil, soap" as one line per person
  for (const [by, list] of added) {
    const at = Math.max(...list.map((i) => i.createdAt))
    out.push({ kind: "items-added", key: `items:${by}:${at}`, at, by, items: list })
  }

  return out.sort((a, b) => b.at - a.at)
}

/** One line of text for an event, for the inbox and for system notifications */
export function describeEvent(
  ev: InboxEvent,
  ctx: { meId: ID | null; names: Map<string, string>; trip: Pick<Trip, "currency">; meals?: MealWeights }
): { title: string; body: string } {
  const who = (id: ID) => (id === ctx.meId ? "You" : (ctx.names.get(id) ?? "Someone"))
  const money = (v: number, c = ctx.trip.currency) => formatMoney(v, c)
  switch (ev.kind) {
    case "expense-added":
    case "expense-edited":
    case "expense-deleted": {
      const e = ev.expense
      const verb = ev.kind === "expense-added" ? "added" : ev.kind === "expense-edited" ? "changed" : "deleted"
      const title = `${who(ev.by)} ${verb} ${e.title} · ${money(e.amount, e.currency)}`
      if (ev.kind === "expense-deleted") return { title, body: "It no longer counts in balances." }
      const impact = expenseImpact(e, ctx.trip, ctx.meals)
      const me = ctx.meId
      if (!me || (!(me in impact.paid) && !(me in impact.owed))) return { title, body: "You're not part of it." }
      const net = (impact.paid[me] ?? 0) - (impact.owed[me] ?? 0)
      return {
        title,
        body: net > 0 ? `You get back ${money(net)}` : net < 0 ? `Your share: ${money(-net)}` : "Your balance doesn't change.",
      }
    }
    case "payment": {
      const p = ev.payment
      const to = p.to === ctx.meId ? "you" : who(p.to)
      return {
        title: `${who(p.from)} paid ${to} ${money(p.amount)}`,
        body: ev.by === p.from ? "Recorded by them." : `Recorded by ${who(ev.by)}.`,
      }
    }
    case "item-assigned":
      return {
        title: `${who(ev.by)} asked you to buy ${ev.item.name}${ev.item.urgent ? " (urgent)" : ""}`,
        body: ev.item.needBy ? `Needed by ${shortDate(ev.item.needBy)}. You'll get a reminder.` : "It's on your to-buy list.",
      }
    case "item-urgent":
      return {
        title: `${who(ev.by)} needs ${ev.item.name} urgently`,
        body: !ev.item.assignee
          ? "Nobody's buying it yet. Tap “I'll buy” if you can."
          : ev.item.assignee === ctx.meId
            ? "You're buying it."
            : `${who(ev.item.assignee)} is buying it.`,
      }
    case "items-added": {
      const names = ev.items.map((i) => i.name)
      return {
        title: `${who(ev.by)} added ${names.length === 1 ? names[0] : `${names.length} items`} to the to-buy list`,
        body: names.slice(0, 6).join(", ") + (names.length > 6 ? "…" : ""),
      }
    }
  }
}

export const seenKey = (tripId: string) => `seen:${tripId}`
/** How far back the inbox lists things (unread or not) */
export const INBOX_DAYS = 14
