import { Check, ListChecks, Plus, Receipt, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EmptyState, SectionTitle } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTripActions } from "@/hooks/useTripActions"
import { useTrip } from "@/hooks/useTripData"
import { guessCategory } from "@/lib/categories"
import { addItem, removeItems, restore, setItemDone } from "@/lib/repo"
import type { ShopItem } from "@/lib/types"

/** Shared to-buy list. Tick what you bought, then turn it into one expense. */
export default function ShoppingScreen() {
  const { trip, items } = useTrip()
  const { addExpense } = useTripActions()
  const [name, setName] = useState("")
  const open = items.filter((i) => !i.done)
  const bought = items.filter((i) => i.done)

  const add = async () => {
    // "rice, oil, soap" adds three items
    const names = name
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean)
    for (const n of names) await addItem(trip.id, n.slice(0, 60))
    setName("")
  }

  const toExpense = () => {
    const list = bought.map((i) => i.name)
    const title = `Bazar: ${list.join(", ")}`
    addExpense({
      title: title.length > 80 ? `${title.slice(0, 77)}…` : title,
      category: list.map(guessCategory).find(Boolean) ?? "groceries",
      ...(trip.mealMode ? { splitMode: "meals" as const } : {}),
      context: `${list.length} ${list.length === 1 ? "item" : "items"} from the list`,
      onSaved: () => removeItems(bought.map((i) => i.id)),
    })
  }

  const clear = async (list: ShopItem[]) => {
    await removeItems(list.map((i) => i.id))
    toast(`Removed ${list.length} ${list.length === 1 ? "item" : "items"}`, {
      action: { label: "Undo", onClick: () => list.forEach((i) => restore("items", i.id)) },
    })
  }

  return (
    <div className="pt-3 pb-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
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
      </form>

      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title="List is empty">
          Anyone can add what the home needs. Whoever goes to the bazar ticks things off.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 && (
            <ul className="mt-4 divide-y overflow-hidden rounded-2xl border bg-card">
              {open.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </ul>
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
                  <ItemRow key={item.id} item={item} />
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

function ItemRow({ item }: { item: ShopItem }) {
  const done = item.done === 1
  return (
    <li className="flex items-center">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={() => setItemDone(item.id, !done)}
        className="flex min-h-12 flex-1 items-center gap-3 px-3 text-left active:bg-accent"
      >
        <span
          className={
            done
              ? "inline-flex size-6 items-center justify-center rounded-full bg-positive text-white"
              : "size-6 rounded-full border-2 border-input"
          }
        >
          {done && <Check className="size-4" strokeWidth={3} aria-hidden />}
        </span>
        <span className={done ? "text-muted-foreground line-through" : ""}>{item.name}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        onClick={() => removeItems([item.id])}
        aria-label={`Remove ${item.name}`}
      >
        <X className="size-4" />
      </Button>
    </li>
  )
}
