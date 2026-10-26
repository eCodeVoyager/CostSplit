import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBackClose } from "@/hooks/useBackClose"
import { useTrip } from "@/hooks/useTripData"
import type { Transfer } from "@/lib/balance"
import { toISODate } from "@/lib/dates"
import { currencySymbol, formatMoney, minorToInput, parseAmount } from "@/lib/money"
import { addPayment, softDelete } from "@/lib/repo"
import { Chip, MemberAvatar } from "./common"
import { PhotoField } from "./PhotoField"

/** Record money handed over between two people ("Sakib paid Ehsan €25") */
export function PaymentSheet({
  open,
  onOpenChange,
  suggestion,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestion?: Transfer | null
}) {
  const { trip, members, meId, names } = useTrip()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [amountText, setAmountText] = useState("")
  const [note, setNote] = useState("")
  const [proof, setProof] = useState<string | undefined>()

  const close = () => onOpenChange(false)
  useBackClose(open, close)

  useEffect(() => {
    if (!open) return
    setFrom(suggestion?.from ?? meId ?? "")
    setTo(suggestion?.to ?? "")
    setAmountText(suggestion ? minorToInput(suggestion.amount, trip.currency) : "")
    setNote("")
    setProof(undefined)
  }, [open, suggestion, meId, trip.currency])

  const amount = parseAmount(amountText, trip.currency)
  const valid = !!amount && !!from && !!to && from !== to
  const label = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))

  const save = async () => {
    if (!valid || !amount) return
    const id = await addPayment(trip.id, {
      from,
      to,
      amount,
      date: toISODate(),
      ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}),
      ...(proof ? { proof } : {}),
    })
    navigator.vibrate?.(15)
    close()
    toast.success(`${label(from)} paid ${to === meId ? "you" : label(to)} ${formatMoney(amount, trip.currency)}`, {
      action: { label: "Undo", onClick: () => softDelete("payments", id) },
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg">Record a payment</DrawerTitle>
            <DrawerDescription>Money someone handed over to settle up.</DrawerDescription>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
            {from && to && from !== to && (
              <div className="flex items-center justify-center gap-3 rounded-2xl bg-secondary/70 py-4">
                <MemberAvatar id={from} name={names.get(from) ?? "?"} className="size-11" />
                <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                <MemberAvatar id={to} name={names.get(to) ?? "?"} className="size-11" />
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Who paid?</legend>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <Chip key={m.id} selected={from === m.id} onClick={() => setFrom(m.id)} className="pl-1">
                    <MemberAvatar id={m.id} name={m.name} className="size-7 text-[10px]" />
                    {label(m.id)}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">To whom?</legend>
              <div className="flex flex-wrap gap-2">
                {members
                  .filter((m) => m.id !== from)
                  .map((m) => (
                    <Chip key={m.id} selected={to === m.id} onClick={() => setTo(m.id)} className="pl-1">
                      <MemberAvatar id={m.id} name={m.name} className="size-7 text-[10px]" />
                      {label(m.id)}
                    </Chip>
                  ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="pay-amount">Amount ({currencySymbol(trip.currency)})</Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                placeholder="0"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                className="h-12 text-lg font-semibold tabular"
              />
              {suggestion && <p className="text-xs text-muted-foreground">Paid only part of it? Change the amount.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input id="pay-note" placeholder="e.g. bKash, cash at home" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="h-11" />
            </div>

            <div className="space-y-2">
              <PhotoField tripId={trip.id} value={proof} onChange={setProof} label="Proof of payment" />
              <p className="text-xs text-muted-foreground">Optional: a screenshot of the transfer or a photo of the cash receipt.</p>
            </div>
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            <Button size="lg" className="h-12 w-full text-base" onClick={save} disabled={!valid}>
              {amount ? `Record ${formatMoney(amount, trip.currency)}` : "Record payment"}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
