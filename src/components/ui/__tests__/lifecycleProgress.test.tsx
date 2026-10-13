import { describe, expect, it } from 'vitest'
import { getRentalPrimaryAction } from '../../../lib/rentalActions'
import { getUniversalNextAction } from '../LifecycleProgress'

/**
 * RULING 2026-09-29 (audit §7): the banner never names its own transition.
 * Its verb and its target are the single resolver's output, pinned here.
 */
describe('LifecycleProgress banner delegates to getRentalPrimaryAction', () => {
  const cases: Array<{ status: string; meta?: { isOverdue?: boolean; isPartial?: boolean } }> = [
    { status: 'Quote' },
    { status: 'Draft' },
    { status: 'Booked' },
    { status: 'Confirmed' },
    { status: 'Packing' },
    { status: 'Packed' },
    { status: 'Ready' },
    { status: 'On Rent' },
    { status: 'Out' },
    { status: 'On Rent', meta: { isOverdue: true } },
    { status: 'On Rent', meta: { isPartial: true } },
    { status: 'Partial Return' },
    { status: 'Returned' },
    { status: 'Inspected' },
    { status: 'Reset Complete' },
    { status: 'Closed' },
    { status: 'Cancelled' },
  ]

  for (const { status, meta } of cases) {
    it(`agrees with the resolver for ${status}${meta ? ` ${JSON.stringify(meta)}` : ''}`, () => {
      const banner = getUniversalNextAction(status, meta)
      const canonical = getRentalPrimaryAction(status, {
        isOverdue: meta?.isOverdue,
        isPartial: meta?.isPartial,
      })
      expect(banner.primaryVerb).toBe(canonical.label)
      expect(banner.action).toEqual(canonical)
    })
  }

  it('keeps its progress-track presentation independent of the action', () => {
    expect(getUniversalNextAction('Booked').stageIndex).toBe(1)
    expect(getUniversalNextAction('On Rent').currentStage).toBe('Return')
    expect(getUniversalNextAction('Closed').badgeTone).toBe('dim')
  })

  it.each([
    ['Draft', 'neutral'], ['Booked', 'primary'], ['Preparing', 'progress'],
    ['Packed', 'progress'], ['On Rent', 'out'], ['Partial Return', 'progress'],
    ['Returned', 'in'], ['Inspection Complete', 'progress'], ['Reset Complete', 'progress'],
    ['Closed', 'dim'], ['Cancelled', 'danger'], ['Void', 'dim'],
  ])('paints %s with the operational %s meaning', (status, tone) => {
    expect(getUniversalNextAction(status).badgeTone).toBe(tone)
  })

  it('prioritizes an overdue alarm over the partial-return warning', () => {
    expect(getUniversalNextAction('On Rent', { isOverdue: true, isPartial: true }).badgeTone).toBe('danger')
  })
})
