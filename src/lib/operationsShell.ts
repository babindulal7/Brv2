import type { IconName } from '../components/ui/Icon'
import { BOOKING_STATUS, JOBS, type BookingStatus, type JobName } from './workflow'

/**
 * Operations Popup Shell — shared item record engine & step gating.
 *
 * Spec §5, the core rule: "Packing and Return do not each read the booking
 * lines. There is one item record and it flows forward." Every `OperationItem`
 * below carries its pack state AND its return state on the same object —
 * Return reads what Packing actually produced (`packedSerial`/`qtyPacked`),
 * never the original booking line. §5.1: discrepancy is dispatched vs
 * returned, never quoted vs returned.
 *
 * §5.2: once handover is signed, packing lines lock. A correction after that
 * point is an append-only `CorrectionEntry`, never a rewrite — the effective
 * dispatched set is packing lines *plus* corrections, both visible.
 *
 * `lib/workflow.ts` owns the booking-status/job vocabulary; this file imports
 * it and adds display/step-gating logic to it.
 */

export type TrackingMode = 'serial' | 'count'
export type PackState = 'Pending' | 'Packed' | 'Short'
export type ReturnState = 'Pending' | 'Returned' | 'Missing' | 'Damaged'

export interface OperationItem {
  id: string
  name: string
  trackingMode: TrackingMode
  /** What the booking line originally specified — never mutated. */
  bookingSerial?: string
  qtyExpected: number
  location: string

  // ── Packing → produces the dispatched set ──
  packState: PackState
  /* `| undefined` explicit throughout (not just `?`) — tsconfig sets
     exactOptionalPropertyTypes, and `packItem`/`receiveReturn` below assign
     `undefined` directly (e.g. a count-tracked item has no serial) rather
     than omitting the key, same pattern already established in
     AddClient.tsx's `Field` component. */
  /** The serial actually packed. Differs from `bookingSerial` on a substitution. */
  packedSerial?: string | undefined
  qtyPacked: number
  packedBy?: string
  packedAt?: string
  /** Set once handover is signed — §5.2, packing becomes read-only past this point. */
  lockedAt?: string

  // ── Return → checked against the dispatched set, never the booking line ──
  returnState: ReturnState
  qtyReturned: number
  returnCondition?: 'Excellent' | 'Good' | 'Fair' | 'Damaged' | undefined
  returnedBy?: string
  returnedAt?: string
}

export interface CorrectionEntry {
  id: string
  itemId: string
  reason: string
  correctedBy: string
  correctedAt: string
  previousValue: string
  newValue: string
}

/* ── shell step metadata — imports JobName, adds display shape only ─────── */

export interface ShellStepDef {
  key: JobName
  label: string
  icon: IconName
}

/** §1.5 already ruled four operations, not five — Reset absorbs Cleaning.
 *  The shell's rail has 4 entries, not the 5 a step count guessed cold would
 *  assume. See `PLAN.md §4.6`. */
export const SHELL_STEPS: ShellStepDef[] = [
  { key: 'Pack', label: 'Packing', icon: 'box' },
  { key: 'Handover', label: 'Handover · Pickup', icon: 'truck' },
  { key: 'Return', label: 'Return & Inspection', icon: 'return_arrow' },
  { key: 'Reset', label: 'Reset · Cleaning', icon: 'refresh' },
]

export function entryStepFor(status: BookingStatus): JobName | null {
  const found = (Object.keys(JOBS) as JobName[]).find((j) => JOBS[j].runsAt === status)
  if (found) return found
  // Returned's job (Reset) also opens read-only at Closed — spec §4's table.
  if (status === 'Closed') return 'Reset'
  return null
}

export interface StepGate {
  allowed: boolean
  reason: string | null
}

/**
 * Spec §4.1: "Every step is always viewable. Write actions gate on status."
 * Reason text is inline, never a toast — matches the spec's own example
 * ("Pickup closed 6 Aug 09:14 by Ramesh.").
 */
export function stepWriteGate(step: JobName, bookingStatus: BookingStatus, completedAt?: string, completedBy?: string): StepGate {
  const meta = JOBS[step]
  if (meta.runsAt === bookingStatus) return { allowed: true, reason: null }

  const currentOrder = BOOKING_STATUS[bookingStatus].order
  const runsAtOrder = BOOKING_STATUS[meta.runsAt].order

  if (currentOrder < runsAtOrder) {
    return { allowed: false, reason: `${step} opens once this booking reaches ${meta.runsAt} — it is currently ${bookingStatus}.` }
  }
  return {
    allowed: false,
    reason: completedAt ? `${step} closed ${completedAt}${completedBy ? ` by ${completedBy}` : ''}.` : `${step} is already complete for this booking.`,
  }
}

export type StepDotState = 'not-started' | 'in-progress' | 'done' | 'blocked'

export function stepDotState(step: JobName, bookingStatus: BookingStatus, progress: { done: number; total: number }): StepDotState {
  const gate = stepWriteGate(step, bookingStatus)
  if (!gate.allowed) {
    const currentOrder = BOOKING_STATUS[bookingStatus].order
    const runsAtOrder = BOOKING_STATUS[JOBS[step].runsAt].order
    return currentOrder > runsAtOrder ? 'done' : 'blocked'
  }
  if (progress.done === 0) return 'not-started'
  if (progress.done >= progress.total) return 'done'
  return 'in-progress'
}

/* ── item mutations — every one returns a new array, never mutates in place ── */

export function packItem(items: OperationItem[], itemId: string, input: { serial?: string | undefined; qty: number; packedBy: string; packedAt: string }): OperationItem[] {
  return items.map((it) => {
    if (it.id !== itemId) return it
    // §5.2 — a locked line is read-only; a correction entry is the only
    // legal way to change it after this point. Enforced here, in the
    // engine, not just left to the UI hiding pack controls once packed —
    // incidental protection from one caller isn't the same as a guarantee
    // every future caller of this exported function gets for free.
    if (it.lockedAt) return it
    const qtyPacked = Math.min(input.qty, it.qtyExpected)
    return {
      ...it,
      qtyPacked,
      packedSerial: it.trackingMode === 'serial' ? (input.serial ?? it.bookingSerial) : undefined,
      packState: qtyPacked >= it.qtyExpected ? 'Packed' : 'Short',
      packedBy: input.packedBy,
      packedAt: input.packedAt,
    }
  })
}

/** §5.2 — called once, at handover signature. Every currently-packed line locks. */
export function lockPacking(items: OperationItem[], lockedAt: string): OperationItem[] {
  return items.map((it) => (it.packState !== 'Pending' ? { ...it, lockedAt } : it))
}

/**
 * A correction after lock. Never mutates the locked pack fields — appends an
 * entry instead, so `packing lines + corrections` (§5.2) is what's read as
 * the true dispatched set, and both stay visible independently.
 */
export function correctPackedItem(
  items: OperationItem[],
  corrections: CorrectionEntry[],
  itemId: string,
  newQty: number,
  reason: string,
  correctedBy: string,
  correctedAt: string,
): { items: OperationItem[]; corrections: CorrectionEntry[] } {
  const item = items.find((it) => it.id === itemId)
  if (!item) return { items, corrections }
  const entry: CorrectionEntry = {
    id: `corr-${itemId}-${corrections.length + 1}`,
    itemId,
    reason,
    correctedBy,
    correctedAt,
    previousValue: `${effectiveDispatchedQty(item, corrections)} packed`,
    newValue: `${newQty} packed`,
  }
  return { items, corrections: [...corrections, entry] }
}

/** The effective dispatched quantity — packing lines plus any correction, §5.2. */
export function effectiveDispatchedQty(item: OperationItem, corrections: CorrectionEntry[]): number {
  const itemCorrections = corrections.filter((c) => c.itemId === item.id)
  if (itemCorrections.length === 0) return item.qtyPacked
  const last = itemCorrections[itemCorrections.length - 1]!
  const match = /^(\d+)/.exec(last.newValue)
  return match ? Number(match[1]) : item.qtyPacked
}

/**
 * §5.1's core rule: discrepancy is dispatched vs returned, never quoted vs
 * returned. Checks against `qtyPacked` (+corrections), not `qtyExpected`.
 * Substitutions propagate automatically — the expected serial for Return is
 * whatever Packing actually sent out.
 */
export function receiveReturn(
  items: OperationItem[],
  corrections: CorrectionEntry[],
  itemId: string,
  input: { qty: number; condition: OperationItem['returnCondition']; returnedBy: string; returnedAt: string },
): OperationItem[] {
  return items.map((it) => {
    if (it.id !== itemId) return it
    const expected = effectiveDispatchedQty(it, corrections)
    const qtyReturned = Math.min(input.qty, expected)
    return {
      ...it,
      qtyReturned,
      returnCondition: input.condition,
      returnState: input.condition === 'Damaged' ? 'Damaged' : qtyReturned >= expected ? 'Returned' : 'Missing',
      returnedBy: input.returnedBy,
      returnedAt: input.returnedAt,
    }
  })
}

/** What Return should expect for this item — the dispatched set, not the booking line. */
export function expectedForReturn(item: OperationItem, corrections: CorrectionEntry[]): { serial?: string | undefined; qty: number; substituted: boolean } {
  return {
    serial: item.packedSerial,
    qty: effectiveDispatchedQty(item, corrections),
    substituted: Boolean(item.trackingMode === 'serial' && item.packedSerial && item.bookingSerial && item.packedSerial !== item.bookingSerial),
  }
}
