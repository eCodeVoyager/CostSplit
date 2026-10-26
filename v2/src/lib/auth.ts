import { useSyncExternalStore } from "react"
import { apiUrl } from "./server"

export interface Session {
  token: string
  user: { id: string; email: string }
}

const KEY = "costsplit:session"
const listeners = new Set<() => void>()

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

let session = read()

function setSession(next: Session | null) {
  session = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode: stays signed in for this visit only
  }
  listeners.forEach((l) => l())
}

export const getSession = () => session

export function onSessionChange(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSession() {
  return useSyncExternalStore(onSessionChange, getSession)
}

export function authHeaders(): Record<string, string> {
  return session ? { Authorization: `Bearer ${session.token}` } : {}
}

/** The server no longer accepts our token (expired or signed out elsewhere) */
export function sessionExpired() {
  if (session) setSession(null)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error("Can't reach the server. Check your internet connection.")
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string }
  if (!res.ok) throw new Error(data.message ?? `Something went wrong (${res.status})`)
  return data as T
}

export async function requestCode(email: string) {
  await post("/auth/start", { email })
}

export async function verifyCode(email: string, code: string) {
  const result = await post<Session>("/auth/verify", { email, code })
  setSession(result)
  return result
}

/** Ends the session on the server (best effort) and forgets it here */
export async function endSession() {
  await post("/auth/logout", {}).catch(() => {})
  setSession(null)
}

export interface RemoteGroup {
  id: string
  name: string
  emoji: string
  kind: string
}

export async function fetchMyGroups(): Promise<RemoteGroup[]> {
  const res = await fetch(apiUrl("/me"), { headers: authHeaders(), signal: AbortSignal.timeout(15_000) })
  if (res.status === 401) {
    sessionExpired()
    return []
  }
  if (!res.ok) throw new Error(`Couldn't load your groups (${res.status})`)
  return ((await res.json()) as { groups: RemoteGroup[] }).groups
}
