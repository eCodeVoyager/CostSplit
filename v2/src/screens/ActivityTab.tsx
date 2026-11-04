import { Download, ListFilter, Plus, Receipt, Search, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Chip, EmptyState } from "@/components/common"
import { FilterSheet } from "@/components/FilterSheet"
import { ExpenseRow, PaymentRow } from "@/components/rows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, isSpending, monthOf } from "@/lib/balance"
import { dayLabel, monthLabel, toISODate } from "@/lib/dates"
import {
  DEFAULT_FILTER,
  filterChips,
  isDefaultFilter,
  loadFilter,
  matchesFilter,
  sameFilter,
  saveFilter,
  sortItems,
  type ActivityFilter,
  type ActivityItem,
} from "@/lib/filters"
import { formatMoney } from "@/lib/money"
import { downloadFile, expensesCsv, fileSafe } from "@/lib/share"
import { cn } from "@/lib/utils"

/** Everything that happened, newest first, grouped by month and day, with filters for anything */
export function ActivityTab() {
  const { trip, kind, expenses, payments, deletedExpenses, deletedPayments, meId, names, mealWeights, everyone } = useTrip()
  const { addExpense, viewExpense, viewPayment } = useTripActions()
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState("")
  const [filter, setFilterState] = useState<ActivityFilter>(() => loadFilter(trip.id))
  const [filterOpen, setFilterOpen] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const today = toISODate()
  const money = (v: number) => formatMoney(v, trip.currency)

  const setFilter = (f: ActivityFilter) => {
    setFilterState(f)
    saveFilter(trip.id, f)
  }

  const build = (exps: typeof expenses, pays: typeof payments): ActivityItem[] => [
    ...exps.map((e) => ({ type: "expense" as const, date: e.date, createdAt: e.createdAt, expense: e, impact: expenseImpact(e, trip, mealWeights) })),
    ...pays.map((p) => ({ type: "payment" as const, date: p.date, createdAt: p.createdAt, payment: p })),
  ]
  const items = useMemo(() => build(expenses, payments), [expenses, payments, trip, mealWeights]) // eslint-disable-line react-hooks/exhaustive-deps
  const deleted = useMemo(
    () => sortItems(build(deletedExpenses, deletedPayments), "newest").slice(0, 100),
    [deletedExpenses, deletedPayments, trip, mealWeights] // eslint-disable-line react-hooks/exhaustive-deps
  )

  // The deleted bin is temporary: leave it once it's empty
  useEffect(() => {
    if (showDeleted && deleted.length === 0) setShowDeleted(false)
  }, [showDeleted, deleted.length])

  const ctx = { meId, today, names, query, currency: trip.currency }
  const filtered = useMemo(
    () => sortItems(items.filter((it) => matchesFilter(it, filter, ctx)), filter.sort),
    [items, filter, meId, today, names, query, trip.currency] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const count = (f: ActivityFilter) => items.filter((it) => matchesFilter(it, f, ctx)).length
  const list = showDeleted ? deleted : filtered
  const byDate = showDeleted || filter.sort === "newest" || filter.sort === "oldest"

  // month -> day -> items (only when sorted by date)
  const months = useMemo(() => {
    const map = new Map<string, Map<string, ActivityItem[]>>()
    for (const it of list) {
      const month = map.get(monthOf(it.date)) ?? new Map<string, ActivityItem[]>()
      month.set(it.date, [...(month.get(it.date) ?? []), it])
      map.set(monthOf(it.date), month)
    }
    return [...map.entries()]
  }, [list])

  const spent = (rows: ActivityItem[]) =>
    rows.reduce((s, it) => (it.type === "expense" && isSpending(it.expense) ? s + it.impact.total : s), 0)

  const filtering = !isDefaultFilter(filter) || !!query.trim()
  const summary = useMemo(() => {
    let total = 0
    let mine = 0
    let paid = 0
    let moved = 0
    for (const it of filtered) {
      if (it.type === "payment") {
        moved += it.payment.amount
        continue
      }
      if (!isSpending(it.expense)) continue
      total += it.impact.total
      if (meId) {
        mine += it.impact.owed[meId] ?? 0
        paid += it.impact.paid[meId] ?? 0
      }
    }
    return { total, mine, paid, moved }
  }, [filtered, meId])

  if (items.length === 0 && deleted.length === 0) {
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

  const keep = { sort: filter.sort }
  const presets: { key: string; label: string; filter: ActivityFilter }[] = [
    { key: "all", label: "All", filter: { ...DEFAULT_FILTER, ...keep } },
    ...(meId ? [{ key: "mine", label: "Mine", filter: { ...DEFAULT_FILTER, ...keep, impact: "involved" as const } }] : []),
    ...(meId ? [{ key: "owe", label: "I owe", filter: { ...DEFAULT_FILTER, ...keep, impact: "owe" as const } }] : []),
    ...(kind === "home"
      ? [
          { key: "bazar", label: "Bazar", filter: { ...DEFAULT_FILTER, ...keep, categories: ["groceries"] } },
          { key: "bills", label: "Bills", filter: { ...DEFAULT_FILTER, ...keep, types: ["bill" as const] } },
        ]
      : []),
    { key: "month", label: "This month", filter: { ...DEFAULT_FILTER, ...keep, date: "this-month" as const } },
    { key: "payments", label: "Payments", filter: { ...DEFAULT_FILTER, ...keep, types: ["payment" as const] } },
    { key: "money", label: "Loans & money in", filter: { ...DEFAULT_FILTER, ...keep, types: ["loan" as const, "income" as const] } },
  ]
  const chips = filterChips(filter, { names, meId, money })
  const activeCount = chips.filter((c) => c.key !== "sort").length

  const exportCsv = () => {
    const rows = filtered.flatMap((it) => (it.type === "expense" ? [it.expense] : []))
    if (rows.length === 0) {
      toast("No expenses in this view to export")
      return
    }
    const csv = expensesCsv(trip, everyone, rows, mealWeights)
    downloadFile(`${fileSafe(trip.name)}-filtered.csv`, csv, "text/csv;charset=utf-8").catch((err) =>
      toast.error("Couldn't save the file", { description: err instanceof Error ? err.message : String(err) })
    )
  }

  const row = (it: ActivityItem) =>
    it.type === "expense" ? (
      <ExpenseRow expense={it.expense} paid={it.impact.paid} owed={it.impact.owed} onClick={() => viewExpense(it.expense)} />
    ) : (
      <PaymentRow payment={it.payment} onClick={() => viewPayment(it.payment)} />
    )

  return (
    <div className="pt-3">
      <FilterSheet open={filterOpen} onOpenChange={setFilterOpen} value={filter} onApply={setFilter} count={count} />

      <div className="flex items-center gap-1">
        {searching ? (
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              placeholder="Title, person, note or amount"
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
              {presets.map((p) => (
                <Chip
                  key={p.key}
                  selected={!showDeleted && sameFilter(filter, p.filter)}
                  onClick={() => {
                    setShowDeleted(false)
                    setFilter(p.filter)
                  }}
                  className="min-h-9 shrink-0 px-3 text-[13px]"
                >
                  {p.label}
                </Chip>
              ))}
              {deleted.length > 0 && (
                <Chip selected={showDeleted} onClick={() => setShowDeleted(!showDeleted)} className="min-h-9 shrink-0 px-3 text-[13px]">
                  <Trash2 className="size-3.5" aria-hidden /> Deleted
                </Chip>
              )}
            </div>
            <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => setSearching(true)} aria-label="Search activity">
              <Search className="size-5" />
            </Button>
          </>
        )}
        <Button
          variant={activeCount > 0 ? "default" : "ghost"}
          size="icon"
          className="relative size-11 shrink-0"
          onClick={() => setFilterOpen(true)}
          aria-label={activeCount > 0 ? `Filters, ${activeCount} on` : "Filters"}
        >
          <ListFilter className="size-5" />
          {activeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex size-5 items-center justify-center rounded-full bg-background text-[10px] font-bold text-primary ring-2 ring-primary">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {showDeleted ? (
        <p className="mt-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Recently deleted. They don't count anywhere. Tap one to see it and restore it.
        </p>
      ) : (
        <>
          {chips.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.clear(filter))}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 text-xs font-medium text-accent-foreground"
                  aria-label={`Remove filter ${c.label}`}
                >
                  {c.label}
                  <X className="size-3" aria-hidden />
                </button>
              ))}
              <button type="button" onClick={() => setFilter(DEFAULT_FILTER)} className="min-h-8 shrink-0 px-2 text-xs font-medium text-primary">
                Clear all
              </button>
            </div>
          )}
          {filtering && (
            <div className="mt-2 rounded-2xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {filtered.length} {filtered.length === 1 ? "item" : "items"}
                    {summary.total > 0 && ` · spent ${money(summary.total)}`}
                  </p>
                  <p className="text-xs text-muted-foreground tabular">
                    {[
                      meId && summary.total > 0 ? `your share ${money(summary.mine)}` : null,
                      meId && summary.paid > 0 ? `you paid ${money(summary.paid)}` : null,
                      summary.moved > 0 ? `payments ${money(summary.moved)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Matching what you picked"}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={exportCsv}>
                  <Download /> CSV
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {list.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>Nothing matches.</p>
          <Button variant="link" onClick={() => (setFilter(DEFAULT_FILTER), setQuery(""))}>
            Clear filters
          </Button>
        </div>
      )}

      {byDate
        ? months.map(([month, days]) => (
            <section key={month} aria-label={monthLabel(month)} className="pt-3">
              <div className="flex items-baseline justify-between px-1 pt-2">
                <h2 className="text-lg font-bold">{monthLabel(month)}</h2>
                {!showDeleted && <span className="text-sm tabular text-muted-foreground">spent {money(spent([...days.values()].flat()))}</span>}
              </div>
              {[...days.entries()].map(([date, rows]) => (
                <div key={date}>
                  <div className="sticky top-[calc(3.5rem+var(--sat))] z-10 -mx-4 flex items-baseline justify-between bg-background/95 px-5 py-2 backdrop-blur">
                    <h3 className="text-[13px] font-semibold">{dayLabel(date)}</h3>
                    {!showDeleted && <span className="text-xs tabular text-muted-foreground">{money(spent(rows))}</span>}
                  </div>
                  <ul className={cn("divide-y overflow-hidden rounded-2xl border bg-card", showDeleted && "opacity-70")}>
                    {rows.map((it) => (
                      <li key={it.type === "expense" ? it.expense.id : it.payment.id}>{row(it)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        : list.length > 0 && (
            <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
              {list.map((it) => (
                <li key={it.type === "expense" ? it.expense.id : it.payment.id}>
                  <p className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">{dayLabel(it.date)}</p>
                  {row(it)}
                </li>
              ))}
            </ul>
          )}
      <div className="h-4" />
    </div>
  )
}
