import { ChevronLeft, House, Plane, Plus, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { Chip, MemberAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { STARTER_BILLS, TRIP_EMOJIS } from "@/lib/categories"
import { CURRENCIES, currencyName } from "@/lib/currencies"
import { parseAmount } from "@/lib/money"
import { createTrip } from "@/lib/repo"
import type { GroupKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const DEFAULTS: Record<GroupKind, { emoji: string; currency: string; placeholder: string }> = {
  home: { emoji: "🏠", currency: "BDT", placeholder: "Our flat" },
  trip: { emoji: "✈️", currency: "EUR", placeholder: "Greece 2026" },
}

/** One screen: home or trip, name, people, go. Everything else has sensible defaults. */
export default function NewTripScreen() {
  const [, navigate] = useLocation()
  const [kind, setKind] = useState<GroupKind>("home")
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState(DEFAULTS.home.emoji)
  const [currency, setCurrency] = useState(DEFAULTS.home.currency)
  const [me, setMe] = useState("")
  const [friend, setFriend] = useState("")
  const [friends, setFriends] = useState<string[]>([])
  const [bills, setBills] = useState<Set<string>>(new Set(["Rent", "Electricity", "Gas", "Internet"]))
  const [rentText, setRentText] = useState("")
  const [mealMode, setMealMode] = useState(false)
  const [saving, setSaving] = useState(false)

  const pickKind = (k: GroupKind) => {
    setKind(k)
    setEmoji(DEFAULTS[k].emoji)
    setCurrency(DEFAULTS[k].currency)
  }

  const addFriend = () => {
    const trimmed = friend.trim().slice(0, 40)
    if (!trimmed) return
    const taken = [me, ...friends].some((n) => n.trim().toLowerCase() === trimmed.toLowerCase())
    if (!taken) setFriends([...friends, trimmed])
    setFriend("")
  }

  const toggleBill = (title: string) => {
    const next = new Set(bills)
    if (next.has(title)) next.delete(title)
    else next.add(title)
    setBills(next)
  }

  const finalName = name.trim() || DEFAULTS[kind].placeholder
  const valid = me.trim()

  const create = async () => {
    if (!valid || saving) return
    setSaving(true)
    // A name typed but not yet "added" still counts
    const pending = friend.trim() ? [...friends, friend.trim().slice(0, 40)] : friends
    const rent = parseAmount(rentText, currency) ?? 0
    const id = await createTrip({
      name: finalName.slice(0, 60),
      emoji,
      currency,
      kind,
      mealMode: kind === "home" && mealMode,
      me: me.trim().slice(0, 40),
      others: pending,
      bills:
        kind === "home"
          ? STARTER_BILLS.filter((b) => bills.has(b.title)).map((b) => ({
              title: b.title,
              category: b.category,
              dueDay: b.dueDay,
              variable: b.variable,
              amount: b.title === "Rent" ? rent : 0,
            }))
          : [],
    })
    navigate(`/t/${id}`, { replace: true })
    toast.success(kind === "home" ? "Home created" : "Trip created", {
      description: "Send the others a link so they can join.",
      action: { label: "Invite", onClick: () => navigate(`/t/${id}?invite`) },
    })
  }

  return (
    <div className="pt-safe mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <header className="-mx-1.5 flex h-14 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11" onClick={() => navigate("/")} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">New group</h1>
      </header>

      <form
        className="space-y-7 pt-2"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What are you sharing?">
          {(
            [
              { k: "home", icon: House, title: "Home", text: "Flatmates, mess, family" },
              { k: "trip", icon: Plane, title: "Trip", text: "Travel, events, outings" },
            ] as const
          ).map((o) => (
            <button
              key={o.k}
              type="button"
              role="radio"
              aria-checked={kind === o.k}
              onClick={() => pickKind(o.k)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition-colors",
                kind === o.k ? "border-primary bg-primary/5" : "border-border bg-card"
              )}
            >
              <o.icon className={cn("size-6", kind === o.k ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span className="font-semibold">{o.title}</span>
              <span className="text-xs text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="me">Your name</Label>
          <Input
            id="me"
            autoFocus
            placeholder="e.g. Ehsan"
            autoComplete="given-name"
            value={me}
            maxLength={40}
            onChange={(e) => setMe(e.target.value)}
            className="h-12"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="friend">{kind === "home" ? "Who lives with you?" : "Who's coming?"}</Label>
          <div className="flex gap-2">
            <Input
              id="friend"
              placeholder="Name"
              value={friend}
              maxLength={40}
              enterKeyHint="next"
              onChange={(e) => setFriend(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addFriend()
                }
              }}
              className="h-12"
            />
            <Button
              type="button"
              variant="outline"
              className="h-12 px-4"
              // Keep the name field focused (and the keyboard up) to add the next person
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                addFriend()
                document.getElementById("friend")?.focus()
              }}
              disabled={!friend.trim()}
              aria-label="Add person"
            >
              <Plus />
            </Button>
          </div>
          {friends.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {friends.map((f) => (
                <li key={f} className="inline-flex min-h-10 items-center gap-1.5 rounded-full border bg-card py-1 pr-1 pl-1">
                  <MemberAvatar id={f} name={f} className="size-7 text-[10px]" />
                  <span className="text-sm font-medium">{f}</span>
                  <button
                    type="button"
                    onClick={() => setFriends(friends.filter((x) => x !== f))}
                    className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                    aria-label={`Remove ${f}`}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">You can add people later, or they can join with your link.</p>
        </div>

        {kind === "home" && (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Monthly bills you share</legend>
              <div className="flex flex-wrap gap-2">
                {STARTER_BILLS.map((b) => (
                  <Chip key={b.title} selected={bills.has(b.title)} onClick={() => toggleBill(b.title)} className="min-h-9 px-3 text-[13px]">
                    {b.title}
                  </Chip>
                ))}
              </div>
              {bills.has("Rent") && (
                <Input
                  inputMode="decimal"
                  placeholder="Monthly rent (optional)"
                  value={rentText}
                  onChange={(e) => setRentText(e.target.value)}
                  className="mt-2 h-11"
                  aria-label="Monthly rent"
                />
              )}
              <p className="text-xs text-muted-foreground">Each month they show up to pay with one tap. Change them any time.</p>
            </fieldset>

            <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <Label htmlFor="meal-mode" className="font-normal">
                <span className="font-medium">We count meals (mess)</span>
                <span className="block text-xs text-muted-foreground">Bazar is split by how many meals each person eats.</span>
              </Label>
              <Switch id="meal-mode" checked={mealMode} onCheckedChange={setMealMode} />
            </div>
          </>
        )}

        <div className="space-y-3">
          <Label htmlFor="trip-name">Name</Label>
          <Input
            id="trip-name"
            placeholder={DEFAULTS[kind].placeholder}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="h-12"
          />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
            {TRIP_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={emoji === e}
                onClick={() => setEmoji(e)}
                className={emoji === e ? "size-11 rounded-xl bg-primary/15 text-xl ring-2 ring-primary" : "size-11 rounded-xl bg-secondary text-xl"}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-12 w-full rounded-md border border-input bg-transparent px-3"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} · {currencyName(c)}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" size="lg" className="h-13 w-full text-base" disabled={!valid || saving}>
          Create {kind === "home" ? "home" : "trip"}
        </Button>
      </form>
    </div>
  )
}
