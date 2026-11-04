import { allocate, minorToInput, parseAmount } from "./money"

/**
 * "Some people typed an amount, the app fills in the rest."
 * Amounts someone typed stay as typed; everyone left blank shares what's left equally.
 * Used for exact-amount splits and for several payers.
 */
export interface AutoFill {
  /** Amount for every participant (minor units), typed or filled in */
  amounts: Record<string, number>
  /** Participants whose amount the app filled in */
  auto: Set<string>
  /**
   * What doesn't fit: > 0 means everyone typed and it's short of the total,
   * < 0 means the typed amounts already add up to more than the total
   */
  left: number
}

export function autoFill(total: number, people: string[], typed: Record<string, number | undefined>): AutoFill {
  const fixed = people.filter((id) => typed[id] !== undefined)
  const open = people.filter((id) => typed[id] === undefined)
  const typedSum = fixed.reduce((s, id) => s + (typed[id] ?? 0), 0)
  const remaining = total - typedSum
  const amounts: Record<string, number> = {}
  for (const id of fixed) amounts[id] = typed[id] ?? 0
  if (open.length > 0 && remaining > 0) {
    Object.assign(amounts, allocate(remaining, Object.fromEntries(open.map((id) => [id, 1]))))
  } else {
    for (const id of open) amounts[id] = 0
  }
  const left = open.length > 0 ? Math.min(0, remaining) : remaining
  // Keep the participants' order
  const ordered = Object.fromEntries(people.map((id) => [id, amounts[id] ?? 0]))
  return { amounts: ordered, auto: new Set(open), left }
}

/** Text box -> amount: blank = let the app fill it, "0" = nothing, junk = blank */
export function parseTyped(text: string | undefined, currency: string): number | undefined {
  const t = (text ?? "").trim()
  if (!t) return undefined
  if (/^0+([.,]0*)?$/.test(t)) return 0
  return parseAmount(t, currency) ?? undefined
}

/**
 * Loading saved amounts back into the form: if they were an even split, nothing
 * counts as typed (changing the total re-splits evenly). Otherwise everyone but
 * the last person counts as typed, so a new total lands on that last person.
 */
export function typedFromSaved(total: number, saved: Record<string, number>, currency: string): Record<string, string> {
  const ids = Object.keys(saved)
  const even = autoFill(total, ids, {})
  if (ids.every((id) => even.amounts[id] === saved[id])) return {}
  return Object.fromEntries(ids.slice(0, -1).map((id) => [id, minorToInput(saved[id], currency)]))
}
