import { Copy, Mail, Share2, UserRound } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { renderSVG } from "uqr"
import { openSignIn } from "@/components/SignInSheet"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useBackClose } from "@/hooks/useBackClose"
import { useOnline } from "@/hooks/useInstall"
import { useTrip } from "@/hooks/useTripData"
import { sendInvite, useSession } from "@/lib/auth"
import { EMAIL_RE, notJoined } from "@/lib/people"
import { setMemberEmail } from "@/lib/repo"
import { hasServer } from "@/lib/server"
import { memberLink, shareOrCopy, tripLink } from "@/lib/share"
import { syncTrip } from "@/lib/sync"
import type { Trip } from "@/lib/types"
import { cn } from "@/lib/utils"
import { MemberAvatar } from "./common"

/**
 * Invite link for everyone (they pick their name), or a personal one for a
 * person already on the list: it joins as them straight away. A personal
 * invite can also go by email; signing in with that address picks them too.
 */
export function ShareDialog({
  trip,
  open,
  onOpenChange,
  initialMember = null,
}: {
  trip: Trip
  open: boolean
  onOpenChange: (o: boolean) => void
  initialMember?: string | null
}) {
  useBackClose(open, () => onOpenChange(false))
  const session = useSession()
  const online = useOnline()
  const { members, meId, kind } = useTrip()
  const waiting = notJoined(members, meId)
  const [forId, setForId] = useState<string | null>(initialMember)
  const person = forId ? members.find((m) => m.id === forId) : undefined
  const link = person ? memberLink(trip.id, person.id) : tripLink(trip.id)
  const svg = useMemo(() => renderSVG(link, { border: 2, pixelSize: 8 }), [link])
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => setEmail(person?.email ?? ""), [person?.id, person?.email])

  // The link only works once this group is on the server, which needs an account
  if (hasServer() && !session) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign in to invite</DialogTitle>
            <DialogDescription>
              Right now “{trip.name}” is only on this phone. Sign in with your email so it syncs, then share the link.
            </DialogDescription>
          </DialogHeader>
          <Button
            className="h-11"
            onClick={() => {
              // Close first, then open the sheet once this dialog has left the history stack
              onOpenChange(false)
              setTimeout(() => openSignIn("Sign in so others can join with your invite link."), 220)
            }}
          >
            <UserRound /> Sign in with email
          </Button>
        </DialogContent>
      </Dialog>
    )
  }

  const what = kind === "home" ? "our home costs" : "our trip expenses"
  const share = async () => {
    const result = await shareOrCopy({
      title: trip.name,
      text: person
        ? `Hi ${person.name}, join "${trip.name}" on CostSplit for ${what}. This link sets you up as ${person.name}:`
        : `Join "${trip.name}" on CostSplit for ${what}:`,
      url: link,
    })
    if (result === "copied") toast.success("Invite link copied")
  }

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success("Link copied")
  }

  const validEmail = EMAIL_RE.test(email.trim())
  const sendEmail = async () => {
    if (!person || !validEmail || sending) return
    const address = email.trim().toLowerCase()
    setSending(true)
    try {
      // Saved on the person either way: signing in with this address picks them
      if (person.email !== address) await setMemberEmail(person.id, address)
      // The server needs to know this person before it can write to them
      await syncTrip(trip.id)
      await sendInvite(trip.id, person.id, address)
      toast.success(`Invite sent to ${address}`, { description: `${person.name} joins as ${person.name} with one tap.` })
    } catch (err) {
      toast.error("Couldn't send the invite", {
        description: `${err instanceof Error ? err.message : String(err)} You can still share the link.`,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? `Invite ${person.name}` : "Invite people"}</DialogTitle>
          <DialogDescription>
            {person
              ? `This link is for ${person.name} only: opening it joins as ${person.name}, no name picking.`
              : "Anyone with this link can join, view and add expenses. They pick their name when they open it."}
          </DialogDescription>
        </DialogHeader>

        {waiting.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Who is this link for?</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Who is this link for?">
              <PersonChip selected={!person} onClick={() => setForId(null)}>
                Anyone
              </PersonChip>
              {waiting.map((m) => (
                <PersonChip key={m.id} selected={person?.id === m.id} onClick={() => setForId(m.id)}>
                  <MemberAvatar id={m.id} name={m.name} className="-ml-1.5 size-6 text-[9px]" />
                  {m.name}
                </PersonChip>
              ))}
            </div>
          </div>
        )}

        <div
          className="mx-auto w-52 overflow-hidden rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
          role="img"
          aria-label="QR code with the invite link"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="truncate rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground" data-testid="invite-link">
          {link}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={copy}>
            <Copy /> Copy
          </Button>
          <Button className="h-11" onClick={share}>
            <Share2 /> Share
          </Button>
        </div>

        {person && hasServer() && (
          <form
            className="space-y-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault()
              sendEmail()
            }}
          >
            <label htmlFor="invite-email" className="text-sm font-medium">
              Or email it to {person.name}
            </label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="off"
                placeholder="name@example.com"
                value={email}
                maxLength={254}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
              <Button type="submit" className="h-11" disabled={!validEmail || sending || !online} aria-label={`Email the invite to ${person.name}`}>
                <Mail /> {sending ? "Sending…" : "Send"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {online
                ? `If ${person.name} signs in with this address, the app knows it's them, even with the general link.`
                : "Connect to the internet to send an email. Sharing the link works offline."}
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PersonChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"
      )}
    >
      {children}
    </button>
  )
}
