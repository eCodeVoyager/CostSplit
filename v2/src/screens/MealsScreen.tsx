import { ChevronLeft, ChevronRight, Copy, UtensilsCrossed } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { EmptyState, MemberAvatar, SectionTitle } from "@/components/common"
import { MealStepper } from "@/components/MealStepper"
import { Button } from "@/components/ui/button"
import { useTrip } from "@/hooks/useTripData"
import { addDays, dayLabel, monthLabel, toISODate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { summarizeMonth } from "@/lib/month"
import { setMeals, updateTrip } from "@/lib/repo"

/** Mess-style meal book: count meals per day, see the month's meal rate */
export default function MealsScreen() {
  const { trip, members, everyone, mealsByDay, expenses, mealWeights, meId, names } = useTrip()
  const [date, setDate] = useState(toISODate())
  const counts = mealsByDay.get(date) ?? {}
  const month = date.slice(0, 7)
  const summary = useMemo(() => summarizeMonth(month, trip, expenses, mealWeights), [month, trip, expenses, mealWeights])
  const today = toISODate()

  if (!trip.mealMode) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="Meal count is off"
        action={
          <Button size="lg" className="h-12" onClick={() => updateTrip(trip.id, { mealMode: true })}>
            Turn on meal count
          </Button>
        }
      >
        In a mess, bazar is shared by how many meals each person eats. Turn this on to count meals daily.
      </EmptyState>
    )
  }

  const copyYesterday = async () => {
    const prev = mealsByDay.get(addDays(date, -1)) ?? {}
    if (Object.keys(prev).length === 0) {
      toast("Nothing counted the day before")
      return
    }
    for (const m of members) await setMeals(trip.id, date, m.id, prev[m.id] ?? 0)
    toast.success("Copied the day before")
  }

  const dayTotal = members.reduce((s, m) => s + (counts[m.id] ?? 0), 0)
  // Everyone who ate this month, including people who have since moved out
  const eaters = everyone.filter((m) => (summary.meals[m.id] ?? 0) > 0 || !m.archived)

  return (
    <div className="pt-3 pb-6">
      <div className="flex items-center justify-between rounded-2xl border bg-card p-1">
        <Button variant="ghost" size="icon" className="size-11" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <ChevronLeft className="size-5" />
        </Button>
        <button type="button" className="min-h-11 flex-1 text-center" onClick={() => setDate(today)}>
          <span className="block font-semibold">{dayLabel(date)}</span>
          {date !== today && <span className="block text-xs text-primary">Back to today</span>}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Next day"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border bg-card">
        <div className="divide-y">
          {members.map((m) => (
            <MealStepper
              key={m.id}
              tripId={trip.id}
              date={date}
              member={m}
              count={counts[m.id] ?? 0}
              label={m.id === meId ? "You" : m.name}
              half
            />
          ))}
        </div>
        <div className="flex items-center justify-between border-t bg-muted/50 px-3 py-1.5">
          <span className="text-sm text-muted-foreground">{dayTotal} meals this day</span>
          <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={copyYesterday}>
            <Copy /> Same as day before
          </Button>
        </div>
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">Guest ate? Add their meals to the person who brought them.</p>

      <SectionTitle>{monthLabel(month)}</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Meals" value={String(summary.totalMeals)} />
        <Stat label="Bazar" value={formatMoney(summary.mealBazar, trip.currency, { compact: summary.mealBazar > 9_999_900 })} />
        <Stat label="Meal rate" value={summary.mealRate ? formatMoney(summary.mealRate, trip.currency) : "—"} />
      </div>
      {summary.mealBazar === 0 && (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          Add bazar with the split set to “Meals” and it's shared by these counts.
        </p>
      )}
      <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
        {eaters.map((m) => {
          const n = summary.meals[m.id] ?? 0
          return (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <MemberAvatar id={m.id} name={m.name} className="size-8" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.id === meId ? "You" : names.get(m.id)}</span>
              <span className="text-sm text-muted-foreground tabular">
                {n} {n === 1 ? "meal" : "meals"}
              </span>
              <span className="w-24 text-right text-sm font-semibold tabular">
                {formatMoney(Math.round(n * (summary.totalMeals ? summary.mealBazar / summary.totalMeals : 0)), trip.currency)}
              </span>
            </li>
          )
        })}
      </ul>

      <Button variant="ghost" className="mt-6 w-full text-muted-foreground" onClick={() => updateTrip(trip.id, { mealMode: false })}>
        Turn off meal count
      </Button>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular">{value}</p>
    </div>
  )
}
