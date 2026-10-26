import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { timeAgo } from "@/lib/dates"
import { requestSync, useSyncState } from "@/lib/sync"
import { cn } from "@/lib/utils"

/** Small status pill: tells people their data is safe even with no signal */
export function SyncBadge({ pending }: { pending: number }) {
  const { status, lastSyncedAt, error } = useSyncState()
  if (status === "disabled") return null

  const offline = status === "offline"
  const label = offline
    ? pending > 0
      ? `${pending} saved offline`
      : "Offline"
    : status === "syncing"
      ? "Syncing"
      : status === "error"
        ? "Sync issue"
        : pending > 0
          ? "Saving"
          : "Synced"
  const Icon = offline ? CloudOff : status === "syncing" ? RefreshCw : status === "error" ? TriangleAlert : Cloud

  const onClick = () => {
    if (offline) {
      toast("You're offline", {
        description: "Everything is saved on this phone and will sync when you're back online.",
      })
      return
    }
    if (status === "error") toast.error("Couldn't sync", { description: error })
    else if (lastSyncedAt) toast(`Last synced ${timeAgo(lastSyncedAt)}`)
    requestSync(0)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        offline || status === "error" ? "bg-negative-soft text-negative" : "bg-secondary text-secondary-foreground"
      )}
      aria-label={`Sync status: ${label}`}
    >
      <Icon className={cn("size-3.5", status === "syncing" && "animate-spin")} aria-hidden />
      {label}
    </button>
  )
}
