import { ArrowRight, Clock, CloudOff, Copy, Pencil, RotateCcw, Share2, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBackClose } from "@/hooks/useBackClose"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, expenseTransfers } from "@/lib/balance"
import { dayLabel } from "@/lib/dates"
import { isEdited } from "@/lib/filters"
import { formatMoney } from "@/lib/money"
import { restore, softDelete } from "@/lib/repo"
import { expenseText, shareOrCopy } from "@/lib/share"
import type { Expense, Payment } from "@/lib/types"
import { UNDO_MS } from "@/lib/utils"
import { ExpenseBreakdown } from "./breakdown"
import { MemberAvatar } from "./common"
import { PhotoThumb, PhotoViewer } from "./PhotoField"

export type DetailTarget = { kind: "expense"; expense: Expense } | { kind: "payment"; payment: Payment }

const when = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

/** Who added it and who changed it last, so nothing changes silently */
function History({ row }: { row: { createdAt: number; updatedAt: number; createdBy?: string; updatedBy?: string; dirty: 0 | 1; deleted: 0 | 1 } }) {
  const { names, meId } = useTrip()
  const who = (id?: string) => (!id ? null : id === meId ? "you" : (names.get(id) ?? "someone"))
  const added = who(row.createdBy)
  const edited = isEdited(row)
  return (
    <ul className="space-y-1 rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
      <li className="flex items-center gap-2">
        <Clock className="size-3.5 shrink-0" aria-hidden />
        Added {added ? `by ${added} ` : ""}· {when(row.createdAt)}
      </li>
      {(edited || row.deleted === 1) && (
        <li className="flex items-center gap-2">
          <Pencil className="size-3.5 shrink-0" aria-hidden />
          {row.deleted ? "Deleted" : "Last changed"} {who(row.updatedBy) ? `by ${who(row.updatedBy)} ` : ""}· {when(row.updatedAt)}
        </li>
      )}
      {row.dirty === 1 && (
        <li className="flex items-center gap-2">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          Only on this phone so far. Others see it after it syncs.
        </li>
      )}
    </ul>
  )
}

export function DetailSheet({
  open,
  onOpenChange,
  target,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target?: DetailTarget | null
}) {
  const data = useTrip()
  const { trip, names, meId, mealWeights } = data
  const { editExpense, addExpense } = useTripActions()
  const [photo, setPhoto] = useState<string | undefined>()
  const close = () => onOpenChange(false)
  useBackClose(open, close)

  // Always show the latest version (it may have synced or been edited meanwhile)
  const expense =
    target?.kind === "expense"
      ? (data.expenses.find((e) => e.id === target.expense.id) ??
        data.deletedExpenses.find((e) => e.id === target.expense.id) ??
        target.expense)
      : null
  const payment =
    target?.kind === "payment"
      ? (data.payments.find((p) => p.id === target.payment.id) ??
        data.deletedPayments.find((p) => p.id === target.payment.id) ??
        target.payment)
      : null
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))

  const then = (fn: () => void) => {
    close()
    setTimeout(fn, 220)
  }

  const removeExpense = async (e: Expense) => {
    await softDelete("expenses", e.id, meId)
    close()
    toast("Expense deleted", { duration: UNDO_MS, action: { label: "Undo", onClick: () => restore("expenses", e.id, meId) } })
  }
  const removePayment = async (p: Payment) => {
    await softDelete("payments", p.id, meId)
    close()
    toast("Payment removed", { duration: UNDO_MS, action: { label: "Undo", onClick: () => restore("payments", p.id, meId) } })
  }
  const restoreRow = async (table: "expenses" | "payments", id: string) => {
    await restore(table, id, meId)
    toast.success("Restored")
  }

  const share = async (e: Expense) => {
    const impact = expenseImpact(e, trip, mealWeights)
    const result = await shareOrCopy({ title: e.title, text: expenseText(trip, e, impact, expenseTransfers(impact), names) })
    if (result === "copied") toast.success("Copied — paste it in your group chat")
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <PhotoViewer tripId={trip.id} fileId={photo} onClose={() => setPhoto(undefined)} label="Photo" />
          <DrawerHeader className="py-2 text-left">
            <DrawerTitle className="text-lg">
              {expense ? (expense.kind === "income" ? "Money in" : expense.category === "loan" ? "Loan" : "Expense") : "Payment"}
              {(expense?.deleted || payment?.deleted) === 1 && <span className="ml-2 text-sm font-medium text-destructive"> (deleted)</span>}
            </DrawerTitle>
            <DrawerDescription className="sr-only">Full details, split and history</DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {expense && (
              <>
                {expense.deleted === 1 && (
                  <p className="rounded-xl bg-negative-soft px-3 py-2 text-xs">
                    Deleted: it no longer counts in balances or reports. Restore it if that was a mistake.
                  </p>
                )}
                <ExpenseBreakdown expense={expense} />
                {(expense.note || expense.receipt) && (
                  <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
                    {expense.receipt && <PhotoThumb tripId={trip.id} fileId={expense.receipt} onClick={() => setPhoto(expense.receipt)} />}
                    {expense.note && (
                      <p className="min-w-0 flex-1 text-sm">
                        <span className="block text-[11px] text-muted-foreground">Note</span>
                        {expense.note}
                      </p>
                    )}
                  </div>
                )}
                <History row={expense} />
              </>
            )}

            {payment && (
              <>
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/70 py-5">
                  <div className="flex items-center gap-3">
                    <MemberAvatar id={payment.from} name={names.get(payment.from) ?? "?"} className="size-11" />
                    <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                    <MemberAvatar id={payment.to} name={names.get(payment.to) ?? "?"} className="size-11" />
                  </div>
                  <p className="text-sm">
                    <strong>{who(payment.from)}</strong> paid <strong>{payment.to === meId ? "you" : who(payment.to)}</strong>
                  </p>
                  <p className="text-2xl font-bold tabular">{formatMoney(payment.amount, trip.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {dayLabel(payment.date)}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </p>
                </div>
                <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                  {who(payment.from)}'s balance went up by {formatMoney(payment.amount, trip.currency)} and{" "}
                  {payment.to === meId ? "yours" : `${who(payment.to)}'s`} went down by the same amount.
                </p>
                {payment.proof && (
                  <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                    <PhotoThumb tripId={trip.id} fileId={payment.proof} onClick={() => setPhoto(payment.proof)} />
                    <p className="text-sm">Proof of payment</p>
                  </div>
                )}
                <History row={payment} />
              </>
            )}
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            {expense && expense.deleted === 0 && (
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
                <Button size="lg" className="h-12" onClick={() => then(() => editExpense(expense))}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-12"
                  onClick={() => then(() => addExpense({ copyOf: expense }))}
                  aria-label="Add again"
                >
                  <Copy />
                </Button>
                <Button variant="outline" size="icon" className="size-12" onClick={() => share(expense)} aria-label="Share details">
                  <Share2 />
                </Button>
                <Button variant="outline" size="icon" className="size-12 text-destructive" onClick={() => removeExpense(expense)} aria-label="Delete expense">
                  <Trash2 />
                </Button>
              </div>
            )}
            {payment && payment.deleted === 0 && (
              <Button variant="outline" size="lg" className="h-12 text-destructive" onClick={() => removePayment(payment)}>
                <Trash2 /> Remove payment
              </Button>
            )}
            {(expense?.deleted === 1 || payment?.deleted === 1) && (
              <Button size="lg" className="h-12" onClick={() => restoreRow(expense ? "expenses" : "payments", (expense ?? payment)!.id)}>
                <RotateCcw /> Restore
              </Button>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
