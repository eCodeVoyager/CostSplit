import { lazy, Suspense } from "react"
import { Redirect, Route, Switch } from "wouter"
import { Splash } from "@/components/common"
import { SignInHost } from "@/components/SignInSheet"
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
      <SignInHost />
      {/* Edge-to-edge Android: scrolled content never runs under the clock and battery icons */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-(--sat) bg-background/90 backdrop-blur-md" />
      {/* Snackbar-style: above the tab bar and + button, so toasts never cover the header's back/sync/invite buttons */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(var(--sab) + 96px)" }}
        mobileOffset={{ bottom: "calc(var(--sab) + 96px)" }}
      />
    </>
  )
}
