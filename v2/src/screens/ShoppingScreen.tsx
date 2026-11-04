import { CalendarDays, Check, ListChecks, MoreVertical, Plus, Receipt, Siren, Trash2, UserMinus, UserRound } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Chip, EmptyState, MemberAvatar, SectionTitle } from "@/components/common"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { guessCategory } from "@/lib/categories"
import { addDays, needByLabel, shortDate, toISODate } from "@/lib/dates"
import { addItem, assignItem, byNeed, planItem, removeItems, restore, setItemDone } from "@/lib/repo"
import type { ShopItem } from "@/lib/types"
import { cn, UNDO_MS } from "@/lib/utils"

type View = "all" | "mine" | "free" | "urgent"

/** Opens the phone's date picker for a hidden date input */
function pickDate(input: HTMLInputElement | null) {
  if (!input) return
  try {
    input.showPicker()
  } catch {
    input.focus()
    input.click()
  }
}

/**
 * Shared to-buy list. Say "I'll buy" (or assign someone) so two people don't
 * buy the same thing, mark what's urgent or needed by a day, tick what you
 * bought, then turn it into one expense. Whoever is buying gets reminded.
 */
export default function ShoppingScreen() {
  const { trip, items, meId, names } = useTrip()
  const { addExpense } = useTripActions()
  const [name, setName] = useState("")
  const [urgent, setUrgent] = useState(false)
  const [needBy, setNeedBy] = useState<string | undefined>()
  const [view, setView] = useState<View>("all")
  const dateRef = useRef<HTMLInputElement>(null)
  const who = (id?: string) => (!id ? "" : id === meId ? "You" : (names.get(id) ?? "?"))
  const today = toISODate()
  const tomorrow = addDays(today, 1)

  const open = items.filter((i) => !i.done).sort(byNeed)
  const bought = items.filter((i) => i.done)
  const mine = open.filter((i) => i.assignee === meId)
  const free = open.filter((i) => !i.assignee)
  const urgentItems = open.filter((i) => i.urgent)
  const shown = view === "mine" ? mine : view === "free" ? free : view === "urgent" ? urgentItems : open
  const customDay = !!needBy && needBy !== today && needBy !== tomorrow

  const add = async () => {
    // "rice, oil, soap" adds three items
    const list = name
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean)
    const already: string[] = []
    for (const n of list) {
      const existing = await addItem(trip.id, n.slice(0, 60), meId, { urgent, needBy })
      if (existing) already.push(existing.assignee ? `${existing.name} (${who(existing.assignee)} will buy it)` : existing.name)
    }
    if (already.length) toast(`Already on the list: ${already.join(", ")}`)
    setName("")
    setUrgent(false)
    setNeedBy(undefined)
  }

  const toggleBought = (item: ShopItem) => {
    const done = item.done !== 1
    setItemDone(item.id, done, meId)
    if (done && item.assignee && item.assignee !== meId) {
      toast(`${who(item.assignee)} was going to buy ${item.name}`, { description: "Marked as bought by you, so they can skip it." })
    }
  }

  const toExpense = () => {
    const list = bought.map((i) => i.name)
    const buyers = [...new Set(bought.map((i) => i.boughtBy).filter(Boolean))] as string[]
    addExpense({
      title: "Bazar",
      category: list.map(guessCategory).find(Boolean) ?? "groceries",
      items: list,
      // Whoever ticked them off paid, if it was one person
      ...(buyers.length === 1 ? { payer: buyers[0] } : {}),
      ...(trip.mealMode ? { splitMode: "meals" as const } : {}),
      context: `${list.length} ${list.length === 1 ? "item" : "items"} from the list`,
      onSaved: () => removeItems(bought.map((i) => i.id)),
    })
  }

  const clear = async (list: ShopItem[]) => {
    await removeItems(list.map((i) => i.id))
    toast(`Removed ${list.length} ${list.length === 1 ? "item" : "items"}`, {
      duration: UNDO_MS,
      action: { label: "Undo", onClick: () => list.forEach((i) => restore("items", i.id)) },
    })
  }

  return (
    <div className="pt-3 pb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <div className="flex gap-2">
          <Input
            autoFocus={items.length === 0}
            placeholder="Rice, oil, soap…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            enterKeyHint="done"
            className="h-12"
            aria-label="Add items"
          />
          <Button type="submit" className="h-12 px-4" disabled={!name.trim()} aria-label="Add to list">
            <Plus />
          </Button>
        </div>
        {/* How soon it's needed, for what's being added */}
        <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          <Chip
            selected={urgent}
            onClick={() => setUrgent(!urgent)}
            className={cn("min-h-9 shrink-0 px-3 text-[13px]", urgent && "border-negative bg-negative text-white")}
          >
            <Siren className="size-3.5" aria-hidden /> Urgent
          </Chip>
          <Chip selected={needBy === today} onClick={() => setNeedBy(needBy === today ? undefined : today)} className="min-h-9 shrink-0 px-3 text-[13px]">
            Need today
          </Chip>
          <Chip
            selected={needBy === tomorrow}
            onClick={() => setNeedBy(needBy === tomorrow ? undefined : tomorrow)}
            className="min-h-9 shrink-0 px-3 text-[13px]"
          >
            Tomorrow
          </Chip>
          <span className="relative shrink-0">
            <Chip selected={customDay} onClick={() => (customDay ? setNeedBy(undefined) : pickDate(dateRef.current))} className="min-h-9 px-3 text-[13px]">
              <CalendarDays className="size-3.5" aria-hidden />
              {customDay ? `By ${shortDate(needBy!)}` : "Pick a day"}
            </Chip>
            <input
              ref={dateRef}
              type="date"
              min={today}
              value={needBy ?? ""}
              onChange={(e) => setNeedBy(e.target.value || undefined)}
              className="pointer-events-none absolute inset-0 opacity-0"
              tabIndex={-1}
              aria-label="Needed by"
            />
          </span>
        </div>
      </form>

      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title="List is empty">
          Anyone can add what the home needs. Tap “I'll buy” so nobody buys the same thing twice; the buyer gets a reminder.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
              <Chip selected={view === "all"} onClick={() => setView("all")} className="min-h-9 shrink-0 px-3 text-[13px]">
                All {open.length}
              </Chip>
              {urgentItems.length > 0 && (
                <Chip selected={view === "urgent"} onClick={() => setView("urgent")} className="min-h-9 shrink-0 px-3 text-[13px]">
                  <Siren className="size-3.5" aria-hidden /> Urgent {urgentItems.length}
                </Chip>
              )}
              {meId && (
                <Chip selected={view === "mine"} onClick={() => setView("mine")} className="min-h-9 shrink-0 px-3 text-[13px]">
                  For me {mine.length}
                </Chip>
              )}
              <Chip selected={view === "free"} onClick={() => setView("free")} className="min-h-9 shrink-0 px-3 text-[13px]">
                Nobody's buying {free.length}
              </Chip>
            </div>
          )}
          {shown.length > 0 && (
            <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
              {shown.map((item) => (
                <ItemRow key={item.id} item={item} onToggle={() => toggleBought(item)} />
              ))}
            </ul>
          )}
          {open.length > 0 && shown.length === 0 && (
            <p className="mt-3 rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {view === "mine" ? "Nothing assigned to you." : view === "urgent" ? "Nothing urgent." : "Everything has someone buying it."}
            </p>
          )}
          {bought.length > 0 && (
            <>
              <SectionTitle
                action={
                  <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => clear(bought)}>
                    Clear
                  </Button>
                }
              >
                Bought ({bought.length})
              </SectionTitle>
              <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
                {bought.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={() => toggleBought(item)} />
                ))}
              </ul>
              <Button size="lg" className="mt-3 h-12 w-full" onClick={toExpense}>
                <Receipt /> Add bought items as expense
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}

/** Urgent / needed-by pills for a to-buy item */
export function NeedBadges({ item }: { item: ShopItem }) {
  if (item.done) return null
  const need = item.needBy ? needByLabel(item.needBy) : null
  if (!item.urgent && !need) return null
  return (
    <>
      {item.urgent ? (
        <span className="inline-flex items-center gap-0.5 rounded-full bg-negative px-1.5 text-[10px] font-bold tracking-wide text-white uppercase">
          <Siren className="size-3" aria-hidden /> Urgent
        </span>
      ) : null}
      {need && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px] font-medium",
            need.late ? "bg-negative-soft text-negative" : need.soon ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
          )}
        >
          {need.text}
        </span>
      )}
    </>
  )
}

function ItemRow({ item, onToggle }: { item: ShopItem; onToggle: () => void }) {
  const { everyone, meId, names } = useTrip()
  const dateRef = useRef<HTMLInputElement>(null)
  const who = (id?: string) => (!id ? "" : id === meId ? "You" : (names.get(id) ?? "?"))
  const done = item.done === 1
  const today = toISODate()
  const sub = done
    ? item.boughtBy
      ? `bought by ${item.boughtBy === meId ? "you" : who(item.boughtBy)}`
      : ""
    : item.assignee
      ? item.assignee === meId
        ? "You're buying it"
        : `${who(item.assignee)} will buy it`
      : item.createdBy && item.createdBy !== meId
        ? `added by ${who(item.createdBy)}`
        : ""

  return (
    <li className={cn("relative flex items-center pr-1", !done && item.urgent && "bg-negative-soft/40")}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className="flex min-h-13 min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-left active:bg-accent"
      >
        <span
          className={
            done
              ? "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-positive text-white"
              : "size-6 shrink-0 rounded-full border-2 border-input"
          }
        >
          {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate", done && "text-muted-foreground line-through")}>{item.name}</span>
          <span className="flex flex-wrap items-center gap-1">
            <NeedBadges item={item} />
            {sub && (
              <span className={cn("truncate text-xs", item.assignee === meId && !done ? "font-medium text-primary" : "text-muted-foreground")}>
                {sub}
              </span>
            )}
          </span>
        </span>
      </button>
      {!done &&
        (item.assignee ? (
          <MemberAvatar id={item.assignee} name={names.get(item.assignee) ?? "?"} className="size-7 text-[10px]" />
        ) : (
          meId && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => assignItem(item.id, meId, meId)}>
              I'll buy
            </Button>
          )
        ))}
      <input
        ref={dateRef}
        type="date"
        min={today}
        value={item.needBy ?? ""}
        onChange={(e) => planItem(item.id, { needBy: e.target.value || null }, meId)}
        className="pointer-events-none absolute right-0 bottom-0 size-px opacity-0"
        tabIndex={-1}
        aria-label={`${item.name} needed by`}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={`More for ${item.name}`}>
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {!done && (
            <>
              <DropdownMenuLabel>Who buys it?</DropdownMenuLabel>
              {everyone
                .filter((m) => !m.archived)
                .map((m) => (
                  <DropdownMenuItem key={m.id} onSelect={() => assignItem(item.id, m.id, meId)}>
                    <UserRound className="size-4" aria-hidden />
                    {m.id === meId ? "I'll buy it" : m.name}
                    {item.assignee === m.id && <Check className="ml-auto size-4" aria-hidden />}
                  </DropdownMenuItem>
                ))}
              {item.assignee && (
                <DropdownMenuItem onSelect={() => assignItem(item.id, null, meId)}>
                  <UserMinus className="size-4" aria-hidden /> Nobody yet
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>How soon?</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => planItem(item.id, { urgent: !item.urgent }, meId)}>
                <Siren className="size-4" aria-hidden /> {item.urgent ? "Not urgent" : "Urgent"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => planItem(item.id, { needBy: today }, meId)}>
                <CalendarDays className="size-4" aria-hidden /> Needed today
                {item.needBy === today && <Check className="ml-auto size-4" aria-hidden />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => planItem(item.id, { needBy: addDays(today, 1) }, meId)}>
                <CalendarDays className="size-4" aria-hidden /> Needed tomorrow
                {item.needBy === addDays(today, 1) && <Check className="ml-auto size-4" aria-hidden />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTimeout(() => pickDate(dateRef.current), 50)}>
                <CalendarDays className="size-4" aria-hidden /> Pick a day…
              </DropdownMenuItem>
              {item.needBy && (
                <DropdownMenuItem onSelect={() => planItem(item.id, { needBy: null }, meId)}>
                  <CalendarDays className="size-4" aria-hidden /> No date
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onSelect={() => removeItems([item.id])}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
