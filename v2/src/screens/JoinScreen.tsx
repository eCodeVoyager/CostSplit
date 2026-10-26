import { CircleAlert, UserRound, WifiOff } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useLocation } from "wouter"
import { EmptyState, Splash } from "@/components/common"
import { openSignIn } from "@/components/SignInSheet"
import { Button } from "@/components/ui/button"
import { useOnline } from "@/hooks/useInstall"
import { useSession } from "@/lib/auth"
import { isTripId } from "@/lib/nav"
import { joinTrip, SignedOutError, TripNotFoundError } from "@/lib/sync"

type State = "joining" | "offline" | "notfound" | "signedout" | "error"

const JOIN_REASON = "Sign in with your email to join. Then this group syncs on every phone you use."

/**
 * Downloads a shared trip. `embedded` means we're already on /t/:id and the
 * trip screen takes over by itself once the data lands in IndexedDB.
 */
export function JoinScreen({ id, embedded }: { id: string; embedded?: boolean }) {
  const [, navigate] = useLocation()
  const online = useOnline()
  const session = useSession()
  const [state, setState] = useState<State>("joining")

  const run = useCallback(async () => {
    if (!isTripId(id)) return setState("notfound")
    if (!navigator.onLine) return setState("offline")
    setState("joining")
    try {
      await joinTrip(id)
      if (!embedded) navigate(`~/t/${id}`, { replace: true })
    } catch (err) {
      if (err instanceof SignedOutError) {
        setState("signedout")
        openSignIn(JOIN_REASON)
      } else setState(err instanceof TripNotFoundError ? "notfound" : "error")
    }
  }, [id, embedded, navigate])

  // Runs again right after signing in
  useEffect(() => {
    run()
  }, [run, session])

  // Retry automatically when the connection comes back
  useEffect(() => {
    if (online && state === "offline") run()
  }, [online, state, run])

  const home = (
    <Button size="lg" variant="outline" className="h-12" onClick={() => navigate("~/", { replace: true })}>
      Go to my trips
    </Button>
  )

  if (state === "joining") return <Splash />

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <div className="w-full">
        {state === "offline" && (
          <EmptyState icon={WifiOff} title="Connect once to join" action={home}>
            This trip isn't on your phone yet. Join with internet once, then it works offline.
          </EmptyState>
        )}
        {state === "signedout" && (
          <EmptyState
            icon={UserRound}
            title="Sign in to join"
            action={
              <div className="flex flex-col gap-2">
                <Button size="lg" className="h-12" onClick={() => openSignIn(JOIN_REASON)}>
                  Sign in with email
                </Button>
                {home}
              </div>
            }
          >
            Joining needs a free account, so the group stays in sync on every phone.
          </EmptyState>
        )}
        {state === "notfound" && (
          <EmptyState icon={CircleAlert} title="Trip not found" action={home}>
            Check the link with whoever sent it. The trip may not have synced yet.
          </EmptyState>
        )}
        {state === "error" && (
          <EmptyState
            icon={CircleAlert}
            title="Couldn't reach the server"
            action={
              <div className="flex flex-col gap-2">
                <Button size="lg" className="h-12" onClick={run}>
                  Try again
                </Button>
                {home}
              </div>
            }
          >
            Your connection may be weak. Try again in a moment.
          </EmptyState>
        )}
      </div>
    </div>
  )
}
