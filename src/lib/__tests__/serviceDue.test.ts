import { describe, it, expect } from 'vitest'
import { serviceStatus, serviceDetail, hasServicePlan, type ServiceRow } from '../serviceDue'

/**
 * RULING 2026-09-08 (R-28) — the reading half.
 *
 * What this suite can and cannot speak for, stated once:
 *
 * ✅ How a due unit is SAID — which token, which words, which counters. That is
 *    what `lib/serviceDue.ts` decides and it is decided without a database.
 *
 * ❌ WHETHER a unit is due. That is `product_units_service_v` (migration 0103)
 *    and it is arithmetic over three tables. Re-deriving it here would create
 *    the second implementation R-28 exists to avoid, and a green run would then
 *    prove only that two copies of the same mistake agree. The view's own
 *    post-conditions execute R-28's scenario — 90 days / 40 rental days, five
 *    bookings of ten, `usage` before `time` — against a real Postgres.
 */

const BASE: ServiceRow = {
  unitId: 'unit-1',
  productId: 'product-1',
  lastServiceAt: '2026-06-01T00:00:00.000Z',
  daysSinceService: 10,
  rentalDaysSinceService: 4,
  meterHoursSinceService: 3,
  dueAt: null,
  dueReason: null,
  overdueDays: null,
  serviceIntervalDays: null,
  serviceIntervalRentalDays: null,
  serviceIntervalMeterHours: null,
  serviceGraceDays: 7,
}

const row = (over: Partial<ServiceRow>): ServiceRow => ({ ...BASE, ...over })

describe('serviceStatus — nothing to say is said with nothing', () => {
  it('is null for a model with no preventive plan, which is most of the catalogue', () => {
    expect(serviceStatus(BASE)).toBeNull()
  })

  it('is null for a unit under a plan that is not due yet', () => {
    expect(serviceStatus(row({ serviceIntervalDays: 90, daysSinceService: 10 }))).toBeNull()
  })

  /* No "OK" badge, ever. A column of green ticks trains the eye to skip the one
     amber row, which is the only row that had anything to say. */
  it('renders no positive state — the absence of a badge IS the healthy state', () => {
    const healthy = row({ serviceIntervalDays: 90, serviceIntervalRentalDays: 40 })
    expect(serviceStatus(healthy)).toBeNull()
  })
})

describe('serviceStatus — due, then overdue', () => {
  it('is a NEUTRAL badge while it is merely due — due is information, not a problem', () => {
    const status = serviceStatus(row({ dueReason: 'time', serviceIntervalDays: 90, daysSinceService: 92, overdueDays: 0 }))
    expect(status?.level).toBe('due')
    expect(status?.tone).toBe('neutral')
    expect(status?.label).toBe('Service due')
  })

  it('turns danger only past the grace window, and says by how much', () => {
    const status = serviceStatus(row({ dueReason: 'time', serviceIntervalDays: 90, daysSinceService: 110, overdueDays: 13 }))
    expect(status?.level).toBe('overdue')
    expect(status?.tone).toBe('danger')
    expect(status?.label).toBe('Overdue by 13 days')
  })

  /* The words change before the colour does — CLAUDE.md's "never colour alone".
     A reader in greyscale must still be able to tell due from overdue. */
  it('distinguishes due from overdue in WORDS, not only in tone', () => {
    const due = serviceStatus(row({ dueReason: 'time', serviceIntervalDays: 90, daysSinceService: 92, overdueDays: 0 }))
    const overdue = serviceStatus(row({ dueReason: 'time', serviceIntervalDays: 90, daysSinceService: 110, overdueDays: 13 }))
    expect(due?.label).not.toBe(overdue?.label)
  })

  /* A usage-due unit carries no overdue count — "overdue by N days" has no
     meaning against a rental-day threshold, and 0103 returns null rather than
     inventing one. It must not silently read as overdue. */
  it('a usage reason with no overdue count reads as due, not overdue', () => {
    const status = serviceStatus(
      row({ dueReason: 'usage', serviceIntervalRentalDays: 40, rentalDaysSinceService: 50, overdueDays: null }),
    )
    expect(status?.level).toBe('due')
    expect(status?.tone).toBe('neutral')
  })
})

describe('serviceDetail — the tooltip names the counter that crossed', () => {
  it('gives the time reason a date, in Bikram Sambat and AD, plus the day count', () => {
    const detail = serviceDetail(
      row({ dueReason: 'time', dueAt: '2026-08-30T00:00:00.000Z', serviceIntervalDays: 90, daysSinceService: 95 }),
    )
    expect(detail).toContain('2026')
    expect(detail).toContain('— time (95 of 90 days)')
  })

  /* R-28's own example sentence: `— usage (42 of 40 rental days)`. A number an
     operator can check against a booking list, not a bare "due". */
  it('gives the usage reason its rental-day counters', () => {
    const detail = serviceDetail(
      row({ dueReason: 'usage', serviceIntervalRentalDays: 40, rentalDaysSinceService: 42 }),
    )
    expect(detail).toBe('Due — usage (42 of 40 rental days)')
  })

  it('falls back to meter hours when that is the counter that crossed', () => {
    const detail = serviceDetail(
      row({ dueReason: 'usage', serviceIntervalMeterHours: 250, meterHoursSinceService: 260 }),
    )
    expect(detail).toBe('Due — usage (260 of 250 meter hours)')
  })

  /* Rental days first when both crossed: a coordinator can reconcile rental days
     against a booking list without opening the unit. */
  it('names rental days first when both usage counters have crossed', () => {
    const detail = serviceDetail(
      row({
        dueReason: 'usage',
        serviceIntervalRentalDays: 40,
        rentalDaysSinceService: 42,
        serviceIntervalMeterHours: 250,
        meterHoursSinceService: 260,
      }),
    )
    expect(detail).toContain('rental days')
    expect(detail).not.toContain('meter hours')
  })

  it('shows a meter reading as 42, not 42.0, and keeps a real fraction', () => {
    expect(serviceDetail(row({ dueReason: 'usage', serviceIntervalMeterHours: 40, meterHoursSinceService: 42 }))).toContain(
      '42 of 40',
    )
    expect(
      serviceDetail(row({ dueReason: 'usage', serviceIntervalMeterHours: 40, meterHoursSinceService: 42.5 })),
    ).toContain('42.5 of 40')
  })

  /* A date the view could not produce must not become a blank tooltip. */
  it('says how long it has been when the time reason carries no due date', () => {
    const detail = serviceDetail(row({ dueReason: 'time', dueAt: null, serviceIntervalDays: 90, daysSinceService: 95 }))
    expect(detail).toContain('95 days since the last service')
  })
})

describe('hasServicePlan — the model page empty state', () => {
  it('is false when all three intervals are off, which is the default', () => {
    expect(
      hasServicePlan({ serviceIntervalDays: null, serviceIntervalRentalDays: null, serviceIntervalMeterHours: null }),
    ).toBe(false)
  })

  it('is true as soon as any ONE of the three is set — either, not both', () => {
    expect(
      hasServicePlan({ serviceIntervalDays: 90, serviceIntervalRentalDays: null, serviceIntervalMeterHours: null }),
    ).toBe(true)
    expect(
      hasServicePlan({ serviceIntervalDays: null, serviceIntervalRentalDays: 40, serviceIntervalMeterHours: null }),
    ).toBe(true)
    expect(
      hasServicePlan({ serviceIntervalDays: null, serviceIntervalRentalDays: null, serviceIntervalMeterHours: 250 }),
    ).toBe(true)
  })
})
