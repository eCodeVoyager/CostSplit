import { ArrowRight, CircleCheck, HandCoins, ImageIcon, Plus, Share2, Trash2 } from "lucide-react"
import { useState } from "react"
import { PhotoViewer } from "@/components/PhotoField"
import { toast } from "sonner"
import { cn, UNDO_MS } from "@/lib/utils"
import { BalanceText, EmptyState, MemberAvatar, SectionTitle } from "@/components/common"
import { Button } from "@/components/ui/button"
import { useTrip } from "@/hooks/useTripData"
import { shortDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { restore, softDelete } from "@/lib/repo"
import { settleUpText, shareOrCopy } from "@/lib/share"
import { useTripActions } from "@/hooks/useTripActions"

export function BalancesTab() {
  const { trip, balances, transfers, payments, meId, names, expenses } = useTrip()
  const { recordPayment, openAdd } = useTripActions()
  const [proof, setProof] = useState<string | undefined>()
  const label = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const me = balances.find((b) => b.memberId === meId)
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.net)))
  // Show "you" first, then the people involved most
  const sorted = [...balances].sort((a, b) => (a.memberId === meId ? -1 : b.memberId === meId ? 1 : b.net - a.net))

  if (expenses.length === 0 && payments.length === 0) {
    return (
      <EmptyState
        icon={HandCoins}
        title="Nothing to settle"
        action={
          <Button size="lg" className="h-12" onClick={openAdd}>
            <Plus /> Add an expense
          </Button>
        }
      >
        Balances appear here as soon as someone pays for the group.
      </EmptyState>
    )
  }

  const share = async () => {
    const result = await shareOrCopy({ title: trip.name, text: settleUpText(trip, transfers, names) })
    if (result === "copied") toast.success("Copied — paste it in your group chat")
  }

  const removePayment = async (id: string) => {
    await softDelete("payments", id)
    toast("Payment removed", { duration: UNDO_MS, action: { label: "Undo", onClick: () => restore("payments", id) } })
  }

  return (
    <div className="pt-4">
      <PhotoViewer tripId={trip.id} fileId={proof} onClose={() => setProof(undefined)} label="Proof of payment" />
      {me && (
        <div
          className={cn(
            "rounded-2xl p-4",
            me.net > 0 ? "bg-positive-soft" : me.net < 0 ? "bg-negative-soft" : "bg-secondary"
          )}
        >
          <p className="text-sm text-muted-foreground">Your balance</p>
          <p className="mt-0.5 text-2xl font-bold">
            <BalanceText net={me.net} currency={trip.currency} you />
          </p>
          <p className="mt-1 text-xs tabular text-muted-foreground">
            You paid {formatMoney(me.paid, trip.currency)} · your share {formatMoney(me.share, trip.currency)}
          </p>
        </div>
      )}

      <SectionTitle
        action={
          transfers.length > 0 && (
            <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={share}>
              <Share2 /> Share
            </Button>
          )
        }
      >
        Settle up
      </SectionTitle>
      {transfers.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
          <CircleCheck className="size-6 text-positive" aria-hidden />
          <p className="font-medium">Everyone is settled up</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {transfers.map((t) => {
            const mine = t.from === meId || t.to === meId
            return (
              <li key={`${t.from}-${t.to}`} className={cn("flex items-center gap-2 px-3 py-3", mine && "bg-accent/40")}>
                <MemberAvatar id={t.from} name={names.get(t.from) ?? "?"} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1 text-sm font-medium">
                    <span className="truncate">{label(t.from)}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-label="pays" />
                    <span className="truncate">{label(t.to)}</span>
                  </p>
                  <p className="text-base font-semibold tabular">{formatMoney(t.amount, trip.currency)}</p>
                </div>
                <Button variant={mine ? "default" : "outline"} className="h-10" onClick={() => recordPayment(t)}>
                  Mark paid
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <SectionTitle>Everyone</SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {sorted.map((b) => (
          <li key={b.memberId} className="px-3 py-3">
            <div className="flex items-center gap-3">
              <MemberAvatar id={b.memberId} name={b.name} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {b.memberId === meId ? "You" : names.get(b.memberId)}
                </p>
                <p className="text-xs tabular text-muted-foreground">
                  paid {formatMoney(b.paid, trip.currency)} · share {formatMoney(b.share, trip.currency)}
                </p>
              </div>
              <BalanceText net={b.net} currency={trip.currency} className="text-right text-sm" />
            </div>
            {/* Diverging bar: left of center owes, right of center gets back */}
            <div className="mt-2 grid grid-cols-2 gap-px" aria-hidden>
              <div className="flex h-1.5 justify-end overflow-hidden rounded-l-full bg-muted">
                {b.net < 0 && <div className="h-full rounded-l-full bg-negative" style={{ width: `${(-b.net / maxAbs) * 100}%` }} />}
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-r-full bg-muted">
                {b.net > 0 && <div className="h-full rounded-r-full bg-positive" style={{ width: `${(b.net / maxAbs) * 100}%` }} />}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => recordPayment()}>
            <Plus /> Record
          </Button>
        }
      >
        Payments
      </SectionTitle>
      {payments.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          When someone pays back, tap “Mark paid” above.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 pr-1 pl-3">
              <HandCoins className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <strong className="font-medium">{label(p.from)}</strong> paid <strong className="font-medium">{label(p.to)}</strong>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {shortDate(p.date)}
                  {p.note ? ` · ${p.note}` : ""}
                </p>
              </div>
              {p.proof && (
                <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" onClick={() => setProof(p.proof)} aria-label="View proof of payment">
                  <ImageIcon className="size-4" />
                </Button>
              )}
              <span className="text-sm font-semibold tabular">{formatMoney(p.amount, trip.currency)}</span>
              <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" onClick={() => removePayment(p.id)} aria-label="Remove payment">
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
