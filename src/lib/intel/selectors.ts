/**
 * Smart Intel Cards v1 — deterministic local intelligence selectors (spec §E).
 *
 * Law 1: pure functions over already-available rental history. No network, no
 * ML, and nothing here may be labelled "AI" — statistics only. All money
 * results are integer paisa; callers omit (never CSS-hide) finance output for
 * money-blind roles via `lib/fieldGating.ts`.
 */

/** Days rented ÷ days available × 100. Null when there is no basis. */
export function timeUtilization(rentedDays: number, availableDays: number): number | null {
  if (!Number.isFinite(rentedDays) || !Number.isFinite(availableDays)) return null
  if (availableDays <= 0 || rentedDays < 0) return null
  return Math.round((rentedDays / availableDays) * 100)
}

/** Annual rental revenue ÷ acquisition cost × 100. */
export function dollarUtilization(annualRevenuePaisa: number, acquisitionPaisa: number): number | null {
  if (!Number.isFinite(annualRevenuePaisa) || !Number.isFinite(acquisitionPaisa)) return null
  if (acquisitionPaisa <= 0 || annualRevenuePaisa < 0) return null
  return Math.round((annualRevenuePaisa / acquisitionPaisa) * 100)
}

/** Cumulative revenue ÷ acquisition cost × 100 (break-even at 100). */
export function breakEvenPercent(cumulativeRevenuePaisa: number, acquisitionPaisa: number): number | null {
  return dollarUtilization(cumulativeRevenuePaisa, acquisitionPaisa)
}

/** Revenue ÷ rental-days, rounded half-up to whole paisa. */
export function profitPerRentalDay(revenuePaisa: number, rentalDays: number): number | null {
  if (!Number.isFinite(revenuePaisa) || !Number.isFinite(rentalDays)) return null
  if (rentalDays <= 0 || revenuePaisa < 0) return null
  const q = revenuePaisa / rentalDays
  return (q < 0 ? -Math.round(-q) : Math.round(q))
}

/** Maintenance cost ÷ revenue × 100. */
export function maintenanceCostRatio(maintenancePaisa: number, revenuePaisa: number): number | null {
  if (!Number.isFinite(maintenancePaisa) || !Number.isFinite(revenuePaisa)) return null
  if (revenuePaisa <= 0 || maintenancePaisa < 0) return null
  return Math.round((maintenancePaisa / revenuePaisa) * 100)
}

/** Whole days since the last on-rent day, from a day-precision epoch. */
export function idleDaysSince(lastOnRentDayEpochMs: number | null, nowEpochMs: number): number | null {
  if (lastOnRentDayEpochMs === null) return null
  if (!Number.isFinite(lastOnRentDayEpochMs) || !Number.isFinite(nowEpochMs)) return null
  const diff = nowEpochMs - lastOnRentDayEpochMs
  if (diff < 0) return null
  return Math.floor(diff / 86_400_000)
}

export interface CoOccurrenceInput {
  /** Product id to explain. */
  productId: string
  /** Completed rental product-id sets. */
  completedRentals: string[][]
  /** Minimum co-rental count before a pairing is reported. */
  minSample: number
}

export interface CoOccurrenceRow {
  productId: string
  /** Share of the target's rentals that also contained this product, 0–100. */
  percent: number
  count: number
}

/**
 * "Often rented with" from co-occurrence on completed rentals only (spec
 * §25). Deterministic counting — not a recommender, never labelled AI.
 */
export function oftenRentedWith(input: CoOccurrenceInput): CoOccurrenceRow[] {
  const withTarget = input.completedRentals.filter((r) => r.includes(input.productId))
  if (withTarget.length < input.minSample) return []
  const counts = new Map<string, number>()
  for (const rental of withTarget) {
    for (const pid of new Set(rental)) {
      if (pid === input.productId) continue
      counts.set(pid, (counts.get(pid) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= input.minSample)
    .map(([productId, count]): CoOccurrenceRow => ({
      productId,
      count,
      percent: Math.round((count / withTarget.length) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.productId.localeCompare(b.productId))
}

export interface BookingRange {
  id: string
  /** Half-open [start, end) epoch ms. */
  startMs: number
  endMs: number
}

/** Overlap check for the conflict warning (spec §E) — half-open intervals. */
export function conflictsFor(range: BookingRange, existing: BookingRange[]): BookingRange[] {
  return existing.filter(
    (e) => e.id !== range.id && range.startMs < e.endMs && e.startMs < range.endMs,
  )
}

export interface ReadinessInput {
  equipmentReserved: boolean
  serialsAssigned: boolean
  packed: number
  packedTotal: number
  contractSigned: boolean
  depositPending: boolean
}

export interface ReadinessLine {
  label: string
  done: boolean
}

/** Compact booking readiness strip (spec §17) — connected state, not badges. */
export function readinessLines(input: ReadinessInput): ReadinessLine[] {
  return [
    { label: 'Equipment reserved', done: input.equipmentReserved },
    { label: 'Serial numbers assigned', done: input.serialsAssigned },
    {
      label: `Packed ${input.packed} / ${input.packedTotal}`,
      done: input.packedTotal > 0 && input.packed >= input.packedTotal,
    },
    { label: 'Contract signed', done: input.contractSigned },
    { label: 'Deposit cleared', done: !input.depositPending },
  ]
}
