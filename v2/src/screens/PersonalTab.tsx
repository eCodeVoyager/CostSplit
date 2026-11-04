import { Lock, Plus, Search, Wallet, X } from "lucide-react"
import { useMemo, useState } from "react"
import { CategoryIcon, Chip, SectionTitle, Segmented } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { isSpending, monthOf } from "@/lib/balance"
import { getCategory } from "@/lib/categories"
import { dayLabel, monthLabel, toISODate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { ALL_TIME, mySpending, personalBase } from "@/lib/personal"
import type { PersonalExpense } from "@/lib/types"
import { cn } from "@/lib/utils"

type View = "all" | "personal" | "shared"

/**
 * My own money: private expenses that never touch the group, added to my
 * share of the group's spending so I see what I really spent.
 */
export default function PersonalTab() {
  const { trip, expenses, personal, meId, mealWeights } = useTrip()
  const { addPersonal, editPersonal } = useTripActions()
  const thisMonth = toISODate().slice(0, 7)
  const [period, setPeriod] = useState(thisMonth)
  const [view, setView] = useState<View>("all")
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [cat, setCat] = useState<string | null>(null)
  const money = (v: number) => formatMoney(v, trip.currency)

  const months = useMemo(() => {
    const set = new Set<string>([thisMonth])
    personal.forEach((p) => set.add(monthOf(p.date)))
    if (meId) expenses.forEach((e) => isSpending(e) && (e.split[meId] || e.paidBy[meId]) && set.add(monthOf(e.date)))
    return [...set].sort().reverse()
  }, [personal, expenses, meId, thisMonth])

  const summary = useMemo(
    () => mySpending(period, meId, trip, expenses, personal, mealWeights),
    [period, meId, trip, expenses, personal, mealWeights]
  )

  const inPeriod = useMemo(() => personal.filter((p) => period === ALL_TIME || monthOf(p.date) === period), [personal, period])
  const periodCats = useMemo(() => [...new Set(inPeriod.map((p) => p.category))], [inPeriod])
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inPeriod.filter(
      (p) =>
        (!cat || p.category === cat) &&
        (!q || [p.title, p.note ?? "", getCategory(p.category).label].some((t) => t.toLowerCase().includes(q)))
    )
  }, [inPeriod, query, cat])

  const days = useMemo(() => {
    const map = new Map<string, PersonalExpense[]>()
    for (const p of list) map.set(p.date, [...(map.get(p.date) ?? []), p])
    return [...map.entries()]
  }, [list])

  const sharedPct = summary.total ? Math.round((summary.shared / summary.total) * 100) : 0
  const cats = summary.byCategory
    .map((c) => ({ ...c, value: view === "all" ? c.total : view === "personal" ? c.personal : c.shared }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
  const maxCat = Math.max(1, ...cats.map((c) => c.value))
  const daysInPeriod =
    period === ALL_TIME
      ? 0
      : period === thisMonth
        ? Number(toISODate().slice(8, 10))
        : new Date(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0).getDate()

  return (
    <div className="pt-3 pb-6">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
        {months.map((m) => (
          <Chip key={m} selected={period === m} onClick={() => setPeriod(m)} className="min-h-9 shrink-0 px-3 text-[13px]">
            {monthLabel(m, "short")}
          </Chip>
        ))}
        <Chip selected={period === ALL_TIME} onClick={() => setPeriod(ALL_TIME)} className="min-h-9 shrink-0 px-3 text-[13px]">
          All time
        </Chip>
      </div>

      <div className="mt-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm">
        <p className="text-sm opacity-80">My total spending · {period === ALL_TIME ? "all time" : monthLabel(period)}</p>
        <p className="mt-0.5 text-3xl font-bold tabular">{money(summary.total)}</p>
        {daysInPeriod > 0 && summary.total > 0 && (
          <p className="text-xs opacity-80 tabular">about {money(Math.round(summary.total / daysInPeriod))} a day</p>
        )}
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-primary-foreground/20" aria-hidden>
          <div className="h-full bg-primary-foreground/90" style={{ width: `${sharedPct}%` }} />
          <div className="h-full bg-primary-foreground/45" style={{ width: `${summary.total ? 100 - sharedPct : 0}%` }} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="flex items-center gap-1.5 opacity-80">
              <span className="size-2 rounded-full bg-primary-foreground/90" aria-hidden /> My share of {trip.name}
            </dt>
            <dd className="text-base font-semibold tabular">{money(summary.shared)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 opacity-80">
              <span className="size-2 rounded-full bg-primary-foreground/45" aria-hidden /> Personal
            </dt>
            <dd className="text-base font-semibold tabular">{money(summary.personal)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Personal expenses are private to your account. They never change group balances or reports.
        {!meId && " Pick who you are in this group to include your share."}
      </p>

      {cats.length > 0 && (
        <>
          <SectionTitle>Where it went</SectionTitle>
          <div className="space-y-3 rounded-2xl border bg-card p-4">
            <Segmented<View>
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "all", label: "Everything" },
                { value: "personal", label: "Personal" },
                { value: "shared", label: "Group share" },
              ]}
            />
            <ul className="space-y-3">
              {cats.map((c) => {
                const cat = getCategory(c.id)
                return (
                  <li key={c.id}>
                    <div className="flex items-center gap-2 text-sm">
                      <cat.icon className="size-4 text-muted-foreground" aria-hidden />
                      <span className="flex-1 truncate">{cat.label}</span>
                      {view === "all" && c.personal > 0 && c.shared > 0 && (
                        <span className="text-[11px] text-muted-foreground tabular">
                          {money(c.shared)} + {money(c.personal)}
                        </span>
                      )}
                      <span className="w-24 text-right font-medium tabular">{money(c.value)}</span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                      {view !== "personal" && <div className="h-full bg-primary" style={{ width: `${(view === "all" ? c.shared : c.value) / maxCat * 100}%` }} />}
                      {view !== "shared" && <div className="h-full bg-primary/45" style={{ width: `${(view === "all" ? c.personal : c.value) / maxCat * 100}%` }} />}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}

      <SectionTitle
        action={
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="size-9" onClick={() => setSearching((v) => !v)} aria-label="Search personal expenses">
              {searching ? <X className="size-4" /> : <Search className="size-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => addPersonal()}>
              <Plus /> Add
            </Button>
          </div>
        }
      >
        Personal expenses {list.length > 0 && `· ${list.length}`}
      </SectionTitle>
      {searching && (
        <Input
          autoFocus
          placeholder="Search title, note, category"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2 h-11"
          aria-label="Search personal expenses"
        />
      )}

      {periodCats.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-1 flex gap-2 overflow-x-auto px-4 py-1">
          <Chip selected={!cat} onClick={() => setCat(null)} className="min-h-9 shrink-0 px-3 text-[13px]">
            All
          </Chip>
          {periodCats.map((c) => {
            const info = getCategory(c)
            return (
              <Chip key={c} selected={cat === c} onClick={() => setCat(cat === c ? null : c)} className="min-h-9 shrink-0 px-3 text-[13px]">
                <info.icon className="size-3.5" aria-hidden />
                {info.short}
              </Chip>
            )
          })}
        </div>
      )}

      {personal.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-8 text-center">
          <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <Wallet className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">Track your own spending too</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Your lunch, phone recharge, rickshaw home. Only you see them, and your total includes your share of the group.
          </p>
          <Button className="mt-4 h-11" onClick={() => addPersonal()}>
            <Plus /> Add personal expense
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          {query ? "Nothing matches." : `No personal expenses in ${period === ALL_TIME ? "this group" : monthLabel(period)}.`}
        </p>
      ) : (
        days.map(([date, rows]) => (
          <div key={date}>
            <div className="flex items-baseline justify-between px-1 pt-3 pb-1.5">
              <h3 className="text-[13px] font-semibold">{dayLabel(date)}</h3>
              <span className="text-xs tabular text-muted-foreground">{money(rows.reduce((s, p) => s + personalBase(p, trip), 0))}</span>
            </div>
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {rows.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => editPersonal(p)}
                    className={cn("flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/50 active:bg-accent")}
                  >
                    <CategoryIcon category={p.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {getCategory(p.category).label}
                        {p.currency !== trip.currency ? ` · ${p.currency}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                        {p.dirty ? " · not synced yet" : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular">{formatMoney(p.amount, p.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  )
}
