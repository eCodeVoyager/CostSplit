import { Camera, ChevronLeft, ImageOff, LogOut, Mail, UserRound } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { EmptyState, MadeBy, MemberAvatar } from "@/components/common"
import { openSignIn } from "@/components/SignInSheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAllGroups } from "@/hooks/useAllGroups"
import { useOnline } from "@/hooks/useInstall"
import { displayName, endSession, removeAvatar, saveProfileName, uploadAvatar, useSession } from "@/lib/auth"
import { rememberAvatar } from "@/lib/avatars"
import { compressImage } from "@/lib/photos"
import { hasServer } from "@/lib/server"
import { APP_VERSION } from "@/lib/update"

/** The account: name and photo (shown on your people in every group), email, sign out */
export default function ProfileScreen() {
  const [, navigate] = useLocation()
  const session = useSession()
  const online = useOnline()
  const groups = useAllGroups()
  const user = session?.user
  const [name, setName] = useState(user?.name ?? "")
  const [busy, setBusy] = useState<"photo" | "name" | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(user?.name ?? ""), [user?.name])

  const back = () => (window.history.length > 1 ? window.history.back() : navigate("/", { replace: true }))

  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : String(err))

  const saveName = async () => {
    const trimmed = name.trim().slice(0, 40)
    if (!user || trimmed === (user.name ?? "")) return setName(user?.name ?? "")
    setBusy("name")
    try {
      await saveProfileName(trimmed)
      toast.success(trimmed ? "Name saved" : "Name removed")
    } catch (err) {
      setName(user.name ?? "")
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const pickPhoto = async (file: File) => {
    setBusy("photo")
    try {
      const jpeg = await compressImage(file, { square: 320, quality: 0.82 })
      const updated = await uploadAvatar(jpeg)
      if (updated.avatar) await rememberAvatar(updated.avatar, jpeg)
      toast.success("Photo updated", { description: "Your flatmates see it next time they sync." })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const dropPhoto = async () => {
    setBusy("photo")
    try {
      await removeAvatar()
      toast("Photo removed")
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const signOut = async () => {
    await endSession()
    toast("Signed out", { description: "Everything stays on this phone. Sign in again to sync." })
  }

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-8">
      <header className="-mx-1.5 flex h-14 items-center gap-1">
        <Button variant="ghost" size="icon" className="size-11" onClick={back} aria-label="Back">
          <ChevronLeft className="size-5" />
        </Button>
        <h1 className="text-lg font-semibold">Profile</h1>
      </header>

      <div className="flex-1">
        {!user ? (
          <EmptyState
            icon={UserRound}
            title={hasServer() ? "Sign in to set up your profile" : "Profiles need sync"}
            action={
              hasServer() && (
                <Button size="lg" className="h-12" onClick={() => openSignIn("Sign in to add your name and photo, and sync your groups.")}>
                  <Mail /> Sign in with email
                </Button>
              )
            }
          >
            Your name and photo show on your people in every home and trip, and new phones know who you are.
          </EmptyState>
        ) : (
          <div className="space-y-6 pt-4">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!online || busy !== null}
                className="relative rounded-full outline-offset-4 disabled:opacity-70"
                aria-label={user.avatar ? "Change profile photo" : "Add a profile photo"}
              >
                <MemberAvatar id={user.id} name={displayName(user)} photo={user.avatar ?? null} className="size-28 text-3xl" />
                <span className="absolute right-0 bottom-0 inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
                  {busy === "photo" ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Camera className="size-4" aria-hidden />
                  )}
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) pickPhoto(file)
                  e.target.value = ""
                }}
              />
              <div className="text-center">
                <p className="text-xl font-semibold">{displayName(user)}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              {user.avatar && (
                <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={dropPhoto} disabled={!online || busy !== null}>
                  <ImageOff /> Remove photo
                </Button>
              )}
            </div>

            <div className="space-y-4 rounded-2xl border bg-card p-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Your name</Label>
                <Input
                  id="profile-name"
                  value={name}
                  maxLength={40}
                  autoComplete="name"
                  placeholder="e.g. Ehsan"
                  disabled={!online || busy === "name"}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">Filled in for you when you start or join a group, and shown on invite emails you send.</p>
              </div>
              <div className="flex items-start gap-3 border-t pt-4">
                <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Email</p>
                  <p className="truncate text-sm">{user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    You sign in with it. When someone invites this address, you join as the right person by yourself.
                  </p>
                </div>
              </div>
              {groups && (
                <p className="border-t pt-4 text-sm text-muted-foreground">
                  On this phone: {groups.length} {groups.length === 1 ? "group" : "groups"}. Your photo shows on you in each of them.
                </p>
              )}
              {!online && <p className="text-xs text-muted-foreground">You're offline. Changes to your name and photo need internet.</p>}
            </div>

            <Button variant="outline" className="h-12 w-full" onClick={signOut}>
              <LogOut /> Sign out
            </Button>
          </div>
        )}
      </div>

      <div className="pt-10">
        <MadeBy />
        <p className="mt-1 text-center text-[11px] text-muted-foreground/80">CostSplit {APP_VERSION}</p>
      </div>
    </div>
  )
}
