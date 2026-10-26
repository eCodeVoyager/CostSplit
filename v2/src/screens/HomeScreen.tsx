import { useLiveQuery } from "dexie-react-hooks"
import { ChevronRight, CloudOff, Link2, Plus, Share, Smartphone, UserRound, UtensilsCrossed, WifiOff, Zap } from "lucide-react"
import { useState } from "react"
import { useLocation } from "wouter"
import { BalanceText } from "@/components/common"
import { openSignIn } from "@/components/SignInSheet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useBackClose } from "@/hooks/useBackClose"
import { useInstall } from "@/hooks/useInstall"
import { useSession } from "@/lib/auth"
import { computeBalances, mealWeights } from "@/lib/balance"
import { db, getKV, meKey } from "@/lib/db"
import { parseInvite } from "@/lib/nav"
import { hasServer, isAndroidBrowser, publicOrigin } from "@/lib/server"

export function HomeScreen() {
  const [, navigate] = useLocation()
  const [joinOpen, setJoinOpen] = useState(false)
  const session = useSession()
  const signedOut = hasServer() && !session

  const trips = useLiveQuery(async () => {
    const all = (await db.trips.toArray()).filter((t) => !t.deleted)
    const rows = await Promise.all(
      all.map(async (trip) => {
        const [members, expenses, payments, meals, meId] = await Promise.all([
          db.members.where("tripId").equals(trip.id).toArray(),
          db.expenses.where("tripId").equals(trip.id).toArray(),
          db.payments.where("tripId").equals(trip.id).toArray(),
          db.meals.where("tripId").equals(trip.id).toArray(),
          getKV<string | null>(meKey(trip.id), null),
        ])
        const live = expenses.filter((e) => !e.deleted)
        const balances = computeBalances(trip, members, live, payments.filter((p) => !p.deleted), mealWeights(meals))
        const lastActivity = Math.max(trip.updatedAt, ...live.map((e) => e.updatedAt))
        return {
          trip,
          people: members.filter((m) => !m.deleted).length,
          count: live.length,
          me: balances.find((b) => b.memberId === meId),
          lastActivity,
        }
      })
    )
    return rows.sort((a, b) => b.lastActivity - a.lastActivity)
  })

  if (trips === undefined) return null

  return (
    <div className="pt-safe mx-auto min-h-dvh max-w-lg px-4 pb-10">
      <header className="flex items-center gap-3 py-5">
        <img src="/favicon.svg" alt="" className="size-10 rounded-xl" />
        <div>
          <h1 className="text-xl font-bold">CostSplit</h1>
          <p className="text-xs text-muted-foreground">Shared home & trip costs. Works offline.</p>
        </div>
      </header>

      {trips.length === 0 ? (
        <Welcome onNew={() => navigate("/new")} onJoin={() => setJoinOpen(true)} signedOut={signedOut} />
      ) : (
        <>
          {signedOut && (
            <button
              type="button"
              onClick={() => openSignIn()}
              className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-negative-soft p-4 text-left text-negative active:opacity-80"
            >
              <CloudOff className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">Only on this phone</span>
                <span className="block opacity-90">Sign in to sync with your flatmates and keep a copy safe.</span>
              </span>
              <ChevronRight className="size-5" aria-hidden />
            </button>
          )}
          <ul className="space-y-3">
            {trips.map(({ trip, people, count, me }) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/t/${trip.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition-transform active:scale-[0.99]"
                >
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl" aria-hidden>
                    {trip.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{trip.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {trip.kind === "home" ? "Home" : "Trip"} · {people} {people === 1 ? "person" : "people"} · {count}{" "}
                      {count === 1 ? "expense" : "expenses"}
                    </p>
                    {me && count > 0 && <BalanceText net={me.net} currency={trip.currency} you className="text-sm" />}
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button size="lg" className="h-12" onClick={() => navigate("/new")}>
              <Plus /> New
            </Button>
            <Button size="lg" variant="outline" className="h-12" onClick={() => setJoinOpen(true)}>
              <Link2 /> Join
            </Button>
          </div>
          <InstallCard />
        </>
      )}

      <JoinDialog open={joinOpen} onOpenChange={setJoinOpen} onJoin={(id) => navigate(`/join/${id}`)} />
    </div>
  )
}

function Welcome({ onNew, onJoin, signedOut }: { onNew: () => void; onJoin: () => void; signedOut: boolean }) {
  const points = [
    { icon: Zap, title: "Bills every month", text: "Rent, electricity, internet, maid. Set once, tap Pay each month." },
    { icon: UtensilsCrossed, title: "Bazar by meals", text: "Mess-style meal count with a live meal rate. Or just split equally." },
    { icon: WifiOff, title: "Works with no signal", text: "Saved on your phone first, syncs when online. Share one link to join." },
  ]
  return (
    <div className="pt-6">
      <h2 className="text-3xl leading-tight font-bold text-balance">Flatmates, bills, bazar. Sorted.</h2>
      <p className="mt-3 text-muted-foreground">
        Track everything your home spends together and see who owes whom. Trips work too.
      </p>
      <ul className="mt-8 space-y-5">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <p.icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm text-muted-foreground">{p.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-10 flex flex-col gap-2">
        <Button size="lg" className="h-13 text-base" onClick={onNew}>
          <Plus /> Set up your home
        </Button>
        <Button size="lg" variant="ghost" className="h-12 text-base" onClick={onJoin}>
          <Link2 /> I have an invite link
        </Button>
        {signedOut && (
          <Button
            size="lg"
            variant="ghost"
            className="h-12 text-base"
            onClick={() => openSignIn("Sign in with the email you used before to bring back your homes and trips.")}
          >
            <UserRound /> Sign in to restore my groups
          </Button>
        )}
      </div>
      <InstallCard />
    </div>
  )
}

function InstallCard() {
  const { canPrompt, showIOSHint, install } = useInstall()
  if (isAndroidBrowser) {
    return (
      <a
        href={`${publicOrigin()}/download/`}
        className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed p-4 active:bg-accent"
      >
        <Smartphone className="size-6 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">Get the Android app</span>
          <span className="block text-muted-foreground">Small download, works offline.</span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
      </a>
    )
  }
  if (!canPrompt && !showIOSHint) return null
  return (
    <div className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed p-4">
      <Smartphone className="size-6 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">Install as an app</p>
        <p className="text-muted-foreground">
          {canPrompt ? (
            "Home screen icon, full screen, offline."
          ) : (
            <>
              Tap <Share className="inline size-3.5" aria-label="Share" /> then “Add to Home Screen”.
            </>
          )}
        </p>
      </div>
      {canPrompt && (
        <Button className="h-10" onClick={install}>
          Install
        </Button>
      )}
    </div>
  )
}

function JoinDialog({
  open,
  onOpenChange,
  onJoin,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onJoin: (id: string) => void
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState("")
  useBackClose(open, () => onOpenChange(false))

  const submit = () => {
    const id = parseInvite(value)
    if (!id) {
      setError("That doesn't look like a CostSplit link")
      return
    }
    onOpenChange(false)
    onJoin(id)
  }

  const paste = async () => {
    try {
      setValue(await navigator.clipboard.readText())
      setError("")
    } catch {
      // Clipboard permission denied: user can paste manually
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a home or trip</DialogTitle>
          <DialogDescription>Paste the invite link a friend sent you.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="https://…/join/…"
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                setError("")
              }}
              className="h-11"
              aria-label="Invite link"
              aria-invalid={!!error}
            />
            {"clipboard" in navigator && "readText" in navigator.clipboard && (
              <Button type="button" variant="outline" className="h-11" onClick={paste}>
                Paste
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full" disabled={!value.trim()}>
            Join
          </Button>
          <p className="text-center text-xs text-muted-foreground">Needs internet once to download. You'll sign in with your email.</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
