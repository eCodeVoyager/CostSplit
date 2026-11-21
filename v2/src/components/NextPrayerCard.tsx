import { ChevronRight, MoonStar } from "lucide-react"
import { useEffect, useState } from "react"
import { Link } from "wouter"
import { nextPrayer, prayerName, resolvePlace, useAdhanSettings } from "@/lib/adhan/settings"

/** On the first screen: the next prayer, one tap from the Prayer page */
export function NextPrayerCard({ className }: { className?: string }) {
  const settings = useAdhanSettings()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const place = resolvePlace(settings)
  const next = place ? nextPrayer(place, settings, new Date(now)) : null
  const min = next ? Math.max(0, Math.round((next.at - now) / 60_000)) : 0
  const until = min < 1 ? "now" : min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${min % 60} min`

  return (
    <Link href="/prayer" className={`flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs active:bg-accent ${className ?? ""}`}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <MoonStar className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-sm">
        {next ? (
          <>
            <span className="block font-semibold">
              {prayerName(next.prayer, next.at)} {new Date(next.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
            <span className="block truncate text-muted-foreground">
              {until} · {place?.name}
              {settings.enabled ? " · azan on" : ""}
            </span>
          </>
        ) : (
          <>
            <span className="block font-semibold">Prayer times and azan</span>
            <span className="block text-muted-foreground">Pick your city to start</span>
          </>
        )}
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </Link>
  )
}
