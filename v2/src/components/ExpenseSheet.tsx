import { CalendarDays, Check, Minus, Plus, StickyNote, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useBackClose } from "@/hooks/useBackClose"
import { useTrip } from "@/hooks/useTripData"
import { monthOf } from "@/lib/balance"
import { categoriesFor, getCategory, guessCategory, quickPicksFor, type QuickPick } from "@/lib/categories"
import { addDays, toISODate } from "@/lib/dates"
import { allocate, convertToBase, currencySymbol, formatMoney, minorToInput, parseAmount } from "@/lib/money"
import { restore, saveExpense, softDelete } from "@/lib/repo"
import type { Expense, SplitMode } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Chip, MemberAvatar, Segmented } from "./common"
import { PhotoField } from "./PhotoField"

/** Starting values for a new expense (bill payment, bazar, loan, shopping list...) */
export interface ExpensePreset {
  kind?: "expense" | "income"
  title?: string
  category?: string
  /** Base currency minor units */
  amount?: number
  payer?: string
  splitMode?: SplitMode
  /** Only these people share it (default: everyone) */
  people?: string[]
  /** Per-person shares or exact minor amounts, matching `splitMode` */
  weights?: Record<string, number>
  billId?: string
  period?: string
  /** Shown under the title, e.g. "Rent · October bill" */
  context?: string
  onSaved?: (id: string) => void
}

interface FormState {
  kind: "expense" | "income"
  billId?: string
  period?: string
  splitTouched: boolean
  amountText: string
  currency: string
  rate: number
  title: string
  category: string
  categoryTouched: boolean
  multiPay: boolean
  payer: string
  payerAmounts: Record<string, string>
  splitMode: SplitMode
  included: Record<string, boolean>
  shares: Record<string, number>
  exact: Record<string, string>
  date: string
  note: string
  showNote: boolean
  receipt?: string
}

export function ExpenseSheet({
  open,
  onOpenChange,
  expense,
  preset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass to edit; omit to add */
  expense?: Expense | null
  preset?: ExpensePreset | null
}) {
  const { trip, kind, members, everyone, meId, expenses, mealWeights } = useTrip()
  // Editing an old expense still shows people who have since moved out
  const people = useMemo(
    () => (expense ? everyone.filter((m) => !m.archived || m.id in expense.paidBy || m.id in expense.split) : members),
    [expense, everyone, members]
  )
  const base = trip.currency
  const [form, setForm] = useState<FormState | null>(null)
  const [submitted, setSubmitted] = useState(false)
  // A half-typed new expense survives an accidental swipe-down
  const draftFor = useRef<string | null>(null)

  const close = () => onOpenChange(false)
  useBackClose(open, close)

  useEffect(() => {
    if (!open) return
    const key = expense ? `edit:${expense.id}` : preset ? "preset" : "new"
    if (key === "new" && draftFor.current === key && form) return
    draftFor.current = key
    setSubmitted(false)
    setForm(expense ? fromExpense(expense) : blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id, preset])

  function blank(): FormState {
    const p = preset ?? {}
    const sharing = new Set(p.weights ? Object.keys(p.weights) : (p.people ?? members.map((m) => m.id)))
    return {
      kind: p.kind ?? "expense",
      billId: p.billId,
      period: p.period,
      splitTouched: !!p.splitMode,
      amountText: p.amount ? minorToInput(p.amount, base) : "",
      currency: base,
      rate: 1,
      title: p.title ?? "",
      category: p.category ?? "other",
      categoryTouched: !!p.category,
      multiPay: false,
      payer: p.payer ?? meId ?? members[0]?.id ?? "",
      payerAmounts: {},
      splitMode: p.splitMode ?? "equal",
      included: Object.fromEntries(members.map((m) => [m.id, sharing.has(m.id)])),
      shares:
        p.splitMode === "shares" && p.weights
          ? { ...p.weights }
          : Object.fromEntries(members.map((m) => [m.id, sharing.has(m.id) ? 1 : 0])),
      exact:
        p.splitMode === "exact" && p.weights
          ? Object.fromEntries(Object.entries(p.weights).map(([id, v]) => [id, minorToInput(v, base)]))
          : {},
      date: toISODate(),
      note: "",
      showNote: false,
    }
  }

  function fromExpense(e: Expense): FormState {
    const payers = Object.keys(e.paidBy)
    const toText = (rec: Record<string, number>) =>
      Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, minorToInput(v, e.currency)]))
    return {
      kind: e.kind ?? "expense",
      splitTouched: true,
      amountText: minorToInput(e.amount, e.currency),
      currency: e.currency,
      rate: e.rate,
      title: e.title,
      category: e.category,
      categoryTouched: true,
      multiPay: payers.length > 1,
      payer: payers[0] ?? meId ?? "",
      payerAmounts: toText(e.paidBy),
      splitMode: e.splitMode,
      included: Object.fromEntries(Object.keys(e.split).map((id) => [id, true])),
      shares:
        e.splitMode === "shares" ? { ...e.split } : Object.fromEntries(people.map((m) => [m.id, e.split[m.id] ? 1 : 0])),
      exact: e.splitMode === "exact" ? toText(e.split) : {},
      date: e.date,
      note: e.note ?? "",
      showNote: !!e.note,
      receipt: e.receipt,
    }
  }

  const picks = useMemo(() => {
    const seen = new Set<string>()
    const list: QuickPick[] = []
    for (const e of expenses) {
      const k = e.title.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      list.push({ title: e.title.trim(), category: e.category })
      if (list.length >= 4) break
    }
    for (const p of quickPicksFor(kind)) {
      if (list.length >= 8) break
      if (!seen.has(p.title.toLowerCase())) list.push(p)
    }
    return list
  }, [expenses, kind])

  if (!form) return null

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const cur = form.currency
  const amount = parseAmount(form.amountText, cur)
  const currencyOptions = [base, ...Object.keys(trip.rates ?? {}).filter((c) => c !== base)]

  // Who paid
  let paidBy: Record<string, number> = {}
  let payLeft = 0
  if (form.multiPay) {
    for (const [id, text] of Object.entries(form.payerAmounts)) {
      const v = parseAmount(text, cur)
      if (v) paidBy[id] = v
    }
    payLeft = (amount ?? 0) - Object.values(paidBy).reduce((s, v) => s + v, 0)
  } else if (form.payer) {
    paidBy = { [form.payer]: amount ?? 0 }
  }

  // How it's split
  let split: Record<string, number> = {}
  let splitLeft = 0
  if (form.splitMode === "equal" || form.splitMode === "meals") {
    split = Object.fromEntries(Object.entries(form.included).filter(([, on]) => on).map(([id]) => [id, 1]))
  } else if (form.splitMode === "shares") {
    split = Object.fromEntries(Object.entries(form.shares).filter(([, n]) => n > 0))
  } else {
    for (const [id, text] of Object.entries(form.exact)) {
      const v = parseAmount(text, cur)
      if (v) split[id] = v
    }
    splitLeft = (amount ?? 0) - Object.values(split).reduce((s, v) => s + v, 0)
  }
  // Meals: weight by meals eaten this month (falls back to equal until counted)
  const monthMeals = mealWeights.get(monthOf(form.date)) ?? {}
  const eaten = Object.fromEntries(Object.entries(monthMeals).filter(([id, n]) => n > 0 && split[id]))
  const mealsCounted = Object.keys(eaten).length > 0
  const preview = amount ? allocate(amount, form.splitMode === "meals" && mealsCounted ? eaten : split) : {}
  const income = form.kind === "income"

  const errors = {
    amount: !amount ? "Enter an amount" : null,
    paid: form.multiPay
      ? payLeft !== 0 && amount
        ? payLeft > 0
          ? `${formatMoney(payLeft, cur)} still unassigned`
          : `${formatMoney(-payLeft, cur)} too much`
        : Object.keys(paidBy).length === 0
          ? "Enter who paid how much"
          : null
      : !form.payer
        ? "Choose who paid"
        : null,
    split:
      Object.keys(split).length === 0
        ? "Pick at least one person"
        : form.splitMode === "exact" && splitLeft !== 0 && amount
          ? splitLeft > 0
            ? `${formatMoney(splitLeft, cur)} left to split`
            : `${formatMoney(-splitLeft, cur)} over the total`
          : null,
  }
  const valid = !errors.amount && !errors.paid && !errors.split

  // In a mess, bazar defaults to splitting by meals
  const withCategory = (category: string): Partial<FormState> =>
    trip.mealMode && !form.splitTouched
      ? { category, splitMode: category === "groceries" ? "meals" : "equal" }
      : { category }

  const onTitle = (title: string) => {
    const guess = form.categoryTouched ? null : guessCategory(title)
    set({ title, ...(guess ? withCategory(guess) : {}) })
  }

  const cycleCurrency = () => {
    const next = currencyOptions[(currencyOptions.indexOf(cur) + 1) % currencyOptions.length]
    set({ currency: next, rate: next === base ? 1 : (trip.rates[next] ?? 1) })
  }

  const setSplitMode = (mode: SplitMode) => {
    if (mode === "exact" && amount && Object.keys(form.exact).length === 0) {
      // Start from an even split so people only adjust what differs
      const even = allocate(amount, split)
      set({
        splitMode: mode,
        splitTouched: true,
        exact: Object.fromEntries(Object.entries(even).map(([id, v]) => [id, minorToInput(v, cur)])),
      })
    } else {
      set({ splitMode: mode, splitTouched: true })
    }
  }

  const toggleMultiPay = () => {
    if (!form.multiPay && amount && form.payer) {
      set({ multiPay: true, payerAmounts: { [form.payer]: minorToInput(amount, cur) } })
    } else {
      set({ multiPay: !form.multiPay })
    }
  }

  const save = async () => {
    setSubmitted(true)
    if (!valid || !amount) return
    const id = await saveExpense(
      trip.id,
      {
        ...(income ? { kind: "income" as const } : {}),
        ...(form.billId ? { billId: form.billId, period: form.period } : {}),
        title: form.title.trim() || getCategory(form.category).label,
        category: form.category,
        amount,
        currency: cur,
        rate: cur === base ? 1 : form.rate,
        date: form.date,
        paidBy,
        splitMode: form.splitMode,
        split,
        ...(form.note.trim() ? { note: form.note.trim().slice(0, 500) } : {}),
        // Always written so removing a photo while editing clears it
        receipt: form.receipt,
      },
      expense?.id
    )
    navigator.vibrate?.(15)
    draftFor.current = null
    close()
    preset?.onSaved?.(id)
    if (!expense) {
      toast.success(`Added ${income ? "money in " : ""}${formatMoney(amount, cur)}`, {
        action: { label: "Undo", onClick: () => softDelete("expenses", id) },
      })
    }
  }

  const remove = async () => {
    if (!expense) return
    await softDelete("expenses", expense.id)
    draftFor.current = null
    close()
    toast("Expense deleted", { action: { label: "Undo", onClick: () => restore("expenses", expense.id) } })
  }

  const showErrors = submitted || form.amountText !== ""

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="flex-row items-center justify-between py-2 text-left">
            <div>
              <DrawerTitle className="text-lg">
                {income ? (expense ? "Edit money in" : "Money in") : expense ? "Edit expense" : "New expense"}
              </DrawerTitle>
              <DrawerDescription className={preset?.context && !expense ? "text-sm" : "sr-only"}>
                {(!expense && preset?.context) || "Amount, who paid and how to split it"}
              </DrawerDescription>
            </div>
            {expense && (
              <Button variant="ghost" size="icon" className="size-11 text-destructive" onClick={remove} aria-label="Delete expense">
                <Trash2 className="size-5" />
              </Button>
            )}
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            {/* Amount first: it's the one thing every expense needs */}
            <div className="rounded-2xl bg-secondary/70 px-4 py-5">
              <div className="flex items-center justify-center gap-2">
                {currencyOptions.length > 1 ? (
                  <button
                    type="button"
                    onClick={cycleCurrency}
                    className="min-h-11 min-w-11 rounded-xl bg-card px-2 text-2xl font-semibold shadow-sm"
                    aria-label={`Currency ${cur}, tap to change`}
                  >
                    {currencySymbol(cur)}
                  </button>
                ) : (
                  <span className="text-3xl font-semibold text-muted-foreground">{currencySymbol(cur)}</span>
                )}
                <label htmlFor="amount" className="sr-only">
                  Amount
                </label>
                <input
                  id="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus={!expense}
                  placeholder="0"
                  value={form.amountText}
                  onChange={(e) => set({ amountText: e.target.value })}
                  className="w-full min-w-0 bg-transparent text-center text-5xl font-semibold tabular outline-none placeholder:text-muted-foreground/50"
                  style={{ maxWidth: `${Math.max(3, form.amountText.length + 1)}ch` }}
                />
              </div>
              {cur !== base && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {amount ? `≈ ${formatMoney(convertToBase(amount, cur, form.rate, base), base)} · ` : ""}1 {base} ={" "}
                  {form.rate} {cur}
                </p>
              )}
              {showErrors && errors.amount && submitted && (
                <p role="alert" className="mt-2 text-center text-sm text-destructive">
                  {errors.amount}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">What for?</Label>
              <Input
                id="title"
                placeholder={income ? "e.g. Sold old newspapers" : kind === "home" ? "e.g. Bazar, gas cylinder" : "e.g. Gyros at the port"}
                value={form.title}
                maxLength={80}
                enterKeyHint="done"
                onChange={(e) => onTitle(e.target.value)}
                className="h-11"
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {picks.map((p) => {
                  const Icon = getCategory(p.category).icon
                  return (
                    <Chip
                      key={p.title}
                      selected={form.title === p.title}
                      onClick={() => set({ title: p.title, ...withCategory(p.category), categoryTouched: true })}
                      className="min-h-9 px-3 text-[13px]"
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {p.title}
                    </Chip>
                  )
                })}
              </div>
            </div>

            <fieldset className="space-y-2">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium">{income ? "Received by" : "Paid by"}</legend>
                <button type="button" onClick={toggleMultiPay} className="min-h-9 px-1 text-sm font-medium text-primary">
                  {form.multiPay ? "One person" : "Several people"}
                </button>
              </div>
              {!form.multiPay ? (
                <div className="flex flex-wrap gap-2">
                  {people.map((m) => (
                    <Chip key={m.id} selected={form.payer === m.id} onClick={() => set({ payer: m.id })} className="pl-1">
                      <MemberAvatar id={m.id} name={m.name} className="size-7 text-[10px]" />
                      {m.id === meId ? "You" : m.name}
                    </Chip>
                  ))}
                </div>
              ) : (
                <div className="divide-y rounded-xl border bg-card">
                  {people.map((m) => (
                    <label key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <MemberAvatar id={m.id} name={m.name} className="size-8" />
                      <span className="flex-1 truncate text-sm">{m.id === meId ? "You" : m.name}</span>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        value={form.payerAmounts[m.id] ?? ""}
                        onChange={(e) => set({ payerAmounts: { ...form.payerAmounts, [m.id]: e.target.value } })}
                        className="h-10 w-28 text-right tabular"
                        aria-label={`${m.name} paid`}
                      />
                    </label>
                  ))}
                </div>
              )}
              {showErrors && errors.paid && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.paid}
                </p>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">{income ? "Belongs to" : "Split"}</legend>
              <Segmented
                label="Split mode"
                value={form.splitMode}
                onChange={setSplitMode}
                options={[
                  { value: "equal", label: trip.mealMode ? "Equal" : "Equally" },
                  { value: "shares", label: trip.mealMode ? "Shares" : "By shares" },
                  { value: "exact", label: "Amounts" },
                  ...(trip.mealMode || form.splitMode === "meals" ? [{ value: "meals" as const, label: "Meals" }] : []),
                ]}
              />
              <div className="divide-y rounded-xl border bg-card">
                {people.map((m) => {
                  const share = preview[m.id] ?? 0
                  const name = m.id === meId ? "You" : m.name
                  if (form.splitMode === "equal" || form.splitMode === "meals") {
                    const on = !!form.included[m.id]
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => set({ included: { ...form.included, [m.id]: !on } })}
                        className="flex min-h-13 w-full items-center gap-3 px-3 py-2 text-left"
                      >
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-md border-2 transition-colors",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                          )}
                        >
                          {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                        </span>
                        <MemberAvatar id={m.id} name={m.name} className="size-8" />
                        <span className={cn("flex-1 truncate text-sm", !on && "text-muted-foreground")}>{name}</span>
                        <span className="text-right text-sm tabular text-muted-foreground">
                          {form.splitMode === "meals" && on && mealsCounted && (
                            <span className="block text-[11px]">{monthMeals[m.id] ?? 0} meals</span>
                          )}
                          {on && amount ? formatMoney(share, cur) : ""}
                        </span>
                      </button>
                    )
                  }
                  if (form.splitMode === "shares") {
                    const n = form.shares[m.id] ?? 0
                    const setN = (v: number) => set({ shares: { ...form.shares, [m.id]: Math.max(0, Math.min(20, v)) } })
                    return (
                      <div key={m.id} className="flex min-h-13 items-center gap-3 px-3 py-2">
                        <MemberAvatar id={m.id} name={m.name} className="size-8" />
                        <div className="min-w-0 flex-1">
                          <div className={cn("truncate text-sm", n === 0 && "text-muted-foreground")}>{name}</div>
                          {amount && n > 0 ? <div className="text-xs tabular text-muted-foreground">{formatMoney(share, cur)}</div> : null}
                        </div>
                        <Button variant="outline" size="icon" className="size-10" onClick={() => setN(n - 1)} aria-label={`Fewer shares for ${m.name}`}>
                          <Minus />
                        </Button>
                        <span className="w-6 text-center font-semibold tabular" aria-live="polite">
                          {n}
                        </span>
                        <Button variant="outline" size="icon" className="size-10" onClick={() => setN(n + 1)} aria-label={`More shares for ${m.name}`}>
                          <Plus />
                        </Button>
                      </div>
                    )
                  }
                  return (
                    <label key={m.id} className="flex min-h-13 items-center gap-3 px-3 py-2">
                      <MemberAvatar id={m.id} name={m.name} className="size-8" />
                      <span className="flex-1 truncate text-sm">{name}</span>
                      <Input
                        inputMode="decimal"
                        placeholder="0"
                        value={form.exact[m.id] ?? ""}
                        onChange={(e) => set({ exact: { ...form.exact, [m.id]: e.target.value } })}
                        className="h-10 w-28 text-right tabular"
                        aria-label={`${m.name} owes`}
                      />
                    </label>
                  )
                })}
              </div>
              {form.splitMode === "meals" && (
                <p className="text-xs text-muted-foreground">
                  {mealsCounted
                    ? "Split by meals eaten this month. Shares update as meals are counted."
                    : "No meals counted this month yet, so it's split equally for now."}
                </p>
              )}
              {(form.splitMode === "equal" || form.splitMode === "meals") && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {Object.keys(split).length} {Object.keys(split).length === 1 ? "person" : "people"}
                  </span>
                  <button
                    type="button"
                    className="min-h-9 px-1 font-medium text-primary"
                    onClick={() => {
                      const all = Object.keys(split).length === people.length
                      set({ included: Object.fromEntries(people.map((m) => [m.id, !all])) })
                    }}
                  >
                    {Object.keys(split).length === people.length ? "Select none" : "Select all"}
                  </button>
                </div>
              )}
              {form.splitMode === "shares" && (
                <p className="text-xs text-muted-foreground">Tip: give a couple 2 shares, skip someone with 0.</p>
              )}
              {showErrors && errors.split && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.split}
                </p>
              )}
            </fieldset>

            <div className="space-y-2">
              <span className="text-sm font-medium">Category</span>
              <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4" role="radiogroup" aria-label="Category">
                {[
                  ...categoriesFor(kind),
                  ...(categoriesFor(kind).some((c) => c.id === form.category) ? [] : [getCategory(form.category)]),
                ].map((c) => {
                  const selected = form.category === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => set({ ...withCategory(c.id), categoryTouched: true })}
                      className="flex min-w-16 flex-col items-center gap-1 rounded-xl py-1"
                    >
                      <span
                        className={cn(
                          "inline-flex size-11 items-center justify-center rounded-xl transition-colors",
                          selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                        )}
                      >
                        <c.icon className="size-5" aria-hidden />
                      </span>
                      <span className={cn("text-[11px]", selected ? "font-semibold" : "text-muted-foreground")}>{c.short}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip selected={form.date === toISODate()} onClick={() => set({ date: toISODate() })}>
                  Today
                </Chip>
                <Chip selected={form.date === addDays(toISODate(), -1)} onClick={() => set({ date: addDays(toISODate(), -1) })}>
                  Yesterday
                </Chip>
                <label className="relative inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-medium">
                  <CalendarDays className="size-4" aria-hidden />
                  <span>{form.date}</span>
                  <input
                    type="date"
                    value={form.date}
                    max={addDays(toISODate(), 1)}
                    onChange={(e) => e.target.value && set({ date: e.target.value })}
                    className="absolute inset-0 opacity-0"
                    aria-label="Pick a date"
                  />
                </label>
                {!form.showNote && (
                  <Chip onClick={() => set({ showNote: true })}>
                    <StickyNote className="size-4" aria-hidden />
                    Note
                  </Chip>
                )}
              </div>
              <PhotoField
                tripId={trip.id}
                value={form.receipt}
                onChange={(receipt) => set({ receipt })}
                label={income ? "Photo (optional)" : "Receipt photo"}
              />
              {form.showNote && (
                <Textarea
                  placeholder="Anything to remember (optional)"
                  value={form.note}
                  maxLength={500}
                  onChange={(e) => set({ note: e.target.value })}
                  aria-label="Note"
                />
              )}
            </div>
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            <Button size="lg" className="h-12 w-full text-base" onClick={save} disabled={submitted && !valid}>
              {expense
                ? "Save changes"
                : amount
                  ? `Add ${income ? "money in " : ""}${formatMoney(amount, cur)}`
                  : income
                    ? "Add money in"
                    : "Add expense"}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
