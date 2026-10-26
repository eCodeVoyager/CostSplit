import { useSyncExternalStore } from "react"
import { authHeaders, fetchMyGroups, getSession, onSessionChange, sessionExpired } from "./auth"
import { allRowTables, CHILD_TABLES, cursorKey, db, getKV, SYNC_TABLES, table } from "./db"
import { apiUrl, hasServer, saveServerUrl } from "./server"
import type { AnyRow, TableName } from "./types"

export type SyncStatus = "idle" | "syncing" | "offline" | "error" | "disabled" | "signedout"

export interface SyncState {
  status: SyncStatus
  lastSyncedAt: number | null
  error?: string
}

interface Change {
  table: TableName
  record: Omit<AnyRow, "dirty">
}

interface SyncResponse {
  cursor: number
  hasMore: boolean
  changes: Change[]
}

const BATCH = 200
const LAST_SYNC_KEY = "costsplit:lastSyncedAt"

export class TripNotFoundError extends Error {
  constructor() {
    super("Trip not found")
  }
}

export class SignedOutError extends Error {
  constructor() {
    super("Sign in to sync")
  }
}

/** Sync needs a server and an account */
export const canSync = () => hasServer() && !!getSession()
const idleStatus = (): SyncStatus => (!hasServer() ? "disabled" : getSession() ? "idle" : "signedout")

let state: SyncState = {
  status: idleStatus(),
  lastSyncedAt: Number(safeStorage(() => localStorage.getItem(LAST_SYNC_KEY))) || null,
}
const listeners = new Set<() => void>()

function safeStorage<T>(fn: () => T): T | null {
  try {
    return fn()
  } catch {
    return null
  }
}

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

function strip(row: AnyRow): Omit<AnyRow, "dirty"> {
  const { dirty: _dirty, ...rest } = row
  return rest
}

async function collectDirty(tripId: string): Promise<Change[]> {
  const changes: Change[] = []
  const trip = await db.trips.get(tripId)
  if (trip?.dirty) changes.push({ table: "trips", record: strip(trip) })
  for (const name of CHILD_TABLES) {
    const rows = await table(name).where("[tripId+dirty]").equals([tripId, 1]).toArray()
    rows.forEach((r) => changes.push({ table: name, record: strip(r) }))
  }
  return changes
}

async function post(body: unknown): Promise<SyncResponse> {
  const res = await fetch(apiUrl("/sync"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 401) {
    sessionExpired()
    throw new SignedOutError()
  }
  if (res.status === 404) throw new TripNotFoundError()
  if (!res.ok) throw new Error(`Sync failed (${res.status})`)
  return (await res.json()) as SyncResponse
}

/** Photos are uploaded after their expense exists on the server */
async function uploadFiles(tripId: string) {
  const pending = await db.files.where("[tripId+uploaded]").equals([tripId, 0]).toArray()
  for (const file of pending) {
    const res = await fetch(apiUrl(`/files/${tripId}/${file.id}`), {
      method: "PUT",
      headers: { "Content-Type": file.type, ...authHeaders() },
      body: file.blob,
      signal: AbortSignal.timeout(60_000),
    })
    if (res.status === 401) {
      sessionExpired()
      throw new SignedOutError()
    }
    if (!res.ok) throw new Error(`Photo upload failed (${res.status})`)
    await db.files.update(file.id, { uploaded: 1 })
  }
}

/** Push this trip's local changes, then pull everything newer than our cursor */
export async function syncTrip(tripId: string) {
  for (let round = 0; round < 100; round++) {
    const cursor = await getKV(cursorKey(tripId), 0)
    const dirty = await collectDirty(tripId)
    const changes = dirty.slice(0, BATCH)
    const res = await post({ tripId, cursor, changes })

    await db.transaction("rw", [...allRowTables(), db.kv], async () => {
      // Pushed rows are clean unless they were edited again while in flight
      for (const { table: name, record } of changes) {
        const current = await table(name).get(record.id)
        if (current && current.updatedAt === record.updatedAt) {
          await table(name).update(record.id, { dirty: 0 })
        }
      }
      for (const { table: name, record } of res.changes) {
        if (!SYNC_TABLES.includes(name)) continue
        const current = await table(name).get(record.id)
        const newer = !current || record.updatedAt > current.updatedAt
        const same = current && record.updatedAt === current.updatedAt && !current.dirty
        if (newer || same) await table(name).put({ ...record, dirty: 0 } as AnyRow)
      }
      await db.kv.put({ key: cursorKey(tripId), value: res.cursor })
    })

    if (!res.hasMore && dirty.length <= BATCH) break
  }
  await uploadFiles(tripId)
}

/** Download a group someone shared. Throws TripNotFoundError for unknown ids. */
export async function joinTrip(tripId: string) {
  if (await db.trips.get(tripId)) return
  if (!hasServer()) throw new Error("No sync server set. Add one under More → Settings → App.")
  if (!getSession()) throw new SignedOutError()
  await syncTrip(tripId)
}

/** After signing in on a new phone: bring back every group on this account */
export async function restoreFromAccount() {
  const groups = await fetchMyGroups()
  let restored = 0
  for (const group of groups) {
    if (await db.trips.get(group.id)) continue
    try {
      await syncTrip(group.id)
      restored++
    } catch {
      // Deleted or unreachable group: skip it, the rest still restore
    }
  }
  return restored
}

let timer: ReturnType<typeof setTimeout> | undefined
let running = false
let queued = false

export function requestSync(delay = 700) {
  if (!canSync()) {
    setState({ status: idleStatus() })
    return
  }
  clearTimeout(timer)
  timer = setTimeout(runSync, delay)
}

async function runSync() {
  if (running) {
    queued = true
    return
  }
  if (!navigator.onLine) {
    setState({ status: "offline" })
    return
  }
  running = true
  setState({ status: "syncing" })
  let failed: unknown = null
  try {
    const trips = await db.trips.toArray()
    for (const trip of trips) {
      try {
        await syncTrip(trip.id)
      } catch (err) {
        failed = err
        if (err instanceof SignedOutError) break
      }
    }
  } catch (err) {
    failed = err
  }
  running = false

  if (failed instanceof SignedOutError) {
    setState({ status: "signedout", error: undefined })
  } else if (failed) {
    setState({
      status: navigator.onLine ? "error" : "offline",
      error: failed instanceof Error ? failed.message : String(failed),
    })
  } else {
    const now = Date.now()
    safeStorage(() => localStorage.setItem(LAST_SYNC_KEY, String(now)))
    setState({ status: "idle", lastSyncedAt: now, error: undefined })
  }

  if (queued) {
    queued = false
    requestSync(0)
  }
}

/**
 * Point the app at another server. Every local row is queued again and pull
 * cursors reset, so the new server receives the full history.
 */
export async function changeServer(url: string) {
  saveServerUrl(url)
  await db.transaction("rw", [...allRowTables(), db.kv, db.files], async () => {
    for (const name of SYNC_TABLES) await table(name).toCollection().modify({ dirty: 1 })
    await db.files.toCollection().modify({ uploaded: 0 })
    const keys = (await db.kv.toCollection().primaryKeys()).filter((k) => String(k).startsWith("cursor:"))
    await db.kv.bulkDelete(keys)
  })
  setState({ status: idleStatus(), error: undefined })
  requestSync(0)
}

let started = false

export function startSync() {
  if (started) return
  started = true
  window.addEventListener("online", () => requestSync(0))
  window.addEventListener("offline", () => setState({ status: "offline" }))
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestSync(0)
  })
  setInterval(() => {
    if (document.visibilityState === "visible") requestSync(0)
  }, 30_000)
  onSessionChange(() => requestSync(0))
  requestSync(0)
}
