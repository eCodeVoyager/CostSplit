import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useSession } from "@/lib/auth"
import { autoIdentify, linkChanges } from "@/lib/people"
import { clearClaim, linkMe, setMe } from "@/lib/repo"
import type { TripData } from "./useTripData"

/**
 * Works out who "me" is in a group without asking, when it can (the person
 * this account joined as, a personal invite link, an invited email), and keeps
 * that person tied to the account: its id, email and profile photo.
 * Returns true while a picker would be pointless (an automatic choice is on its way).
 */
export function useIdentity(data: TripData | null | undefined, onNotMe: () => void): boolean {
  const user = useSession()?.user ?? null
  const auto = data && !data.meId ? autoIdentify(data.members, user, data.claim) : null
  const told = useRef(false)
  // Writes re-run this effect through the live query; one batch at a time
  const busy = useRef(false)
  // Look again once a batch is written, in case the data changed meanwhile
  const [round, setRound] = useState(0)

  const tripId = data?.trip.id
  const meId = data?.meId ?? null
  const claim = data?.claim ?? null
  const members = data?.members

  useEffect(() => {
    if (!tripId || !members || busy.current) return
    const run = (fn: () => Promise<boolean>) => {
      busy.current = true
      fn()
        .catch(() => false)
        .then((wrote) => {
          busy.current = false
          if (wrote) setRound((r) => r + 1)
        })
    }
    if (!meId) {
      if (!auto) return
      run(async () => {
        await setMe(tripId, auto.memberId)
        if (claim) await clearClaim(tripId)
        const name = members.find((m) => m.id === auto.memberId)?.name
        if (name && !told.current && auto.reason !== "account") {
          told.current = true
          toast.success(`You're ${name} here`, {
            description: auto.reason === "invite" ? "From your invite link." : "Matched by your email.",
            action: { label: "Not me", onClick: onNotMe },
          })
        }
        return true
      })
      return
    }
    // Only a hint from what is on screen; linkMe works from the database
    const relink = !!user && linkChanges(members, meId, user).length > 0
    if (claim || relink) {
      run(async () => {
        if (claim) await clearClaim(tripId)
        const wrote = relink && user ? await linkMe(tripId, meId, user) : 0
        return !!claim || wrote > 0
      })
    }
    // auto is derived from the same inputs; onNotMe is stable enough (opens a dialog)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, meId, claim, members, user, auto?.memberId, round])

  return !!auto
}
