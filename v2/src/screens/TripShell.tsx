import { ChevronLeft, HandCoins, House, LayoutGrid, Plus, Receipt, UserPlus } from "lucide-react"
import { lazy, Suspense, useEffect, useState } from "react"
import { Link, Route, Switch, useLocation } from "wouter"
import { AddSheet } from "@/components/AddSheet"
import { BillSheet } from "@/components/BillSheet"
import { Splash } from "@/components/common"
import { ExpenseSheet, type ExpensePreset } from "@/components/ExpenseSheet"
import { PaymentSheet } from "@/components/PaymentSheet"
import { SyncBadge } from "@/components/SyncBadge"
import { WhoAreYou } from "@/components/WhoAreYou"
import { Button } from "@/components/ui/button"
import { ActionsContext, type TripActions } from "@/hooks/useTripActions"
import { TripContext, useTripQuery, type BillStatus } from "@/hooks/useTripData"
import type { Transfer } from "@/lib/balance"
import { monthLabel } from "@/lib/dates"
import { rememberTrip } from "@/lib/nav"
import type { Bill, Expense } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActivityTab } from "./ActivityTab"
import { BalancesTab } from "./BalancesTab"
import { JoinScreen } from "./JoinScreen"
import { MoreTab } from "./MoreTab"
import { OverviewTab } from "./OverviewTab"

const StatsTab = lazy(() => import("./StatsTab"))
const SettingsTab = lazy(() => import("./SettingsTab"))
const BillsScreen = lazy(() => import("./BillsScreen"))
const MealsScreen = lazy(() => import("./MealsScreen"))
const ShoppingScreen = lazy(() => import("./ShoppingScreen"))
const ShareDialog = lazy(() => import("@/components/ShareDialog").then((m) => ({ default: m.ShareDialog })))

type Sheet =
  | { kind: "expense"; expense: Expense | null; preset: ExpensePreset | null }
  | { kind: "payment"; suggestion: Transfer | null }
  | { kind: "bill"; bill: Bill | null }
  | { kind: "add" }

export function TripShell({ id }: { id: string }) {
  const data = useTripQuery(id)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Keep each sheet's last props while it animates closed
  const [last, setLast] = useState<Partial<Record<Sheet["kind"], Sheet>>>({})
  const [shareOpen, setShareOpen] = useState(false)
  const [whoOpen, setWhoOpen] = useState(false)

  useEffect(() => {
    if (data) rememberTrip(id)
  }, [data, id])

  if (data === undefined) return <Splash />
  // Not on this device yet: treat the link as an invite
  if (data === null) return <JoinScreen id={id} embedded />

  const open = (s: Sheet) => {
    setLast((l) => ({ ...l, [s.kind]: s }))
    setSheet(s)
  }
  const onOpenChange = (o: boolean) => !o && setSheet(null)

  const addExpense = (preset?: ExpensePreset) => open({ kind: "expense", expense: null, preset: preset ?? null })

  const payBill = ({ bill, period }: BillStatus) => {
    const active = new Set(data.members.map((m) => m.id))
    // People who moved out since the bill was set up are left out
    const split = Object.fromEntries(Object.entries(bill.split).filter(([memberId]) => active.has(memberId)))
    const custom = Object.keys(split).length > 0
    addExpense({
      title: `${bill.title} · ${monthLabel(period, "short")}`,
      category: bill.category,
      ...(bill.amount ? { amount: bill.amount } : {}),
      ...(bill.payer && active.has(bill.payer) ? { payer: bill.payer } : {}),
      splitMode: custom ? bill.splitMode : "equal",
      ...(custom ? (bill.splitMode === "exact" ? { weights: split } : { people: Object.keys(split) }) : {}),
      billId: bill.id,
      period,
      context: `${bill.title} for ${monthLabel(period)}${bill.variable ? ". Enter this month's amount." : ""}`,
    })
  }

  const actions: TripActions = {
    openAdd: () => open({ kind: "add" }),
    addExpense,
    editExpense: (expense) => open({ kind: "expense", expense, preset: null }),
    recordPayment: (suggestion) => open({ kind: "payment", suggestion: suggestion ?? null }),
    payBill,
    editBill: (bill) => open({ kind: "bill", bill: bill ?? null }),
    invite: () => setShareOpen(true),
    changeMe: () => setWhoOpen(true),
  }

  const exp = last.expense?.kind === "expense" ? last.expense : null
  const pay = last.payment?.kind === "payment" ? last.payment : null
  const bill = last.bill?.kind === "bill" ? last.bill : null

  return (
    <TripContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>
        <div className="min-h-dvh pb-[calc(6rem+var(--sab))]">
          <header className="pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-1.5">
              <Button variant="ghost" size="icon" className="size-11" asChild>
                <Link href="~/" aria-label="All homes and trips">
                  <ChevronLeft className="size-5" />
                </Link>
              </Button>
              <h1 className="min-w-0 flex-1 truncate text-[17px] font-semibold">
                <span aria-hidden className="mr-1.5">
                  {data.trip.emoji}
                </span>
                {data.trip.name}
              </h1>
              <SyncBadge pending={data.pending} />
              <Button variant="ghost" size="icon" className="size-11" onClick={actions.invite} aria-label="Invite people">
                <UserPlus className="size-5" />
              </Button>
            </div>
          </header>

          <main className="mx-auto max-w-lg px-4">
            <Suspense fallback={<div className="h-40" />}>
              <Switch>
                <Route path="/" component={OverviewTab} />
                <Route path="/activity" component={ActivityTab} />
                <Route path="/balances" component={BalancesTab} />
                <Route path="/more" component={MoreTab} />
                <Route path="/bills" component={BillsScreen} />
                <Route path="/meals" component={MealsScreen} />
                <Route path="/list" component={ShoppingScreen} />
                <Route path="/stats" component={StatsTab} />
                <Route path="/settings" component={SettingsTab} />
              </Switch>
            </Suspense>
          </main>

          <BottomNav onAdd={actions.openAdd} home={data.kind === "home"} />
        </div>

        <AddSheet open={sheet?.kind === "add"} onOpenChange={onOpenChange} />
        <ExpenseSheet
          open={sheet?.kind === "expense"}
          onOpenChange={onOpenChange}
          expense={exp?.expense}
          preset={exp?.preset}
        />
        <PaymentSheet open={sheet?.kind === "payment"} onOpenChange={onOpenChange} suggestion={pay?.suggestion} />
        <BillSheet open={sheet?.kind === "bill"} onOpenChange={onOpenChange} bill={bill?.bill} />
        {shareOpen && (
          <Suspense>
            <ShareDialog trip={data.trip} open={shareOpen} onOpenChange={setShareOpen} />
          </Suspense>
        )}
        <WhoAreYou
          tripId={data.trip.id}
          members={data.members}
          open={whoOpen || (!data.meId && data.members.length > 0)}
          onOpenChange={data.meId ? setWhoOpen : undefined}
        />
      </ActionsContext.Provider>
    </TripContext.Provider>
  )
}

const SUB_PAGES = ["/more", "/bills", "/meals", "/list", "/stats", "/settings"]

function BottomNav({ onAdd, home }: { onAdd: () => void; home: boolean }) {
  const [location] = useLocation()
  const tabs = [
    { href: "/", label: home ? "Home" : "Overview", icon: House, active: location === "/" },
    { href: "/activity", label: "Activity", icon: Receipt, active: location === "/activity" },
    null,
    { href: "/balances", label: "Balances", icon: HandCoins, active: location === "/balances" },
    { href: "/more", label: "More", icon: LayoutGrid, active: SUB_PAGES.includes(location) },
  ]
  return (
    <nav aria-label="Sections" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
        {tabs.map((tab) =>
          tab === null ? (
            <div key="add" className="flex justify-center">
              <button
                type="button"
                onClick={onAdd}
                aria-label="Add"
                className="-mt-7 inline-flex size-15 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
              >
                <Plus className="size-7" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                tab.active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <tab.icon className="size-[22px]" strokeWidth={tab.active ? 2.4 : 2} aria-hidden />
              {tab.label}
            </Link>
          )
        )}
      </div>
    </nav>
  )
}
