export const LAST_TRIP_KEY = "costsplit:lastTrip"

export function rememberTrip(tripId: string | null) {
  try {
    if (tripId) localStorage.setItem(LAST_TRIP_KEY, tripId)
    else localStorage.removeItem(LAST_TRIP_KEY)
  } catch {
    // Not critical
  }
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isTripId(value: string) {
  return ID_RE.test(value)
}

/** Accepts a full invite link, a /t/ link or a bare trip id */
export function parseInvite(input: string): string | null {
  const text = input.trim()
  const match = text.match(/\/(?:join|t)\/([A-Za-z0-9_-]{8,64})/)
  const id = match ? match[1] : text
  return isTripId(id) ? id : null
}

/** Where a pasted invite should go, keeping a personal invite's ?as=<person> */
export function invitePath(input: string): string | null {
  const id = parseInvite(input)
  if (!id) return null
  const as = input.match(/[?&]as=([A-Za-z0-9_-]{8,64})/)?.[1]
  return `/join/${id}${as ? `?as=${as}` : ""}`
}
