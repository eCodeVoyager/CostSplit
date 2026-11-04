import { ArrowRight, HandCoins, Share2 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBackClose } from "@/hooks/useBackClose"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { directDebts, memberLedger } from "@/lib/balance"
import { dayLabel } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { shareOrCopy } from "@/lib/share"
import { cn } from "@/lib/utils"
import { BreakdownSection } from "./breakdown"
import { BalanceText, CategoryIcon, MemberAvatar } from "./common"

/**
 * One person's statement: every expense and payment that moved their balance,
 * with a running total, so anyone can check how a balance came about.
 */
export function MemberSheet({
  open,
  onOpenChange,
  memberId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId?: string | null
}) {
  const { trip, expenses, payments, mealWeights, names, meId, balances } = useTrip()
  const { viewExpense, viewPayment, recordPayment } = useTripActions()
  const close = () => onOpenChange(false)
  useBackClose(open, close)

  const ledger = useMemo(
    () => (memberId ? memberLedger(memberId, trip, expenses, payments, mealWeights) : []),
    [memberId, trip, expenses, payments, mealWeights]
  )
  const debts = useMemo(
    () => (memberId ? directDebts(trip, expenses, payments, mealWeights).filter((t) => t.from === memberId || t.to === memberId) : []),
    [memberId, trip, expenses, payments, mealWeights]
  )
  if (!memberId) return null

  const money = (v: number) => formatMoney(v, trip.currency)
  const signed = (v: number) => formatMoney(v, trip.currency, { signed: true })
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const you = memberId === meId
  const balance = balances.find((b) => b.memberId === memberId)
  const net = balance?.net ?? 0
  const sent = ledger.filter((l) => l.kind === "payment").reduce((s, l) => s + l.paid, 0)
  const received = ledger.filter((l) => l.kind === "payment").reduce((s, l) => s + l.share, 0)
  const paid = balance?.paid ?? 0
  const share = balance?.share ?? 0

  const then = (fn: () => void) => {
    close()
    setTimeout(fn, 220)
  }

  const shareText = async () => {
    const lines = [
      `${trip.emoji} ${trip.name}: ${names.get(memberId)}'s statement`,
      `Paid for the group: ${money(paid)}`,
      `Share of expenses: ${money(share)}`,
      `Paid back to others: ${money(sent)}`,
      `Received from others: ${money(received)}`,
      `Balance: ${net === 0 ? "settled" : net > 0 ? `gets back ${money(net)}` : `owes ${money(-net)}`}`,
      "",
      ...ledger
        .slice()
        .reverse()
        .slice(0, 40)
        .map((l) => {
          const title = l.expense ? l.expense.title : l.payment!.from === memberId ? `Paid ${names.get(l.payment!.to)}` : `Got from ${names.get(l.payment!.from)}`
          return `${l.date} ${title}: ${l.effect >= 0 ? "+" : "-"}${money(Math.abs(l.effect))} → ${money(l.running)}`
        }),
    ]
    const result = await shareOrCopy({ title: trip.name, text: lines.join("\n") })
    if (result === "copied") toast.success("Statement copied")
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="flex-row items-center gap-3 py-2 text-left">
            <MemberAvatar id={memberId} name={names.get(memberId) ?? "?"} className="size-11" />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate text-lg">{you ? "Your statement" : `${names.get(memberId)}`}</DrawerTitle>
              <DrawerDescription asChild>
                <p className="text-sm">
                  <BalanceText net={net} currency={trip.currency} you={you} />
                </p>
              </DrawerDescription>
            </div>
            <Button variant="ghost" size="icon" className="size-11" onClick={shareText} aria-label="Share statement">
              <Share2 className="size-5" />
            </Button>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            {/* The whole balance as one sum, so it can be checked by hand */}
            <div className="rounded-2xl border bg-card p-3 text-sm">
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular">
                <dt className="text-muted-foreground">Paid for the group</dt>
                <dd className="text-right">{signed(paid)}</dd>
                <dt className="text-muted-foreground">Share of expenses</dt>
                <dd className="text-right">{signed(-share)}</dd>
                <dt className="text-muted-foreground">Paid back to others</dt>
                <dd className="text-right">{signed(sent)}</dd>
                <dt className="text-muted-foreground">Received from others</dt>
                <dd className="text-right">{signed(-received)}</dd>
                <dt className="border-t pt-1 font-semibold">Balance</dt>
                <dd className={cn("border-t pt-1 text-right font-semibold", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "")}>
                  {net > 0 ? "+" : net < 0 ? "−" : ""}
                  {money(Math.abs(net))}
                </dd>
              </dl>
            </div>

            {debts.length > 0 && (
              <BreakdownSection title="Owes / is owed directly">
                {debts.map((t) => {
                  const other = t.from === memberId ? t.to : t.from
                  const owes = t.from === memberId
                  return (
                    <div key={`${t.from}-${t.to}`} className="flex min-h-11 items-center gap-2 px-3 py-2">
                      <MemberAvatar id={other} name={names.get(other) ?? "?"} className="size-7 text-[10px]" />
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {owes ? `${you ? "You owe" : "Owes"} ${who(other)}` : `${who(other)} ${other === meId ? "owe" : "owes"} ${you ? "you" : "them"}`}
                      </p>
                      <span className={cn("text-sm font-semibold tabular", owes ? "text-negative" : "text-positive")}>{money(t.amount)}</span>
                      {owes && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => then(() => recordPayment(t))}>
                          Pay
                        </Button>
                      )}
                    </div>
                  )
                })}
              </BreakdownSection>
            )}

            <BreakdownSection title="Everything, newest first" aside={`${ledger.length} ${ledger.length === 1 ? "item" : "items"}`}>
              {ledger.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nothing yet.</p>}
              {ledger
                .slice()
                .reverse()
                .map((l) => {
                  const e = l.expense
                  const p = l.payment
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => then(() => (e ? viewExpense(e) : viewPayment(p!)))}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-accent"
                    >
                      {e ? (
                        <CategoryIcon category={e.category} className="size-9" />
                      ) : (
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-positive-soft text-positive">
                          <HandCoins className="size-4" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-medium">
                          {e ? (
                            e.title
                          ) : (
                            <>
                              {who(p!.from)} <ArrowRight className="size-3 shrink-0" aria-label="paid" /> {who(p!.to)}
                            </>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground tabular">
                          {dayLabel(l.date)}
                          {e ? ` · paid ${money(Math.abs(l.paid))} · share ${money(Math.abs(l.share))}` : ""}
                        </p>
                      </div>
                      <div className="text-right tabular">
                        <p className={cn("text-sm font-semibold", l.effect > 0 ? "text-positive" : l.effect < 0 ? "text-negative" : "text-muted-foreground")}>
                          {l.effect > 0 ? "+" : l.effect < 0 ? "−" : ""}
                          {money(Math.abs(l.effect))}
                        </p>
                        <p className="text-[11px] text-muted-foreground">= {l.running < 0 ? "−" : ""}{money(Math.abs(l.running))}</p>
                      </div>
                    </button>
                  )
                })}
            </BreakdownSection>
            <p className="px-1 text-[11px] text-muted-foreground">
              + means {you ? "you get" : "they get"} more back, − means {you ? "you owe" : "they owe"} more. The small number is the balance after each item.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
