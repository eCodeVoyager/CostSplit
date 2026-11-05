import { Directory, Encoding, Filesystem } from "@capacitor/filesystem"
import { Share } from "@capacitor/share"
import type { ExpenseImpact, Transfer } from "./balance"
import { expenseImpact, type MealWeights } from "./balance"
import { getCategory } from "./categories"
import { formatMoney, toMajor } from "./money"
import type { MonthSummary } from "./month"
import { isNative, publicOrigin } from "./server"
import type { Expense, Member, Trip } from "./types"

export function tripLink(tripId: string) {
  return `${publicOrigin()}/join/${tripId}`
}

/** A link for one person: opening it joins as them, without "Who are you?" */
export function memberLink(tripId: string, memberId: string) {
  return `${tripLink(tripId)}?as=${encodeURIComponent(memberId)}`
}

/** Native share sheet when available (WhatsApp, Telegram...), clipboard otherwise */
export async function shareOrCopy(data: { title?: string; text: string; url?: string }): Promise<"shared" | "copied" | "cancelled"> {
  // The Android WebView has no navigator.share; the Share plugin opens the system sheet
  if (isNative) {
    try {
      await Share.share({ ...data, dialogTitle: data.title })
      return "shared"
    } catch {
      return "cancelled"
    }
  }
  if (navigator.share) {
    try {
      await navigator.share(data)
      return "shared"
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled"
    }
  }
  await navigator.clipboard.writeText([data.text, data.url].filter(Boolean).join("\n"))
  return "copied"
}

export function settleUpText(trip: Trip, transfers: Transfer[], names: Map<string, string>) {
  if (transfers.length === 0) return `${trip.emoji} ${trip.name}: everyone is settled up!`
  const lines = transfers.map(
    (t) => `• ${names.get(t.from) ?? "?"} → ${names.get(t.to) ?? "?"}: ${formatMoney(t.amount, trip.currency)}`
  )
  return `${trip.emoji} ${trip.name} — settle up\n${lines.join("\n")}`
}

/** One expense in words, for the group chat: who paid, the split and who owes whom */
export function expenseText(trip: Trip, e: Expense, impact: ExpenseImpact, transfers: Transfer[], names: Map<string, string>) {
  const money = (v: number) => formatMoney(Math.abs(v), trip.currency)
  const name = (id: string) => names.get(id) ?? "?"
  const lines = [`${e.title}: ${formatMoney(e.amount, e.currency)} (${e.date})`]
  lines.push(`${e.kind === "income" ? "Received by" : "Paid by"} ${Object.keys(e.paidBy).map(name).join(" + ")}`)
  lines.push(`Split: ${Object.entries(impact.owed).map(([id, v]) => `${name(id)} ${money(v)}`).join(", ")}`)
  if (transfers.length) {
    lines.push("", "Who owes whom:")
    transfers.forEach((t) => lines.push(`• ${name(t.from)} → ${name(t.to)}: ${money(t.amount)}`))
  }
  return lines.join("\n")
}

/** Month-end summary for the group chat */
export function monthReportText(trip: Trip, period: string, summary: MonthSummary, names: Map<string, string>) {
  const money = (v: number) => formatMoney(v, trip.currency)
  const lines = [`${trip.emoji} ${trip.name} — ${period}`, `Total spent: ${money(summary.spent)}`]
  if (summary.totalMeals > 0) {
    lines.push(`Meals: ${summary.totalMeals} · meal rate ${money(summary.mealRate)}`)
  }
  lines.push("", "Top costs:")
  summary.byCategory.slice(0, 5).forEach(([id, v]) => lines.push(`• ${getCategory(id).label}: ${money(v)}`))
  lines.push("", "Per person (paid / share):")
  const ids = [...new Set([...Object.keys(summary.paid), ...Object.keys(summary.shares)])]
  ids.forEach((id) => {
    const meals = summary.meals[id] ? ` · ${summary.meals[id]} meals` : ""
    lines.push(`• ${names.get(id) ?? "?"}: ${money(summary.paid[id] ?? 0)} / ${money(summary.shares[id] ?? 0)}${meals}`)
  })
  return lines.join("\n")
}

function csvCell(value: string | number) {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function expensesCsv(trip: Trip, members: Member[], expenses: Expense[], meals?: MealWeights) {
  const live = members.filter((m) => !m.deleted || expenses.some((e) => e.paidBy[m.id] || e.split[m.id]))
  const header = ["Date", "Type", "Title", "Category", "Amount", "Currency", `Amount (${trip.currency})`, "Paid by", "Bill month"]
  live.forEach((m) => header.push(`${m.name} share (${trip.currency})`))

  const rows = expenses
    .filter((e) => !e.deleted)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const impact = expenseImpact(e, trip, meals)
      const payers = Object.keys(impact.paid)
        .map((id) => members.find((m) => m.id === id)?.name ?? "?")
        .join(" + ")
      return [
        e.date,
        e.kind === "income" ? "Money in" : e.category === "loan" ? "Loan" : "Expense",
        e.title,
        getCategory(e.category).label,
        toMajor(e.amount, e.currency),
        e.currency,
        toMajor(impact.total, trip.currency),
        payers,
        e.period ?? "",
        ...live.map((m) => toMajor(impact.owed[m.id] ?? 0, trip.currency)),
      ]
    })

  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")
}

/**
 * Saves a file. In the Android app the WebView ignores download links, so the file is
 * written to the app cache and handed to the share sheet (Drive, Files, WhatsApp...).
 */
export async function downloadFile(name: string, content: string, type: string) {
  if (isNative) {
    const { uri } = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 })
    try {
      await Share.share({ title: name, files: [uri], dialogTitle: "Save or send" })
    } catch {
      // Closed the share sheet without picking an app
    }
    return
  }
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function fileSafe(name: string) {
  return name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "trip"
}
