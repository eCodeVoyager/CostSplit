import {
  DoorOpen,
  Download,
  FileJson,
  FileSpreadsheet,
  Pencil,
  RefreshCw,
  Smartphone,
  Trash2,
  Upload,
  UserPlus,
  UserRoundCheck,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useLocation } from "wouter"
import { MemberAvatar, SectionTitle, Segmented } from "@/components/common"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useInstall, useOnline } from "@/hooks/useInstall"
import { useTrip } from "@/hooks/useTripData"
import { CURRENCIES, currencyName, fetchRate } from "@/lib/currencies"
import { timeAgo } from "@/lib/dates"
import { rememberTrip } from "@/lib/nav"
import {
  addMember,
  exportBackup,
  importBackup,
  isMemberUsed,
  removeMember,
  removeTripLocally,
  renameMember,
  setMemberArchived,
  updateTrip,
} from "@/lib/repo"
import { downloadFile, expensesCsv, fileSafe } from "@/lib/share"
import { checkServer, getServerUrl, isNative, SYNC_BUILD_ENABLED } from "@/lib/server"
import { changeServer, requestSync, useSyncState } from "@/lib/sync"
import { useTheme, type Theme } from "@/lib/theme"
import { APP_VERSION } from "@/lib/update"
import type { GroupKind, Member } from "@/lib/types"
import { TRIP_EMOJIS } from "@/lib/categories"
import { useTripActions } from "@/hooks/useTripActions"

export default function SettingsTab() {
  const { trip, kind, members, everyone, meId, expenses, mealWeights } = useTrip()
  const label = kind === "home" ? "home" : "trip"
  const { invite, changeMe } = useTripActions()
  const [theme, setTheme] = useTheme()
  const [, navigate] = useLocation()
  const [name, setName] = useState(trip.name)
  const [newPerson, setNewPerson] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => setName(trip.name), [trip.name])

  const saveName = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== trip.name) updateTrip(trip.id, { name: trimmed.slice(0, 60) })
    else setName(trip.name)
  }

  const addPerson = async () => {
    const trimmed = newPerson.trim()
    if (!trimmed) return
    if (everyone.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`${trimmed} is already here`)
      return
    }
    await addMember(trip.id, trimmed.slice(0, 40))
    setNewPerson("")
  }

  const exportCsv = () => {
    downloadFile(`${fileSafe(trip.name)}-expenses.csv`, expensesCsv(trip, everyone, expenses, mealWeights), "text/csv;charset=utf-8")
  }

  const exportJson = async () => {
    const backup = await exportBackup(trip.id)
    downloadFile(`${fileSafe(trip.name)}-backup.json`, JSON.stringify(backup), "application/json")
  }

  const restoreJson = async (file: File) => {
    try {
      const id = await importBackup(JSON.parse(await file.text()))
      toast.success("Backup restored")
      if (id !== trip.id) navigate(`~/t/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that file")
    }
  }

  const removeTrip = async () => {
    await removeTripLocally(trip.id)
    rememberTrip(null)
    navigate("~/", { replace: true })
  }

  return (
    <div className="pt-2 pb-6">
      <SectionTitle>{kind === "home" ? "Home" : "Trip"}</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <Segmented<GroupKind>
          label="Group type"
          value={kind}
          onChange={(k) => updateTrip(trip.id, { kind: k })}
          options={[
            { value: "home", label: "Home" },
            { value: "trip", label: "Trip" },
          ]}
        />
        <div className="space-y-2">
          <label htmlFor="trip-name" className="text-sm font-medium">
            Name
          </label>
          <Input
            id="trip-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            className="h-11"
          />
        </div>
        {kind === "home" && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="settings-meals" className="font-normal">
              <span className="font-medium">Meal count (mess)</span>
              <span className="block text-xs text-muted-foreground">Split bazar by meals eaten</span>
            </Label>
            <Switch
              id="settings-meals"
              checked={!!trip.mealMode}
              onCheckedChange={(on) => updateTrip(trip.id, { mealMode: on })}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
          {TRIP_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="radio"
              aria-checked={trip.emoji === emoji}
              onClick={() => updateTrip(trip.id, { emoji })}
              className={
                trip.emoji === emoji
                  ? "size-11 rounded-xl bg-primary/15 text-xl ring-2 ring-primary"
                  : "size-11 rounded-xl bg-secondary text-xl"
              }
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <CurrencySettings hasExpenses={expenses.length > 0} />

      <SectionTitle
        action={
          <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={invite}>
            <UserPlus /> Invite
          </Button>
        }
      >
        People
      </SectionTitle>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {everyone.map((m) => (
          <PersonRow key={m.id} member={m} isMe={m.id === meId} />
        ))}
        <li className="p-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addPerson()
            }}
          >
            <Input placeholder="Add a person" value={newPerson} maxLength={40} onChange={(e) => setNewPerson(e.target.value)} className="h-11" />
            <Button type="submit" className="h-11" disabled={!newPerson.trim()}>
              Add
            </Button>
          </form>
        </li>
      </ul>
      <Button variant="outline" className="mt-3 h-11 w-full" onClick={changeMe}>
        <UserRoundCheck /> I'm not {members.find((m) => m.id === meId)?.name ?? "this person"}
      </Button>

      <SectionTitle>Your data</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={exportCsv} disabled={expenses.length === 0}>
          <FileSpreadsheet /> Export CSV
        </Button>
        <Button variant="outline" className="h-12" onClick={exportJson}>
          <Download /> Backup
        </Button>
        <Button variant="outline" className="col-span-2 h-12" onClick={() => fileRef.current?.click()}>
          <Upload /> Restore from backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) restoreJson(file)
            e.target.value = ""
          }}
        />
      </div>
      <p className="mt-2 flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
        <FileJson className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Everything is stored on this phone first. A backup file is a safe copy you can keep anywhere.
      </p>

      <SectionTitle>App</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <span className="text-sm font-medium">Appearance</span>
          <Segmented<Theme>
            label="Appearance"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
        <SyncRow />
        <InstallRow />
        <p className="text-xs text-muted-foreground">CostSplit {APP_VERSION}</p>
      </div>

      <SectionTitle>Danger zone</SectionTitle>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/10">
            <Trash2 /> Remove {label} from this phone
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{trip.name}” from this phone?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone else keeps it. You can come back any time with the invite link. Changes not yet synced will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeTrip}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PersonRow({ member, isMe }: { member: Member; isMe: boolean }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(member.name)

  const save = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== member.name) renameMember(member.id, trimmed.slice(0, 40))
    setEditing(false)
  }

  const remove = async () => {
    if (await isMemberUsed(member)) {
      // Has history: keep it for balances, just stop offering them on new expenses
      await setMemberArchived(member.id, true)
      toast(`${member.name} marked as moved out`, {
        description: "Their past expenses and balance stay. Settle up with them in Balances.",
        action: { label: "Undo", onClick: () => setMemberArchived(member.id, false) },
      })
      return
    }
    await removeMember(member.id)
    toast(`${member.name} removed`)
  }
  const archived = member.archived === 1

  return (
    <li className="flex items-center gap-3 py-2 pr-1 pl-3">
      <MemberAvatar id={member.id} name={member.name} />
      {editing ? (
        <Input
          autoFocus
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className="h-10 flex-1"
          aria-label={`Rename ${member.name}`}
        />
      ) : (
        <span className={archived ? "min-w-0 flex-1 truncate text-muted-foreground" : "min-w-0 flex-1 truncate font-medium"}>
          {member.name}
          {isMe && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">You</span>}
          {archived && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">Moved out</span>}
        </span>
      )}
      <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" onClick={() => setEditing(true)} aria-label={`Rename ${member.name}`}>
        <Pencil className="size-4" />
      </Button>
      {archived ? (
        <Button variant="ghost" size="sm" className="h-11 text-primary" onClick={() => setMemberArchived(member.id, false)}>
          Move back
        </Button>
      ) : (
        !isMe && (
          <Button
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            onClick={remove}
            aria-label={`Remove ${member.name} or mark as moved out`}
          >
            <DoorOpen className="size-4" />
          </Button>
        )
      )}
    </li>
  )
}

function CurrencySettings({ hasExpenses }: { hasExpenses: boolean }) {
  const { trip } = useTrip()
  const online = useOnline()
  const [adding, setAdding] = useState("")
  const extra = Object.entries(trip.rates ?? {})

  const setRate = (code: string, value: number) => {
    if (value > 0) updateTrip(trip.id, { rates: { ...trip.rates, [code]: value } })
  }

  const add = async (code: string) => {
    setAdding("")
    if (!code || code === trip.currency || trip.rates[code]) return
    let rate = 1
    if (online) {
      try {
        rate = await fetchRate(trip.currency, code)
      } catch {
        toast("Enter the rate by hand", { description: "Couldn't fetch a live rate right now." })
      }
    }
    updateTrip(trip.id, { rates: { ...trip.rates, [code]: rate } })
  }

  const refresh = async (code: string) => {
    try {
      setRate(code, await fetchRate(trip.currency, code))
      toast.success(`Updated ${code} rate`)
    } catch {
      toast.error("Couldn't fetch a live rate")
    }
  }

  const remove = (code: string) => {
    const { [code]: _removed, ...rest } = trip.rates
    updateTrip(trip.id, { rates: rest })
  }

  return (
    <>
      <SectionTitle>Money</SectionTitle>
      <div className="space-y-4 rounded-2xl border bg-card p-4">
        <div className="space-y-2">
          <label htmlFor="base-currency" className="text-sm font-medium">
            Main currency
          </label>
          <select
            id="base-currency"
            value={trip.currency}
            disabled={hasExpenses}
            onChange={(e) => updateTrip(trip.id, { currency: e.target.value })}
            className="h-11 w-full rounded-md border border-input bg-transparent px-3 disabled:opacity-60"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} · {currencyName(c)}
              </option>
            ))}
          </select>
          {hasExpenses && <p className="text-xs text-muted-foreground">Locked once expenses exist, so balances stay correct.</p>}
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Other currencies</span>
          <p className="text-xs text-muted-foreground">
            Paid in {extra.length ? extra.map(([c]) => c).join(", ") : "another currency"}? Expenses are converted at the rate below.
          </p>
          {extra.map(([code, rate]) => (
            <div key={code} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-sm tabular">1 {trip.currency} =</span>
              <Input
                inputMode="decimal"
                defaultValue={rate}
                key={rate}
                onBlur={(e) => setRate(code, Number(e.target.value.replace(",", ".")))}
                className="h-11 flex-1 text-right tabular"
                aria-label={`${code} per ${trip.currency}`}
              />
              <span className="w-10 text-sm font-medium">{code}</span>
              <Button variant="ghost" size="icon" className="size-11" disabled={!online} onClick={() => refresh(code)} aria-label={`Fetch live ${code} rate`}>
                <RefreshCw className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-11" onClick={() => remove(code)} aria-label={`Remove ${code}`}>
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <select
            value={adding}
            onChange={(e) => add(e.target.value)}
            className="h-11 w-full rounded-md border border-dashed border-input bg-transparent px-3 text-sm"
            aria-label="Add a currency"
          >
            <option value="">+ Add a currency</option>
            {CURRENCIES.filter((c) => c !== trip.currency && !trip.rates[c]).map((c) => (
              <option key={c} value={c}>
                {c} · {currencyName(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  )
}

function SyncRow() {
  const { status, lastSyncedAt, error } = useSyncState()
  const [url, setUrl] = useState(getServerUrl())
  const [checking, setChecking] = useState(false)
  if (!SYNC_BUILD_ENABLED) {
    return <p className="text-sm text-muted-foreground">Sync is off in this build: data stays on this phone.</p>
  }

  const changed = url.trim().replace(/\/+$/, "") !== getServerUrl()
  const save = async () => {
    setChecking(true)
    const ok = url.trim() === "" ? !isNative : await checkServer(url)
    setChecking(false)
    if (!ok) {
      toast.error("Can't reach that server", { description: "Check the address and that the server is running." })
      return
    }
    await changeServer(url)
    toast.success("Server saved, syncing all trips")
  }

  const text =
    status === "disabled"
      ? "No server yet — everything stays on this phone"
      : status === "offline"
        ? "Offline — changes are saved on this phone"
        : status === "syncing"
          ? "Syncing…"
          : status === "error"
            ? `Sync problem: ${error ?? "unknown"}`
            : lastSyncedAt
              ? `Synced ${timeAgo(lastSyncedAt)}`
              : "Not synced yet"

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Sync</p>
          <p className="truncate text-xs text-muted-foreground">{text}</p>
        </div>
        <Button variant="outline" className="h-10" onClick={() => requestSync(0)} disabled={status === "syncing" || status === "disabled"}>
          <RefreshCw className={status === "syncing" ? "animate-spin" : undefined} /> Sync now
        </Button>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={isNative ? "http://192.168.1.10:8787" : "Same as this website"}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          className="h-10 flex-1 text-sm"
          aria-label="Sync server address"
        />
        <Button type="submit" variant="outline" className="h-10" disabled={!changed || checking}>
          {checking ? "Checking…" : "Save"}
        </Button>
      </form>
    </div>
  )
}

function InstallRow() {
  const { canPrompt, showIOSHint, install } = useInstall()
  if (!canPrompt && !showIOSHint) return null
  return (
    <div className="flex items-center gap-3">
      <Smartphone className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install the app</p>
        <p className="text-xs text-muted-foreground">
          {canPrompt ? "Opens full screen and works offline." : "Tap Share, then “Add to Home Screen”."}
        </p>
      </div>
      {canPrompt && (
        <Button className="h-10" onClick={install}>
          Install
        </Button>
      )}
    </div>
  )
}
