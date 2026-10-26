import { Check, ChevronRight, Plus, Receipt, UserPlus, Zap } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "wouter"
import { CategoryIcon, EmptyState, SectionTitle } from "@/components/common"
import { MealStepper } from "@/components/MealStepper"
import { BalanceHero, ExpenseRow } from "@/components/rows"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, isSpending } from "@/lib/balance"
import { monthLabel, shortDate, toISODate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { summarizeMonth } from "@/lib/month"
import { addItem, setItemDone } from "@/lib/repo"
import { cn } from "@/lib/utils"

/** The group's front page: what needs doing today, at a glance */
export function OverviewTab() {
  const data = useTrip()
  const { trip, kind, expenses, meId, mealWeights, members } = data
  const { openAdd, invite } = useTripActions()
  const month = toISODate().slice(0, 7)
  const summary = useMemo(() => summarizeMonth(month, trip, expenses, mealWeights), [month, trip, expenses, mealWeights])
  const home = kind === "home"

  const tripTotal = useMemo(
    () => expenses.filter(isSpending).reduce((s, e) => s + expenseImpact(e, trip).total, 0),
    [expenses, trip]
  )
  const myShare = meId ? (summary.shares[meId] ?? 0) : 0
  const subtitle = home
    ? `${monthLabel(month)}: home spent ${formatMoney(summary.spent, trip.currency)}${meId ? ` · your share ${formatMoney(myShare, trip.currency)}` : ""}`
    : `Trip total ${formatMoney(tripTotal, trip.currency)}`

  if (!home && expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No expenses yet"
        action={
          <div className="flex flex-col gap-2">
            <Button size="lg" className="h-12" onClick={openAdd}>
              <Plus /> Add first expense
            </Button>
            {members.length < 2 && (
              <Button size="lg" variant="outline" className="h-12" onClick={invite}>
                <UserPlus /> Invite friends
              </Button>
            )}
          </div>
        }
      >
        Tap + whenever someone pays. It works without internet and syncs later.
      </EmptyState>
    )
  }

  return (
    <div className="pt-4 pb-4">
      <BalanceHero subtitle={subtitle} />
      {home && <BillsCard />}
      {trip.mealMode && <MealsCard rate={summary.mealRate} totalMeals={summary.totalMeals} />}
      {home && <ListCard />}
      <RecentCard />
    </div>
  )
}

function BillsCard() {
  const { trip, billStatus, bills, names, meId } = useTrip()
  const { payBill, editBill } = useTripActions()
  const month = toISODate().slice(0, 7)

  if (bills.length === 0) {
    return (
      <>
        <SectionTitle>Monthly bills</SectionTitle>
        <button
          type="button"
          onClick={() => editBill()}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed p-4 text-left active:bg-accent"
        >
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Zap className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Add rent, electricity, internet…</span>
            <span className="block text-xs text-muted-foreground">Set once. Each month you just tap “Pay”.</span>
          </span>
          <Plus className="size-5 text-muted-foreground" aria-hidden />
        </button>
      </>
    )
  }

  const dueCount = billStatus.filter((b) => !b.paid).length
  return (
    <>
      <SectionTitle
        action={
          <Link href="/bills" className="inline-flex min-h-9 items-center text-sm font-medium text-primary">
            All bills
          </Link>
        }
      >
        Bills · {monthLabel(month)} {dueCount > 0 ? `· ${dueCount} to pay` : "· all paid"}
      </SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {billStatus.map((st) => {
          const payer = st.paid ? Object.keys(st.paid.paidBy)[0] : null
          return (
            <li key={`${st.bill.id}-${st.period}`} className="flex items-center gap-3 px-3 py-2.5">
              <CategoryIcon category={st.bill.category} className="size-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {st.bill.title}
                  {st.period !== month ? ` · ${monthLabel(st.period, "short")}` : ""}
                </p>
                <p className={cn("truncate text-xs", st.overdue ? "font-medium text-negative" : "text-muted-foreground")}>
                  {st.paid
                    ? `Paid by ${payer === meId ? "you" : names.get(payer ?? "")} · ${formatMoney(st.paid.amount, st.paid.currency)}`
                    : `${st.overdue ? "Overdue since" : "Due"} ${shortDate(st.due)}${st.bill.amount ? ` · ${formatMoney(st.bill.amount, trip.currency)}` : ""}`}
                </p>
              </div>
              {st.paid ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-positive">
                  <Check className="size-4" aria-hidden /> Paid
                </span>
              ) : (
                <Button size="sm" className="h-9" variant={st.overdue ? "default" : "outline"} onClick={() => payBill(st)}>
                  Pay
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function MealsCard({ rate, totalMeals }: { rate: number; totalMeals: number }) {
  const { trip, members, mealsByDay, meId } = useTrip()
  const today = toISODate()
  const counts = mealsByDay.get(today) ?? {}
  return (
    <>
      <SectionTitle
        action={
          <Link href="/meals" className="inline-flex min-h-9 items-center text-sm font-medium text-primary">
            Meal book
          </Link>
        }
      >
        Today's meals
      </SectionTitle>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="divide-y">
          {members.map((m) => (
            <MealStepper
              key={m.id}
              tripId={trip.id}
              date={today}
              member={m}
              count={counts[m.id] ?? 0}
              label={m.id === meId ? "You" : m.name}
            />
          ))}
        </div>
        <p className="border-t bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {totalMeals > 0
            ? `This month: ${totalMeals} meals · meal rate ${formatMoney(rate, trip.currency)}`
            : "Count meals each day. Bazar marked “Meals” is split by these counts."}
        </p>
      </div>
    </>
  )
}

function ListCard() {
  const { trip, items } = useTrip()
  const [name, setName] = useState("")
  const open = items.filter((i) => !i.done)
  const add = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    await addItem(trip.id, trimmed.slice(0, 60))
    setName("")
  }
  return (
    <>
      <SectionTitle
        action={
          <Link href="/list" className="inline-flex min-h-9 items-center text-sm font-medium text-primary">
            {items.length > 0 ? `See all (${items.length})` : "Open list"}
          </Link>
        }
      >
        To buy
      </SectionTitle>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <form
          className="flex gap-2 p-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input placeholder="Rice, oil, soap…" value={name} onChange={(e) => setName(e.target.value)} className="h-10" aria-label="Add to the list" />
          <Button type="submit" variant="outline" className="h-10" disabled={!name.trim()} aria-label="Add item">
            <Plus />
          </Button>
        </form>
        {open.slice(0, 4).map((item) => (
          <button
            key={item.id}
            type="button"
            role="checkbox"
            aria-checked={false}
            onClick={() => setItemDone(item.id, true)}
            className="flex min-h-11 w-full items-center gap-3 border-t px-3 text-left text-sm active:bg-accent"
          >
            <span className="size-5 rounded-full border-2 border-input" aria-hidden />
            {item.name}
          </button>
        ))}
        {open.length > 4 && (
          <Link href="/list" className="block border-t px-3 py-2 text-xs text-muted-foreground">
            +{open.length - 4} more
          </Link>
        )}
      </div>
    </>
  )
}

function RecentCard() {
  const { trip, expenses, mealWeights } = useTrip()
  const { editExpense } = useTripActions()
  const recent = expenses.slice(0, 5)
  if (recent.length === 0) return null
  return (
    <>
      <SectionTitle
        action={
          <Link href="/activity" className="inline-flex min-h-9 items-center gap-0.5 text-sm font-medium text-primary">
            See all <ChevronRight className="size-4" aria-hidden />
          </Link>
        }
      >
        Recent
      </SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {recent.map((e) => {
          const impact = expenseImpact(e, trip, mealWeights)
          return (
            <li key={e.id}>
              <ExpenseRow expense={e} paid={impact.paid} owed={impact.owed} onClick={() => editExpense(e)} />
            </li>
          )
        })}
      </ul>
    </>
  )
}
