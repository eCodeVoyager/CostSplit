import { useEffect, useState } from "react"
import { authHeaders, getSession } from "./auth"
import { db } from "./db"
import { apiUrl, hasServer } from "./server"

/** Profile photos live in the files table under this "group", so removing a group never drops them */
const AVATARS = "avatars"
const RETRY_MS = 60_000

/** id -> object URL. Avatars are tiny and few, so URLs are kept for the whole visit. */
const urls = new Map<string, string>()
const loading = new Map<string, Promise<string | null>>()
const failedAt = new Map<string, number>()

async function load(id: string): Promise<string | null> {
  let row = await db.files.get(id)
  if (!row) {
    if (!hasServer() || !getSession() || !navigator.onLine) return null
    const res = await fetch(apiUrl(`/avatars/${id}`), { headers: authHeaders(), signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    row = { id, tripId: AVATARS, blob: await res.blob(), type: "image/jpeg", uploaded: 1, createdAt: Date.now() }
    await db.files.put(row)
  }
  const url = URL.createObjectURL(row.blob)
  urls.set(id, url)
  return url
}

function resolve(id: string) {
  let p = loading.get(id)
  if (!p) {
    p = load(id)
      .catch(() => null)
      .then((url) => {
        if (!url) {
          // Try again later (offline, or the photo was just replaced)
          failedAt.set(id, Date.now())
          loading.delete(id)
        }
        return url
      })
    loading.set(id, p)
  }
  return p
}

/** Object URL for a profile photo, or null (show initials) */
export function useAvatarUrl(id?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (urls.get(id) ?? null) : null))
  useEffect(() => {
    if (!id) return setUrl(null)
    const known = urls.get(id)
    if (known) return setUrl(known)
    setUrl(null)
    if (Date.now() - (failedAt.get(id) ?? 0) < RETRY_MS) return
    let live = true
    resolve(id).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [id])
  return url
}

/** Our own new photo shows right away, without downloading it back */
export async function rememberAvatar(id: string, blob: Blob) {
  await db.files.put({ id, tripId: AVATARS, blob, type: "image/jpeg", uploaded: 1, createdAt: Date.now() })
  urls.set(id, URL.createObjectURL(blob))
  failedAt.delete(id)
}
