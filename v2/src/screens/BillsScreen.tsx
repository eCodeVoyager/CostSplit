import { Check, Plus, Zap } from "lucide-react"
import { CategoryIcon, EmptyState, SectionTitle } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { monthLabel, shortDate, toISODate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { Bill } from "@/lib/types"
import { cn } from "@/lib/utils"

export default function BillsScreen() {
  const { trip, bills, billStatus, expenses, names, meId } = useTrip()
  const { payBill, editBill } = useTripActions()
  const month = toISODate().slice(0, 7)
  const who = (id?: string) => (!id ? "" : id === meId ? "You" : (names.get(id) ?? "?"))

  if (bills.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title="No monthly bills yet"
        action={
          <Button size="lg" className="h-12" onClick={() => editBill()}>
            <Plus /> Add a bill
          </Button>
        }
      >
        Rent, electricity, gas, water, internet, maid. Set each once; every month it shows up to pay.
      </EmptyState>
    )
  }

  const splitText = (b: Bill) => {
    const ids = Object.keys(b.split)
    if (ids.length === 0) return "everyone equally"
    if (b.splitMode === "exact") return "fixed amounts"
    return ids.map(who).join(", ")
  }

  const history = (b: Bill) =>
    expenses
      .filter((e) => e.billId === b.id)
      .sort((x, y) => (y.period ?? "").localeCompare(x.period ?? ""))
      .slice(0, 3)

  return (
    <div className="pt-2 pb-6">
      <SectionTitle>This month</SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {billStatus.map((st) => (
          <li key={`${st.bill.id}-${st.period}`} className="flex items-center gap-3 px-3 py-2.5">
            <CategoryIcon category={st.bill.category} className="size-9" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {st.bill.title}
                {st.period !== month ? ` · ${monthLabel(st.period, "short")}` : ""}
              </p>
              <p className={cn("text-xs", st.overdue ? "font-medium text-negative" : "text-muted-foreground")}>
                {st.paid
                  ? `${who(Object.keys(st.paid.paidBy)[0])} paid ${formatMoney(st.paid.amount, st.paid.currency)}`
                  : `${st.overdue ? "Overdue since" : "Due"} ${shortDate(st.due)}`}
              </p>
            </div>
            {st.paid ? (
              <Check className="size-5 text-positive" aria-label="Paid" />
            ) : (
              <Button size="sm" className="h-9" onClick={() => payBill(st)}>
                Pay
              </Button>
            )}
          </li>
        ))}
      </ul>

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => editBill()}>
            <Plus /> Add bill
          </Button>
        }
      >
        All bills
      </SectionTitle>
      <ul className="space-y-2">
        {bills.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => editBill(b)}
              className="w-full rounded-2xl border bg-card p-3 text-left active:bg-accent"
            >
              <div className="flex items-center gap-3">
                <CategoryIcon category={b.category} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Day {b.dueDay} · {splitText(b)}
                    {b.payer ? ` · usually ${who(b.payer)}` : ""}
                  </p>
                </div>
                <span className="text-right text-sm font-semibold tabular">
                  {b.amount ? formatMoney(b.amount, trip.currency) : "varies"}
                </span>
              </div>
              {history(b).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
                  {history(b).map((e) => (
                    <span key={e.id} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground tabular">
                      {monthLabel(e.period ?? e.date.slice(0, 7), "short")} {formatMoney(e.amount, e.currency)}
                    </span>
                  ))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
