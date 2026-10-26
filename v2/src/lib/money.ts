const digitsCache = new Map<string, number>()
const formatCache = new Map<string, Intl.NumberFormat>()

/** Number of minor-unit digits for a currency (EUR 2, JPY 0) */
export function currencyDigits(currency: string): number {
  let digits = digitsCache.get(currency)
  if (digits === undefined) {
    try {
      digits =
        new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2
    } catch {
      digits = 2
    }
    digitsCache.set(currency, digits)
  }
  return digits
}

export function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** currencyDigits(currency))
}

export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** currencyDigits(currency)
}

function formatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`
  let f = formatCache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        currencyDisplay: "narrowSymbol",
        ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
      })
    } catch {
      f = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" })
    }
    formatCache.set(key, f)
  }
  return f
}

/** Format minor units, e.g. 1250 EUR -> "€12.50" */
export function formatMoney(minor: number, currency: string, opts: { compact?: boolean; signed?: boolean } = {}) {
  const text = formatter(currency, !!opts.compact).format(Math.abs(toMajor(minor, currency)))
  if (minor < 0) return `-${text}`
  if (opts.signed && minor > 0) return `+${text}`
  return text
}

export function currencySymbol(currency: string): string {
  const part = formatter(currency, false)
    .formatToParts(0)
    .find((p) => p.type === "currency")
  return part?.value ?? currency
}

/**
 * Parse user input into minor units. Accepts "12,50", "12.50", "1 200" and
 * simple sums like "12+8.5". Returns null when not a positive amount.
 */
export function parseAmount(input: string, currency: string): number | null {
  const cleaned = input.replace(/\s/g, "").replace(/,/g, ".")
  if (!cleaned || !/^[0-9.+-]+$/.test(cleaned)) return null
  const terms = cleaned.match(/[+-]?[^+-]+/g)
  if (!terms) return null
  let total = 0
  for (const term of terms) {
    const n = Number(term)
    if (!Number.isFinite(n)) return null
    total += n
  }
  const minor = toMinor(total, currency)
  return minor > 0 ? minor : null
}

/** Minor units -> editable string without symbol ("12.5") */
export function minorToInput(minor: number, currency: string): string {
  const fixed = toMajor(minor, currency).toFixed(currencyDigits(currency))
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed
}

/**
 * Split `total` minor units proportionally to `weights` so the parts always
 * add up exactly to `total` (largest remainder method). Ties go to the
 * earlier key, so every device computes the same result.
 */
export function allocate(total: number, weights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const result: Record<string, number> = {}
  const sum = entries.reduce((s, [, w]) => s + w, 0)
  if (sum <= 0) return result

  let assigned = 0
  const remainders = entries.map(([id, w], index) => {
    const exact = (total * w) / sum
    const floor = Math.floor(exact)
    result[id] = floor
    assigned += floor
    return { id, frac: exact - floor, index }
  })

  remainders.sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (let i = 0; i < total - assigned; i++) {
    result[remainders[i % remainders.length].id] += 1
  }
  return result
}

/** Convert minor units of `currency` into base minor units; `rate` = currency units per 1 base unit */
export function convertToBase(minor: number, currency: string, rate: number, base: string): number {
  if (currency === base || !rate) return minor
  return toMinor(toMajor(minor, currency) / rate, base)
}
