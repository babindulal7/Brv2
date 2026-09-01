/**
 * `WHATSAPP_LINKS_SPEC_v1.0` §3 — the menu's availability rules.
 *
 * The point of these is the REASONS. A disabled entry that names the wrong
 * cause sends a staff member to the wrong screen, so each blocker is asserted
 * to be distinct and to name where it is fixed.
 */

import { describe, it, expect } from 'vitest'
import { whatsappActionsFor, type WaBookingFacts, type WaSettings } from '../whatsappActions'
import type { Paisa } from '../money'
import type { SystemRole } from '../../types/database'

const rs = (n: number) => (n * 100) as Paisa
const OWNER: SystemRole = 'Owner'

const FACTS: WaBookingFacts = {
  clientName: 'Ram Bahadur',
  bookingNo: 'B-901',
  stage: 'Booked',
  startIso: '2026-08-05T06:00:00.000Z',
  endIso: '2026-08-09T06:00:00.000Z',
  itemCount: 3,
  topLines: ['Alexa Mini'],
  isOverdue: false,
  total: rs(50000),
  advance: rs(10000),
  deposit: rs(5000),
  balance: rs(0),
}

const SET: WaSettings = {
  businessName: 'Babin Rentals',
  businessPhone: '01-4567890',
  defaultPickupTime: '10:00',
  defaultReturnTime: '17:00',
}

const run = (
  facts: Partial<WaBookingFacts> = {},
  settings: Partial<WaSettings> = {},
  role: SystemRole = OWNER,
  clientPhone: string | null = '9841234567',
) => whatsappActionsFor({ facts: { ...FACTS, ...facts }, settings: { ...SET, ...settings }, role, clientPhone })

describe('composable actions', () => {
  it('composes a real wa.me link when everything is present', () => {
    const first = run()[0]!
    expect(first.id).toBe('booking_confirmed')
    expect(first.unavailable).toBeUndefined()
    expect(first.href).toMatch(/^https:\/\/wa\.me\/9779841234567\?text=/)
  })

  it('offers nothing at all on a Quote', () => {
    expect(run({ stage: 'Quote' })).toEqual([])
  })

  it('puts the overdue notice first once a booking is late', () => {
    const out = run({ stage: 'On Rent', isOverdue: true })
    expect(out[0]?.id).toBe('overdue')
    expect(out[0]?.href).not.toBeNull()
  })
})

describe('every blocker names its own cause', () => {
  it('disables the whole menu for one reason when the client has no phone', () => {
    const out = run({}, {}, OWNER, null)
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((a) => a.href === null)).toBe(true)
    expect(out.every((a) => /No valid phone/.test(a.unavailable ?? ''))).toBe(true)
  })

  it('treats a junk phone exactly as a missing one', () => {
    expect(run({}, {}, OWNER, 'n/a').every((a) => a.href === null)).toBe(true)
  })

  it('blocks the confirmation on a missing pickup time and says where to set it', () => {
    const first = run({}, { defaultPickupTime: '' })[0]!
    expect(first.href).toBeNull()
    expect(first.unavailable).toMatch(/usual pickup time/i)
    expect(first.unavailable).toMatch(/Settings/)
    /* The wording must say the blank is deliberate — otherwise the next
       session "fixes" it by hardcoding an hour. */
    expect(first.unavailable).toMatch(/blank rather than guessed/)
  })

  it('blocks the return reminder on a missing return time', () => {
    const first = run({ stage: 'On Rent' }, { defaultReturnTime: '' })[0]!
    expect(first.id).toBe('return_reminder')
    expect(first.unavailable).toMatch(/usual return time/i)
  })

  it('blocks the overdue notice on a missing contact number, not on a time', () => {
    const first = run({ stage: 'On Rent', isOverdue: true }, { businessPhone: '' })[0]!
    expect(first.id).toBe('overdue')
    expect(first.unavailable).toMatch(/contact number/i)
    expect(first.unavailable).not.toMatch(/pickup|return time/i)
  })

  it('blocks the confirmation on a missing total separately from a missing time', () => {
    const first = run({ total: null })[0]!
    expect(first.unavailable).toMatch(/no invoiced total/i)
    expect(first.unavailable).not.toMatch(/pickup/i)
  })
})

describe('money, and Law 6', () => {
  it('offers the balance reminder only when a positive balance is visible', () => {
    expect(run({ stage: 'Closed', balance: rs(0) })).toEqual([])
    expect(run({ stage: 'Closed', balance: rs(2500) }).map((a) => a.id)).toEqual(['balance_due'])
  })

  it('never reads a null balance as "nothing owed"', () => {
    /* null = not fetched or not permitted. Rendering it as a Rs 0 reminder
       would state a financial fact the session does not have. */
    expect(run({ stage: 'Closed', balance: null })).toEqual([])
  })

  it.each(['Warehouse', 'Technician', 'Driver', 'Client'] as SystemRole[])(
    'offers %s no money template even with a balance owed',
    (role) => {
      const out = run({ stage: 'Closed', balance: rs(2500) }, {}, role)
      expect(out).toEqual([])
    },
  )

  it('still lets a money-blind role send a non-money message', () => {
    const out = run({ stage: 'Packed' }, {}, 'Warehouse')
    expect(out.map((a) => a.id)).toContain('gear_ready')
  })
})
