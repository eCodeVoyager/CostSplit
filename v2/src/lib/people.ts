import type { User } from "./auth"
import type { Member } from "./types"

type Identity = Pick<User, "id" | "email">

const sameEmail = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export type AutoReason = "account" | "invite" | "email"

/**
 * Who "me" is in a group, without asking: the person this account joined as
 * before (another phone), the person a personal invite link was for, or the
 * person invited with this email. Null when only the user can tell.
 */
export function autoIdentify(
  members: Member[],
  user: Identity | null,
  claim: string | null
): { memberId: string; reason: AutoReason } | null {
  const free = (m: Member) => !m.userId || (!!user && m.userId === user.id)
  if (user) {
    const mine = members.find((m) => m.userId === user.id)
    if (mine) return { memberId: mine.id, reason: "account" }
  }
  if (claim) {
    const invited = members.find((m) => m.id === claim && free(m))
    if (invited) return { memberId: invited.id, reason: "invite" }
  }
  if (user) {
    const byEmail = members.find((m) => !m.userId && sameEmail(m.email, user.email))
    if (byEmail) return { memberId: byEmail.id, reason: "email" }
  }
  return null
}

type Patch = Partial<Pick<Member, "userId" | "email" | "avatar">>

/**
 * Changes that tie `me` to the signed-in account (and drop the tie from anyone
 * else in the group who had it). Only the fields that differ, so nothing is
 * written when it's already right. `force` takes over a person another account
 * had joined as (the user picked them by hand).
 */
export function linkChanges(
  members: Member[],
  meId: string,
  user: User,
  force = false
): { id: string; patch: Patch }[] {
  const out: { id: string; patch: Patch }[] = []
  const me = members.find((m) => m.id === meId)
  if (!me) return out
  if (me.userId && me.userId !== user.id && !force) return out
  const want: Patch = { userId: user.id, email: user.email, avatar: user.avatar }
  const patch: Patch = {}
  for (const key of ["userId", "email", "avatar"] as const) if (me[key] !== want[key]) patch[key] = want[key]
  if (Object.keys(patch).length) out.push({ id: me.id, patch })
  for (const m of members) {
    if (m.id === meId || m.userId !== user.id) continue
    out.push({ id: m.id, patch: { userId: undefined, avatar: undefined, ...(sameEmail(m.email, user.email) ? { email: undefined } : {}) } })
  }
  return out
}

/** People who haven't joined with an account yet (they can get a personal invite) */
export const notJoined = (members: Member[], meId: string | null) =>
  members.filter((m) => !m.userId && m.id !== meId && !m.archived)

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
