import { lazy, Suspense } from "react"
import { Redirect, Route, Switch } from "wouter"
import { Splash } from "@/components/common"
import { Toaster } from "@/components/ui/sonner"
import { HomeScreen } from "@/screens/HomeScreen"
import { JoinScreen } from "@/screens/JoinScreen"
import { TripShell } from "@/screens/TripShell"

const NewTripScreen = lazy(() => import("@/screens/NewTripScreen"))

export default function App() {
  return (
    <>
      <Suspense fallback={<Splash />}>
        <Switch>
          <Route path="/" component={HomeScreen} />
          <Route path="/new" component={NewTripScreen} />
          <Route path="/join/:id">{(p) => <JoinScreen id={p.id} />}</Route>
          <Route path="/t/:id" nest>
            {(p) => <TripShell key={p.id} id={p.id} />}
          </Route>
          <Route>
            <Redirect to="/" replace />
          </Route>
        </Switch>
      </Suspense>
      {/* Below the status bar on edge-to-edge Android */}
      <Toaster position="top-center" offset={{ top: "calc(var(--sat) + 12px)" }} mobileOffset={{ top: "calc(var(--sat) + 8px)" }} />
    </>
  )
}
