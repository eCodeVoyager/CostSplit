/** Local calendar date as YYYY-MM-DD (not UTC, so late-night expenses land on the right day) */
export function toISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function dayLabel(iso: string): string {
  const today = toISODate()
  if (iso === today) return "Today"
  if (iso === addDays(today, -1)) return "Yesterday"
  const d = parseISODate(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
}

export function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(ts).toLocaleDateString()
}

/** "2026-10" -> "October" (adds the year when it isn't this year) */
export function monthLabel(period: string, style: "long" | "short" = "long"): string {
  const [y, m] = period.split("-").map(Number)
  const sameYear = y === new Date().getFullYear()
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, ...(sameYear ? {} : { year: "numeric" }) })
}

/** When a to-buy item is needed: "today", "tomorrow", "Sat 8 Nov", or "was due Nov 3" */
export function needByLabel(iso: string, today = toISODate()): { text: string; late: boolean; soon: boolean } {
  if (iso < today) return { text: `needed since ${shortDate(iso)}`, late: true, soon: true }
  if (iso === today) return { text: "needed today", late: false, soon: true }
  if (iso === addDays(today, 1)) return { text: "needed tomorrow", late: false, soon: true }
  const d = parseISODate(iso)
  return { text: `by ${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`, late: false, soon: false }
}

/** "2026-10", +1 -> "2026-11" */
export function shiftMonth(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
