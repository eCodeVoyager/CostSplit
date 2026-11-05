import { Bell, ChevronLeft, HandCoins, House, LayoutGrid, Plus, Receipt, Wallet } from "lucide-react"
import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import { Link, Route, Switch, useLocation, useSearch } from "wouter"
import { AddSheet } from "@/components/AddSheet"
import { BillSheet } from "@/components/BillSheet"
import { AvatarContext, Splash } from "@/components/common"
import { DetailSheet, type DetailTarget } from "@/components/DetailSheet"
import { ExpenseSheet, type ExpensePreset } from "@/components/ExpenseSheet"
import { InboxSheet } from "@/components/InboxSheet"
import { MemberSheet } from "@/components/MemberSheet"
import { PaymentSheet } from "@/components/PaymentSheet"
import { PersonalSheet, type PersonalPreset } from "@/components/PersonalSheet"
import { SyncBadge } from "@/components/SyncBadge"
import { WhoAreYou } from "@/components/WhoAreYou"
import { Button } from "@/components/ui/button"
import { ActionsContext, type TripActions } from "@/hooks/useTripActions"
import { useIdentity } from "@/hooks/useIdentity"
import { useInbox } from "@/hooks/useInbox"
import { TripContext, useTrip, useTripQuery, type BillStatus } from "@/hooks/useTripData"
import { toISODate } from "@/lib/dates"
import type { Transfer } from "@/lib/balance"
import { monthLabel } from "@/lib/dates"
import { rememberTrip } from "@/lib/nav"
import type { Bill, Expense, PersonalExpense } from "@/lib/types"
import { cn } from "@/lib/utils"
import { ActivityTab } from "./ActivityTab"
import { BalancesTab } from "./BalancesTab"
import { JoinScreen } from "./JoinScreen"
import { MoreTab } from "./MoreTab"
import { OverviewTab } from "./OverviewTab"

const StatsTab = lazy(() => import("./StatsTab"))
const PersonalTab = lazy(() => import("./PersonalTab"))
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
  | { kind: "detail"; target: DetailTarget }
  | { kind: "personal"; item: PersonalExpense | null; preset: PersonalPreset | null }
  | { kind: "member"; memberId: string }

export function TripShell({ id }: { id: string }) {
  const data = useTripQuery(id)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Keep each sheet's last props while it animates closed
  const [last, setLast] = useState<Partial<Record<Sheet["kind"], Sheet>>>({})
  // Invite dialog: everyone (memberId null) or one person
  const [share, setShare] = useState<{ memberId: string | null } | null>(null)
  const [whoOpen, setWhoOpen] = useState(false)
  // Joined with a personal link, on another phone, or invited by email: no "Who are you?"
  const autoMe = useIdentity(data, () => setWhoOpen(true))
  const everyone = data?.everyone
  const avatars = useMemo(
    () => new Map((everyone ?? []).filter((m) => m.avatar).map((m) => [m.id, m.avatar!])),
    [everyone]
  )

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
    viewExpense: (expense) => open({ kind: "detail", target: { kind: "expense", expense } }),
    viewPayment: (payment) => open({ kind: "detail", target: { kind: "payment", payment } }),
    addPersonal: (preset) => open({ kind: "personal", item: null, preset: preset ?? null }),
    editPersonal: (item) => open({ kind: "personal", item, preset: null }),
    viewMember: (memberId) => open({ kind: "member", memberId }),
    recordPayment: (suggestion) => open({ kind: "payment", suggestion: suggestion ?? null }),
    payBill,
    editBill: (bill) => open({ kind: "bill", bill: bill ?? null }),
    invite: () => setShare({ memberId: null }),
    inviteMember: (memberId) => setShare({ memberId }),
    changeMe: () => setWhoOpen(true),
  }

  const exp = last.expense?.kind === "expense" ? last.expense : null
  const pay = last.payment?.kind === "payment" ? last.payment : null
  const bill = last.bill?.kind === "bill" ? last.bill : null
  const detail = last.detail?.kind === "detail" ? last.detail : null
  const personal = last.personal?.kind === "personal" ? last.personal : null
  const member = last.member?.kind === "member" ? last.member : null

  return (
    <TripContext.Provider value={data}>
      <AvatarContext.Provider value={avatars}>
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
              <InboxButton onInvite={actions.invite} />
              <MoreButton />
            </div>
          </header>

          <main className="mx-auto max-w-lg px-4">
            <Suspense fallback={<div className="h-40" />}>
              <Switch>
                <Route path="/" component={OverviewTab} />
                <Route path="/activity" component={ActivityTab} />
                <Route path="/balances" component={BalancesTab} />
                <Route path="/personal" component={PersonalTab} />
                <Route path="/more" component={MoreTab} />
                <Route path="/bills" component={BillsScreen} />
                <Route path="/meals" component={MealsScreen} />
                <Route path="/list" component={ShoppingScreen} />
                <Route path="/stats" component={StatsTab} />
                <Route path="/settings" component={SettingsTab} />
              </Switch>
            </Suspense>
          </main>

          <BottomNav onAdd={actions.openAdd} onAddPersonal={() => actions.addPersonal()} home={data.kind === "home"} />
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
        <DetailSheet open={sheet?.kind === "detail"} onOpenChange={onOpenChange} target={detail?.target} />
        <PersonalSheet open={sheet?.kind === "personal"} onOpenChange={onOpenChange} item={personal?.item} preset={personal?.preset} />
        <MemberSheet open={sheet?.kind === "member"} onOpenChange={onOpenChange} memberId={member?.memberId} />
        {share && (
          <Suspense>
            <ShareDialog
              trip={data.trip}
              open
              onOpenChange={(o) => !o && setShare(null)}
              initialMember={share.memberId}
            />
          </Suspense>
        )}
        <WhoAreYou
          tripId={data.trip.id}
          members={data.members}
          open={whoOpen || (!data.meId && !autoMe && data.members.length > 0)}
          onOpenChange={data.meId ? setWhoOpen : undefined}
        />
      </ActionsContext.Provider>
      </AvatarContext.Provider>
    </TripContext.Provider>
  )
}

const SUB_PAGES = ["/more", "/bills", "/meals", "/list", "/stats", "/settings"]

/**
 * Bell with the number of things that are new or need you. Also handles links
 * like /t/<id>?inbox (from a notification or the dashboard) and ?invite.
 */
function InboxButton({ onInvite }: { onInvite: () => void }) {
  const data = useTrip()
  const { events, unread, lastSeen, markSeen } = useInbox(data)
  const [open, setOpen] = useState(false)
  const search = useSearch()
  const [location, navigate] = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(search)
    if (!params.has("inbox") && !params.has("invite")) return
    if (params.has("inbox")) setOpen(true)
    if (params.has("invite")) onInvite()
    navigate(location, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const today = toISODate()
  const urgent = data.billStatus.filter((b) => !b.paid && b.due < today).length
  const count = unread + urgent
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative size-11"
        onClick={() => setOpen(true)}
        aria-label={count ? `Updates, ${count} new` : "Updates"}
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 inline-flex min-w-4.5 items-center justify-center rounded-full bg-negative px-1 text-[10px] leading-4.5 font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </Button>
      <InboxSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) markSeen()
        }}
        events={events}
        lastSeen={lastSeen}
      />
    </>
  )
}

/** Bills, meals, list, insights and settings live behind this (the tab bar holds Personal instead) */
function MoreButton() {
  const [location] = useLocation()
  const active = SUB_PAGES.includes(location)
  return (
    <Button variant="ghost" size="icon" className={cn("size-11", active && "text-primary")} asChild>
      <Link href="/more" aria-label="More: bills, meals, list, insights, settings" aria-current={active ? "page" : undefined}>
        <LayoutGrid className="size-5" strokeWidth={active ? 2.4 : 2} />
      </Link>
    </Button>
  )
}

function BottomNav({ onAdd, onAddPersonal, home }: { onAdd: () => void; onAddPersonal: () => void; home: boolean }) {
  const [location] = useLocation()
  const onPersonal = location === "/personal"
  const tabs = [
    { href: "/", label: home ? "Home" : "Overview", icon: House, active: location === "/" },
    { href: "/activity", label: "Activity", icon: Receipt, active: location === "/activity" },
    null,
    { href: "/balances", label: "Balances", icon: HandCoins, active: location === "/balances" },
    { href: "/personal", label: "Personal", icon: Wallet, active: onPersonal },
  ]
  return (
    <nav aria-label="Sections" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
        {tabs.map((tab) =>
          tab === null ? (
            <div key="add" className="flex justify-center">
              <button
                type="button"
                // On Personal, + adds a personal expense straight away
                onClick={onPersonal ? onAddPersonal : onAdd}
                aria-label={onPersonal ? "Add personal expense" : "Add"}
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
