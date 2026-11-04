import { RotateCcw } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { useBackClose } from "@/hooks/useBackClose"
import { useTrip } from "@/hooks/useTripData"
import { categoriesFor, getCategory } from "@/lib/categories"
import {
  DATE_LABELS,
  DEFAULT_FILTER,
  IMPACT_LABELS,
  SORT_LABELS,
  TYPE_LABELS,
  type ActivityFilter,
  type DatePreset,
  type ItemType,
  type MyImpact,
  type PeopleMatch,
  type PeopleRole,
  type SortKey,
} from "@/lib/filters"
import { currencySymbol, minorToInput, parseAmount } from "@/lib/money"
import { Chip, MemberAvatar, Segmented } from "./common"

function Group({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </fieldset>
  )
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value])

/** Every way to narrow Activity down: type, people, category, dates, amounts and more */
export function FilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
  count,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: ActivityFilter
  onApply: (f: ActivityFilter) => void
  /** How many items a filter would show, for the button */
  count: (f: ActivityFilter) => number
}) {
  const { trip, kind, everyone, names, meId } = useTrip()
  const [f, setF] = useState(value)
  const [minText, setMinText] = useState("")
  const [maxText, setMaxText] = useState("")
  useBackClose(open, () => onOpenChange(false))

  useEffect(() => {
    if (!open) return
    setF(value)
    setMinText(value.min !== undefined ? minorToInput(value.min, trip.currency) : "")
    setMaxText(value.max !== undefined ? minorToInput(value.max, trip.currency) : "")
  }, [open, value, trip.currency])

  const set = (patch: Partial<ActivityFilter>) => setF((x) => ({ ...x, ...patch }))
  const who = (id: string) => (id === meId ? "You" : (names.get(id) ?? "?"))
  const types: ItemType[] = ["expense", ...(kind === "home" ? (["bill"] as const) : []), "payment", "loan", "income"]
  const categories = [...categoriesFor(kind), getCategory("loan")]
  const n = count(f)

  const peopleHint = (() => {
    if (f.people.length === 0) return "Pick people to see only what involves them."
    const list = f.people.map(who)
    const verb = f.role === "paid" ? "paid" : f.role === "shared" ? "shared" : "paid or shared"
    if (f.people.length === 1) return `Items ${list[0]} ${verb}.`
    if (f.match === "all") return `Items ${list.join(" and ")} all ${verb} together.`
    if (f.match === "only") return `Items ${verb} by exactly ${list.join(" and ")}, nobody else.`
    return `Items any of ${list.join(", ")} ${verb}.`
  })()

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[94dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="flex-row items-center justify-between py-2 text-left">
            <div>
              <DrawerTitle className="text-lg">Filter & sort</DrawerTitle>
              <DrawerDescription className="text-xs">Remembered on this phone for {trip.name}.</DrawerDescription>
            </div>
            <Button
              variant="ghost"
              className="h-10 text-primary"
              onClick={() => {
                setF(DEFAULT_FILTER)
                setMinText("")
                setMaxText("")
              }}
            >
              <RotateCcw /> Reset
            </Button>
          </DrawerHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
            <Group title="Sort">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <Chip key={k} selected={f.sort === k} onClick={() => set({ sort: k })} className="min-h-9 px-3 text-[13px]">
                    {SORT_LABELS[k]}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Type" hint={f.types.length === 0 ? "Showing every type." : undefined}>
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <Chip key={t} selected={f.types.includes(t)} onClick={() => set({ types: toggle(f.types, t) })} className="min-h-9 px-3 text-[13px]">
                    {TYPE_LABELS[t]}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="People" hint={peopleHint}>
              <div className="flex flex-wrap gap-2">
                {everyone.map((m) => (
                  <Chip key={m.id} selected={f.people.includes(m.id)} onClick={() => set({ people: toggle(f.people, m.id) })} className="pl-1">
                    <MemberAvatar id={m.id} name={m.name} className="size-7 text-[10px]" />
                    {who(m.id)}
                  </Chip>
                ))}
              </div>
              {f.people.length > 0 && (
                <Segmented<PeopleRole>
                  label="Their part"
                  value={f.role}
                  onChange={(role) => set({ role })}
                  options={[
                    { value: "any", label: "Paid or shared" },
                    { value: "paid", label: "Paid" },
                    { value: "shared", label: "Shared" },
                  ]}
                />
              )}
              {f.people.length > 1 && (
                <Segmented<PeopleMatch>
                  label="How many of them"
                  value={f.match}
                  onChange={(match) => set({ match })}
                  options={[
                    { value: "any", label: "Any one" },
                    { value: "all", label: "All of them" },
                    { value: "only", label: "Only them" },
                  ]}
                />
              )}
            </Group>

            {meId && (
              <Group title="Your part">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(IMPACT_LABELS) as MyImpact[]).map((k) => (
                    <Chip key={k} selected={f.impact === k} onClick={() => set({ impact: k })} className="min-h-9 px-3 text-[13px]">
                      {IMPACT_LABELS[k]}
                    </Chip>
                  ))}
                </div>
              </Group>
            )}

            <Group title="Category">
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Chip
                    key={c.id}
                    selected={f.categories.includes(c.id)}
                    onClick={() => set({ categories: toggle(f.categories, c.id) })}
                    className="min-h-9 px-3 text-[13px]"
                  >
                    <c.icon className="size-3.5" aria-hidden />
                    {c.short}
                  </Chip>
                ))}
              </div>
            </Group>

            <Group title="Date">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DATE_LABELS) as DatePreset[]).map((k) => (
                  <Chip key={k} selected={f.date === k} onClick={() => set({ date: k })} className="min-h-9 px-3 text-[13px]">
                    {DATE_LABELS[k]}
                  </Chip>
                ))}
              </div>
              {f.date === "custom" && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    From
                    <Input type="date" value={f.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} className="h-11" />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    To
                    <Input type="date" value={f.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} className="h-11" />
                  </label>
                </div>
              )}
            </Group>

            <Group title={`Amount (${currencySymbol(trip.currency)})`}>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="Min"
                  value={minText}
                  onChange={(e) => {
                    setMinText(e.target.value)
                    set({ min: parseAmount(e.target.value, trip.currency) ?? undefined })
                  }}
                  className="h-11 tabular"
                  aria-label="Minimum amount"
                />
                <Input
                  inputMode="decimal"
                  placeholder="Max"
                  value={maxText}
                  onChange={(e) => {
                    setMaxText(e.target.value)
                    set({ max: parseAmount(e.target.value, trip.currency) ?? undefined })
                  }}
                  className="h-11 tabular"
                  aria-label="Maximum amount"
                />
              </div>
            </Group>

            <Group title="More">
              <div className="flex flex-wrap gap-2">
                <Chip selected={f.receipt} onClick={() => set({ receipt: !f.receipt })} className="min-h-9 px-3 text-[13px]">
                  With photo
                </Chip>
                <Chip selected={f.note} onClick={() => set({ note: !f.note })} className="min-h-9 px-3 text-[13px]">
                  With note
                </Chip>
                <Chip selected={f.multiPayer} onClick={() => set({ multiPayer: !f.multiPayer })} className="min-h-9 px-3 text-[13px]">
                  Several payers
                </Chip>
                {trip.mealMode && (
                  <Chip selected={f.byMeals} onClick={() => set({ byMeals: !f.byMeals })} className="min-h-9 px-3 text-[13px]">
                    Split by meals
                  </Chip>
                )}
                <Chip selected={f.edited} onClick={() => set({ edited: !f.edited })} className="min-h-9 px-3 text-[13px]">
                  Edited after adding
                </Chip>
              </div>
            </Group>
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            <Button
              size="lg"
              className="h-12 w-full text-base"
              onClick={() => {
                onApply(f)
                onOpenChange(false)
              }}
            >
              {n === 0 ? "Nothing matches" : `Show ${n} ${n === 1 ? "item" : "items"}`}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
