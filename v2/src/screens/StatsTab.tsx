import { ChartPie, Share2 } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Chip, EmptyState, MemberAvatar, SectionTitle } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useTrip } from "@/hooks/useTripData"
import { isSpending, monthOf } from "@/lib/balance"
import { getCategory } from "@/lib/categories"
import { dayLabel, monthLabel, parseISODate, toISODate } from "@/lib/dates"
import { convertToBase, formatMoney } from "@/lib/money"
import { summarizeMonth, type MonthSummary } from "@/lib/month"
import { monthReportText, shareOrCopy } from "@/lib/share"

const ALL = "all"

export default function StatsTab() {
  const { trip, kind, expenses, everyone, meId, names, mealWeights } = useTrip()
  const spending = useMemo(() => expenses.filter(isSpending), [expenses])
  const months = useMemo(() => [...new Set(spending.map((e) => monthOf(e.date)))].sort().reverse(), [spending])
  const [picked, setPicked] = useState<string>(() => (kind === "home" ? toISODate().slice(0, 7) : ALL))
  const month = picked === ALL || months.includes(picked) || picked === toISODate().slice(0, 7) ? picked : ALL

  // "All time" reuses the month math with every month merged
  const summary: MonthSummary = useMemo(() => {
    if (month !== ALL) return summarizeMonth(month, trip, expenses, mealWeights)
    const parts = months.map((m) => summarizeMonth(m, trip, expenses, mealWeights))
    const add = (key: "shares" | "paid") =>
      parts.reduce<Record<string, number>>((acc, p) => {
        for (const [id, v] of Object.entries(p[key])) acc[id] = (acc[id] ?? 0) + v
        return acc
      }, {})
    const cats = new Map<string, number>()
    parts.forEach((p) => p.byCategory.forEach(([c, v]) => cats.set(c, (cats.get(c) ?? 0) + v)))
    const mealBazar = parts.reduce((s, p) => s + p.mealBazar, 0)
    const totalMeals = parts.reduce((s, p) => s + p.totalMeals, 0)
    return {
      month: ALL,
      spent: parts.reduce((s, p) => s + p.spent, 0),
      shares: add("shares"),
      paid: add("paid"),
      byCategory: [...cats.entries()].sort((a, b) => b[1] - a[1]),
      mealBazar,
      totalMeals,
      mealRate: totalMeals ? Math.round(mealBazar / totalMeals) : 0,
      meals: {},
    }
  }, [month, months, trip, expenses, mealWeights])

  const daily = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of spending) {
      if (month !== ALL && monthOf(e.date) !== month) continue
      map.set(e.date, (map.get(e.date) ?? 0) + convertToBase(e.amount, e.currency, e.rate, trip.currency))
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [spending, month, trip.currency])

  if (spending.length === 0) {
    return (
      <EmptyState icon={ChartPie} title="No insights yet">
        Add a few expenses to see where the money goes.
      </EmptyState>
    )
  }

  const money = (v: number) => formatMoney(v, trip.currency)
  // A month counts the days that have passed in it; "all time" spans first to last expense
  const today = toISODate()
  const days =
    month !== ALL
      ? month === today.slice(0, 7)
        ? Number(today.slice(8, 10))
        : new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
      : daily.length > 0
        ? Math.round((parseISODate(daily[0][0]).getTime() - parseISODate(daily[daily.length - 1][0]).getTime()) / 86_400_000) + 1
        : 0
  const people = everyone.filter((m) => summary.shares[m.id] || summary.paid[m.id])
  const maxCategory = summary.byCategory[0]?.[1] ?? 1
  const maxPerson = Math.max(1, ...people.map((m) => Math.max(summary.paid[m.id] ?? 0, summary.shares[m.id] ?? 0)))
  const maxDay = Math.max(1, ...daily.map(([, v]) => v))
  const myShare = meId ? (summary.shares[meId] ?? 0) : 0

  const share = async () => {
    const text = monthReportText(trip, month === ALL ? "All time" : monthLabel(month), summary, names)
    const result = await shareOrCopy({ title: trip.name, text })
    if (result === "copied") toast.success("Report copied — paste it in your group chat")
  }

  return (
    <div className="pt-3 pb-6">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
        {[...(kind === "home" && !months.includes(toISODate().slice(0, 7)) ? [toISODate().slice(0, 7)] : []), ...months].map((m) => (
          <Chip key={m} selected={month === m} onClick={() => setPicked(m)} className="min-h-9 shrink-0 px-3 text-[13px]">
            {monthLabel(m, "short")}
          </Chip>
        ))}
        <Chip selected={month === ALL} onClick={() => setPicked(ALL)} className="min-h-9 shrink-0 px-3 text-[13px]">
          All time
        </Chip>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Kpi label="Spent" value={money(summary.spent)} />
        <Kpi label="Per day" value={money(Math.round(summary.spent / Math.max(1, days)))} hint={`${days} ${days === 1 ? "day" : "days"}`} />
        {meId && <Kpi label="Your share" value={money(myShare)} hint={`${Math.round((myShare / Math.max(1, summary.spent)) * 100)}% of total`} />}
        {trip.mealMode && summary.totalMeals > 0 ? (
          <Kpi label="Meal rate" value={money(summary.mealRate)} hint={`${summary.totalMeals} meals`} />
        ) : (
          <Kpi label="Per person" value={money(Math.round(summary.spent / Math.max(1, people.length)))} hint={`${people.length} people`} />
        )}
      </div>

      <Button variant="outline" className="mt-3 h-11 w-full" onClick={share}>
        <Share2 /> Share {month === ALL ? "report" : `${monthLabel(month)} report`}
      </Button>

      {summary.spent === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing spent in {monthLabel(month)} yet.</p>
      ) : (
        <>
          <SectionTitle>By category</SectionTitle>
          <ul className="space-y-3 rounded-2xl border bg-card p-4">
            {summary.byCategory.map(([id, value]) => {
              const cat = getCategory(id)
              return (
                <li key={id}>
                  <div className="flex items-center gap-2 text-sm">
                    <cat.icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1">{cat.label}</span>
                    <span className="text-xs text-muted-foreground tabular">{Math.round((value / summary.spent) * 100)}%</span>
                    <span className="w-24 text-right font-medium tabular">{money(value)}</span>
                  </div>
                  <Bar value={value} max={maxCategory} />
                </li>
              )
            })}
          </ul>

          <SectionTitle>Paid vs. share</SectionTitle>
          <ul className="space-y-4 rounded-2xl border bg-card p-4">
            {people.map((m) => (
              <li key={m.id}>
                <div className="flex items-center gap-2 text-sm">
                  <MemberAvatar id={m.id} name={m.name} className="size-6 text-[9px]" />
                  <span className="flex-1 truncate font-medium">{m.id === meId ? "You" : names.get(m.id)}</span>
                  {trip.mealMode && summary.meals[m.id] ? (
                    <span className="text-xs text-muted-foreground">{summary.meals[m.id]} meals</span>
                  ) : null}
                </div>
                <div className="mt-1.5 grid grid-cols-[3.5rem_1fr_5.5rem] items-center gap-x-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">Paid</span>
                  <Bar value={summary.paid[m.id] ?? 0} max={maxPerson} />
                  <span className="text-right tabular">{money(summary.paid[m.id] ?? 0)}</span>
                  <span className="text-muted-foreground">Share</span>
                  <Bar value={summary.shares[m.id] ?? 0} max={maxPerson} muted />
                  <span className="text-right tabular">{money(summary.shares[m.id] ?? 0)}</span>
                </div>
              </li>
            ))}
          </ul>

          <SectionTitle>By day</SectionTitle>
          <ul className="space-y-3 rounded-2xl border bg-card p-4">
            {daily.map(([date, value]) => (
              <li key={date}>
                <div className="flex justify-between text-sm">
                  <span>{dayLabel(date)}</span>
                  <span className="font-medium tabular">{money(value)}</span>
                </div>
                <Bar value={value} max={maxDay} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-bold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Bar({ value, max, muted }: { value: number; max: number; muted?: boolean }) {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div
        className={muted ? "h-full rounded-full bg-primary/40" : "h-full rounded-full bg-primary"}
        style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
      />
    </div>
  )
}
