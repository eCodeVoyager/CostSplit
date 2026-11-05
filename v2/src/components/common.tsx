import type { LucideIcon } from "lucide-react"
import { createContext, useContext, type ReactNode } from "react"
import { useAvatarUrl } from "@/lib/avatars"
import { getCategory } from "@/lib/categories"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

const HUES = [255, 160, 25, 300, 75, 200, 340, 120]

function hueFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy>
      <span className="size-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  )
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}

/** memberId -> profile photo id, for everyone in the open group */
export const AvatarContext = createContext<ReadonlyMap<string, string>>(new Map())

/** Profile photo when the person joined with an account that has one, colored initials otherwise */
export function MemberAvatar({ id, name, className, photo }: { id: string; name: string; className?: string; photo?: string | null }) {
  const fromGroup = useContext(AvatarContext).get(id)
  const url = useAvatarUrl(photo === undefined ? fromGroup : photo)
  const base = "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold select-none"
  if (url) return <img src={url} alt="" aria-hidden className={cn(base, "bg-muted object-cover", className)} draggable={false} />
  return (
    <span aria-hidden className={cn("avatar", base, className)} style={{ ["--h" as string]: hueFor(id) }}>
      {initials(name)}
    </span>
  )
}

/** The small credit line */
export function MadeBy({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-muted-foreground", className)}>
      Made with{" "}
      <span role="img" aria-label="coffee">
        ☕
      </span>{" "}
      by Ehsan
    </p>
  )
}

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const { icon: Icon, label } = getCategory(category)
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground",
        className
      )}
      title={label}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  )
}

/** Balance with color AND words, so meaning never relies on color alone */
export function BalanceText({
  net,
  currency,
  you,
  className,
}: {
  net: number
  currency: string
  you?: boolean
  className?: string
}) {
  if (net === 0) return <span className={cn("text-muted-foreground", className)}>settled up</span>
  const amount = formatMoney(Math.abs(net), currency)
  if (net > 0) {
    return (
      <span className={cn("text-positive", className)}>
        {you ? "you get back" : "gets back"} <strong className="tabular font-semibold">{amount}</strong>
      </span>
    )
  }
  return (
    <span className={cn("text-negative", className)}>
      {you ? "you owe" : "owes"} <strong className="tabular font-semibold">{amount}</strong>
    </span>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="size-7" aria-hidden />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-6 pb-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{children}</h2>
      {action}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-xl bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-lg text-sm font-medium transition-colors",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Big tappable pill used for choosing people, categories, currencies */
export function Chip({
  selected,
  onClick,
  children,
  className,
  ...rest
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
  "aria-label"?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[0.97]",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-accent",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
