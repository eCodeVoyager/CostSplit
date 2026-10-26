import {
  ArrowDownLeft,
  HandCoins,
  Handshake,
  ListChecks,
  Receipt,
  Repeat2,
  ShoppingCart,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBackClose } from "@/hooks/useBackClose"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { toISODate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { saveExpense, softDelete } from "@/lib/repo"
import type { Expense } from "@/lib/types"
import { CategoryIcon } from "./common"

interface Tile {
  key: string
  label: string
  hint: string
  icon: LucideIcon
  run: () => void
}

/** What the "+" button opens: every way money moves in a shared home, one tap each */
export function AddSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { trip, kind, expenses, billStatus, meId, names } = useTrip()
  const { addExpense, recordPayment, payBill } = useTripActions()
  const [, navigate] = useLocation()
  useBackClose(open, () => onOpenChange(false))

  // Close first, then open the next sheet once this one has left the history stack
  const then = (fn: () => void) => () => {
    onOpenChange(false)
    setTimeout(fn, 220)
  }

  const due = billStatus.filter((b) => !b.paid)
  const home = kind === "home"

  const tiles: Tile[] = [
    { key: "expense", label: "Expense", hint: "Someone paid", icon: Receipt, run: then(() => addExpense()) },
    ...(home
      ? [
          {
            key: "bazar",
            label: "Bazar",
            hint: trip.mealMode ? "Split by meals" : "Groceries",
            icon: ShoppingCart,
            run: then(() =>
              addExpense({ title: "Bazar", category: "groceries", ...(trip.mealMode ? { splitMode: "meals" as const } : {}) })
            ),
          },
          {
            key: "bill",
            label: "Pay a bill",
            hint: due.length ? `${due.length} due` : "Rent, utilities",
            icon: Zap,
            run: then(() => (due.length === 1 ? payBill(due[0]) : navigate("/bills"))),
          },
        ]
      : []),
    {
      key: "give",
      label: home ? "Give money" : "Pay back",
      hint: home ? "Deposit or pay back" : "Settle a debt",
      icon: HandCoins,
      run: then(() => recordPayment()),
    },
    {
      key: "lend",
      label: "Lend",
      hint: "Someone borrowed",
      icon: Handshake,
      run: then(() =>
        addExpense({
          title: "Loan",
          category: "loan",
          people: [],
          ...(meId ? { payer: meId } : {}),
          context: "Tick who borrowed it. Only they owe it back.",
        })
      ),
    },
    {
      key: "income",
      label: "Money in",
      hint: "Refund, sold items",
      icon: ArrowDownLeft,
      run: then(() =>
        addExpense({ kind: "income", category: "other", context: "Money the group got back, shared by everyone" })
      ),
    },
    ...(trip.mealMode
      ? [{ key: "meals", label: "Meals", hint: "Count today", icon: UtensilsCrossed, run: then(() => navigate("/meals")) }]
      : []),
    ...(home ? [{ key: "list", label: "To-buy list", hint: "Shared list", icon: ListChecks, run: then(() => navigate("/list")) }] : []),
  ]

  // Daily things (bus fare, water, snacks) repeat a lot: re-add with one tap
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Expense[] = []
    for (const e of expenses) {
      if (e.kind === "income" || e.billId || e.category === "loan") continue
      const key = `${e.title.toLowerCase()}|${e.amount}|${Object.keys(e.paidBy).join()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(e)
      if (out.length === 3) break
    }
    return out
  }, [expenses])

  const repeat = async (e: Expense) => {
    onOpenChange(false)
    const { id: _id, tripId: _t, createdAt: _c, updatedAt: _u, deleted: _d, dirty: _x, note: _n, receipt: _r, ...copy } = e
    const id = await saveExpense(trip.id, { ...copy, date: toISODate() })
    navigator.vibrate?.(15)
    toast.success(`Added ${e.title} ${formatMoney(e.amount, e.currency)}`, {
      action: { label: "Undo", onClick: () => softDelete("expenses", id) },
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-[max(1.25rem,var(--sab))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-lg">Add</DrawerTitle>
            <DrawerDescription className="sr-only">Choose what to add</DrawerDescription>
          </DrawerHeader>

          <div className="grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={t.run}
                className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-1 py-3 text-center transition-transform active:scale-[0.97]"
              >
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <t.icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm leading-tight font-semibold">{t.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <h3 className="flex items-center gap-1.5 pt-5 pb-2 text-sm font-semibold text-muted-foreground">
                <Repeat2 className="size-4" aria-hidden /> Add again today
              </h3>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {recent.map((e) => {
                  const payer = Object.keys(e.paidBy)[0]
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => repeat(e)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-accent"
                      >
                        <CategoryIcon category={e.category} className="size-9" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {payer === meId ? "You" : names.get(payer)} paid ·{" "}
                            {Object.keys(e.split).length} {Object.keys(e.split).length === 1 ? "person" : "people"}
                          </span>
                        </span>
                        <span className="text-sm font-semibold tabular">{formatMoney(e.amount, e.currency)}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
