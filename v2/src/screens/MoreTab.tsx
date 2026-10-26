import { ChartPie, ChevronRight, House, ListChecks, Settings2, UserPlus, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "wouter"
import { Switch } from "@/components/ui/switch"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { updateTrip } from "@/lib/repo"

function Row({ href, icon: Icon, title, hint, onClick, right }: {
  href?: string
  icon: LucideIcon
  title: string
  hint?: string
  onClick?: () => void
  right?: ReactNode
}) {
  const inner = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {right ?? <ChevronRight className="size-5 text-muted-foreground" aria-hidden />}
    </>
  )
  const cls = "flex min-h-16 w-full items-center gap-3 px-3 text-left active:bg-accent"
  if (href) return <Link href={href} className={cls}>{inner}</Link>
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

export function MoreTab() {
  const { trip, kind, billStatus, bills, items, everyone } = useTrip()
  const { invite } = useTripActions()
  const due = billStatus.filter((b) => !b.paid).length
  const toBuy = items.filter((i) => !i.done).length

  return (
    <div className="space-y-4 pt-4 pb-6">
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        <Row
          href="/bills"
          icon={Zap}
          title="Monthly bills"
          hint={bills.length ? `${bills.length} bills${due ? ` · ${due} to pay` : " · all paid"}` : "Rent, electricity, internet, maid"}
        />
        {trip.mealMode ? (
          <Row href="/meals" icon={UtensilsCrossed} title="Meal book" hint="Daily meal counts and meal rate" />
        ) : (
          <Row
            icon={UtensilsCrossed}
            title="Meal count (mess)"
            hint="Split bazar by how many meals each person eats"
            onClick={() => updateTrip(trip.id, { mealMode: true })}
            right={<Switch checked={false} aria-label="Turn on meal count" tabIndex={-1} />}
          />
        )}
        <Row href="/list" icon={ListChecks} title="To-buy list" hint={toBuy ? `${toBuy} items to buy` : "Shared shopping list"} />
        <Row href="/stats" icon={ChartPie} title="Insights" hint="Monthly report, categories, who paid what" />
      </div>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        <Row href="/settings" icon={Settings2} title={kind === "home" ? "Home settings" : "Trip settings"} hint={`${everyone.length} people · ${trip.currency}`} />
        <Row icon={UserPlus} title="Invite people" hint="Share a link or QR code" onClick={invite} />
        <Row href="~/" icon={House} title="All homes and trips" />
      </div>
    </div>
  )
}
