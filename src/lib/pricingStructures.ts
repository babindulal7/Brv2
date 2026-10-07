import { roundHalfUp, type Paisa } from './money'

/**
 * # Pricing structures and rulesets (Booqable adoption spec G3)
 *
 * What a rental of ONE unit of a product costs for a stated period, when the product is priced by
 * something richer than "rate × days":
 *
 *  - **structure** — duration tiles ("1 day 5,000 · 2 days 7,500 …") plus an optional fee per extra day
 *    beyond the last tile. As elsewhere, a rental longer than a tile takes the NEXT tile (prices round up).
 *  - **ruleset** — ordered rules. *Charge-period* rules run first and change WHICH days are charged (a free
 *    pickup or return day). *Price* rules then adjust the price of the charged days, by weekday or date
 *    range, and each carries a `stack` flag: off = the adjustment is taken on the ORIGINAL day price, on =
 *    it compounds on the already-adjusted price.
 *
 * Pure arithmetic — no table is read here. The caller supplies the product's terms and the period.
 *
 * ## Rounding (19 Aug ruling stays ours)
 * Whole rupees, ONE rounding, at the end of the unit price. Intermediate figures are exact (fractional
 * paisa), so a rule order cannot change a total by a rounding accident. Booqable's fractional-currency
 * results (`$81.40`) are not adopted: Rs 81.40 → Rs 81.
 *
 * ## What is NOT done here
 * Persisting the breakdown on the booking line and having `create_booking` accept a line total. Today a
 * booking line stores one per-day rate; a structure price does not divide into one without a paisa
 * discrepancy. Until that migration exists this module is the quote engine and the fixture, not yet the
 * source of an invoice amount. See PROGRESS 2026-10-07 — Remaining.
 *
 * RULING 2026-10-07: (1) a price rule on a structure/fixed product is applied to the charged days' equal
 * share of the structure total (⭐ B-5 — Booqable documents rules on per-day rates only);
 * (2) a rental that exceeds every tile with no extra-day fee is charged the last tile (nothing invented).
 */

export interface PriceTile {
  /** The tile covers rentals of up to this many days. */
  readonly days: number
  readonly pricePaisa: number
}

export interface PricingStructure {
  readonly tiles: readonly PriceTile[]
  /** Fee per day beyond the last tile; `null` = none. */
  readonly extraDayPaisa: number | null
}

export type PriceBase =
  | { readonly method: 'flat'; readonly perDayPaisa: number }
  | { readonly method: 'fixed'; readonly pricePaisa: number }
  | { readonly method: 'structure'; readonly structure: PricingStructure }

export interface ChargeRule {
  readonly kind: 'charge'
  readonly action: 'skip_pickup_day' | 'skip_return_day'
  /** skip_pickup_day: only when collected at/after this `HH:mm`. Omitted = always. */
  readonly pickupAfter?: string
  /** skip_return_day: only when returned before this `HH:mm`. Omitted = always. */
  readonly returnBefore?: string
}

export interface PriceRule {
  readonly kind: 'price'
  readonly name: string
  /** Signed: +10 raises the price, −20 discounts it. */
  readonly percent: number
  /** 0 = Sunday … 6 = Saturday. Omitted = every weekday. */
  readonly weekdays?: readonly number[]
  /** Inclusive `YYYY-MM-DD` bounds. Omitted = unbounded. */
  readonly from?: string
  readonly to?: string
  /** overlaps: only matching days · fits_within: all days or none · spans: any match prices every day. */
  readonly applyWhen: 'overlaps' | 'fits_within' | 'spans'
  /** false: adjust the ORIGINAL day price. true: compound on the price after the earlier rules. */
  readonly stack: boolean
}

export type PricingRule = ChargeRule | PriceRule

export interface QuoteInput {
  readonly base: PriceBase
  readonly rules?: readonly PricingRule[]
  /** Operational day of pickup, `YYYY-MM-DD` (AD — Law 7). */
  readonly pickupDay: string
  /** Rental days as the booking counts them (≥ 1). */
  readonly days: number
  readonly pickupTime?: string
  readonly returnTime?: string
}

export interface QuoteAdjustment {
  readonly rule: string
  readonly deltaPaisa: number
}

export interface PriceQuote {
  readonly originalDays: number
  readonly chargedDays: number
  /** Before any price rule, exact. */
  readonly baseTotalPaisa: number
  readonly adjustments: readonly QuoteAdjustment[]
  /** One unit, whole rupees, rounded once. */
  readonly unitTotalPaisa: Paisa
  /** Why a rule did or did not fire — the explanation a coordinator can read. */
  readonly notes: readonly string[]
}

const DAY_MS = 86_400_000

function dayList(pickupDay: string, days: number): string[] {
  const start = Date.parse(`${pickupDay}T00:00:00Z`)
  return Array.from({ length: days }, (_, i) => new Date(start + i * DAY_MS).toISOString().slice(0, 10))
}

const weekdayOf = (day: string): number => new Date(`${day}T00:00:00Z`).getUTCDay()

/** The structure total for `n` charged days. */
export function structureTotal(structure: PricingStructure, n: number): number {
  const tiles = [...structure.tiles].sort((a, b) => a.days - b.days)
  if (tiles.length === 0 || n < 1) return 0
  const covering = tiles.find((t) => t.days >= n)
  if (covering) return covering.pricePaisa
  const last = tiles[tiles.length - 1] as PriceTile
  return last.pricePaisa + (structure.extraDayPaisa ?? 0) * (n - last.days)
}

function baseTotal(base: PriceBase, chargedDays: number): number {
  switch (base.method) {
    case 'flat':
      return base.perDayPaisa * chargedDays
    case 'fixed':
      return base.pricePaisa
    case 'structure':
      return structureTotal(base.structure, chargedDays)
  }
}

function matches(rule: PriceRule, day: string): boolean {
  if (rule.weekdays && rule.weekdays.length > 0 && !rule.weekdays.includes(weekdayOf(day))) return false
  if (rule.from && day < rule.from) return false
  if (rule.to && day > rule.to) return false
  return true
}

export function quoteUnitPrice(input: QuoteInput): PriceQuote {
  const days = Math.max(1, Math.floor(input.days))
  const notes: string[] = []
  let charged = dayList(input.pickupDay, days)
  const rules = input.rules ?? []

  /* 1 — charge-period rules, in the order given, before any price rule. Never below one charged day. */
  for (const rule of rules) {
    if (rule.kind !== 'charge') continue
    if (rule.action === 'skip_pickup_day') {
      if (rule.pickupAfter !== undefined) {
        if (!input.pickupTime) {
          notes.push('Free pickup day not applied: no pickup time given.')
          continue
        }
        if (input.pickupTime < rule.pickupAfter) {
          notes.push(`Pickup day charged: collected before ${rule.pickupAfter}.`)
          continue
        }
      }
      if (charged.length > 1) {
        charged = charged.slice(1)
        notes.push('Pickup day not charged.')
      }
    } else {
      if (rule.returnBefore !== undefined) {
        if (!input.returnTime) {
          notes.push('Free return day not applied: no return time given.')
          continue
        }
        if (input.returnTime >= rule.returnBefore) {
          notes.push(`Return day charged: returned at or after ${rule.returnBefore}.`)
          continue
        }
      }
      if (charged.length > 1) {
        charged = charged.slice(0, -1)
        notes.push('Return day not charged.')
      }
    }
  }

  /* 2 — the base, split evenly over the charged days so a price rule has a day price to act on. */
  const total = baseTotal(input.base, charged.length)
  const original = charged.map(() => total / charged.length)
  const current = [...original]
  const adjustments: QuoteAdjustment[] = []

  /* 3 — price rules, top to bottom. */
  for (const rule of rules) {
    if (rule.kind !== 'price') continue
    const hit = charged.map((d) => matches(rule, d))
    let applies: boolean[]
    if (rule.applyWhen === 'fits_within') applies = hit.map(() => hit.every(Boolean))
    else if (rule.applyWhen === 'spans') applies = hit.map(() => hit.some(Boolean))
    else applies = hit
    let delta = 0
    for (let i = 0; i < current.length; i++) {
      if (!applies[i]) continue
      const d = (rule.percent / 100) * (rule.stack ? (current[i] as number) : (original[i] as number))
      current[i] = (current[i] as number) + d
      delta += d
    }
    adjustments.push({ rule: rule.name, deltaPaisa: delta })
    if (!applies.some(Boolean)) notes.push(`${rule.name}: no charged day falls in its period.`)
  }

  const exact = Math.max(0, current.reduce((s, v) => s + v, 0))
  return {
    originalDays: days,
    chargedDays: charged.length,
    baseTotalPaisa: total,
    adjustments,
    unitTotalPaisa: (roundHalfUp(exact / 100) * 100) as Paisa,
    notes,
  }
}
