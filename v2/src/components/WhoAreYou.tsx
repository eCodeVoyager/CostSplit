import { UserPlus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { addMember, setMe } from "@/lib/repo"
import type { Member } from "@/lib/types"
import { MemberAvatar } from "./common"

/** Asked once per trip per device, so the app can say "you owe" instead of names */
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
  const [name, setName] = useState("")

  const pick = async (id: string) => {
    await setMe(tripId, id)
    onOpenChange?.(false)
  }

  const addSelf = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const id = await addMember(tripId, trimmed)
    await pick(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" showCloseButton={!!onOpenChange}>
        <DialogHeader>
          <DialogTitle>Who are you?</DialogTitle>
          <DialogDescription>Pick your name so we can show what you owe. Only saved on this phone.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[50dvh] gap-2 overflow-y-auto">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m.id)}
              className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3 text-left font-medium hover:bg-accent active:scale-[0.99]"
            >
              <MemberAvatar id={m.id} name={m.name} />
              {m.name}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            addSelf()
          }}
        >
          <Input placeholder="Not listed? Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} className="h-11" />
          <Button type="submit" variant="outline" className="h-11" disabled={!name.trim()} aria-label="Add me">
            <UserPlus />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
