import { CalendarDays, Check, History, Minus, Plus, StickyNote, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { cn, UNDO_MS } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useBackClose } from "@/hooks/useBackClose"
import { useTrip } from "@/hooks/useTripData"
import { expenseImpact, expenseTransfers, monthOf } from "@/lib/balance"
import { categoriesFor, getCategory, guessCategory, quickPicksFor, type QuickPick } from "@/lib/categories"
import { addDays, dayLabel, toISODate } from "@/lib/dates"
import { allocate, convertToBase, currencySymbol, formatMoney, minorToInput, parseAmount } from "@/lib/money"
import { autoFill, parseTyped, typedFromSaved } from "@/lib/autofill"
import { removeItems, restore, saveExpense, savePersonal, softDelete } from "@/lib/repo"
import { expenseWarnings, usePrefs } from "@/lib/review"
import type { Expense, SplitMode } from "@/lib/types"
import { BreakdownSection, ExpenseBreakdown, WarningList, WhoOwesWhom } from "./breakdown"
import { Chip, MemberAvatar, Segmented } from "./common"
import { PhotoField } from "./PhotoField"
import { ChangeList, ReviewDialog } from "./ReviewDialog"

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
  /** Start from an existing expense ("Add again"): same everything, dated today */
  copyOf?: Expense
  /** What was bought (from the to-buy list) */
  items?: string[]
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
  /** Several payers: who paid */
  payers: Record<string, boolean>
  /** Only what was typed; blank boxes are filled in by the app */
  payerAmounts: Record<string, string>
  splitMode: SplitMode
  included: Record<string, boolean>
  shares: Record<string, number>
  /** Only what was typed; blank boxes are filled in by the app */
  exact: Record<string, string>
  /** To-buy list items bought with this */
  fromList: string[]
  itemsText: string
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
  const { trip, kind, members, everyone, meId, expenses, mealWeights, names, items: shopItems } = useTrip()
  const prefs = usePrefs()
  const [reviewing, setReviewing] = useState(false)
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
    setReviewing(false)
    setForm(expense ? fromExpense(expense) : preset?.copyOf ? copied(preset.copyOf) : blank())
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
      payers: {},
      payerAmounts: {},
      splitMode: p.splitMode ?? "equal",
      included: Object.fromEntries(members.map((m) => [m.id, sharing.has(m.id)])),
      shares:
        p.splitMode === "shares" && p.weights
          ? { ...p.weights }
          : Object.fromEntries(members.map((m) => [m.id, sharing.has(m.id) ? 1 : 0])),
      exact: p.splitMode === "exact" && p.weights ? typedFromSaved(p.amount ?? 0, p.weights, base) : {},
      fromList: [],
      itemsText: (p.items ?? []).join(", "),
      date: toISODate(),
      note: "",
      showNote: false,
    }
  }

  /** Same people and split as an earlier expense, as a new one dated today */
  function copied(e: Expense): FormState {
    const active = new Set(members.map((m) => m.id))
    const keep = (rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).filter(([id]) => active.has(id)))
    const f = fromExpense({ ...e, paidBy: keep(e.paidBy), split: keep(e.split) })
    return { ...f, date: toISODate(), receipt: undefined, note: "", showNote: false }
  }

  function fromExpense(e: Expense): FormState {
    const payers = Object.keys(e.paidBy)
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
      payers: Object.fromEntries(payers.map((id) => [id, true])),
      payerAmounts: payers.length > 1 ? typedFromSaved(e.amount, e.paidBy, e.currency) : {},
      splitMode: e.splitMode,
      included: Object.fromEntries(Object.keys(e.split).map((id) => [id, true])),
      shares:
        e.splitMode === "shares" ? { ...e.split } : Object.fromEntries(people.map((m) => [m.id, e.split[m.id] ? 1 : 0])),
      exact: e.splitMode === "exact" ? typedFromSaved(e.amount, e.split, e.currency) : {},
      fromList: [],
      itemsText: (e.items ?? []).join(", "),
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

  // Who paid. Several payers: typed amounts stay, blank ones share what's left
  let paidBy: Record<string, number> = {}
  let payLeft = 0
  const payerIds = people.filter((m) => form.payers[m.id]).map((m) => m.id)
  const payFill = autoFill(
    amount ?? 0,
    payerIds,
    Object.fromEntries(payerIds.map((id) => [id, parseTyped(form.payerAmounts[id], cur)]))
  )
  if (form.multiPay) {
    paidBy = Object.fromEntries(Object.entries(payFill.amounts).filter(([, v]) => v > 0))
    payLeft = amount ? payFill.left : 0
  } else if (form.payer) {
    paidBy = { [form.payer]: amount ?? 0 }
  }

  // How it's split. Amounts: typed amounts stay, blank ones share what's left equally
  let split: Record<string, number> = {}
  let splitLeft = 0
  const sharerIds = people.filter((m) => form.included[m.id]).map((m) => m.id)
  const exactFill = autoFill(
    amount ?? 0,
    sharerIds,
    Object.fromEntries(sharerIds.map((id) => [id, parseTyped(form.exact[id], cur)]))
  )
  if (form.splitMode === "equal" || form.splitMode === "meals") {
    split = Object.fromEntries(sharerIds.map((id) => [id, 1]))
  } else if (form.splitMode === "shares") {
    split = Object.fromEntries(Object.entries(form.shares).filter(([, n]) => n > 0))
  } else {
    split = Object.fromEntries(Object.entries(exactFill.amounts).filter(([, v]) => v > 0))
    splitLeft = amount ? exactFill.left : 0
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
      ? payerIds.length === 0
        ? "Tick who paid"
        : payLeft !== 0 && amount
          ? payLeft > 0
            ? `${formatMoney(payLeft, cur)} still unassigned`
            : `${formatMoney(-payLeft, cur)} more than the total`
          : Object.keys(paidBy).length === 0 && amount
            ? "Enter who paid how much"
            : null
      : !form.payer
        ? "Choose who paid"
        : null,
    split:
      Object.keys(split).length === 0
        ? form.splitMode === "exact" && sharerIds.length > 0 && !amount
          ? null
          : "Pick at least one person"
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

  // Amounts start as an even split of whoever shares it (all blank = all filled in)
  const setSplitMode = (mode: SplitMode) => set({ splitMode: mode, splitTouched: true })

  const toggleMultiPay = () => {
    if (!form.multiPay) {
      set({ multiPay: true, payers: form.payer ? { [form.payer]: true } : {}, payerAmounts: {} })
    } else {
      set({ multiPay: false, payer: payerIds[0] ?? form.payer })
    }
  }

  const togglePayer = (id: string) => {
    const on = !form.payers[id]
    const { [id]: _drop, ...rest } = form.payerAmounts
    set({ payers: { ...form.payers, [id]: on }, payerAmounts: on ? form.payerAmounts : rest })
  }

  const toggleSharer = (id: string) => {
    const on = !form.included[id]
    const { [id]: _drop, ...rest } = form.exact
    set({ included: { ...form.included, [id]: on }, exact: on ? form.exact : rest })
  }

  // Same title as before: offer that expense's split ("Internet" is always the same 3 people)
  const titleKey = form.title.trim().toLowerCase()
  const last =
    !expense && !preset?.copyOf && !form.billId && titleKey
      ? expenses.find((e) => (e.kind ?? "expense") === form.kind && e.title.trim().toLowerCase() === titleKey)
      : undefined
  const lastIds = last ? Object.keys(last.split).filter((id) => members.some((m) => m.id === id)) : []
  const sameAsLast =
    !!last &&
    last.splitMode === form.splitMode &&
    lastIds.length === Object.keys(split).length &&
    lastIds.every((id) => id in split) &&
    (last.splitMode !== "shares" || lastIds.every((id) => last.split[id] === split[id]))
  const suggestLast = last && lastIds.length > 0 && !sameAsLast ? last : null
  const applyLast = () => {
    if (!suggestLast) return
    const ids = new Set(lastIds)
    const mode = suggestLast.splitMode === "meals" && !trip.mealMode ? "equal" : suggestLast.splitMode
    const kept = Object.fromEntries(lastIds.map((id) => [id, suggestLast.split[id]]))
    set({
      splitMode: mode,
      splitTouched: true,
      included: Object.fromEntries(people.map((m) => [m.id, ids.has(m.id)])),
      shares: mode === "shares" ? Object.fromEntries(people.map((m) => [m.id, kept[m.id] ?? 0])) : form.shares,
      exact: mode === "exact" && amount === suggestLast.amount ? typedFromSaved(suggestLast.amount, kept, cur) : {},
    })
  }

  // Bazar items: ticked from the to-buy list, plus anything typed
  const openItems = shopItems.filter((i) => !i.done)
  const pickedItems = shopItems.filter((i) => form.fromList.includes(i.id))
  const itemNames = [
    ...new Set(
      [...pickedItems.map((i) => i.name), ...form.itemsText.split(/[,\n]/)].map((n) => n.trim().slice(0, 60)).filter(Boolean)
    ),
  ].slice(0, 40)
  const showItems =
    !income && (["groceries", "household"].includes(form.category) || itemNames.length > 0 || form.fromList.length > 0)

  const input = {
    ...(income ? { kind: "income" as const } : {}),
    ...(form.billId ? { billId: form.billId, period: form.period } : {}),
    title: form.title.trim() || getCategory(form.category).label,
    category: form.category,
    amount: amount ?? 0,
    currency: cur,
    rate: cur === base ? 1 : form.rate,
    date: form.date,
    paidBy,
    splitMode: form.splitMode,
    split,
    // Always written so clearing the note, items or photo while editing removes them
    note: form.note.trim() ? form.note.trim().slice(0, 500) : undefined,
    items: itemNames.length ? itemNames : undefined,
    receipt: form.receipt,
  }
  // The expense exactly as it would be saved, for the live "who owes whom" and the confirm step
  const draft: Expense = {
    ...(expense ?? { id: "draft", tripId: trip.id, createdAt: 0, updatedAt: 0, deleted: 0, dirty: 0 }),
    ...input,
  }
  if (!income) delete draft.kind
  const liveTransfers = valid && amount ? expenseTransfers(expenseImpact(draft, trip, mealWeights)) : []

  const save = () => {
    setSubmitted(true)
    if (!valid || !amount) return
    if (prefs.review) setReviewing(true)
    else commit()
  }

  const commit = async () => {
    if (!valid || !amount) return
    setReviewing(false)
    const id = await saveExpense(trip.id, input, expense?.id, meId)
    // Bought now, so off the to-buy list
    if (pickedItems.length) await removeItems(pickedItems.map((i) => i.id))
    navigator.vibrate?.(15)
    draftFor.current = null
    close()
    preset?.onSaved?.(id)
    if (!expense) {
      toast.success(`Added ${income ? "money in " : ""}${formatMoney(amount, cur)}`, {
        duration: UNDO_MS, action: { label: "Undo", onClick: () => softDelete("expenses", id) },
      })
    }
  }

  /** Only I paid and only I share it: it belongs in Personal, not the group */
  const saveAsPersonal = async () => {
    if (!amount) return
    setReviewing(false)
    const id = await savePersonal(trip.id, {
      title: input.title,
      category: input.category,
      amount,
      currency: cur,
      rate: input.rate,
      date: form.date,
      ...(input.note ? { note: input.note } : {}),
    })
    draftFor.current = null
    close()
    toast.success(`Saved to Personal: ${formatMoney(amount, cur)}`, {
      description: "Only you can see it. It doesn't change group balances.",
      duration: UNDO_MS,
      action: { label: "Undo", onClick: () => softDelete("personal", id) },
    })
  }

  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const changes = expense ? describeChanges(expense, draft, who) : []
  const warnings = reviewing && amount ? expenseWarnings({ ...input, id: expense?.id, kind: form.kind }, expenses, trip, toISODate()) : []

  /** "Rest" button: give the unassigned amount to this person */
  const addRest = (field: "payerAmounts" | "exact", id: string, left: number, current: number) => {
    set({ [field]: { ...form[field], [id]: minorToInput(current + left, cur) } } as Partial<FormState>)
  }

  const remove = async () => {
    if (!expense) return
    await softDelete("expenses", expense.id, meId)
    draftFor.current = null
    close()
    toast("Expense deleted", { duration: UNDO_MS, action: { label: "Undo", onClick: () => restore("expenses", expense.id, meId) } })
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

            {showItems && (
              <div className="space-y-2">
                <Label htmlFor="items">
                  Items bought <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                {openItems.length > 0 && !expense && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">From the to-buy list: tap what you bought, it comes off the list.</p>
                    <div className="flex flex-wrap gap-2">
                      {openItems.map((i) => {
                        const on = form.fromList.includes(i.id)
                        return (
                          <Chip
                            key={i.id}
                            selected={on}
                            onClick={() => set({ fromList: on ? form.fromList.filter((x) => x !== i.id) : [...form.fromList, i.id] })}
                            className="min-h-9 px-3 text-[13px]"
                          >
                            {on && <Check className="size-3.5" aria-hidden />}
                            {i.name}
                            {i.assignee && i.assignee !== meId && <span className="opacity-70">· {names.get(i.assignee)}</span>}
                          </Chip>
                        )
                      })}
                    </div>
                  </div>
                )}
                <Input
                  id="items"
                  placeholder="rice 5kg, oil, soap"
                  value={form.itemsText}
                  maxLength={600}
                  onChange={(e) => set({ itemsText: e.target.value })}
                  className="h-11"
                />
              </div>
            )}

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
                <>
                  <div className="divide-y rounded-xl border bg-card">
                    {people.map((m) => {
                      const on = !!form.payers[m.id]
                      return (
                        <div key={m.id} className="flex min-h-13 items-center gap-2 px-3 py-2">
                          <PersonToggle on={on} onClick={() => togglePayer(m.id)} id={m.id} name={m.name} label={m.id === meId ? "You" : m.name} />
                          {on && payLeft > 0 && !!amount && (
                            <RestButton
                              onClick={() => addRest("payerAmounts", m.id, payLeft, payFill.amounts[m.id] ?? 0)}
                              label={`${m.name} paid the rest`}
                            />
                          )}
                          {on && (
                            <AmountBox
                              text={form.payerAmounts[m.id] ?? ""}
                              auto={payFill.auto.has(m.id)}
                              value={payFill.amounts[m.id] ?? 0}
                              currency={cur}
                              onChange={(text) => set({ payerAmounts: { ...form.payerAmounts, [m.id]: text } })}
                              label={`${m.name} paid`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <AutoHint
                    typed={payerIds.some((id) => !payFill.auto.has(id))}
                    onReset={() => set({ payerAmounts: {} })}
                    text="Tick who paid. Type what someone paid and the others' share of the rest fills in by itself."
                  />
                </>
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
              {suggestLast && (
                <button
                  type="button"
                  onClick={applyLast}
                  className="flex w-full items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-accent/40 px-3 py-2 text-left active:bg-accent"
                >
                  <History className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block font-medium">Split like last “{suggestLast.title}”?</span>
                    <span className="block truncate text-muted-foreground">
                      {MODE_LABEL[suggestLast.splitMode]} · {lastIds.map(who).join(", ")}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-primary">Use</span>
                </button>
              )}
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
                  const on = !!form.included[m.id]
                  return (
                    <div key={m.id} className="flex min-h-13 items-center gap-2 px-3 py-2">
                      <PersonToggle on={on} onClick={() => toggleSharer(m.id)} id={m.id} name={m.name} label={name} />
                      {on && splitLeft > 0 && !!amount && (
                        <RestButton
                          onClick={() => addRest("exact", m.id, splitLeft, exactFill.amounts[m.id] ?? 0)}
                          label={`${m.name} owes the rest`}
                        />
                      )}
                      {on && (
                        <AmountBox
                          text={form.exact[m.id] ?? ""}
                          auto={exactFill.auto.has(m.id)}
                          value={exactFill.amounts[m.id] ?? 0}
                          currency={cur}
                          onChange={(text) => set({ exact: { ...form.exact, [m.id]: text } })}
                          label={`${m.name} owes`}
                        />
                      )}
                    </div>
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
                <p className="text-xs text-muted-foreground">Someone uses twice as much? Give them 2 shares. 0 leaves them out.</p>
              )}
              {form.splitMode === "exact" && (
                <>
                  {amount ? (
                    <p className={cn("text-sm", splitLeft === 0 ? "text-muted-foreground" : "font-medium text-destructive")}>
                      {splitLeft === 0
                        ? `Adds up to ${formatMoney(amount, cur)}`
                        : splitLeft > 0
                          ? `${formatMoney(splitLeft, cur)} left · tap Rest on someone`
                          : `${formatMoney(-splitLeft, cur)} over the total`}
                    </p>
                  ) : null}
                  <AutoHint
                    typed={sharerIds.some((id) => !exactFill.auto.has(id))}
                    onReset={() => set({ exact: {} })}
                    text="Type anyone's amount and the others share what's left equally. Untick people who aren't in it."
                  />
                </>
              )}
              {showErrors && errors.split && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.split}
                </p>
              )}
            </fieldset>

            {liveTransfers.length > 0 && (
              <BreakdownSection title="Who owes whom" aside={liveTransfers.length > 1 ? `${liveTransfers.length} payments` : undefined}>
                <WhoOwesWhom transfers={liveTransfers} />
              </BreakdownSection>
            )}

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

          <ReviewDialog
            open={reviewing}
            title={expense ? "Save these changes?" : income ? "Add this money in?" : form.category === "loan" ? "Add this loan?" : "Add this expense?"}
            confirmLabel={expense ? "Save" : `Add ${amount ? formatMoney(amount, cur) : ""}`}
            onConfirm={commit}
            onCancel={() => setReviewing(false)}
          >
            {expense && <ChangeList changes={changes} />}
            <WarningList
              warnings={warnings}
              action={(w) =>
                w.kind === "self-only" && w.id === meId && !expense && !form.billId ? (
                  <button type="button" onClick={saveAsPersonal} className="mt-1 min-h-8 font-semibold text-primary underline-offset-2 hover:underline">
                    Save as personal instead
                  </button>
                ) : null
              }
            />
            <ExpenseBreakdown expense={draft} />
            {input.note && (
              <p className="rounded-xl border bg-card px-3 py-2 text-sm">
                <span className="block text-[11px] text-muted-foreground">Note</span>
                {input.note}
              </p>
            )}
          </ReviewDialog>

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

function RestButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Inside a <label>: don't also focus the input
        e.preventDefault()
        onClick()
      }}
      className="min-h-9 shrink-0 rounded-full border border-dashed border-primary/50 px-2.5 text-xs font-medium text-primary active:bg-accent"
      aria-label={label}
    >
      Rest
    </button>
  )
}

/** Tick box + avatar + name, used to pick payers and sharers */
function PersonToggle({ on, onClick, id, name, label }: { on: boolean; onClick: () => void; id: string; name: string; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
          on ? "border-primary bg-primary text-primary-foreground" : "border-input"
        )}
      >
        {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
      </span>
      <MemberAvatar id={id} name={name} className="size-8" />
      <span className={cn("truncate text-sm", !on && "text-muted-foreground")}>{label}</span>
    </button>
  )
}

/** Amount box that shows the app's filled-in amount until someone types their own */
function AmountBox({
  text,
  auto,
  value,
  currency,
  onChange,
  label,
}: {
  text: string
  auto: boolean
  value: number
  currency: string
  onChange: (text: string) => void
  label: string
}) {
  return (
    <div className="relative shrink-0">
      {auto && (
        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] font-semibold tracking-wide text-primary uppercase">
          auto
        </span>
      )}
      <Input
        inputMode="decimal"
        placeholder={auto ? minorToInput(value, currency) : "0"}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-10 w-28 text-right tabular", auto && "border-dashed placeholder:text-foreground/70")}
        aria-label={auto ? `${label}, filled in: ${minorToInput(value, currency)}` : label}
      />
    </div>
  )
}

function AutoHint({ typed, onReset, text }: { typed: boolean; onReset: () => void; text: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
      <p>{text}</p>
      {typed && (
        <button type="button" onClick={onReset} className="min-h-8 shrink-0 font-medium text-primary">
          Split evenly
        </button>
      )}
    </div>
  )
}

const MODE_LABEL: Record<SplitMode, string> = { equal: "Equally", shares: "By shares", exact: "Amounts", meals: "By meals" }

/** What an edit changes, field by field, in words */
function describeChanges(before: Expense, after: Expense, who: (id: string) => string) {
  const out: { label: string; from: string; to: string }[] = []
  const add = (label: string, from: string, to: string) => {
    if (from !== to) out.push({ label, from, to })
  }
  const paid = (e: Expense) =>
    Object.entries(e.paidBy)
      .map(([id, v]) => `${who(id)} ${formatMoney(v, e.currency)}`)
      .join(", ")
  const split = (e: Expense) => {
    const people = Object.entries(e.split).map(([id, v]) =>
      e.splitMode === "shares" ? `${who(id)} x${v}` : e.splitMode === "exact" ? `${who(id)} ${formatMoney(v, e.currency)}` : who(id)
    )
    return `${MODE_LABEL[e.splitMode]}: ${people.join(", ")}`
  }
  add("Amount", formatMoney(before.amount, before.currency), formatMoney(after.amount, after.currency))
  add("What for", before.title, after.title)
  add("Category", getCategory(before.category).label, getCategory(after.category).label)
  add("Date", dayLabel(before.date), dayLabel(after.date))
  add(after.kind === "income" ? "Received by" : "Paid by", paid(before), paid(after))
  add("Split", split(before), split(after))
  add("Items", (before.items ?? []).join(", "), (after.items ?? []).join(", "))
  add("Note", before.note ?? "", after.note ?? "")
  add("Photo", before.receipt ? "Photo" : "", after.receipt ? "Photo" : "")
  return out
}
