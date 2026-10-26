export const CURRENCIES = [
  "EUR",
  "BDT",
  "USD",
  "GBP",
  "INR",
  "AED",
  "SAR",
  "QAR",
  "TRY",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "SGD",
  "MYR",
  "THB",
]

export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: "currency" }).of(code) ?? code
  } catch {
    return code
  }
}

/** Live rate: units of `quote` per 1 `base`. Needs internet; caller falls back to manual entry. */
export async function fetchRate(base: string, quote: string): Promise<number> {
  const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`)
  if (!res.ok) throw new Error("Rate service unavailable")
  const data = (await res.json()) as { rates?: Record<string, number> }
  const rate = data.rates?.[quote]
  if (!rate) throw new Error(`No rate for ${quote}`)
  // Significant digits, not decimals: 1 BDT = 0.0072 EUR would be 0.6% off (৳77 on €100)
  return Number(rate.toPrecision(6))
}
