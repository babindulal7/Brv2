import { describe, it, expect } from 'vitest'
import {
  type BookingStatus,
  type Flag,
  type JobName,
  type JobState,
  type CloseGateInput,
  BOOKING_STATUS,
  STATUS_ORDER,
  statusToken,
  clientLabel,
  canAdvance,
  JOBS,
  JOB_ORDER,
  assertOneJobInProgress,
  jobThatSets,
  assertItemCounts,
  FLAGS,
  closeGates,
  planTransition,
  fromRetiredStage,
  outstanding,
} from '../workflow'

const SIX: readonly BookingStatus[] = ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed']

/**
 * A booking that is genuinely finished: billed, settled, deposit returned, no
 * case, no unapproved damage.
 *
 * `rentalInvoiced: true` is the load-bearing member (MONEY-13). Before 7 Sep
 * the fixture had no such field, so "all four gates pass" was reachable by a
 * rental nobody had ever billed — the sum was over zero rows.
 */
const PASSING_GATES: CloseGateInput = {
  rentalInvoiced: true,
  rentalOutstandingPaisa: 0,
  depositHeldPaisa: 0,
  openCases: 0,
  damageChargesPendingApproval: 0,
}

/* ── §1.2 · the canonical six ───────────────────────────────────────────── */

describe('BOOKING_STATUS — Foundation §1.2, six statuses and no more', () => {
  it('holds exactly six, in the locked sequence', () => {
    expect(Object.keys(BOOKING_STATUS)).toEqual(SIX)
    expect(Object.keys(BOOKING_STATUS)).toHaveLength(6)
  })

  it('numbers them 0..5 with no gaps and no ties', () => {
    expect(SIX.map((s) => BOOKING_STATUS[s].order)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('STATUS_ORDER is the same six, sorted by order', () => {
    expect(STATUS_ORDER).toEqual(SIX)
  })

  it('carries the v4.1 seven-hue colour token for each', () => {
    /*
     * DESIGN_DIRECTION_SPEC_v4.1 §4. This test asserted the five-tone law
     * until 25 Aug 2026; v4.1 superseded it and two expectations moved:
     *
     *   On Rent  green -> ORANGE. Green used to mean "out of the warehouse",
     *            split from Returned by fill weight within one hue. v4.1 gives
     *            "out with the client" its own hue, so the lifecycle reads
     *            gray -> blue -> yellow -> orange -> green -> dim.
     *   Closed   neutral -> dim. Gray now means "not started yet" (Quote);
     *            "finished" is the dim hue, so the two no longer share a token.
     *
     * The KEY names are deliberately unchanged (`out`, `in`, `progress`) per
     * §7.5 — v4.1 recolours the statuses, it does not rename them.
     */
    expect(statusToken('Quote')).toBe('neutral')   // gray  — not started
    expect(statusToken('Booked')).toBe('primary')  // blue  — committed
    expect(statusToken('Packed')).toBe('progress') // yellow — in-house work
    expect(statusToken('On Rent')).toBe('out')     // ORANGE — with the client
    expect(statusToken('Returned')).toBe('in')     // green — safely home
    expect(statusToken('Closed')).toBe('dim')      // dim   — finished
  })
})

/* ── §1.8 · what a client is shown instead ──────────────────────────────── */

describe('clientLabel — §1.8', () => {
  it('translates the internal six into client-facing words', () => {
    expect(clientLabel('Quote')).toBe('Quote')
    expect(clientLabel('Booked')).toBe('Confirmed')
    expect(clientLabel('Packed')).toBe('Ready for pickup')
    expect(clientLabel('On Rent')).toBe('With you')
    expect(clientLabel('Returned')).toBe('Returned')
    expect(clientLabel('Closed')).toBe('Complete')
  })

  it('never leaks Packing, Inspection or Reset to a client', () => {
    const shown = SIX.map((s) => clientLabel(s)).join(' | ')
    expect(shown).not.toMatch(/pack(ing|ed)?\b/i)
    expect(shown).not.toMatch(/inspection/i)
    expect(shown).not.toMatch(/reset/i)
  })

  it('overdue overrides the label whatever the status', () => {
    for (const s of SIX) expect(clientLabel(s, true)).toBe('Overdue')
  })
})

/* ── §1.2 · forward-only, no skipping ───────────────────────────────────── */

describe('canAdvance — §1.2 forward-only, stages may not be skipped', () => {
  it('allows each of the five legal steps', () => {
    const legal: Array<[BookingStatus, BookingStatus]> = [
      ['Quote', 'Booked'],
      ['Booked', 'Packed'],
      ['Packed', 'On Rent'],
      ['On Rent', 'Returned'],
      ['Returned', 'Closed'],
    ]
    for (const [from, to] of legal) expect(canAdvance(from, to)).toBe(true)
  })

  it('allows nothing else — every other ordered pair of the 36 is refused', () => {
    let allowed = 0
    for (const from of SIX) {
      for (const to of SIX) {
        if (canAdvance(from, to)) allowed += 1
      }
    }
    expect(allowed).toBe(5)
  })

  it('refuses skips, reversals and self-transitions by name', () => {
    expect(canAdvance('Quote', 'Packed')).toBe(false)
    expect(canAdvance('Booked', 'On Rent')).toBe(false)
    expect(canAdvance('Quote', 'Closed')).toBe(false)
    expect(canAdvance('Returned', 'On Rent')).toBe(false) // a reversal is not a transition
    expect(canAdvance('Closed', 'Returned')).toBe(false)
    expect(canAdvance('Booked', 'Booked')).toBe(false)
  })

  it('nothing follows Closed', () => {
    for (const to of SIX) expect(canAdvance('Closed', to)).toBe(false)
  })
})

/* ── §1.5 · the four jobs ───────────────────────────────────────────────── */

describe('JOBS — §1.5, four operations, not five', () => {
  it('is exactly Pack, Handover, Return, Reset', () => {
    expect(Object.keys(JOBS)).toEqual(['Pack', 'Handover', 'Return', 'Reset'])
    expect(JOB_ORDER).toEqual(['Pack', 'Handover', 'Return', 'Reset'])
  })

  it('has no Cleaning job — Reset absorbed it', () => {
    expect(Object.keys(JOBS)).not.toContain('Cleaning')
    expect(JOB_ORDER).not.toContain('Cleaning' as unknown as JobName)
  })

  it('runs each job at the status before the one it sets', () => {
    expect(JOBS.Pack).toMatchObject({ runsAt: 'Booked', sets: 'Packed' })
    expect(JOBS.Handover).toMatchObject({ runsAt: 'Packed', sets: 'On Rent' })
    expect(JOBS.Return).toMatchObject({ runsAt: 'On Rent', sets: 'Returned' })
    // Reset sets nothing and blocks the item, never the booking.
    expect(JOBS.Reset).toMatchObject({ runsAt: 'Returned', sets: null, blocksBooking: false })
  })

  it('jobThatSets is derived from JOBS, and answers null where no job applies', () => {
    expect(jobThatSets('Packed')).toBe('Pack')
    expect(jobThatSets('On Rent')).toBe('Handover')
    expect(jobThatSets('Returned')).toBe('Return')
    expect(jobThatSets('Quote')).toBeNull()
    expect(jobThatSets('Booked')).toBeNull()
    expect(jobThatSets('Closed')).toBeNull()
  })

  it('refuses two jobs In Progress at once', () => {
    const two: Partial<Record<JobName, JobState>> = { Pack: 'In Progress', Handover: 'In Progress' }
    expect(() => assertOneJobInProgress(two)).toThrow(/§1\.5/)
    expect(() => assertOneJobInProgress({ Pack: 'In Progress' })).not.toThrow()
    expect(() => assertOneJobInProgress({ Pack: 'Complete', Handover: 'Not Started' })).not.toThrow()
    expect(() => assertOneJobInProgress({})).not.toThrow()
  })
})

/* ── §1.6 · item state is a quantity split ──────────────────────────────── */

describe('assertItemCounts — §1.6', () => {
  it('accepts a split that sums to the booking total', () => {
    expect(() => assertItemCounts({ Ready: 2, 'Picked Up': 3, Returned: 4, Missing: 1 }, 10)).not.toThrow()
  })

  it('fails loudly when the four buckets do not sum to the total', () => {
    expect(() => assertItemCounts({ Ready: 2, 'Picked Up': 3, Returned: 4, Missing: 1 }, 11)).toThrow(/§1\.6/)
  })

  it('treats Damaged as a condition on Returned, never a fifth bucket', () => {
    // Damaged is NOT added to the sum — 4 returned of which 2 damaged still totals 10.
    expect(() => assertItemCounts({ Ready: 2, 'Picked Up': 3, Returned: 4, Missing: 1, Damaged: 2 }, 10)).not.toThrow()
    expect(() => assertItemCounts({ Ready: 2, 'Picked Up': 3, Returned: 4, Missing: 1, Damaged: 5 }, 10)).toThrow(/Damaged/)
  })
})

/* ── §1.9 · the flag registry ───────────────────────────────────────────── */

describe('FLAGS — §1.9', () => {
  it('the three Critical return flags block Close', () => {
    for (const f of ['Overdue', 'Missing', 'Damaged'] as const) {
      expect(FLAGS[f].type).toBe('Critical')
      expect(FLAGS[f].blocks).toContain('Closed')
    }
  })

  it('Deposit Pending and Payment Due block Handover — expressed as the status Handover sets', () => {
    for (const f of ['Deposit Pending', 'Payment Due'] as const) {
      expect(FLAGS[f].blocks).toEqual(['On Rent'])
      expect(FLAGS[f].blocks).toEqual([JOBS.Handover.sets])
    }
  })

  it('Not Reset blocks nothing — an un-reset item blocks the item, never the booking', () => {
    expect(FLAGS['Not Reset'].blocks).toEqual([])
  })

  it('Cancelled is a flag, not a status', () => {
    expect(Object.keys(FLAGS)).toContain('Cancelled')
    expect(Object.keys(BOOKING_STATUS)).not.toContain('Cancelled')
  })

  it('gold outline belongs to Sub-Rented alone', () => {
    const ext = (Object.keys(FLAGS) as Flag[]).filter((f) => FLAGS[f].token === 'ext')
    expect(ext).toEqual(['Sub-Rented'])
  })
})

/* ── §1.7 · the four close gates ────────────────────────────────────────── */

describe('closeGates — §1.7', () => {
  it('is four gates, all passing on a clean booking', () => {
    const gates = closeGates(PASSING_GATES)
    expect(gates).toHaveLength(4)
    expect(gates.every((g) => g.passing)).toBe(true)
    expect(gates.every((g) => g.blocking === null)).toBe(true)
  })

  it('Reset and Cleaning are deliberately NOT close gates', () => {
    const labels = closeGates(PASSING_GATES).map((g) => g.label).join(' | ')
    expect(labels).not.toMatch(/reset/i)
    expect(labels).not.toMatch(/clean/i)
  })

  it('a failing gate carries the blocking value, not just the word blocked', () => {
    const gates = closeGates({ ...PASSING_GATES, rentalOutstandingPaisa: 50_000, openCases: 2 })
    const money = gates.find((g) => g.label === 'Rental Outstanding settled')
    expect(money?.passing).toBe(false)
    /* Was the paisa integer `'50000'`. Law 12 wants the figure an operator can
       act on, in the rupees every other screen shows. */
    expect(money?.blocking).toBe('Rs 500 still outstanding')
    const cases = gates.find((g) => g.label === 'No open Case')
    expect(cases?.blocking).toBe('2 open')
  })

  /* ── MONEY-13 · "outstanding = 0" on a rental nobody billed ─────────────── */

  it('refuses a rental that was never invoiced, though its outstanding reads zero', () => {
    const gates = closeGates({ ...PASSING_GATES, rentalInvoiced: false })
    const money = gates.find((g) => g.label === 'Rental Outstanding settled')
    expect(money?.passing).toBe(false)
    // The refusal has to say WHY zero is not settlement, or it reads as a bug.
    expect(money?.blocking).toMatch(/nothing has been invoiced/i)
    expect(money?.blocking).toMatch(/empty sum/i)
  })

  it('separates "never billed" from "paid in full" — the same zero, two verdicts', () => {
    const unbilled = closeGates({ ...PASSING_GATES, rentalInvoiced: false })[0]
    const settled = closeGates(PASSING_GATES)[0]
    expect(unbilled?.passing).toBe(false)
    expect(settled?.passing).toBe(true)
  })

  it('names an overpayment as an overpayment rather than as an outstanding balance', () => {
    const gates = closeGates({ ...PASSING_GATES, rentalOutstandingPaisa: -25_000 })
    expect(gates[0]?.passing).toBe(false)
    expect(gates[0]?.blocking).toBe('Rs 250 overpaid — the invoice does not reconcile')
  })

  /* ── RL-05 · held, not uncollected ──────────────────────────────────────── */

  it('refuses a close while the deposit is still held, and names the amount', () => {
    const gates = closeGates({ ...PASSING_GATES, depositHeldPaisa: 2_500_000 })
    const deposit = gates.find((g) => g.label === 'Deposit resolved')
    expect(deposit?.passing).toBe(false)
    expect(deposit?.blocking).toContain('Rs 25,000')
    expect(deposit?.blocking).toMatch(/still held/i)
  })

  it('passes the deposit gate once everything received has been refunded or applied', () => {
    expect(closeGates({ ...PASSING_GATES, depositHeldPaisa: 0 }).every((g) => g.passing)).toBe(true)
  })

  it('refuses, rather than passes, when more was refunded than was ever received', () => {
    const deposit = closeGates({ ...PASSING_GATES, depositHeldPaisa: -100 }).find(
      (g) => g.label === 'Deposit resolved',
    )
    expect(deposit?.passing).toBe(false)
    expect(deposit?.blocking).toMatch(/more deposit has been refunded or applied/i)
  })

  /* ── RL-06 · the count that used to be a constant ───────────────────────── */

  it('refuses on an unapproved damage finding and counts it in words, singular and plural', () => {
    const one = closeGates({ ...PASSING_GATES, damageChargesPendingApproval: 1 })[3]
    expect(one?.passing).toBe(false)
    expect(one?.blocking).toBe('1 damage finding awaiting approval, and approving one is not built yet')

    const three = closeGates({ ...PASSING_GATES, damageChargesPendingApproval: 3 })[3]
    expect(three?.blocking).toBe('3 damage findings awaiting approval, and approving one is not built yet')
  })
})

/* ── the transition decision ────────────────────────────────────────────── */

describe('planTransition — §1.2 + §1.7 + §1.9 in one call', () => {
  it('allows a clean forward step and names the job that sets it', () => {
    const p = planTransition({ from: 'Booked', to: 'Packed' })
    expect(p.allowed).toBe(true)
    expect(p.blockers).toEqual([])
    expect(p.job).toBe('Pack')
  })

  it('refuses a skip and says what the next stage actually is', () => {
    const p = planTransition({ from: 'Quote', to: 'On Rent' })
    expect(p.allowed).toBe(false)
    expect(p.blockers[0]?.rule).toBe('forward-only')
    expect(p.blockers[0]?.blocking).toBe('the next stage is Booked')
  })

  it('refuses anything after Closed and says so', () => {
    const p = planTransition({ from: 'Closed', to: 'Quote' })
    expect(p.allowed).toBe(false)
    expect(p.blockers[0]?.blocking).toBe('Closed is final — nothing follows it')
  })

  it('a Deposit Pending flag blocks Handover but not Confirm', () => {
    expect(planTransition({ from: 'Packed', to: 'On Rent', flags: ['Deposit Pending'] }).allowed).toBe(false)
    expect(planTransition({ from: 'Quote', to: 'Booked', flags: ['Deposit Pending'] }).allowed).toBe(true)
  })

  it('refuses Close when no CloseGateInput was supplied — "not evaluated" is not "passing"', () => {
    const p = planTransition({ from: 'Returned', to: 'Closed' })
    expect(p.allowed).toBe(false)
    expect(p.blockers.some((b) => b.rule === 'close-gate' && b.blocking?.startsWith('not evaluated'))).toBe(true)
  })

  it('allows Close when all four gates pass', () => {
    const p = planTransition({ from: 'Returned', to: 'Closed', gates: PASSING_GATES })
    expect(p.allowed).toBe(true)
    expect(p.job).toBeNull()
  })

  it('refuses Close on unsettled money — Law 5 has already kept the deposit out of that figure', () => {
    const p = planTransition({
      from: 'Returned',
      to: 'Closed',
      gates: { ...PASSING_GATES, rentalOutstandingPaisa: 12_450_600 },
    })
    expect(p.allowed).toBe(false)
    expect(p.blockers.map((b) => b.label)).toContain('Rental Outstanding settled')
  })

  it('reports EVERY reason, not the first — law 12 shows the whole list inline', () => {
    const p = planTransition({
      from: 'Booked',
      to: 'Closed',
      flags: ['Overdue', 'Missing'],
      gates: {
        rentalInvoiced: true,
        rentalOutstandingPaisa: 500,
        depositHeldPaisa: 500_000,
        openCases: 1,
        damageChargesPendingApproval: 1,
      },
    })
    expect(p.allowed).toBe(false)
    // 1 forward-only + 2 flags + 4 close gates
    expect(p.blockers).toHaveLength(7)
    expect(new Set(p.blockers.map((b) => b.rule))).toEqual(new Set(['forward-only', 'flag', 'close-gate']))
  })

  it('a flag with no blocks never refuses anything', () => {
    for (const f of ['VIP', 'Sub-Rented', 'Not Reset', 'Draft', 'Sessions', 'Returned Early'] as const) {
      expect(planTransition({ from: 'On Rent', to: 'Returned', flags: [f] }).allowed).toBe(true)
    }
  })
})

/* ── §1.4 · the retired 12-stage vocabulary is unreachable ──────────────── */

describe('the retired 12 stages cannot reach the product', () => {
  const RETIRED_ONLY = [
    'Draft',
    'Confirmed',
    'Preparing',
    'Ready',
    'Dispatched',
    'Return Due',
    'Inspection',
    'Cleaning',
    'Completed',
    'Cancelled',
  ] as const

  it('none of them is a booking status', () => {
    for (const stage of RETIRED_ONLY) {
      expect(Object.keys(BOOKING_STATUS)).not.toContain(stage)
      expect(STATUS_ORDER).not.toContain(stage as unknown as BookingStatus)
    }
  })

  it('none of them can be advanced from or to — the engine throws rather than guessing', () => {
    for (const stage of RETIRED_ONLY) {
      expect(() => canAdvance(stage as unknown as BookingStatus, 'Closed')).toThrow()
      expect(() => planTransition({ from: stage as unknown as BookingStatus, to: 'Closed' })).toThrow()
    }
  })

  it('none of them has a colour token of its own', () => {
    for (const stage of RETIRED_ONLY) {
      expect(() => statusToken(stage as unknown as BookingStatus)).toThrow()
    }
  })

  it('the §1.4 migration map still translates all thirteen into the six', () => {
    const ALL_RETIRED = [
      'Quote',
      'Draft',
      'Confirmed',
      'Preparing',
      'Ready',
      'Dispatched',
      'On Rent',
      'Return Due',
      'Inspection',
      'Cleaning',
      'Completed',
      'Closed',
      'Cancelled',
    ]
    for (const stage of ALL_RETIRED) {
      const mapped = fromRetiredStage(stage)
      expect(SIX).toContain(mapped.status)
    }
  })

  it('maps the tricky ones exactly as §1.4 states', () => {
    expect(fromRetiredStage('Confirmed')).toEqual({ status: 'Booked', flags: [] })
    expect(fromRetiredStage('Dispatched')).toEqual({ status: 'Packed', flags: ['Partial Pickup'] })
    expect(fromRetiredStage('Preparing')).toEqual({
      status: 'Booked',
      flags: [],
      job: { name: 'Pack', state: 'In Progress' },
    })
    // Cleaning maps onto Reset, the job that absorbed it.
    expect(fromRetiredStage('Cleaning')).toEqual({
      status: 'Returned',
      flags: [],
      job: { name: 'Reset', state: 'In Progress' },
    })
    // §1.3 — Cancelled preserves where the booking died, as a flag.
    expect(fromRetiredStage('Cancelled')).toEqual({ status: 'Quote', flags: ['Cancelled'] })
  })

  it('refuses an unknown stage rather than defaulting it to Quote', () => {
    expect(() => fromRetiredStage('Awaiting Payment')).toThrow(/six statuses/)
    expect(() => fromRetiredStage('')).toThrow()
  })
})

/* ── §2.1 · outstanding ─────────────────────────────────────────────────── */

describe('outstanding — §2.1, deposits never enter it', () => {
  it('is Rental Total minus rental payments', () => {
    expect(outstanding(13_950_600, 1_500_000)).toBe(12_450_600)
    expect(outstanding(1000, 1000)).toBe(0)
  })

  it('takes two arguments — there is no deposit parameter to pass', () => {
    expect(outstanding.length).toBe(2)
  })

  it('can go negative on an overpayment rather than clamping to zero', () => {
    expect(outstanding(1000, 1500)).toBe(-500)
  })
})
