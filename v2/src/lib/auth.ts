import { useSyncExternalStore } from "react"
import { apiUrl } from "./server"

export interface User {
  id: string
  email: string
  /** Profile name (optional) */
  name?: string
  /** Profile photo id (optional) */
  avatar?: string
}

export interface Session {
  token: string
  user: User
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

/** Keep the signed-in user's name and photo current (from /me or a profile change) */
function setUser(user: User) {
  if (!session || session.user.id !== user.id) return
  const same =
    session.user.email === user.email && session.user.name === user.name && session.user.avatar === user.avatar
  if (!same) setSession({ ...session, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } })
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

async function send<T>(path: string, init: { method?: string; body?: BodyInit; type?: string }): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? "POST",
      headers: { ...(init.type ? { "Content-Type": init.type } : {}), ...authHeaders() },
      body: init.body,
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error("Can't reach the server. Check your internet connection.")
  }
  const data = (await res.json().catch(() => ({}))) as { message?: string }
  if (res.status === 401 && session) {
    sessionExpired()
    throw new Error("You were signed out. Sign in again.")
  }
  if (!res.ok) throw new Error(data.message ?? `Something went wrong (${res.status})`)
  return data as T
}

const post = <T>(path: string, body: unknown) => send<T>(path, { body: JSON.stringify(body), type: "application/json" })

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
  const data = (await res.json()) as { user: User; groups: RemoteGroup[] }
  if (data.user) setUser(data.user)
  return data.groups
}

/** Name and photo may have changed on another phone */
export async function refreshProfile() {
  if (!session || !navigator.onLine) return
  await fetchMyGroups().catch(() => {})
}

export async function saveProfileName(name: string) {
  const { user } = await post<{ user: User }>("/profile", { name })
  setUser(user)
  return user
}

/** Uploads an already-cropped JPEG; returns the user with the new photo id */
export async function uploadAvatar(jpeg: Blob) {
  const { user } = await send<{ user: User }>("/profile/avatar", { method: "PUT", body: jpeg, type: "image/jpeg" })
  setUser(user)
  return user
}

export async function removeAvatar() {
  const { user } = await send<{ user: User }>("/profile/avatar", { method: "DELETE" })
  setUser(user)
  return user
}

/** Emails `email` a link that joins `tripId` as `memberId` */
export async function sendInvite(tripId: string, memberId: string, email: string) {
  await post("/invite", { tripId, memberId, email })
}

/** What to call the signed-in person: profile name, else the start of the email */
export function displayName(user: User) {
  return user.name || user.email.split("@")[0]
}
