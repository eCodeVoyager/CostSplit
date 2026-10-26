import { Copy, Share2 } from "lucide-react"
import { useMemo } from "react"
import { toast } from "sonner"
import { renderSVG } from "uqr"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useBackClose } from "@/hooks/useBackClose"
import { shareOrCopy, tripLink } from "@/lib/share"
import type { Trip } from "@/lib/types"

export function ShareDialog({ trip, open, onOpenChange }: { trip: Trip; open: boolean; onOpenChange: (o: boolean) => void }) {
  useBackClose(open, () => onOpenChange(false))
  const link = tripLink(trip.id)
  const svg = useMemo(() => renderSVG(link, { border: 2, pixelSize: 8 }), [link])

  const share = async () => {
    const result = await shareOrCopy({
      title: trip.name,
      text: `Join "${trip.name}" on CostSplit to add our trip expenses:`,
      url: link,
    })
    if (result === "copied") toast.success("Invite link copied")
  }

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    toast.success("Link copied")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Invite friends</DialogTitle>
          <DialogDescription>
            Anyone with this link can view and add expenses. Scan it, or send it in your group chat.
          </DialogDescription>
        </DialogHeader>
        <div
          className="mx-auto w-56 overflow-hidden rounded-xl bg-white p-2 [&>svg]:h-auto [&>svg]:w-full"
          role="img"
          aria-label="QR code with the invite link"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <p className="truncate rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">{link}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11" onClick={copy}>
            <Copy /> Copy
          </Button>
          <Button className="h-11" onClick={share}>
            <Share2 /> Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
