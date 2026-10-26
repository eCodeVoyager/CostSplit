import { ArrowRight, ChevronRight, HandCoins, ImageIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "wouter"
import { useTrip } from "@/hooks/useTripData"
import { formatMoney } from "@/lib/money"
import type { Expense, Payment } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CategoryIcon } from "./common"
import { PhotoViewer } from "./PhotoField"

export function ExpenseRow({
  expense: e,
  paid,
  owed,
  onClick,
}: {
  expense: Expense
  paid: Record<string, number>
  owed: Record<string, number>
  onClick: () => void
}) {
  const { trip, meId, names } = useTrip()
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const payers = Object.keys(paid)
  const income = e.kind === "income"
  const loan = e.category === "loan"
  const sharers = Object.keys(owed)
  const subtitle = loan
    ? `${payers.length === 1 ? who(payers[0]) : `${payers.length} people`} lent ${sharers.map(who).join(", ")}`
    : `${payers.length === 1 ? who(payers[0]) : `${payers.length} people`} ${income ? "received" : "paid"}`
  const mine = meId ? (paid[meId] ?? 0) - (owed[meId] ?? 0) : 0
  const involved = meId ? paid[meId] !== undefined || owed[meId] !== undefined : false

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 active:bg-accent"
    >
      <CategoryIcon category={e.category} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-medium">
          <span className="truncate">{e.title}</span>
          {e.receipt && <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="has receipt photo" />}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {subtitle}
          {e.splitMode === "meals" ? " · by meals" : ""}
          {e.currency !== trip.currency ? ` · ${e.currency}` : ""}
          {e.note ? ` · ${e.note}` : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("font-semibold tabular", income && "text-positive")}>
          {income ? "+" : ""}
          {formatMoney(e.amount, e.currency)}
        </p>
        {meId && (
          <p className={cn("text-xs tabular", mine > 0 ? "text-positive" : mine < 0 ? "text-negative" : "text-muted-foreground")}>
            {!involved
              ? "not involved"
              : mine > 0
                ? `you ${income ? "get" : "lent"} ${formatMoney(mine, trip.currency)}`
                : mine < 0
                  ? `you owe ${formatMoney(-mine, trip.currency)}`
                  : "even"}
          </p>
        )}
      </div>
    </button>
  )
}

export function PaymentRow({ payment: p }: { payment: Payment }) {
  const { trip, meId, names } = useTrip()
  const [viewing, setViewing] = useState(false)
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <PhotoViewer tripId={trip.id} fileId={viewing ? p.proof : undefined} onClose={() => setViewing(false)} label="Proof of payment" />
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-positive-soft text-positive">
        <HandCoins className="size-5" aria-hidden />
      </span>
      <p className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        <span className="truncate font-medium">{who(p.from)}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="gave" />
        <span className="truncate font-medium">{who(p.to)}</span>
        {p.note ? <span className="truncate text-xs text-muted-foreground">· {p.note}</span> : null}
      </p>
      {p.proof && (
        <button
          type="button"
          onClick={() => setViewing(true)}
          className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
          aria-label="View proof of payment"
        >
          <ImageIcon className="size-4" />
        </button>
      )}
      <span className="text-sm font-semibold tabular">{formatMoney(p.amount, trip.currency)}</span>
    </div>
  )
}

/** "You owe ৳1,250" card that leads to Balances */
export function BalanceHero({ subtitle }: { subtitle?: string }) {
  const { trip, balances, meId } = useTrip()
  const me = balances.find((b) => b.memberId === meId)
  if (!me) return null
  return (
    <Link
      href="/balances"
      className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm opacity-80">Your balance</p>
        <p className="mt-0.5 text-2xl font-bold tabular">
          {me.net === 0 ? "All settled" : `${me.net > 0 ? "You get" : "You owe"} ${formatMoney(Math.abs(me.net), trip.currency)}`}
        </p>
        {subtitle && <p className="mt-1 text-xs tabular opacity-80">{subtitle}</p>}
      </div>
      <span className="inline-flex items-center gap-0.5 text-sm font-medium opacity-90">
        {me.net !== 0 && "Settle"}
        <ChevronRight className="size-5" aria-hidden />
      </span>
    </Link>
  )
}
