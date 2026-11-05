import { UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useSession } from "@/lib/auth"
import { addMember, linkMe, setMe } from "@/lib/repo"
import type { Member } from "@/lib/types"
import { MemberAvatar } from "./common"

/**
 * Asked once per group per phone, only when the app can't tell by itself (no
 * personal invite link, no earlier join with this account, no invited email).
 */
export function WhoAreYou({
  tripId,
  members,
  open,
  onOpenChange,
}: {
  tripId: string
  members: Member[]
  open: boolean
  onOpenChange?: (o: boolean) => void
}) {
  const user = useSession()?.user ?? null
  const [name, setName] = useState("")

  // Suggest the profile name for "not listed"
  useEffect(() => {
    if (open) setName(user?.name ?? "")
  }, [open, user?.name])

  const pick = async (id: string) => {
    await setMe(tripId, id)
    // Picking by hand ties the person to this account, so other phones know too
    if (user) await linkMe(tripId, id, user, true)
    onOpenChange?.(false)
  }

  const addSelf = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = await addMember(tripId, trimmed.slice(0, 40))
    await pick(id)
  }

  // People nobody has joined as yet come first
  const sorted = [...members].sort((a, b) => Number(!!a.userId && a.userId !== user?.id) - Number(!!b.userId && b.userId !== user?.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={!!onOpenChange}>
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
          <DialogDescription>
            Pick your name so we can show what you owe.{user ? " Your other phones will know it too." : " Only saved on this phone."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50dvh] gap-2 overflow-y-auto">
          {sorted.map((m) => {
            const taken = !!m.userId && m.userId !== user?.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                aria-describedby={taken ? `who-taken-${m.id}` : undefined}
                className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 py-1.5 text-left font-medium hover:bg-accent active:scale-[0.99]"
              >
                <MemberAvatar id={m.id} name={m.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{m.name}</span>
                  {taken && (
                    <span id={`who-taken-${m.id}`} className="block truncate text-xs font-normal text-muted-foreground">
                      Already joined{m.email ? ` as ${m.email}` : ""}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addSelf()
          }}
        >
          <Input
            placeholder="Not listed? Your name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            className="h-11"
            aria-label="Your name, if you're not listed"
          />
          <Button type="submit" variant="outline" className="h-11" disabled={!name.trim()} aria-label="Add me">
            <UserPlus />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
