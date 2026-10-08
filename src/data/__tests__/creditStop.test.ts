// @vitest-environment jsdom
/**
 * **On Stop — Rulings §11.2, the derived credit state.**
 *
 * `client_flag_type` is `VIP | Blocked | Upgrade Candidate` and there is no
 * fourth member. A client is On Stop when their outstanding exceeds their
 * credit limit, or when they hold an invoice more than *N* days past due, where
 * *N* is read from Settings ▸ Financial.
 *
 * What is pinned here is not arithmetic — it is the three ways this predicate
 * is allowed to be wrong, each of which puts a false statement in front of an
 * operator:
 *
 *  1. **A missing figure must not read as a passing one.** `toClientRecord`
 *     maps withheld money to `0`. If a money-blind session's zero were compared
 *     against a limit, every client in the business would report "clear".
 *  2. **The threshold must come from Settings.** A module carrying `30` means
 *     changing the setting changes nothing, silently.
 *  3. **The reason must name the limb.** "On stop" with no why is a support
 *     call.
 *
 * jsdom because `readOverdueStopDays` goes through `localStorage`; the suite
 * default is `node` (`vitest.config.ts`).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CLIENTS_DATA,
  creditStopFactsOf,
  daysPastDue,
  evaluateCreditStop,
  readOverdueStopDays,
  type ClientRecord,
  type CreditStopFacts,
} from '../clients'
import { rupees } from '../../lib/money'
import { writeSettings, resetSettings, SETTINGS_DEFAULTS } from '../../lib/settingsStore'
import { clientDetailGroups, clientGlance } from '../clientIntel'

const OPTS = { overdueStopDays: 30, canViewMoney: true }

/** Everything readable, nothing firing. Each test spoils exactly one field. */
const CLEAR: CreditStopFacts = {
  outstandingPaisa: rupees(10_000),
  creditLimitPaisa: rupees(100_000),
  daysPastDueOnOldestUnpaidInvoice: 0,
}

beforeEach(() => {
  window.localStorage.clear()
})

it('keeps blocked state first and omits personal and financial fields from a Warehouse Intel payload', () => {
  const base = CLIENTS_DATA[0]
  if (!base) throw new Error('The client fixture is missing')
  const client: ClientRecord = { ...base, isBlocked: true }
  const ctx = { role: 'Warehouse' as const }
  const glance = clientGlance(client, ctx)
  const detail = clientDetailGroups(client, ctx)
  expect(glance.lines?.[0]).toMatch(/Blocked/)
  expect(detail[0]?.title).toBe('Credit control')
  const payload = JSON.stringify({ glance, detail })
  expect(payload).not.toContain(client.pan)
  expect(payload).not.toContain(client.phone)
  expect(payload).not.toContain('Outstanding balance')
})

describe('evaluateCreditStop — the two limbs', () => {
  it('is clear when the balance is inside the limit and nothing is late', () => {
    const v = evaluateCreditStop(CLEAR, OPTS)
    expect(v.onStop).toBe(false)
    expect(v.indeterminate).toBe(false)
    expect(v.reasons).toEqual([])
    expect(v.unavailable).toEqual([])
  })

  it('fires when outstanding exceeds the credit limit', () => {
    const v = evaluateCreditStop({ ...CLEAR, outstandingPaisa: rupees(100_001) }, OPTS)
    expect(v.onStop).toBe(true)
    expect(v.reasons.join(' ')).toMatch(/over the approved credit limit/i)
  })

  it('does not fire when outstanding EQUALS the limit — "exceeds" is strict', () => {
    const v = evaluateCreditStop({ ...CLEAR, outstandingPaisa: rupees(100_000) }, OPTS)
    expect(v.onStop).toBe(false)
  })

  it('fires when an invoice is more than N days past due, and names the days', () => {
    const v = evaluateCreditStop({ ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 31 }, OPTS)
    expect(v.onStop).toBe(true)
    expect(v.reasons.join(' ')).toContain('31 days past its due date')
  })

  it('does not fire at exactly N days — the ruling says MORE than N', () => {
    expect(evaluateCreditStop({ ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 30 }, OPTS).onStop).toBe(false)
    expect(evaluateCreditStop({ ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 30 }, OPTS).reasons).toEqual([])
  })

  it('either limb alone is enough — they are OR, not AND', () => {
    expect(evaluateCreditStop({ ...CLEAR, outstandingPaisa: rupees(999_999) }, OPTS).onStop).toBe(true)
    expect(evaluateCreditStop({ ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 90 }, OPTS).onStop).toBe(true)
  })

  it('reports both reasons when both limbs fire', () => {
    const v = evaluateCreditStop(
      { outstandingPaisa: rupees(200_000), creditLimitPaisa: rupees(100_000), daysPastDueOnOldestUnpaidInvoice: 45 },
      OPTS,
    )
    expect(v.reasons).toHaveLength(2)
  })
})

describe('evaluateCreditStop — the threshold is a setting, not a literal', () => {
  it('a shorter threshold puts the same client on stop', () => {
    const facts = { ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 20 }
    expect(evaluateCreditStop(facts, { ...OPTS, overdueStopDays: 30 }).onStop).toBe(false)
    expect(evaluateCreditStop(facts, { ...OPTS, overdueStopDays: 14 }).onStop).toBe(true)
  })

  it('the default is the ruled 30, read from the registry rather than typed in a module', () => {
    expect(SETTINGS_DEFAULTS.overdueStopDays).toBe(30)
    expect(readOverdueStopDays()).toBe(30)
  })

  it('an edit in Settings ▸ Financial is what the predicate then reads', () => {
    writeSettings({ overdueStopDays: 7 })
    expect(readOverdueStopDays()).toBe(7)
    resetSettings()
    expect(readOverdueStopDays()).toBe(30)
  })

  it('refuses a threshold that is not a whole number of days', () => {
    expect(() => writeSettings({ overdueStopDays: 0 })).toThrow(/at least one/i)
    expect(() => writeSettings({ overdueStopDays: 400 })).toThrow(/write-off/i)
  })
})

describe('evaluateCreditStop — an unreadable limb is not a passing limb (§11.2.7)', () => {
  it('a withheld outstanding balance makes the credit limb unavailable, not clear', () => {
    const v = evaluateCreditStop({ ...CLEAR, outstandingPaisa: null }, OPTS)
    expect(v.onStop).toBe(false)
    expect(v.limbs.find((l) => l.limb === 'credit-limit')!.fired).toBeNull()
    expect(v.unavailable.join(' ')).toMatch(/did not run/i)
  })

  it('a zero credit limit is read as "no limit recorded", never as a limit of zero', () => {
    // `toClientRecord` maps an absent `approved_credit_limit` to 0. Comparing
    // any outstanding against it would put the whole directory on stop.
    const v = evaluateCreditStop({ ...CLEAR, creditLimitPaisa: rupees(0) }, OPTS)
    expect(v.onStop).toBe(false)
    expect(v.unavailable.join(' ')).toMatch(/no approved credit limit is recorded/i)
  })

  it('no invoice data makes the overdue limb unavailable, not "nothing is late"', () => {
    const v = evaluateCreditStop({ ...CLEAR, daysPastDueOnOldestUnpaidInvoice: null }, OPTS)
    expect(v.limbs.find((l) => l.limb === 'overdue-invoice')!.fired).toBeNull()
    expect(v.unavailable.join(' ')).toMatch(/no invoice due dates were read/i)
  })

  it('when NO limb can run the verdict is indeterminate — the caller must say so', () => {
    const v = evaluateCreditStop(
      { outstandingPaisa: null, creditLimitPaisa: null, daysPastDueOnOldestUnpaidInvoice: null },
      OPTS,
    )
    expect(v.onStop).toBe(false)
    expect(v.indeterminate).toBe(true)
    expect(v.unavailable).toHaveLength(2)
  })

  it('one firing limb is a verdict even when the other could not run', () => {
    const v = evaluateCreditStop(
      { outstandingPaisa: rupees(200_000), creditLimitPaisa: rupees(100_000), daysPastDueOnOldestUnpaidInvoice: null },
      OPTS,
    )
    expect(v.onStop).toBe(true)
    expect(v.indeterminate).toBe(false)
    expect(v.unavailable).toHaveLength(1)
  })
})

describe('evaluateCreditStop — Law 6', () => {
  const OVER: CreditStopFacts = {
    outstandingPaisa: rupees(200_000),
    creditLimitPaisa: rupees(100_000),
    daysPastDueOnOldestUnpaidInvoice: 0,
  }

  it('the reason names the condition and carries no rupee figure', () => {
    const v = evaluateCreditStop(OVER, { overdueStopDays: 30, canViewMoney: false })
    expect(v.onStop).toBe(true)
    expect(v.reasons.join(' ')).not.toMatch(/Rs|\d[\d,]{2,}/)
    expect(v.details).toEqual([])
  })

  it('the figures appear only for a money-capable session', () => {
    const v = evaluateCreditStop(OVER, { overdueStopDays: 30, canViewMoney: true })
    expect(v.details.join(' ')).toMatch(/Rs/)
  })

  it('the days in the overdue reason are not a money figure and survive either way', () => {
    const late = { ...CLEAR, daysPastDueOnOldestUnpaidInvoice: 60 }
    for (const canViewMoney of [true, false]) {
      expect(evaluateCreditStop(late, { overdueStopDays: 30, canViewMoney }).reasons.join(' ')).toContain('60 days')
    }
  })
})

describe('creditStopFactsOf — what a directory row can honestly supply', () => {
  const VIP = CLIENTS_DATA[0]!

  it('withholds both money facts from a money-blind session rather than reading its zeros', () => {
    const facts = creditStopFactsOf(VIP, { canViewMoney: false })
    expect(facts.outstandingPaisa).toBeNull()
    expect(facts.creditLimitPaisa).toBeNull()
  })

  it('reports the overdue limb as unknown when no invoice data was passed', () => {
    expect(creditStopFactsOf(VIP, { canViewMoney: true }).daysPastDueOnOldestUnpaidInvoice).toBeNull()
  })

  it('a record with no approved limit gets the SPECIFIC reason, not the vague one', () => {
    /* `lib/mock/corpus.ts:149` sets `approved_credit_limit: null` on every mock
       client, so this is the message the whole mock directory shows. "The limit
       is not readable" and "no limit is recorded" reach the same verdict, but
       only the second one tells the operator what to go and set. */
    const noLimit: ClientRecord = { ...VIP, creditLimitPaisa: rupees(0) }
    const v = evaluateCreditStop(creditStopFactsOf(noLimit, { canViewMoney: true }), OPTS)
    expect(v.unavailable.join(' ')).toMatch(/no approved credit limit is recorded/i)
    expect(v.unavailable.join(' ')).not.toMatch(/not both readable/i)
  })

  it('a client over their limit on the seed is caught by the credit limb', () => {
    /* Built here rather than hunting for one in the seed, so the test does not
       break the next time somebody edits a fixture's balance. */
    const over: ClientRecord = { ...VIP, outstandingPaisa: rupees(9_999_999), creditLimitPaisa: rupees(100_000) }
    const v = evaluateCreditStop(creditStopFactsOf(over, { canViewMoney: true }), OPTS)
    expect(v.onStop).toBe(true)
  })

  it('a blocked client is not automatically on stop — they are different facts', () => {
    // Rulings §11.2.4: Blocked and On Stop are intersecting overlays, and
    // `0005_clients.sql` keeps a block off the client's state entirely.
    const blocked: ClientRecord = {
      ...VIP,
      isBlocked: true,
      outstandingPaisa: rupees(1_000),
      creditLimitPaisa: rupees(500_000),
    }
    const v = evaluateCreditStop(
      creditStopFactsOf(blocked, { canViewMoney: true, daysPastDueOnOldestUnpaidInvoice: 0 }),
      OPTS,
    )
    expect(v.onStop).toBe(false)
  })
})

describe('daysPastDue', () => {
  const NOW = new Date('2026-08-16T09:00:00Z')

  it('counts whole days from the due date', () => {
    expect(daysPastDue('2026-07-17', NOW)).toBe(30)
    expect(daysPastDue('2026-07-16', NOW)).toBe(31)
  })

  it('is zero on the due date and zero in the future — never negative', () => {
    expect(daysPastDue('2026-08-16', NOW)).toBe(0)
    expect(daysPastDue('2026-12-25', NOW)).toBe(0)
  })

  it('returns null for a date it cannot read — unknown, not on time', () => {
    expect(daysPastDue('not a date', NOW)).toBeNull()
  })
})
