import { describe, it, expect } from 'vitest'
// Vite `?raw` imports, NOT node:fs — this project ships no `@types/node` and
// `npm run typecheck` is a gate. Same idiom as `breakpoints.test.ts`.
import bookingDetail from '../../modules/rentals/BookingDetail.tsx?raw'
import movementList from '../../modules/today/MovementList.tsx?raw'
import packingWorkspace from '../../modules/rentals/PackingWorkspace.tsx?raw'
import handoverWorkspace from '../../modules/rentals/HandoverWorkspace.tsx?raw'
import returnWorkspace from '../../modules/rentals/ReturnWorkspace.tsx?raw'
import dataRentals from '../../data/rentals.ts?raw'
import { deliveryTypeLabel } from '../format'

/**
 * Law 17 / PLAN.md §6.1 — the word "customer" appears nowhere in the UI.
 *
 * `bookings.delivery_type` spells one enum member `'Customer Pickup'`
 * (`0001_enums.sql:34`), which is correct: Law 17 governs what the operator
 * reads, not what Postgres stores. The write path mapped label → enum from the
 * start (`deliveryTypeFromLabel`); the inverse was never written, so the raw
 * enum rendered at six sites. **All 246 live bookings carry that value**, so it
 * showed on every booking rather than on an edge case.
 *
 * Three Law 17 tests already existed and none caught it, because all three
 * assert over static label constants — no component or formatter ever saw a
 * stored `deliveryType`. These tests cover the value path instead.
 *
 * ⛔ The first pass of this file listed FIVE guarded sites under a heading that
 * said six. The sixth, `data/rentals.ts`'s Intel-card Delivery field, was not a
 * screen and so was not in the list — and it stayed raw (audit BD-06). It is
 * guarded below now, and the guard is no longer described as covering only
 * screens.
 */
describe('deliveryTypeLabel — Law 17 on the read path', () => {
  it('renames the stored enum member for display', () => {
    expect(deliveryTypeLabel('Client Pickup')).toBe('Client Pickup')
    expect(deliveryTypeLabel('Customer Pickup')).toBe('Client Pickup')
  })

  it('passes the other three members through unchanged', () => {
    expect(deliveryTypeLabel('Babin Delivery')).toBe('Babin Delivery')
    expect(deliveryTypeLabel('Courier')).toBe('Courier')
    expect(deliveryTypeLabel('Third Party')).toBe('Third Party')
  })

  it('never returns the banned word, for any enum member', () => {
    for (const member of ['Client Pickup', 'Customer Pickup', 'Babin Delivery', 'Courier', 'Third Party']) {
      expect(deliveryTypeLabel(member).toLowerCase()).not.toContain('customer')
    }
  })

  it('falls back for null, undefined and empty, and honours a custom fallback', () => {
    expect(deliveryTypeLabel(null)).toBe('—')
    expect(deliveryTypeLabel(undefined)).toBe('—')
    expect(deliveryTypeLabel('')).toBe('—')
    expect(deliveryTypeLabel(null, 'Not set')).toBe('Not set')
  })
})

/**
 * Source guard. These are the exact six renders that shipped the raw enum; the
 * behavioural tests above cannot see a component, so this is what stops the
 * regression coming back by the same route. It does NOT prove the whole app is
 * clean — a *new* display site would need adding here.
 */
describe('Law 17 — nothing that reaches the DOM carries a stored delivery type raw', () => {
  const SITES: ReadonlyArray<readonly [string, string]> = [
    ['BookingDetail.tsx', bookingDetail],
    ['MovementList.tsx', movementList],
    ['PackingWorkspace.tsx', packingWorkspace],
    ['HandoverWorkspace.tsx', handoverWorkspace],
    ['ReturnWorkspace.tsx', returnWorkspace],
    // Not a screen, but rendered all the same: `rentalDetailGroups` is what
    // `RentalsList.tsx` hands the Intel card as `detail`.
    ['data/rentals.ts', dataRentals],
  ]

  // The shapes that actually shipped the bug.
  const RAW_RENDERS = [
    '{booking.deliveryType}',
    "v: floor.deliveryType ?? '—'",
    "value={floor.deliveryType ?? '—'}",
    ', m.deliveryType]',
    "value: row.deliveryType }",
  ]

  it.each(SITES)('%s routes its delivery type through deliveryTypeLabel', (_name, src) => {
    expect(src).toContain('deliveryTypeLabel')
  })

  it.each(SITES)('%s renders no raw deliveryType', (_name, src) => {
    for (const shape of RAW_RENDERS) expect(src).not.toContain(shape)
  })

  it('leaves logic that compares the stored enum alone', () => {
    // driverSignatureRequired must keep testing the ENUM, never the label —
    // 'Client Pickup' is not a delivery_type member and would never match.
    expect(handoverWorkspace).toContain("deliveryType === 'Babin Delivery'")
  })
})
