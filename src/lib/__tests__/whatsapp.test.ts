/**
 * `WHATSAPP_LINKS_SPEC_v1.0` §4 — the tests the spec requires shipped WITH the
 * build, not after it.
 *
 * The five §4 headings are the five `describe` blocks below, in the spec's own
 * order, so a reader can check the spec against this file line for line.
 */

import { describe, it, expect } from 'vitest'
import { buildWaLink, normalisePhone, NO_PHONE_REASON } from '../whatsapp'
import {
  ALL_TEMPLATE_IDS,
  adBs,
  balanceDue,
  bookingConfirmed,
  dailyDigest,
  firstName,
  gearReady,
  overdue,
  paymentReceipt,
  pickupTomorrow,
  returnReminder,
  templateMeta,
  templatesForStage,
  type WaBusiness,
} from '../whatsappTemplates'
import type { Paisa } from '../money'
import type { SystemRole } from '../../types/database'

const BUSINESS: WaBusiness = { businessName: 'Babin Rentals', businessPhone: '01-4567890' }
const rs = (rupees: number) => (rupees * 100) as Paisa

/* The seed anchor's month is the only window `lib/bs` can name in BS, so the
   date fixtures sit inside it deliberately — a date outside it exercises the
   fallback instead, which is its own test below. */
const IN_BS_WINDOW = '2026-08-05T06:00:00.000Z'

describe('§4 — 977 normalisation', () => {
  it('prefixes a bare 10-digit Nepali mobile', () => {
    expect(normalisePhone('9841234567')).toBe('9779841234567')
  })

  it('passes an already-prefixed number through untouched', () => {
    expect(normalisePhone('9779841234567')).toBe('9779841234567')
  })

  it('strips the punctuation a counter actually types', () => {
    expect(normalisePhone('+977 984-123 4567')).toBe('9779841234567')
    expect(normalisePhone('(984) 123-4567')).toBe('9779841234567')
  })

  it('refuses short garbage rather than dialling a stranger', () => {
    expect(normalisePhone('1234')).toBeNull()
    expect(normalisePhone('n/a')).toBeNull()
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone(null)).toBeNull()
    expect(normalisePhone(undefined)).toBeNull()
  })

  it('never pads or truncates a near-miss local number into a Nepali one', () => {
    /* Only EXACTLY ten digits gets the 977 prefix. Nine or eleven is not
       silently corrected — padding one would invent a recipient.
       ⚠ Per spec §1 those still fall through the "≥ 8 digits" branch and are
       returned as typed, because nine digits is also a legitimate foreign
       number and nothing here owns another country's numbering plan. So a
       mistyped local mobile yields a link to a number that simply will not
       resolve, rather than to a Nepali stranger — the failure mode the rule
       was chosen for. Asserted so the distinction is deliberate, not assumed. */
    expect(normalisePhone('984123456')).toBe('984123456')
    expect(normalisePhone('98412345678')).toBe('98412345678')
    expect(normalisePhone('984123456')).not.toBe('977984123456')
  })

  it('lets a long foreign number through as typed', () => {
    /* A visiting production or a sub-rental partner abroad. Long enough to be
       real; we do not own its numbering plan, so we do not rewrite it. */
    expect(normalisePhone('+1 415 555 2671')).toBe('14155552671')
  })

  it('refuses a lone country code with no subscriber number', () => {
    expect(normalisePhone('977')).toBeNull()
  })
})

describe('§4 — encoding round-trip', () => {
  it('survives newlines and & through encodeURIComponent', () => {
    const text = 'Line one\nLine two & three'
    const url = buildWaLink('9841234567', text)
    expect(url).not.toBeNull()
    expect(url).toContain('%0A')
    const round = decodeURIComponent(new URL(url as string).searchParams.get('text') ?? '')
    expect(round).toBe(text)
  })

  it('round-trips a whole rendered template, emoji and arrows included', () => {
    const text = bookingConfirmed(
      {
        clientName: 'Sagarmatha Pictures Pvt. Ltd.',
        bookingNo: 'B-901',
        startIso: IN_BS_WINDOW,
        endIso: IN_BS_WINDOW,
        lineCount: 3,
        topLines: ['Alexa Mini', 'Sachtler tripod'],
        total: rs(139506),
        advance: rs(50000),
        deposit: rs(25000),
        pickupTime: '10:00 AM',
      },
      BUSINESS,
    )
    const url = buildWaLink('9841234567', text) as string
    const round = decodeURIComponent(new URL(url).searchParams.get('text') ?? '')
    expect(round).toBe(text)
    expect(round).toContain('✅')
    expect(round).toContain('→')
  })

  it('targets wa.me with the normalised number in the path', () => {
    expect(buildWaLink('984-123-4567', 'hi')).toMatch(/^https:\/\/wa\.me\/9779841234567\?text=/)
  })

  it('returns null — not a broken link — when the number is unusable', () => {
    expect(buildWaLink('n/a', 'hi')).toBeNull()
    /* The caller renders the control disabled with this reason (§1, §3). It is
       a constant so the wording cannot drift between screens. */
    expect(NO_PHONE_REASON).toMatch(/No valid phone/)
  })
})

describe('§4 — stage-awareness', () => {
  const owner: SystemRole = 'Owner'
  const ids = (...args: Parameters<typeof templatesForStage>) =>
    templatesForStage(...args).map((t) => t.id)

  it('a Quote offers nothing', () => {
    expect(ids({ stage: 'Quote', role: owner })).toEqual([])
  })

  it('Booked offers the confirmation first', () => {
    expect(ids({ stage: 'Booked', role: owner })[0]).toBe('booking_confirmed')
  })

  it('Packed offers gear-ready first', () => {
    expect(ids({ stage: 'Packed', role: owner })[0]).toBe('gear_ready')
  })

  it('On Rent offers the return reminder', () => {
    expect(ids({ stage: 'On Rent', role: owner })).toContain('return_reminder')
  })

  it('the overdue flag adds the notice AND takes the first slot', () => {
    const out = ids({ stage: 'On Rent', role: owner, isOverdue: true })
    expect(out).toContain('overdue')
    expect(out[0]).toBe('overdue')
  })

  it('never offers a return chase once the gear is back', () => {
    expect(ids({ stage: 'Returned', role: owner })).not.toContain('return_reminder')
    expect(ids({ stage: 'Closed', role: owner })).not.toContain('return_reminder')
  })

  it('offers the balance reminder only when a balance is actually owed', () => {
    expect(ids({ stage: 'Closed', role: owner })).toEqual([])
    expect(ids({ stage: 'Closed', role: owner, hasBalance: true })).toEqual(['balance_due'])
  })
})

describe('§4 — Law 6 at the registry level, not only the button', () => {
  const MONEY_BLIND: SystemRole[] = ['Warehouse', 'Technician', 'Driver', 'Client']
  const MONEY_TEMPLATES = ALL_TEMPLATE_IDS.filter((id) => templateMeta(id).money)

  it('marks exactly the three money-bearing templates', () => {
    expect(MONEY_TEMPLATES.sort()).toEqual(['balance_due', 'daily_digest', 'payment_receipt'])
  })

  it.each(MONEY_BLIND)('offers no money template to %s, in any stage or flag', (role) => {
    const stages = ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed'] as const
    for (const stage of stages) {
      for (const isOverdue of [false, true]) {
        for (const hasBalance of [false, true]) {
          const out = templatesForStage({ stage, role, isOverdue, hasBalance })
          expect(out.every((t) => !t.money)).toBe(true)
        }
      }
    }
  })

  it('still offers the money reminder to a money role, so the gate is real and not a blanket off-switch', () => {
    const out = templatesForStage({ stage: 'Closed', role: 'Accounts', hasBalance: true })
    expect(out.map((t) => t.id)).toEqual(['balance_due'])
  })
})

describe('§4 — money formatting: whole rupees, no paisa', () => {
  it('renders a whole-rupee total without decimals', () => {
    const out = balanceDue({ clientName: 'Ram', bookingNo: 'B-901', balance: rs(139506) }, BUSINESS)
    expect(out).toContain('Rs 1,39,506')
    expect(out).not.toMatch(/Rs [\d,]+\.\d/)
  })

  it('every money template renders whole rupees for whole-rupee input', () => {
    const receipt = paymentReceipt(
      { clientName: 'Ram', bookingNo: 'B-901', amount: rs(5000), method: 'Cash', balance: rs(0) },
      BUSINESS,
    )
    expect(receipt).not.toMatch(/\.\d\d/)
    expect(receipt).toContain('Status: fully paid ✅')
  })

  it('states a remaining balance when one is left', () => {
    const receipt = paymentReceipt(
      { clientName: 'Ram', bookingNo: 'B-901', amount: rs(5000), method: 'Bank', balance: rs(2500) },
      BUSINESS,
    )
    expect(receipt).toContain('Remaining balance: Rs 2,500')
    expect(receipt).not.toContain('fully paid')
  })
})

describe('template bodies — the frame and the conditional lines', () => {
  const base = { clientName: 'Ram Bahadur Thapa', bookingNo: 'B-901', startIso: IN_BS_WINDOW, endIso: IN_BS_WINDOW }

  it('greets on the first name and closes with the business name', () => {
    const out = returnReminder({ ...base, returnTime: '5:00 PM' }, BUSINESS)
    expect(out.startsWith('Namaste Ram,')).toBe(true)
    expect(out.endsWith('Dhanyabad,\nBabin Rentals')).toBe(true)
  })

  it('addresses a company on its first token rather than on an empty greeting', () => {
    expect(firstName('Sagarmatha Pictures Pvt. Ltd.')).toBe('Sagarmatha')
    expect(firstName('   ')).toBe('')
  })

  it('says nothing at all about an advance or deposit that is zero or absent', () => {
    const out = bookingConfirmed(
      { ...base, lineCount: 2, topLines: [], total: rs(1000), advance: rs(0), deposit: null, pickupTime: '10:00 AM' },
      BUSINESS,
    )
    expect(out).not.toContain('Advance paid')
    expect(out).not.toContain('Deposit')
    expect(out).toContain('Items: 2 items')
  })

  it('names the items when there are some to name', () => {
    const out = bookingConfirmed(
      { ...base, lineCount: 3, topLines: ['Alexa Mini', 'Tripod'], total: rs(1000), pickupTime: '10:00 AM' },
      BUSINESS,
    )
    expect(out).toContain('Items: 3 items — Alexa Mini, Tripod')
  })

  it('puts the business phone in the overdue notice, so the client can reply somewhere that is not this link', () => {
    expect(overdue(base, BUSINESS)).toContain('01-4567890')
  })

  it('carries the pickup window and time through', () => {
    expect(gearReady({ ...base, pickupWindow: '10:00 AM – 12:00 PM' }, BUSINESS)).toContain('10:00 AM – 12:00 PM')
    expect(pickupTomorrow({ ...base, pickupTime: '10:00 AM' }, BUSINESS)).toContain('Pickup from 10:00 AM.')
  })

  it('writes the digest without a client greeting — it is owner-to-owner', () => {
    const out = dailyDigest(
      {
        businessDateIso: IN_BS_WINDOW,
        pickupsCount: 6,
        returnsCount: 4,
        newCount: 2,
        cashTotal: rs(10000),
        bankTotal: rs(5000),
        cardTotal: rs(0),
        otherTotal: rs(0),
        receivablesTotal: rs(250000),
        depositsHeld: rs(75000),
        varianceLine: 'balanced',
      },
      BUSINESS,
    )
    expect(out.startsWith('Babin Rentals — ')).toBe(true)
    expect(out).not.toContain('Namaste')
    expect(out).toContain('Closing variance: balanced')
  })
})

describe('dates — AD always, BS only when the engine can vouch for it', () => {
  it('puts BS beside AD inside the supported window', () => {
    /* The exact BS day is `lib/bs`'s to assert (bs.test.ts); what matters here
       is the SHAPE — "12 Sep 2026 (27 Bhadra)" — and that both halves are present. */
    const out = adBs(IN_BS_WINDOW)
    expect(out).toMatch(/^\d{1,2} \w{3} \d{4} \(.+\)$/)
    expect(out).not.toContain('BS)')
  })

  it('drops the bracket rather than guessing outside the window', () => {
    // 2030 used to be outside the window; since the 2078–2095 table landed it
    // resolves (1 Magh 2086). The bracket is dropped only where the table
    // genuinely cannot name the date, so this reaches past its last year.
    const out = adBs('2040-01-15T06:00:00.000Z')
    expect(out).toMatch(/^\d{1,2} \w{3} \d{4}$/)
  })

  it('renders an unusable date as an explicit non-value, never as Invalid Date', () => {
    expect(adBs('not-a-date')).toBe('—')
  })
})
