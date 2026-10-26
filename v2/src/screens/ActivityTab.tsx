import { Plus, Receipt, Search, X } from "lucide-react"
import { useMemo, useState } from "react"
import { Chip, EmptyState } from "@/components/common"
import { ExpenseRow, PaymentRow } from "@/components/rows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, isSpending, monthOf, type ExpenseImpact } from "@/lib/balance"
import { getCategory } from "@/lib/categories"
import { dayLabel, monthLabel } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import type { Expense, Payment } from "@/lib/types"

type Filter = "all" | "mine" | "bazar" | "bills" | "money"

type Item =
  | { type: "expense"; date: string; createdAt: number; expense: Expense; impact: ExpenseImpact }
  | { type: "payment"; date: string; createdAt: number; payment: Payment }

/** Everything that happened, newest first, grouped by month and day */
export function ActivityTab() {
  const { trip, kind, expenses, payments, meId, names, mealWeights } = useTrip()
  const { addExpense, editExpense } = useTripActions()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      ...expenses.map((e) => ({
        type: "expense" as const,
        date: e.date,
        createdAt: e.createdAt,
        expense: e,
        impact: expenseImpact(e, trip, mealWeights),
      })),
      ...payments.map((p) => ({ type: "payment" as const, date: p.date, createdAt: p.createdAt, payment: p })),
    ]
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  }, [expenses, payments, trip, mealWeights])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      if (it.type === "payment") {
        if (filter === "bazar" || filter === "bills") return false
        if (filter === "mine" && it.payment.from !== meId && it.payment.to !== meId) return false
        if (!q) return true
        return [names.get(it.payment.from), names.get(it.payment.to), it.payment.note].some((t) => t?.toLowerCase().includes(q))
      }
      const e = it.expense
      if (filter === "mine" && meId && !(meId in it.impact.paid) && !(meId in it.impact.owed)) return false
      if (filter === "bazar" && e.category !== "groceries") return false
      if (filter === "bills" && !e.billId) return false
      if (filter === "money" && e.kind !== "income" && e.category !== "loan") return false
      if (!q) return true
      const people = [...Object.keys(e.paidBy), ...Object.keys(e.split)].map((id) => names.get(id) ?? "")
      return [e.title, e.note ?? "", getCategory(e.category).label, ...people].some((t) => t.toLowerCase().includes(q))
    })
  }, [items, query, filter, meId, names])

  // month -> day -> items
  const months = useMemo(() => {
    const map = new Map<string, Map<string, Item[]>>()
    for (const it of filtered) {
      const month = map.get(monthOf(it.date)) ?? new Map<string, Item[]>()
      month.set(it.date, [...(month.get(it.date) ?? []), it])
      map.set(monthOf(it.date), month)
    }
    return [...map.entries()]
  }, [filtered])

  const spent = (list: Item[]) =>
    list.reduce((s, it) => (it.type === "expense" && isSpending(it.expense) ? s + it.impact.total : s), 0)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nothing here yet"
        action={
          <Button size="lg" className="h-12" onClick={() => addExpense()}>
            <Plus /> Add first expense
          </Button>
        }
      >
        Every expense, bill and payment shows up here.
      </EmptyState>
    )
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "mine", label: "Mine" },
    ...(kind === "home"
      ? [
          { value: "bazar" as const, label: "Bazar" },
          { value: "bills" as const, label: "Bills" },
        ]
      : []),
    { value: "money", label: "Loans & money in" },
  ]

  return (
    <div className="pt-3">
      <div className="flex items-center gap-1">
        {searching ? (
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              placeholder="Search title, person, note"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-11 pr-11 pl-9"
              aria-label="Search activity"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 size-11"
              onClick={() => {
                setQuery("")
                setSearching(false)
              }}
              aria-label="Close search"
            >
              <X />
            </Button>
          </div>
        ) : (
          <>
            <div className="no-scrollbar -ml-4 flex flex-1 gap-2 overflow-x-auto py-1 pl-4">
              {filters.map((f) => (
                <Chip
                  key={f.value}
                  selected={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className="min-h-9 shrink-0 px-3 text-[13px]"
                >
                  {f.label}
                </Chip>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => setSearching(true)} aria-label="Search activity">
              <Search className="size-5" />
            </Button>
          </>
        )}
      </div>

      {months.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches.</p>}

      {months.map(([month, days]) => (
        <section key={month} aria-label={monthLabel(month)} className="pt-3">
          <div className="flex items-baseline justify-between px-1 pt-2">
            <h2 className="text-lg font-bold">{monthLabel(month)}</h2>
            <span className="text-sm tabular text-muted-foreground">
              spent {formatMoney(spent([...days.values()].flat()), trip.currency)}
            </span>
          </div>
          {[...days.entries()].map(([date, list]) => (
            <div key={date}>
              <div className="sticky top-[calc(3.5rem+var(--sat))] z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-5 py-2 backdrop-blur">
                <h3 className="text-[13px] font-semibold">{dayLabel(date)}</h3>
                <span className="text-xs tabular text-muted-foreground">{formatMoney(spent(list), trip.currency)}</span>
              </div>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {list.map((it) =>
                  it.type === "expense" ? (
                    <li key={it.expense.id}>
                      <ExpenseRow
                        expense={it.expense}
                        paid={it.impact.paid}
                        owed={it.impact.owed}
                        onClick={() => editExpense(it.expense)}
                      />
                    </li>
                  ) : (
                    <li key={it.payment.id}>
                      <PaymentRow payment={it.payment} />
                    </li>
                  )
                )}
              </ul>
            </div>
          ))}
        </section>
      ))}
      <div className="h-4" />
    </div>
  )
}
