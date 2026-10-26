import { Camera, ImageOff, Loader2, X } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useBackClose } from "@/hooks/useBackClose"
import { savePhoto, usePhoto } from "@/lib/photos"
import { cn } from "@/lib/utils"
import { Chip } from "./common"

/** Optional photo (receipt, payment proof): camera or gallery, shown as a thumbnail */
export function PhotoField({
  tripId,
  value,
  onChange,
  label,
}: {
  tripId: string
  value?: string
  onChange: (fileId: string | undefined) => void
  label: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState(false)

  const pick = async (file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await savePhoto(tripId, file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the photo")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {value ? (
        <div className="flex items-center gap-3">
          <PhotoThumb tripId={tripId} fileId={value} onClick={() => setViewing(true)} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{label}</p>
            <button type="button" className="min-h-9 text-primary" onClick={() => input.current?.click()}>
              Replace
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            aria-label={`Remove ${label.toLowerCase()}`}
          >
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <Chip onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {label}
        </Chip>
      )}
      <PhotoViewer tripId={tripId} fileId={viewing ? value : undefined} onClose={() => setViewing(false)} label={label} />
    </>
  )
}

export function PhotoThumb({
  tripId,
  fileId,
  onClick,
  className,
}: {
  tripId: string
  fileId: string
  onClick?: () => void
  className?: string
}) {
  const photo = usePhoto(tripId, fileId)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted", className)}
      aria-label="View photo"
    >
      {photo?.status === "ready" ? (
        <img src={photo.url} alt="" className="size-full object-cover" />
      ) : photo?.status === "loading" ? (
        <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <ImageOff className="m-auto size-5 text-muted-foreground" aria-hidden />
      )}
    </button>
  )
}

export function PhotoViewer({
  tripId,
  fileId,
  onClose,
  label = "Photo",
}: {
  tripId: string
  fileId?: string
  onClose: () => void
  label?: string
}) {
  const open = !!fileId
  useBackClose(open, onClose)
  const photo = usePhoto(tripId, fileId)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(100vw-1rem,40rem)] p-2">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">Full size photo</DialogDescription>
        {photo?.status === "ready" ? (
          <img src={photo.url} alt={label} className="max-h-[80dvh] w-full rounded-lg object-contain" />
        ) : (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {photo?.status === "unavailable" ? photo.reason : "Loading…"}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
