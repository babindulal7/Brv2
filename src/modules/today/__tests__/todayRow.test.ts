import { describe, expect, it, vi } from 'vitest'

/**
 * # What this suite pins
 *
 * The two behaviours `../updated mds/02_TODAY.md` introduced that a screenshot
 * would not catch, and that no existing suite reaches:
 *
 * 1. **One primary button per row, and which one.** Spec 02 Notes: *"One primary
 *    button per row; everything else behind ⋮."* The row's single filled button
 *    is `primaryFor()`'s answer, and getting it wrong sends the floor to the
 *    wrong workspace — a Packed booking offered [Pack] again, or a return
 *    offered a handover. None of those throw; they all render a plausible row.
 *    The suite also pins that no primary is a WRITE: rulings §8 and
 *    `SUCCESS_FABRICATION_REGISTER_2026-08-12.md` forbid a row telling the floor
 *    something landed when nothing was written, so every primary is a route.
 *
 * 2. **The alert order, now that the Critical-only filter is gone.** The panel
 *    used to render Critical rows only, citing §5.6's "Critical Alerts KPI …
 *    must equal the Alerts column count" — a card spec 02's KPI strip does not
 *    contain. It now lists every alert, priority-sorted. A silent regression to
 *    an unstable or a reversed sort would bury an overdue return under a quote.
 *
 * `lib/supabase` is replaced because `MovementList` reaches `data/today.ts`
 * reaches `queries/bookings.ts` reaches the client, which throws without env
 * vars. Nothing here performs a query.
 */
vi.mock('../../../lib/supabase', () => ({
  supabase: {},
  newClientUuid: () => '00000000-0000-4000-8000-000000000000',
}))

import { primaryFor } from '../MovementList'
import { sortAlerts } from '../AlertsPanel'
import type { AlertRow } from '../../../types/today'
import type { BookingStatus } from '../../../lib/workflow'

const row = (status: BookingStatus, bookingNo = 'B-715') => ({ bookingNo, status })

describe('primaryFor · the row’s one primary action', () => {
  it('offers Pack on a Booked outgoing row, pointing at the Packing route', () => {
    expect(primaryFor(row('Booked'), 'outgoing')).toEqual({
      label: 'Pack',
      to: '/rentals/B-715/packing',
      hint: 'Open the Packing workspace',
    })
  })

  it('offers Handover once the booking is Packed — never Pack twice', () => {
    const { label, to } = primaryFor(row('Packed'), 'outgoing')
    expect(label).toBe('Handover')
    expect(to).toBe('/rentals/B-715/handover')
  })

  it('offers Return on the incoming side whatever the stage says', () => {
    // `todaysIncoming` selects On Rent; the label must not follow the stage the
    // way the outgoing side does, because Return-ness is which query asked.
    for (const stage of ['On Rent', 'Packed', 'Booked'] as const) {
      expect(primaryFor(row(stage), 'incoming').to).toBe('/rentals/B-715/return')
      expect(primaryFor(row(stage), 'incoming').label).toBe('Return')
    }
  })

  it('falls back to opening the booking rather than guessing a workspace', () => {
    // Unreachable while `todaysOutgoing` selects Booked and Packed only — but if
    // that stage set ever widens, the row must not offer to pack a Closed job.
    for (const stage of ['Quote', 'On Rent', 'Returned', 'Closed'] as const) {
      expect(primaryFor(row(stage), 'outgoing')).toEqual({
        label: 'Open',
        to: '/rentals/B-715',
        hint: 'Open the booking',
      })
    }
  })

  it('never writes — every primary is a navigation, and it carries the row’s own number', () => {
    const stages: BookingStatus[] = ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']
    for (const stage of stages) {
      for (const side of ['outgoing', 'incoming'] as const) {
        const primary = primaryFor(row(stage, 'B-9'), side)
        expect(primary.to.startsWith('/rentals/B-9')).toBe(true)
        // No "Complete …" primary: those two stay in the ⋮ menu, where
        // `actions/core.ts` refuses an action that is not `implemented`.
        expect(primary.label).not.toMatch(/^Complete/)
      }
    }
  })

  it('reads the booking number off the row and hardcodes no prefix', () => {
    // Rulings §2 — prefixes are configuration (`data/numbering.ts`), never a
    // literal in a module. Whatever the registry issues has to route.
    expect(primaryFor(row('Booked', 'Q-42'), 'outgoing').to).toBe('/rentals/Q-42/packing')
  })
})

describe('sortAlerts · every alert, priority first', () => {
  const alert = (priority: AlertRow['priority'], title: string): AlertRow => ({
    icon: 'error',
    statusKey: 'danger',
    title,
    detail: 'ABC Films · B-715',
    right: '3 days late',
    rightTone: 'danger',
    action: 'Open Booking',
    to: `/rentals/${title}`,
    priority,
  })

  it('puts Critical above High above Normal', () => {
    const sorted = sortAlerts([alert('Normal', 'n'), alert('High', 'h'), alert('Critical', 'c')])
    expect(sorted.map((a) => a.title)).toEqual(['c', 'h', 'n'])
  })

  it('drops nothing — the Critical-only filter is gone, not relocated', () => {
    const input = [alert('High', 'h1'), alert('Critical', 'c1'), alert('High', 'h2')]
    expect(sortAlerts(input)).toHaveLength(3)
    expect(sortAlerts(input).filter((a) => a.priority === 'High')).toHaveLength(2)
  })

  it('is stable inside a band, so Critical rows keep their due-date order', () => {
    const sorted = sortAlerts([alert('Critical', 'first'), alert('Critical', 'second'), alert('High', 'h')])
    expect(sorted.map((a) => a.title)).toEqual(['first', 'second', 'h'])
  })

  it('does not mutate the array the page passed it', () => {
    const input = [alert('High', 'h'), alert('Critical', 'c')]
    sortAlerts(input)
    expect(input.map((a) => a.title)).toEqual(['h', 'c'])
  })

  it('survives an empty list without inventing a row', () => {
    expect(sortAlerts([])).toEqual([])
  })
})
