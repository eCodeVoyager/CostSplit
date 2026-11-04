import { useLiveQuery } from "dexie-react-hooks"
import { useEffect, useMemo } from "react"
import { getKV, setKV } from "@/lib/db"
import { INBOX_DAYS, inboxEvents, seenKey } from "@/lib/inbox"
import type { TripData } from "./useTripData"

/** Other people's recent changes in this group, and how many you haven't looked at yet */
export function useInbox(data: TripData) {
  const id = data.trip.id
  const seen = useLiveQuery(() => getKV<number | null>(seenKey(id), null), [id])
  // First time with this version: start counting from now, don't flood with old history
  useEffect(() => {
    if (seen === null) setKV(seenKey(id), Date.now())
  }, [seen, id])

  const events = useMemo(
    () =>
      inboxEvents({
        meId: data.meId,
        expenses: [...data.expenses, ...data.deletedExpenses],
        payments: data.payments,
        items: data.items,
        since: Date.now() - INBOX_DAYS * 86_400_000,
      }),
    [data.meId, data.expenses, data.deletedExpenses, data.payments, data.items]
  )
  const lastSeen = seen ?? Date.now()
  const unread = seen == null ? 0 : events.filter((e) => e.at > seen).length
  return { events, unread, lastSeen, markSeen: () => setKV(seenKey(id), Date.now()) }
}
