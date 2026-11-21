import { lazy, Suspense } from "react"
import { Redirect, Route, Switch } from "wouter"
import { AdhanHost } from "@/components/AdhanHost"
import { Splash } from "@/components/common"
import { NotificationsHost } from "@/components/NotificationsHost"
import { UpdateSheet, WhatsNewSheet } from "@/components/UpdateSheets"
import { SignInHost } from "@/components/SignInSheet"
import { Toaster } from "@/components/ui/sonner"
import { HomeScreen } from "@/screens/HomeScreen"
import { JoinScreen } from "@/screens/JoinScreen"
import { TripShell } from "@/screens/TripShell"

const NewTripScreen = lazy(() => import("@/screens/NewTripScreen"))
const ProfileScreen = lazy(() => import("@/screens/ProfileScreen"))
const PrayerScreen = lazy(() => import("@/screens/PrayerScreen"))

export default function App() {
  return (
    <>
      <Suspense fallback={<Splash />}>
        <Switch>
          <Route path="/" component={HomeScreen} />
          <Route path="/new" component={NewTripScreen} />
          <Route path="/profile" component={ProfileScreen} />
          <Route path="/prayer">{() => <PrayerScreen standalone />}</Route>
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
      <NotificationsHost />
      <AdhanHost />
      <UpdateSheet />
      <WhatsNewSheet />
      {/* Edge-to-edge Android: scrolled content never runs under the clock and battery icons */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-(--sat) bg-background/90 backdrop-blur-md" />
      {/* At the top, just under the header (back/sync/invite stay tappable), away from the tab bar and + button */}
      <Toaster
        position="top-center"
        offset={{ top: "calc(var(--sat) + 64px)" }}
        mobileOffset={{ top: "calc(var(--sat) + 64px)" }}
      />
    </>
  )
}
