import { Bell, HandCoins, ListChecks, Pencil, Plus, Siren, Trash2, UtensilsCrossed, Zap, type LucideIcon } from "lucide-react"
import { useLocation } from "wouter"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBackClose } from "@/hooks/useBackClose"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { shortDate, timeAgo, toISODate } from "@/lib/dates"
import { describeEvent, INBOX_DAYS, type InboxEvent } from "@/lib/inbox"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"
import { BreakdownSection } from "./breakdown"

const ICONS: Record<InboxEvent["kind"], LucideIcon> = {
  "expense-added": Plus,
  "expense-edited": Pencil,
  "expense-deleted": Trash2,
  payment: HandCoins,
  "item-assigned": ListChecks,
  "item-urgent": Siren,
  "items-added": ListChecks,
}

/** What needs you now, and what others changed lately */
export function InboxSheet({
  open,
  onOpenChange,
  events,
  lastSeen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  events: InboxEvent[]
  lastSeen: number
}) {
  const { trip, meId, names, mealWeights, billStatus, transfers, items, mealsByDay } = useTrip()
  const { viewExpense, viewPayment, payBill, recordPayment } = useTripActions()
  const [, navigate] = useLocation()
  const close = () => onOpenChange(false)
  useBackClose(open, close)
  const money = (v: number) => formatMoney(v, trip.currency)
  const then = (fn: () => void) => {
    close()
    setTimeout(fn, 220)
  }

  const today = toISODate()
  const due = billStatus.filter((b) => !b.paid && b.due <= today)
  const iOwe = transfers.filter((t) => t.from === meId)
  const toBuy = items.filter((i) => !i.done && i.assignee === meId)
  const urgentFree = items.filter((i) => !i.done && i.urgent && !i.assignee)
  const mealsMissing = trip.mealMode && new Date().getHours() >= 18 && Object.keys(mealsByDay.get(today) ?? {}).length === 0

  const todo: { key: string; icon: LucideIcon; text: string; tone?: "warn"; run: () => void }[] = [
    ...due.map((st) => ({
      key: `bill:${st.bill.id}:${st.period}`,
      icon: Zap,
      text: `${st.bill.title} ${st.due < today ? `overdue since ${shortDate(st.due)}` : "due today"}`,
      tone: "warn" as const,
      run: () => then(() => payBill(st)),
    })),
    ...iOwe.map((t) => ({
      key: `owe:${t.to}`,
      icon: HandCoins,
      text: `Pay ${names.get(t.to)} ${money(t.amount)}`,
      run: () => then(() => recordPayment(t)),
    })),
    ...urgentFree.map((i) => ({
      key: `urgent:${i.id}`,
      icon: Siren,
      text: `Urgent: ${i.name}, nobody's buying it`,
      tone: "warn" as const,
      run: () => then(() => navigate("/list")),
    })),
    ...(toBuy.length
      ? [
          {
            key: "buy",
            icon: ListChecks,
            text: `You're buying ${toBuy.map((i) => `${i.name}${i.urgent ? " (urgent)" : ""}`).join(", ")}`,
            ...(toBuy.some((i) => i.urgent || (i.needBy && i.needBy <= today)) ? { tone: "warn" as const } : {}),
            run: () => then(() => navigate("/list")),
          },
        ]
      : []),
    ...(mealsMissing ? [{ key: "meals", icon: UtensilsCrossed, text: "Today's meals aren't counted yet", run: () => then(() => navigate("/meals")) }] : []),
  ]

  const openEvent = (ev: InboxEvent) => {
    if (ev.kind === "payment") then(() => viewPayment(ev.payment))
    else if (ev.kind === "item-assigned" || ev.kind === "items-added" || ev.kind === "item-urgent") then(() => navigate("/list"))
    else then(() => viewExpense(ev.expense))
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="py-2">
            <DrawerTitle className="text-lg">Updates</DrawerTitle>
            <DrawerDescription className="text-xs">What needs you, and what others changed in the last {INBOX_DAYS} days.</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            {todo.length > 0 && (
              <BreakdownSection title="Needs you">
                {todo.map((t) => (
                  <button key={t.key} type="button" onClick={t.run} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-accent">
                    <t.icon className={cn("size-4 shrink-0", t.tone === "warn" ? "text-negative" : "text-primary")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{t.text}</span>
                  </button>
                ))}
              </BreakdownSection>
            )}
            <BreakdownSection title="From others">
              {events.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Bell className="size-4" aria-hidden /> Nothing new. When someone adds, changes or deletes something, it shows up here.
                </p>
              ) : (
                events.map((ev) => {
                  const { title, body } = describeEvent(ev, { meId, names, trip, meals: mealWeights })
                  const Icon = ICONS[ev.kind]
                  const unread = ev.at > lastSeen
                  return (
                    <button
                      key={ev.key}
                      type="button"
                      onClick={() => openEvent(ev)}
                      className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left active:bg-accent", unread && "bg-accent/40")}
                    >
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", unread && "font-semibold")}>{title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {body} · {timeAgo(ev.at)}
                        </span>
                      </span>
                      {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="new" />}
                    </button>
                  )
                })
              )}
            </BreakdownSection>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
