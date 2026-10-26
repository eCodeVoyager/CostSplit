import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useBackClose } from "@/hooks/useBackClose"
import { useTrip } from "@/hooks/useTripData"
import { getCategory, guessCategory, STARTER_BILLS } from "@/lib/categories"
import { currencySymbol, formatMoney, minorToInput, parseAmount } from "@/lib/money"
import { restore, saveBill, softDelete } from "@/lib/repo"
import type { Bill } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Chip, MemberAvatar, Segmented } from "./common"

type Who = "everyone" | "some" | "fixed"

/** Create or edit a monthly bill (rent, electricity, internet, maid...) */
export function BillSheet({
  open,
  onOpenChange,
  bill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bill?: Bill | null
}) {
  const { trip, members, meId } = useTrip()
  const cur = trip.currency
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("utilities")
  const [amountText, setAmountText] = useState("")
  const [variable, setVariable] = useState(false)
  const [dueDay, setDueDay] = useState(5)
  const [who, setWho] = useState<Who>("everyone")
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [fixed, setFixed] = useState<Record<string, string>>({})
  const [payer, setPayer] = useState<string>("")
  const [submitted, setSubmitted] = useState(false)

  useBackClose(open, () => onOpenChange(false))

  useEffect(() => {
    if (!open) return
    setSubmitted(false)
    setTitle(bill?.title ?? "")
    setCategory(bill?.category ?? "utilities")
    setAmountText(bill?.amount ? minorToInput(bill.amount, cur) : "")
    setVariable(bill?.variable ?? false)
    setDueDay(bill?.dueDay ?? 5)
    const keys = Object.keys(bill?.split ?? {})
    setWho(!bill || keys.length === 0 ? "everyone" : bill.splitMode === "exact" ? "fixed" : "some")
    setPicked(Object.fromEntries(members.map((m) => [m.id, keys.length === 0 || keys.includes(m.id)])))
    setFixed(
      bill?.splitMode === "exact"
        ? Object.fromEntries(Object.entries(bill.split).map(([id, v]) => [id, minorToInput(v, cur)]))
        : {}
    )
    setPayer(bill?.payer ?? "")
  }, [open, bill, members, cur])

  const amount = parseAmount(amountText, cur) ?? 0
  const fixedParsed = Object.fromEntries(
    Object.entries(fixed)
      .map(([id, t]) => [id, parseAmount(t, cur) ?? 0] as const)
      .filter(([, v]) => v > 0)
  )
  const fixedTotal = Object.values(fixedParsed).reduce((s, v) => s + v, 0)
  const pickedIds = Object.entries(picked)
    .filter(([, on]) => on)
    .map(([id]) => id)

  const errors = {
    title: !title.trim() ? "Give it a name" : null,
    amount: !variable && !amount && who !== "fixed" ? "Enter the usual amount, or turn on “Changes every month”" : null,
    who:
      who === "some" && pickedIds.length === 0
        ? "Pick at least one person"
        : who === "fixed" && fixedTotal === 0
          ? "Enter each person's amount"
          : null,
  }
  const valid = !errors.title && !errors.amount && !errors.who

  const save = async () => {
    setSubmitted(true)
    if (!valid) return
    await saveBill(
      trip.id,
      {
        title: title.trim().slice(0, 60),
        category,
        amount: who === "fixed" ? fixedTotal : amount,
        variable: who === "fixed" ? false : variable,
        dueDay,
        splitMode: who === "fixed" ? "exact" : "equal",
        split:
          who === "everyone"
            ? {}
            : who === "some"
              ? Object.fromEntries(pickedIds.map((id) => [id, 1]))
              : fixedParsed,
        ...(payer ? { payer } : {}),
        active: 1,
      },
      bill?.id
    )
    onOpenChange(false)
    toast.success(bill ? "Bill updated" : `${title.trim()} added to monthly bills`)
  }

  const remove = async () => {
    if (!bill) return
    await softDelete("bills", bill.id)
    onOpenChange(false)
    toast("Bill removed", {
      description: "Past payments stay in the history.",
      action: { label: "Undo", onClick: () => restore("bills", bill.id) },
    })
  }

  const show = (e: string | null) =>
    submitted && e ? (
      <p role="alert" className="text-sm text-destructive">
        {e}
      </p>
    ) : null

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="flex-row items-center justify-between py-2 text-left">
            <div>
              <DrawerTitle className="text-lg">{bill ? "Edit bill" : "New monthly bill"}</DrawerTitle>
              <DrawerDescription>It shows up every month until it's paid.</DrawerDescription>
            </div>
            {bill && (
              <Button variant="ghost" size="icon" className="size-11 text-destructive" onClick={remove} aria-label="Delete bill">
                <Trash2 className="size-5" />
              </Button>
            )}
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            <div className="space-y-2">
              <Label htmlFor="bill-title">What bill?</Label>
              <Input
                id="bill-title"
                placeholder="e.g. Electricity"
                value={title}
                maxLength={60}
                onChange={(e) => {
                  setTitle(e.target.value)
                  const guess = guessCategory(e.target.value)
                  if (guess) setCategory(guess)
                }}
                className="h-11"
              />
              {!bill && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {STARTER_BILLS.map((b) => (
                    <Chip
                      key={b.title}
                      selected={title === b.title}
                      onClick={() => {
                        setTitle(b.title)
                        setCategory(b.category)
                        setVariable(b.variable)
                        setDueDay(b.dueDay)
                      }}
                      className="min-h-9 px-3 text-[13px]"
                    >
                      {b.title}
                    </Chip>
                  ))}
                </div>
              )}
              {show(errors.title)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="bill-variable" className="font-normal">
                  <span className="font-medium">Changes every month</span>
                  <span className="block text-xs text-muted-foreground">Like electricity. You'll enter it when paying.</span>
                </Label>
                <Switch id="bill-variable" checked={variable} onCheckedChange={setVariable} />
              </div>
              {who !== "fixed" && (
                <div className="space-y-2">
                  <Label htmlFor="bill-amount">
                    {variable ? "Usual amount (optional)" : "Amount"} ({currencySymbol(cur)})
                  </Label>
                  <Input
                    id="bill-amount"
                    inputMode="decimal"
                    placeholder="0"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value)}
                    className="h-11 text-lg font-semibold tabular"
                  />
                  {show(errors.amount)}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bill-due">Due on day</Label>
              <select
                id="bill-due"
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
                className="h-11 w-full rounded-md border border-input bg-transparent px-3"
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d} of every month
                  </option>
                ))}
              </select>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">Who shares it</legend>
              <Segmented<Who>
                label="Who shares it"
                value={who}
                onChange={setWho}
                options={[
                  { value: "everyone", label: "Everyone" },
                  { value: "some", label: "Some" },
                  { value: "fixed", label: "Fixed amounts" },
                ]}
              />
              {who === "everyone" && (
                <p className="text-xs text-muted-foreground">
                  Split equally between everyone living there when it's paid, including new flatmates.
                </p>
              )}
              {who !== "everyone" && (
                <div className="divide-y rounded-xl border bg-card">
                  {members.map((m) =>
                    who === "some" ? (
                      <button
                        key={m.id}
                        type="button"
                        role="checkbox"
                        aria-checked={!!picked[m.id]}
                        onClick={() => setPicked({ ...picked, [m.id]: !picked[m.id] })}
                        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
                      >
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-md border-2 text-xs font-bold",
                            picked[m.id] ? "border-primary bg-primary text-primary-foreground" : "border-input"
                          )}
                        >
                          {picked[m.id] ? "✓" : ""}
                        </span>
                        <MemberAvatar id={m.id} name={m.name} className="size-8" />
                        <span className="flex-1 truncate text-sm">{m.id === meId ? "You" : m.name}</span>
                      </button>
                    ) : (
                      <label key={m.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                        <MemberAvatar id={m.id} name={m.name} className="size-8" />
                        <span className="flex-1 truncate text-sm">{m.id === meId ? "You" : m.name}</span>
                        <Input
                          inputMode="decimal"
                          placeholder="0"
                          value={fixed[m.id] ?? ""}
                          onChange={(e) => setFixed({ ...fixed, [m.id]: e.target.value })}
                          className="h-10 w-28 text-right tabular"
                          aria-label={`${m.name} pays`}
                        />
                      </label>
                    )
                  )}
                </div>
              )}
              {who === "fixed" && (
                <p className="text-xs text-muted-foreground">
                  For rent by room size. Total {formatMoney(fixedTotal, cur)}.
                </p>
              )}
              {show(errors.who)}
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Usually paid by (optional)</legend>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => (
                  <Chip key={m.id} selected={payer === m.id} onClick={() => setPayer(payer === m.id ? "" : m.id)} className="pl-1">
                    <MemberAvatar id={m.id} name={m.name} className="size-7 text-[10px]" />
                    {m.id === meId ? "You" : m.name}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted-foreground">Category: {getCategory(category).label}</p>
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            <Button size="lg" className="h-12 w-full text-base" onClick={save} disabled={submitted && !valid}>
              {bill ? "Save bill" : "Add bill"}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
