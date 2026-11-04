import { AlertTriangle, ArrowRight, CircleCheck, Info } from "lucide-react"
import type { ReactNode } from "react"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, expenseTransfers, monthOf, type Transfer } from "@/lib/balance"
import { getCategory } from "@/lib/categories"
import { dayLabel, monthLabel, shortDate } from "@/lib/dates"
import { convertToBase, formatMoney } from "@/lib/money"
import type { ReviewWarning } from "@/lib/review"
import type { Expense } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CategoryIcon, MemberAvatar } from "./common"

export function BreakdownSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">{children}</div>
    </section>
  )
}

function PersonLine({ id, detail, amount, strong }: { id: string; detail?: ReactNode; amount: ReactNode; strong?: boolean }) {
  const { names, meId } = useTrip()
  return (
    <div className="flex min-h-11 items-center gap-2.5 px-3 py-2">
      <MemberAvatar id={id} name={names.get(id) ?? "?"} className="size-7 text-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{id === meId ? "You" : (names.get(id) ?? "?")}</p>
        {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
      </div>
      <span className={cn("text-sm tabular", strong && "font-semibold")}>{amount}</span>
    </div>
  )
}

/** "Rafi → You ৳250" rows; works for any number of people */
export function WhoOwesWhom({ transfers, empty }: { transfers: Transfer[]; empty?: string }) {
  const { trip, names, meId } = useTrip()
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  if (transfers.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-positive" aria-hidden />
        {empty ?? "Nobody owes anyone for this"}
      </div>
    )
  }
  return (
    <>
      {transfers.map((t) => {
        const mine = t.from === meId || t.to === meId
        return (
          <div key={`${t.from}-${t.to}`} className={cn("flex min-h-11 items-center gap-2 px-3 py-2", mine && "bg-accent/40")}>
            <MemberAvatar id={t.from} name={names.get(t.from) ?? "?"} className="size-7 text-[10px]" />
            <p className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              <span className="truncate font-medium">{who(t.from)}</span>
              <span className="shrink-0 text-muted-foreground">{t.from === meId ? "pay" : "pays"}</span>
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{who(t.to)}</span>
            </p>
            <span className="text-sm font-semibold tabular">{formatMoney(t.amount, trip.currency)}</span>
          </div>
        )
      })}
    </>
  )
}

const SPLIT_TEXT = {
  equal: "Equally",
  shares: "By shares",
  exact: "Exact amounts",
  meals: "By meals eaten",
} as const

/**
 * Everything about one expense in plain words: who paid, each person's share,
 * who owes whom and what it means for you. Used for the confirm step and details.
 */
export function ExpenseBreakdown({ expense: e, compact }: { expense: Expense; compact?: boolean }) {
  const { trip, meId, mealWeights } = useTrip()
  const impact = expenseImpact(e, trip, mealWeights)
  const transfers = expenseTransfers(impact)
  const income = e.kind === "income"
  const loan = e.category === "loan"
  const foreign = e.currency !== trip.currency
  const money = (v: number) => formatMoney(v, trip.currency)
  const sharers = Object.keys(impact.owed)
  const monthMeals = mealWeights.get(monthOf(e.date)) ?? {}
  const totalShares = Object.values(e.split).reduce((s, v) => s + v, 0)
  const mine = meId ? (impact.paid[meId] ?? 0) - (impact.owed[meId] ?? 0) : 0
  const involved = !!meId && (meId in impact.paid || meId in impact.owed)
  const category = getCategory(e.category)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <CategoryIcon category={e.category} className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{e.title || category.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {dayLabel(e.date)}
            {dayLabel(e.date) !== shortDate(e.date) && ` · ${shortDate(e.date)}`} · {category.label}
            {e.period ? ` · ${monthLabel(e.period, "short")} bill` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-xl font-bold tabular", income && "text-positive")}>
            {income ? "+" : ""}
            {formatMoney(e.amount, e.currency)}
          </p>
          {foreign && <p className="text-[11px] tabular text-muted-foreground">≈ {money(impact.total)}</p>}
        </div>
      </div>

      {(income || loan) && (
        <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {income
            ? "Money in: the group received this. Whoever got it holds everyone's cut, so it isn't counted as spending."
            : "Loan: only the people ticked owe it back. Not counted as spending."}
        </p>
      )}

      {e.items && e.items.length > 0 && (
        <BreakdownSection title="Items bought" aside={`${e.items.length}`}>
          <p className="px-3 py-2 text-sm">{e.items.join(", ")}</p>
        </BreakdownSection>
      )}

      <BreakdownSection title={income ? "Received by" : loan ? "Lent by" : "Paid by"}>
        {Object.entries(e.paidBy).map(([id, v]) => (
          <PersonLine key={id} id={id} amount={formatMoney(v, e.currency)} />
        ))}
      </BreakdownSection>

      <BreakdownSection
        title={income ? "Belongs to" : loan ? "Borrowed by" : `Split · ${SPLIT_TEXT[e.splitMode]}`}
        aside={`${sharers.length} ${sharers.length === 1 ? "person" : "people"}`}
      >
        {sharers.map((id) => {
          const detail =
            e.splitMode === "shares"
              ? `${e.split[id]} of ${totalShares} shares`
              : e.splitMode === "meals"
                ? `${monthMeals[id] ?? 0} meals in ${monthLabel(monthOf(e.date), "short")}`
                : undefined
          return <PersonLine key={id} id={id} detail={detail} amount={money(Math.abs(impact.owed[id]))} />
        })}
      </BreakdownSection>

      {!compact || transfers.length > 0 ? (
        <BreakdownSection title="Who owes whom">
          <WhoOwesWhom transfers={transfers} />
        </BreakdownSection>
      ) : null}

      {meId && (
        <div
          className={cn(
            "rounded-xl px-3 py-2.5 text-sm",
            !involved ? "bg-secondary" : mine > 0 ? "bg-positive-soft" : mine < 0 ? "bg-negative-soft" : "bg-secondary"
          )}
        >
          {!involved ? (
            <span className="text-muted-foreground">You're not part of this one. Your balance doesn't change.</span>
          ) : (
            <>
              <span className="font-medium">
                {mine > 0 ? `You get back ${money(mine)}` : mine < 0 ? `You owe ${money(-mine)}` : "Your balance doesn't change"}
              </span>
              <span className="block text-xs text-muted-foreground tabular">
                You {income ? "received" : "paid"} {money(Math.abs(impact.paid[meId] ?? 0))} · your {income ? "cut" : "share"}{" "}
                {money(Math.abs(impact.owed[meId] ?? 0))}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** Plain-language warnings, most important first */
export function WarningList({ warnings, action }: { warnings: ReviewWarning[]; action?: (w: ReviewWarning) => ReactNode }) {
  const { trip, names, meId } = useTrip()
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const money = (v: number) => formatMoney(v, trip.currency)
  if (warnings.length === 0) return null

  const text = (w: ReviewWarning): { tone: "warn" | "info"; text: string } => {
    switch (w.kind) {
      case "duplicate": {
        const payer = Object.keys(w.expense.paidBy)[0]
        return {
          tone: "warn",
          text: `Looks like a repeat of “${w.expense.title}” (${formatMoney(w.expense.amount, w.expense.currency)}, ${dayLabel(w.expense.date).toLowerCase()}, paid by ${payer === meId ? "you" : who(payer)}). Added twice?`,
        }
      }
      case "duplicate-payment":
        return {
          tone: "warn",
          text: `The same payment (${money(w.payment.amount)}) was already recorded ${dayLabel(w.payment.date).toLowerCase()}. Recorded twice?`,
        }
      case "future":
        return { tone: "warn", text: `The date is in the future (${shortDate(w.date)}).` }
      case "old":
        return { tone: "info", text: `This is dated ${w.days} days ago. Older months' reports will change.` }
      case "payer-not-sharing":
        return {
          tone: "info",
          text: `${w.ids.map(who).join(", ")} paid but ${w.ids.length === 1 && w.ids[0] !== meId ? "isn't" : "aren't"} sharing it, so the full amount is owed back.`,
        }
      case "self-only":
        return {
          tone: "warn",
          text:
            w.id === meId
              ? "Only you paid and share this, so nobody's balance changes. Is it a personal expense?"
              : `Only ${who(w.id)} paid and shares this, so nobody's balance changes.`,
        }
      case "large":
        return { tone: "warn", text: `Much bigger than usual for this category (typically about ${money(w.typical)}). Check for an extra zero.` }
      case "foreign":
        return { tone: "info", text: `In ${w.currency} at 1 ${trip.currency} = ${w.rate} ${w.currency}.` }
      case "overpay":
        return { tone: "warn", text: `That's ${money(w.extra)} more than they owe, so they'll be owed money afterwards.` }
    }
  }

  return (
    <ul className="space-y-2" aria-label="Things to check">
      {warnings.map((w, i) => {
        const { tone, text: body } = text(w)
        const Icon = tone === "warn" ? AlertTriangle : Info
        return (
          <li
            key={i}
            className={cn(
              "flex gap-2 rounded-xl px-3 py-2 text-xs",
              tone === "warn" ? "bg-amber-500/15 text-amber-900 dark:text-amber-200" : "bg-secondary text-muted-foreground"
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p>{body}</p>
              {action?.(w)}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Base-currency amount of an expense */
export const expenseBase = (e: Pick<Expense, "amount" | "currency" | "rate">, base: string) =>
  convertToBase(e.amount, e.currency, e.rate, base)
