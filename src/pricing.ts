/**
 * DeepSeek API price table and cost estimation.
 *
 * This plugin prices a session with the table in force **now** — it answers
 * "what is this conversation costing me", not "what did last month's bill say".
 * Old sessions are therefore re-priced at today's rates; the order of magnitude
 * is what the wrap-up decision reads, and a historical era chain would be a
 * second table to keep in sync for no additional answer.
 *
 * Current table (CNY per 1M tokens), peak windows 09:00–12:00 and 14:00–18:00
 * Beijing time, Monday–Friday; off-peak is exactly half of peak:
 *
 *   flash   peak 0.04 / 2 / 8   off-peak 0.02 / 1 / 4
 *   pro     peak 0.30 / 9 / 27  off-peak 0.15 / 4.5 / 13.5
 *
 * `deepseek-v4-pro` requests are currently served by V4.1-Flash and billed at
 * Flash rates; the pro row stays because an unrecognised model must never be
 * under-priced. Images cost tokens rather than a multiplier of their own.
 *
 * Editing the constants below is the one place to touch when prices change.
 */
import type { PricingRates } from './contract.ts'

/** Peak hours in Beijing time, as [startHour, endHour) pairs. */
const PEAK_WINDOWS: Array<[number, number]> = [[9, 12], [14, 18]]

const BEIJING_OFFSET_MS = 8 * 3_600_000

type Tier = 'pro' | 'flash' | 'vision'

const PEAK_RATES: Record<Tier, PricingRates> = {
  pro: { cacheHit: 0.3, input: 9, output: 27 },
  flash: { cacheHit: 0.04, input: 2, output: 8 },
  // Official policy: the vision model is priced identically to flash; images
  // cost tokens, not their own multiplier.
  vision: { cacheHit: 0.04, input: 2, output: 8 },
}

const halved = (rates: PricingRates): PricingRates => ({
  cacheHit: rates.cacheHit / 2,
  input: rates.input / 2,
  output: rates.output / 2,
})

/** Which price tier a model name falls into; anything unrecognised is billed
 *  as pro, the conservative (more expensive) guess. Vision is matched first:
 *  `deepseek-v4-flash-vision-exp` also contains "flash". */
export function tierOf(model: string): Tier {
  const name = model.toLowerCase()
  if (name.includes('vision')) return 'vision'
  if (name.includes('flash')) return 'flash'
  return 'pro'
}

/** Beijing-time Monday–Friday, which the peak windows honour. */
function isBeijingWeekday(timeMs: number): boolean {
  const day = new Date(timeMs + BEIJING_OFFSET_MS).getUTCDay()
  return day >= 1 && day <= 5
}

/** Whether a moment falls in a peak window, judged in Beijing time so the
 *  estimate does not drift with the machine's timezone. */
export function isPeak(timeMs: number): boolean {
  if (!isBeijingWeekday(timeMs)) return false
  const hour = Math.floor((((timeMs + BEIJING_OFFSET_MS) % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000)
  return PEAK_WINDOWS.some(([from, to]) => hour >= from && hour < to)
}

/** Rates applying to one model at one moment. */
export function ratesAt(timeMs: number, model: string): PricingRates {
  const peak = PEAK_RATES[tierOf(model)]
  return isPeak(timeMs) ? peak : halved(peak)
}

const applyRates = (rates: PricingRates, input: number, cache: number, output: number): number =>
  (input * rates.input + cache * rates.cacheHit + output * rates.output) / 1_000_000

/** Estimated CNY cost of one usage record. */
export function costOf(timeMs: number, model: string, input: number, cache: number, output: number): number {
  return applyRates(ratesAt(timeMs, model), input, cache, output)
}
