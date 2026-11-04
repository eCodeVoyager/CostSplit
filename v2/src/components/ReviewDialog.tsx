import { Check, Pencil } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useBackClose } from "@/hooks/useBackClose"

/**
 * "Check before saving": a last look at exactly what will be recorded,
 * so wrong amounts, payers or splits are caught before balances change.
 */
export function ReviewDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  onEdit,
  children,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** "Edit" goes somewhere else than back (defaults to onCancel) */
  onEdit?: () => void
  children: ReactNode
}) {
  useBackClose(open, onCancel)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-4 pt-4 pb-3">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description ?? "Check the details. Everyone in the group will see this."}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button variant="outline" size="lg" className="h-12" onClick={onEdit ?? onCancel}>
            <Pencil /> Edit
          </Button>
          <Button size="lg" className="h-12" onClick={onConfirm} autoFocus>
            <Check /> {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "Amount: ৳500 → ৳550" lines for edits */
export function ChangeList({ changes }: { changes: { label: string; from: string; to: string }[] }) {
  if (changes.length === 0) {
    return <p className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">Nothing changed.</p>
  }
  return (
    <section className="space-y-1.5">
      <h3 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">What changes</h3>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card text-sm">
        {changes.map((c) => (
          <li key={c.label} className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className="flex flex-wrap items-center gap-x-1.5">
              <span className="text-muted-foreground line-through">{c.from || "—"}</span>
              <span aria-hidden>→</span>
              <span className="font-medium">{c.to || "—"}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
