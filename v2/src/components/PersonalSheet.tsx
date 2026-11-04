import { CalendarDays, Lock, Share2, StickyNote, Trash2, Users } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useBackClose } from "@/hooks/useBackClose"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { monthOf } from "@/lib/balance"
import { categoriesFor, getCategory, guessCategory, quickPicksFor, type QuickPick } from "@/lib/categories"
import { addDays, dayLabel, monthLabel, shortDate, toISODate } from "@/lib/dates"
import { convertToBase, currencySymbol, formatMoney, minorToInput, parseAmount } from "@/lib/money"
import { personalBase } from "@/lib/personal"
import { restore, savePersonal, softDelete } from "@/lib/repo"
import { usePrefs } from "@/lib/review"
import type { PersonalExpense } from "@/lib/types"
import { cn, UNDO_MS } from "@/lib/utils"
import { CategoryIcon, Chip } from "./common"
import { ChangeList, ReviewDialog } from "./ReviewDialog"

export interface PersonalPreset {
  title?: string
  category?: string
  /** Base currency minor units */
  amount?: number
  date?: string
}

interface FormState {
  amountText: string
  currency: string
  rate: number
  title: string
  category: string
  categoryTouched: boolean
  date: string
  note: string
  showNote: boolean
}

/** Add or edit something only you paid for and only you use. Never touches group balances. */
export function PersonalSheet({
  open,
  onOpenChange,
  item,
  preset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: PersonalExpense | null
  preset?: PersonalPreset | null
}) {
  const { trip, kind, personal, meId } = useTrip()
  const { addExpense } = useTripActions()
  const prefs = usePrefs()
  const base = trip.currency
  const [form, setForm] = useState<FormState | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const draftFor = useRef<string | null>(null)

  const close = () => onOpenChange(false)
  useBackClose(open, close)

  useEffect(() => {
    if (!open) return
    const key = item ? `edit:${item.id}` : preset ? "preset" : "new"
    if (key === "new" && draftFor.current === key && form) return
    draftFor.current = key
    setSubmitted(false)
    setReviewing(false)
    setForm(
      item
        ? {
            amountText: minorToInput(item.amount, item.currency),
            currency: item.currency,
            rate: item.rate,
            title: item.title,
            category: item.category,
            categoryTouched: true,
            date: item.date,
            note: item.note ?? "",
            showNote: !!item.note,
          }
        : {
            amountText: preset?.amount ? minorToInput(preset.amount, base) : "",
            currency: base,
            rate: 1,
            title: preset?.title ?? "",
            category: preset?.category ?? "other",
            categoryTouched: !!preset?.category,
            date: preset?.date ?? toISODate(),
            note: "",
            showNote: false,
          }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id, preset])

  const picks = useMemo(() => {
    const seen = new Set<string>()
    const list: QuickPick[] = []
    for (const p of personal) {
      const k = p.title.trim().toLowerCase()
      if (!k || seen.has(k)) continue
      seen.add(k)
      list.push({ title: p.title.trim(), category: p.category })
      if (list.length >= 4) break
    }
    for (const p of quickPicksFor(kind)) {
      if (list.length >= 8) break
      if (!seen.has(p.title.toLowerCase())) list.push(p)
    }
    return list
  }, [personal, kind])

  if (!form) return null

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f))
  const cur = form.currency
  const amount = parseAmount(form.amountText, cur)
  const currencyOptions = [base, ...Object.keys(trip.rates ?? {}).filter((c) => c !== base)]
  const title = form.title.trim() || getCategory(form.category).label
  const input = {
    title,
    category: form.category,
    amount: amount ?? 0,
    currency: cur,
    rate: cur === base ? 1 : form.rate,
    date: form.date,
    note: form.note.trim() ? form.note.trim().slice(0, 500) : undefined,
  }

  const cycleCurrency = () => {
    const next = currencyOptions[(currencyOptions.indexOf(cur) + 1) % currencyOptions.length]
    set({ currency: next, rate: next === base ? 1 : (trip.rates[next] ?? 1) })
  }

  const onTitle = (value: string) => {
    const guess = form.categoryTouched ? null : guessCategory(value)
    set({ title: value, ...(guess && guess !== "loan" ? { category: guess } : {}) })
  }

  const save = () => {
    setSubmitted(true)
    if (!amount) return
    if (prefs.review) setReviewing(true)
    else commit()
  }

  const commit = async () => {
    if (!amount) return
    setReviewing(false)
    const id = await savePersonal(trip.id, input, item?.id)
    navigator.vibrate?.(15)
    draftFor.current = null
    close()
    if (!item) {
      toast.success(`Added ${formatMoney(amount, cur)} to Personal`, {
        duration: UNDO_MS,
        action: { label: "Undo", onClick: () => softDelete("personal", id) },
      })
    }
  }

  const remove = async () => {
    if (!item) return
    await softDelete("personal", item.id)
    draftFor.current = null
    close()
    toast("Personal expense deleted", { duration: UNDO_MS, action: { label: "Undo", onClick: () => restore("personal", item.id) } })
  }

  /** It was shared after all: open it as a group expense, and drop the personal copy once that's saved */
  const moveToGroup = () => {
    if (!item) return
    const id = item.id
    close()
    setTimeout(
      () =>
        addExpense({
          title: item.title,
          category: item.category,
          amount: personalBase(item, trip),
          ...(meId ? { payer: meId } : {}),
          context: "Moving a personal expense to the group. Pick who shares it.",
          onSaved: () => softDelete("personal", id),
        }),
      220
    )
  }

  // Same amount within 2 days in Personal: probably added twice
  const dupOf =
    reviewing && amount
      ? personal.find(
          (p) =>
            p.id !== item?.id &&
            personalBase(p, trip) === convertToBase(amount, cur, input.rate, base) &&
            Math.abs(new Date(p.date).getTime() - new Date(form.date).getTime()) <= 2 * 86_400_000
        )
      : undefined
  const month = monthOf(form.date)
  const monthTotal =
    personal
      .filter((p) => p.id !== item?.id && monthOf(p.date) === month)
      .reduce((s, p) => s + personalBase(p, trip), 0) + (amount ? convertToBase(amount, cur, input.rate, base) : 0)

  const changes = item
    ? [
        ["Amount", formatMoney(item.amount, item.currency), formatMoney(input.amount, input.currency)],
        ["What for", item.title, input.title],
        ["Category", getCategory(item.category).label, getCategory(input.category).label],
        ["Date", dayLabel(item.date), dayLabel(input.date)],
        ["Note", item.note ?? "", input.note ?? ""],
      ]
        .filter(([, a, b]) => a !== b)
        .map(([label, from, to]) => ({ label, from, to }))
    : []

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="flex-row items-center justify-between py-2 text-left">
            <div>
              <DrawerTitle className="text-lg">{item ? "Edit personal expense" : "Personal expense"}</DrawerTitle>
              <DrawerDescription className="flex items-center gap-1 text-xs">
                <Lock className="size-3" aria-hidden /> Only you see this. Group balances don't change.
              </DrawerDescription>
            </div>
            {item && (
              <Button variant="ghost" size="icon" className="size-11 text-destructive" onClick={remove} aria-label="Delete personal expense">
                <Trash2 className="size-5" />
              </Button>
            )}
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
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
                <label htmlFor="personal-amount" className="sr-only">
                  Amount
                </label>
                <input
                  id="personal-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus={!item}
                  placeholder="0"
                  value={form.amountText}
                  onChange={(e) => set({ amountText: e.target.value })}
                  className="w-full min-w-0 bg-transparent text-center text-5xl font-semibold tabular outline-none placeholder:text-muted-foreground/50"
                  style={{ maxWidth: `${Math.max(3, form.amountText.length + 1)}ch` }}
                />
              </div>
              {cur !== base && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {amount ? `≈ ${formatMoney(convertToBase(amount, cur, form.rate, base), base)} · ` : ""}1 {base} = {form.rate} {cur}
                </p>
              )}
              {submitted && !amount && (
                <p role="alert" className="mt-2 text-center text-sm text-destructive">
                  Enter an amount
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="personal-title">What for?</Label>
              <Input
                id="personal-title"
                placeholder="e.g. My lunch, phone recharge"
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
                      onClick={() => set({ title: p.title, category: p.category, categoryTouched: true })}
                      className="min-h-9 px-3 text-[13px]"
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {p.title}
                    </Chip>
                  )
                })}
              </div>
            </div>

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
                      onClick={() => set({ category: c.id, categoryTouched: true })}
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

            {item && (
              <button
                type="button"
                onClick={moveToGroup}
                className="flex w-full items-center gap-3 rounded-2xl border border-dashed p-3 text-left active:bg-accent"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Users className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Share with the group instead</span>
                  <span className="block text-xs text-muted-foreground">Turns it into a group expense and removes it from Personal.</span>
                </span>
                <Share2 className="size-4 text-muted-foreground" aria-hidden />
              </button>
            )}
          </div>

          <ReviewDialog
            open={reviewing}
            title={item ? "Save these changes?" : "Add to Personal?"}
            description="Private: only you see this, on your own devices."
            confirmLabel={item ? "Save" : `Add ${amount ? formatMoney(amount, cur) : ""}`}
            onConfirm={commit}
            onCancel={() => setReviewing(false)}
          >
            {item && <ChangeList changes={changes} />}
            {dupOf && (
              <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                You already have “{dupOf.title}” for {formatMoney(dupOf.amount, dupOf.currency)} on {shortDate(dupOf.date)}. Added twice?
              </p>
            )}
            {form.date > toISODate() && (
              <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                The date is in the future ({shortDate(form.date)}).
              </p>
            )}
            <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
              <CategoryIcon category={input.category} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{input.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {dayLabel(input.date)} · {getCategory(input.category).label}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold tabular">{amount ? formatMoney(amount, cur) : ""}</p>
                {cur !== base && amount ? (
                  <p className="text-[11px] tabular text-muted-foreground">≈ {formatMoney(convertToBase(amount, cur, input.rate, base), base)}</p>
                ) : null}
              </div>
            </div>
            {input.note && (
              <p className="rounded-xl border bg-card px-3 py-2 text-sm">
                <span className="block text-[11px] text-muted-foreground">Note</span>
                {input.note}
              </p>
            )}
            <ul className="space-y-1.5 rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Lock className="size-3.5 shrink-0" aria-hidden /> Nobody else in {trip.name} can see it.
              </li>
              <li className="flex items-center gap-2">
                <Users className="size-3.5 shrink-0" aria-hidden /> Group balances and reports stay the same.
              </li>
              <li>
                Your personal spending in {monthLabel(month)} becomes <strong className="tabular text-foreground">{formatMoney(monthTotal, base)}</strong>.
              </li>
            </ul>
          </ReviewDialog>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            <Button size="lg" className="h-12 w-full text-base" onClick={save} disabled={submitted && !amount}>
              {item ? "Save changes" : amount ? `Add ${formatMoney(amount, cur)} to Personal` : "Add personal expense"}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
