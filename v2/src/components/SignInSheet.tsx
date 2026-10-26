import { Mail } from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useBackClose } from "@/hooks/useBackClose"
import { requestCode, verifyCode } from "@/lib/auth"
import { restoreFromAccount } from "@/lib/sync"

const RESEND_AFTER = 30

// One sheet for the whole app: the sync badge, invites, joining and settings all open it
let reason: string | null = null
const listeners = new Set<() => void>()
const setReason = (next: string | null) => {
  reason = next
  listeners.forEach((l) => l())
}

/** Ask for an email sign-in. `why` is shown under the title. */
export function openSignIn(why = "Sign in with your email to sync with your flatmates and keep a copy safe.") {
  setReason(why)
}

export function SignInHost() {
  const why = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => reason
  )
  return <SignInSheet open={why !== null} why={why ?? ""} onClose={() => setReason(null)} />
}

function SignInSheet({ open, why, onClose }: { open: boolean; why: string; onClose: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [wait, setWait] = useState(0)
  useBackClose(open, onClose)

  useEffect(() => {
    if (!open) return
    setStep("email")
    setCode("")
    setError("")
  }, [open])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async () => {
    if (busy || !email.trim()) return
    setBusy(true)
    setError("")
    try {
      await requestCode(email.trim())
      setStep("code")
      setCode("")
      setWait(RESEND_AFTER)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (value = code) => {
    if (busy || value.length !== 6) return
    setBusy(true)
    setError("")
    try {
      const { user } = await verifyCode(email.trim(), value)
      onClose()
      toast.success(`Signed in as ${user.email}`)
      // A new phone gets back every group this account is in
      const restored = await restoreFromAccount().catch(() => 0)
      if (restored > 0) toast(`Brought back ${restored} ${restored === 1 ? "group" : "groups"}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[94dvh]">
        <form
          className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            if (step === "email") send()
            else verify()
          }}
        >
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg">{step === "email" ? "Sign in" : "Check your email"}</DrawerTitle>
            <DrawerDescription>
              {step === "email" ? why : `We sent a 6-digit code to ${email.trim()}. It works for 10 minutes.`}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-3 px-4 pb-4">
            {step === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  placeholder="you@example.com"
                  value={email}
                  maxLength={254}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError("")
                  }}
                  className="h-12 text-base"
                  aria-invalid={!!error}
                />
                <p className="text-xs text-muted-foreground">No password. We email you a code each time you sign in.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="signin-code">Code</Label>
                <Input
                  id="signin-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  maxLength={6}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6)
                    setCode(digits)
                    setError("")
                    if (digits.length === 6) verify(digits)
                  }}
                  className="h-12 text-center text-2xl font-semibold tracking-[0.4em] tabular"
                  aria-invalid={!!error}
                />
                <div className="flex justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-1" onClick={() => setStep("email")}>
                    Use another email
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-9 px-1" onClick={send} disabled={busy || wait > 0}>
                    {wait > 0 ? `New code in ${wait}s` : "Send a new code"}
                  </Button>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter className="border-t pt-3 pb-[max(1rem,var(--sab))]">
            {step === "email" ? (
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy || !email.trim()}>
                <Mail /> {busy ? "Sending…" : "Email me a code"}
              </Button>
            ) : (
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={busy || code.length !== 6}>
                {busy ? "Checking…" : "Sign in"}
              </Button>
            )}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
