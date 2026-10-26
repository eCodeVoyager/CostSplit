import { allRowTables, CHILD_TABLES, cursorKey, db, meKey, setKV, table } from "./db"
import { requestSync } from "./sync"
import type { AnyRow, Bill, Expense, GroupKind, Meal, Member, Payment, Row, ShopItem, TableName, Trip } from "./types"

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  // randomUUID needs a secure context; plain http on a LAN still works with this
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Always move forward, even if this device's clock is behind the last editor's */
function stamp(prev = 0) {
  return Math.max(Date.now(), prev + 1)
}

function baseRow(tripId: string, id = newId()): Row {
  const now = Date.now()
  return { id, tripId, createdAt: now, updatedAt: now, deleted: 0, dirty: 1 }
}

export async function patchRow(name: TableName, id: string, patch: Partial<AnyRow>) {
  const t = table(name)
  await db.transaction("rw", t, async () => {
    const current = await t.get(id)
    if (!current) return
    await t.put({ ...current, ...patch, updatedAt: stamp(current.updatedAt), dirty: 1 } as AnyRow)
  })
  requestSync()
}

export type BillInput = Omit<Bill, keyof Row>

export async function createTrip(input: {
  name: string
  emoji: string
  currency: string
  kind: GroupKind
  mealMode?: boolean
  me: string
  others: string[]
  bills?: Pick<BillInput, "title" | "category" | "amount" | "variable" | "dueDay">[]
}) {
  const id = newId()
  const trip: Trip = {
    ...baseRow(id, id),
    name: input.name,
    emoji: input.emoji,
    kind: input.kind,
    currency: input.currency,
    rates: {},
    ...(input.mealMode ? { mealMode: true } : {}),
  }
  const members: Member[] = [input.me, ...input.others].map((name, i) => ({
    ...baseRow(id),
    createdAt: trip.createdAt + i,
    name,
  }))
  const bills: Bill[] = (input.bills ?? []).map((b, i) => ({
    ...baseRow(id),
    createdAt: trip.createdAt + i,
    ...b,
    splitMode: "equal",
    split: {},
    active: 1,
  }))
  await db.transaction("rw", [db.trips, db.members, db.bills, db.kv], async () => {
    await db.trips.add(trip)
    await db.members.bulkAdd(members)
    await db.bills.bulkAdd(bills)
    await setKV(meKey(id), members[0].id)
  })
  requestSync()
  return id
}

export const updateTrip = (id: string, patch: Partial<Pick<Trip, "name" | "emoji" | "currency" | "rates" | "kind" | "mealMode">>) =>
  patchRow("trips", id, patch)

export async function addMember(tripId: string, name: string) {
  const member: Member = { ...baseRow(tripId), name }
  await db.members.add(member)
  requestSync()
  return member.id
}

export const renameMember = (id: string, name: string) => patchRow("members", id, { name })

/** Members referenced by an expense or payment can't be removed (balances would break) */
export async function isMemberUsed(member: Member) {
  const expenses = await db.expenses.where("tripId").equals(member.tripId).toArray()
  if (expenses.some((e) => !e.deleted && (e.paidBy[member.id] || e.split[member.id]))) return true
  const payments = await db.payments.where("tripId").equals(member.tripId).toArray()
  return payments.some((p) => !p.deleted && (p.from === member.id || p.to === member.id))
}

export const removeMember = (id: string) => patchRow("members", id, { deleted: 1 })

/** Moved out: keeps their history and balance, hides them from new expenses */
export const setMemberArchived = (id: string, archived: boolean) =>
  patchRow("members", id, { archived: archived ? 1 : 0 })

export const setMe = (tripId: string, memberId: string) => setKV(meKey(tripId), memberId)

export type ExpenseInput = Omit<Expense, keyof Row>

export async function saveExpense(tripId: string, input: ExpenseInput, id?: string) {
  if (id) {
    await patchRow("expenses", id, input)
    return id
  }
  const expense: Expense = { ...baseRow(tripId), ...input }
  await db.expenses.add(expense)
  requestSync()
  return expense.id
}

export async function addPayment(tripId: string, input: Omit<Payment, keyof Row>) {
  const payment: Payment = { ...baseRow(tripId), ...input }
  await db.payments.add(payment)
  requestSync()
  return payment.id
}

export async function saveBill(tripId: string, input: BillInput, id?: string) {
  if (id) {
    await patchRow("bills", id, input)
    return id
  }
  const bill: Bill = { ...baseRow(tripId), ...input }
  await db.bills.add(bill)
  requestSync()
  return bill.id
}

/** One row per person per day, so two phones counting different people never clash */
export async function setMeals(tripId: string, date: string, memberId: string, count: number) {
  const id = `${date}_${memberId}`
  const value = Math.max(0, Math.min(20, Math.round(count * 2) / 2))
  const current = await db.meals.get(id)
  if (current) {
    if (current.count !== value || current.deleted) await patchRow("meals", id, { count: value, deleted: 0 })
    return
  }
  const meal: Meal = { ...baseRow(tripId, id), date, memberId, count: value }
  await db.meals.add(meal)
  requestSync()
}

export async function addItem(tripId: string, name: string) {
  const item: ShopItem = { ...baseRow(tripId), name, done: 0 }
  await db.items.add(item)
  requestSync()
}

export const setItemDone = (id: string, done: boolean) => patchRow("items", id, { done: done ? 1 : 0 })

export async function removeItems(ids: string[]) {
  for (const id of ids) await patchRow("items", id, { deleted: 1 })
}

export const softDelete = (name: TableName, id: string) => patchRow(name, id, { deleted: 1 })
export const restore = (name: TableName, id: string) => patchRow(name, id, { deleted: 0 })

/** Forget a trip on this device only. Others keep it; it can be re-joined with the link. */
export async function removeTripLocally(tripId: string) {
  await db.transaction("rw", [...allRowTables(), db.kv, db.files], async () => {
    await db.trips.delete(tripId)
    for (const name of CHILD_TABLES) await table(name).where("tripId").equals(tripId).delete()
    await db.files.where("tripId").equals(tripId).delete()
    await db.kv.bulkDelete([meKey(tripId), cursorKey(tripId)])
  })
}

type ChildRows = { [K in (typeof CHILD_TABLES)[number]]?: AnyRow[] }

export interface Backup extends ChildRows {
  app: "costsplit"
  version: 2
  exportedAt: string
  trip: Trip
}

export async function exportBackup(tripId: string): Promise<Backup> {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error("Trip not found")
  const backup: Backup = { app: "costsplit", version: 2, exportedAt: new Date().toISOString(), trip }
  for (const name of CHILD_TABLES) backup[name] = await table(name).where("tripId").equals(tripId).toArray()
  return backup
}

/**
 * Restore a backup. Timestamps are kept as-is so newer local or server rows
 * still win; restored rows are queued for sync.
 */
export async function importBackup(data: unknown) {
  const backup = data as Backup
  if (backup?.app !== "costsplit" || backup.version !== 2 || !backup.trip?.id) {
    throw new Error("This file is not a CostSplit v2 backup")
  }
  const groups: [TableName, AnyRow[]][] = [
    ["trips", [backup.trip]],
    ...CHILD_TABLES.map((name): [TableName, AnyRow[]] => [name, backup[name] ?? []]),
  ]
  await db.transaction("rw", allRowTables(), async () => {
    for (const [name, rows] of groups) {
      for (const row of rows) {
        if (row.tripId !== backup.trip.id) continue
        const current = await table(name).get(row.id)
        if (!current || current.updatedAt < row.updatedAt) {
          await table(name).put({ ...row, dirty: 1 })
        }
      }
    }
  })
  requestSync()
  return backup.trip.id
}
