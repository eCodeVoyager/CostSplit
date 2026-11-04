import { Dexie, type EntityTable, type Table } from "dexie"
import type { AnyRow, Bill, Expense, Meal, Member, Payment, PersonalExpense, ShopItem, TableName, Trip } from "./types"

export interface KV {
  key: string
  value: unknown
}

/** Photos (receipts, payment proof), stored on this phone and uploaded when online */
export interface FileRow {
  id: string
  tripId: string
  blob: Blob
  type: string
  uploaded: 0 | 1
  createdAt: number
}

export const db = new Dexie("costsplit-v2") as Dexie & {
  trips: EntityTable<Trip, "id">
  members: EntityTable<Member, "id">
  expenses: EntityTable<Expense, "id">
  payments: EntityTable<Payment, "id">
  bills: EntityTable<Bill, "id">
  meals: EntityTable<Meal, "id">
  items: EntityTable<ShopItem, "id">
  personal: EntityTable<PersonalExpense, "id">
  files: EntityTable<FileRow, "id">
  kv: EntityTable<KV, "key">
}

db.version(1).stores({
  trips: "id",
  members: "id, tripId, [tripId+dirty]",
  expenses: "id, tripId, [tripId+dirty]",
  payments: "id, tripId, [tripId+dirty]",
  kv: "key",
})

db.version(2).stores({
  bills: "id, tripId, [tripId+dirty]",
  meals: "id, tripId, [tripId+dirty]",
  items: "id, tripId, [tripId+dirty]",
})

db.version(3).stores({
  files: "id, tripId, [tripId+uploaded]",
})

db.version(4).stores({
  personal: "id, tripId, [tripId+dirty]",
})

export const CHILD_TABLES = ["members", "expenses", "payments", "bills", "meals", "items", "personal"] as const
export const SYNC_TABLES: TableName[] = ["trips", ...CHILD_TABLES]
/** Every Dexie table holding synced rows, for transactions */
export const allRowTables = () => SYNC_TABLES.map((name) => db.table(name))

export function table(name: TableName): Table<AnyRow, string> {
  return db.table(name)
}

export async function getKV<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export function setKV(key: string, value: unknown) {
  return db.kv.put({ key, value })
}

export const meKey = (tripId: string) => `me:${tripId}`
export const cursorKey = (tripId: string) => `cursor:${tripId}`
