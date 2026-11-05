import { useLiveQuery } from "dexie-react-hooks"
import { Bell, Download, RefreshCw, ShieldCheck, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useBackClose } from "@/hooks/useBackClose"
import { db } from "@/lib/db"
import { notifyPermission, requestNotifyPermission } from "@/lib/notify"
import { isNative } from "@/lib/server"
import {
  APP_VERSION,
  downloadUpdate,
  installUpdate,
  isRequired,
  markWhatsNewSeen,
  releasesSince,
  setUpdateSheet,
  snoozeUpdate,
  useUpdate,
  whatsNewFor,
  type Release,
} from "@/lib/update"

const mb = (bytes?: number) => (bytes ? `${(bytes / 1_048_576).toFixed(1)} MB` : "")

/** "CostSplit 2.2.0 is ready": download in the app, install with one tap */
export function UpdateSheet() {
  const { state, open } = useUpdate()
  const [waiting, setWaiting] = useState(false)
  const info = "info" in state ? state.info : null
  const required = !!info && isRequired(info)
  const close = () => (required ? undefined : snoozeUpdate())
  useBackClose(open && !required, () => snoozeUpdate())

  // Back from Android's "allow installs" screen: carry on installing
  useEffect(() => {
    if (!waiting) return
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      installUpdate()
        .then((r) => r === "installing" && setWaiting(false))
        .catch(() => setWaiting(false))
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [waiting])

  if (!info) return null
  const notes = info.notes?.length ? info.notes : releasesSince(APP_VERSION).flatMap((r) => r.notes)

  const install = async () => {
    const result = await installUpdate()
    setWaiting(result === "needs-permission")
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()} dismissible={!required}>
      <DrawerContent className="max-h-[90dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="py-3">
            <DrawerTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5 text-primary" aria-hidden />
              CostSplit {info.version} {state.status === "ready" ? "is ready" : "is available"}
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              {required
                ? `This version (${APP_VERSION}) can't sync any more. Update to keep going.`
                : `You have ${APP_VERSION}.`}
            </DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            {notes.length > 0 && (
              <ul className="space-y-2 rounded-2xl border bg-card p-3 text-sm">
                {notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            )}
            <p className="flex items-start gap-2 rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your homes, expenses and settings stay exactly as they are. Android asks you to confirm the update; if Play
              Protect offers to scan it, tap Scan app. After this one, updates install by themselves.
            </p>
            {state.status === "downloading" && (
              <div aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${state.percent}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular">Downloading… {state.percent}%</p>
              </div>
            )}
            {state.status === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {state.message}
              </p>
            )}
            {waiting && (
              <p className="rounded-xl bg-accent px-3 py-2 text-xs">
                Turn on “Allow from this source” for CostSplit, then come back. The update continues by itself.
              </p>
            )}
          </div>
          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            {state.status === "ready" ? (
              <Button size="lg" className="h-12 w-full text-base" onClick={install}>
                <RefreshCw /> Install update
              </Button>
            ) : state.status === "downloading" ? (
              <Button size="lg" className="h-12 w-full text-base" disabled>
                Downloading {state.percent}%
              </Button>
            ) : (
              <Button size="lg" className="h-12 w-full text-base" onClick={() => downloadUpdate()}>
                <Download /> {state.status === "error" ? "Try again" : `Download ${mb(info.size)}`}
              </Button>
            )}
            {!required && (
              <Button variant="ghost" className="h-11 w-full" onClick={() => snoozeUpdate()}>
                Later
              </Button>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** Shown once after updating, so people who've used the app for months find the new things */
export function WhatsNewSheet() {
  const groups = useLiveQuery(() => db.trips.count())
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [canAsk, setCanAsk] = useState(false)

  useEffect(() => {
    if (groups === undefined || releases !== null) return
    setReleases(whatsNewFor(groups > 0))
    if (isNative) notifyPermission().then((p) => setCanAsk(p === "prompt")).catch(() => {})
  }, [groups, releases])

  const open = !!releases?.length
  const done = () => {
    markWhatsNewSeen()
    setReleases([])
  }
  useBackClose(open, done)
  if (!releases?.length) return null

  return (
    <Drawer open={open} onOpenChange={(o) => !o && done()}>
      <DrawerContent className="max-h-[90dvh]">
        <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
          <DrawerHeader className="py-3">
            <DrawerTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="size-5 text-primary" aria-hidden /> What's new in CostSplit {APP_VERSION}
            </DrawerTitle>
            <DrawerDescription className="text-xs">{releases[0].title}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
            {releases.map((r) => (
              <ul key={r.version} className="space-y-2 rounded-2xl border bg-card p-3 text-sm">
                {releases.length > 1 && <li className="text-xs font-semibold text-muted-foreground">{r.version}</li>}
                {r.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {n}
                  </li>
                ))}
              </ul>
            ))}
            <p className="text-xs text-muted-foreground">Everything you had is still here. Nothing changes for others until they update too.</p>
          </div>
          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            {canAsk && (
              <Button
                variant="outline"
                size="lg"
                className="h-12 w-full"
                onClick={async () => {
                  await requestNotifyPermission().catch(() => false)
                  setCanAsk(false)
                }}
              >
                <Bell /> Turn on reminders
              </Button>
            )}
            <Button size="lg" className="h-12 w-full text-base" onClick={done}>
              Got it
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

export const openUpdateSheet = () => setUpdateSheet(true)
