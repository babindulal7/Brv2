import { describe, it, expect } from 'vitest'
/* R3-1: the cross-engine agreement check below compares money.ts's gate with
   rbac.ts's rank rule. They disagreed on the sign until 16 Aug 2026. */
import { canApproveDiscount } from '../rbac'
import {
  type Paisa,
  type PriceInput,
  rupees,
  toRupees,
  roundHalfUp,
  grouped,
  formatMoney,
  formatPaisa,
  parseMoney,
  price,
  calculatePrice,
  discountGate,
  DISCOUNT_CAP,
  crewBilling,
  lateFee,
  calculateBookingProfit,
  REFERENCE_CASE,
  REFERENCE_CASE_ERROR,
} from '../money'

/* ── §2.4 · roundHalfUp ─────────────────────────────────────────────────── */

describe('roundHalfUp — Foundation §2.4', () => {
  it('rounds .5 up, not to even (banker’s rounding would fail these)', () => {
    expect(roundHalfUp(0.5)).toBe(1)
    expect(roundHalfUp(1.5)).toBe(2)
    expect(roundHalfUp(2.5)).toBe(3)
    expect(roundHalfUp(3.5)).toBe(4)
  })

  it('rounds negatives away from zero — the whole reason this is not Math.round', () => {
    // Math.round(-0.5) is -0 and Math.round(-2.5) is -2: both drift *up*
    // towards zero, so a reversal or credit note would be short by a rupee.
    expect(roundHalfUp(-0.5)).toBe(-1)
    expect(roundHalfUp(-1.5)).toBe(-2)
    expect(roundHalfUp(-2.5)).toBe(-3)
    expect(Math.round(-2.5)).toBe(-2)
    expect(roundHalfUp(-2.5)).not.toBe(Math.round(-2.5))
  })

  it('leaves values below the halfway mark alone', () => {
    expect(roundHalfUp(0.49)).toBe(0)
    expect(roundHalfUp(1.4)).toBe(1)
    expect(roundHalfUp(-1.4)).toBe(-1)
    expect(roundHalfUp(-1.6)).toBe(-2)
    expect(roundHalfUp(7)).toBe(7)
  })
})

/* ── §2.3 · paisa conversion and display ────────────────────────────────── */

describe('rupees / toRupees', () => {
  it('converts to integer paisa', () => {
    expect(rupees(1)).toBe(100)
    expect(rupees(132750)).toBe(13_275_000)
    expect(rupees(0)).toBe(0)
    expect(rupees(-500)).toBe(-50_000)
  })

  it('round-trips', () => {
    expect(toRupees(rupees(139506))).toBe(139506)
    expect(toRupees(rupees(-1250))).toBe(-1250)
  })

  it('never produces a fractional paisa', () => {
    expect(Number.isInteger(rupees(12.345))).toBe(true)
    expect(Number.isInteger(rupees(0.1 + 0.2))).toBe(true)
  })
})

describe('grouped — South Asian (lakh) digit grouping', () => {
  it('keeps the last three digits together and groups above them in twos', () => {
    expect(grouped(100)).toBe('100')
    expect(grouped(1000)).toBe('1,000')
    expect(grouped(185000)).toBe('1,85,000')
    expect(grouped(139506)).toBe('1,39,506')
    expect(grouped(12345678)).toBe('1,23,45,678')
  })

  it('is not the western three-digit grouping', () => {
    expect(grouped(185000)).not.toBe('185,000')
    expect(grouped(12345678)).not.toBe('12,345,678')
  })

  it('handles zero, small numbers and negatives', () => {
    expect(grouped(0)).toBe('0')
    expect(grouped(7)).toBe('7')
    expect(grouped(-185000)).toBe('-1,85,000')
  })
})

describe('formatMoney', () => {
  it('renders whole rupees without decimals', () => {
    expect(formatMoney(rupees(139506))).toBe('Rs 1,39,506')
    expect(formatMoney(rupees(0))).toBe('Rs 0')
  })

  it('renders a fractional paisa amount with two decimals rather than hiding it', () => {
    expect(formatMoney(12345 as Paisa)).toBe('Rs 123.45')
    expect(formatMoney(5 as Paisa)).toBe('Rs 0.05')
    expect(formatMoney(50 as Paisa)).toBe('Rs 0.50')
  })

  it('puts the sign before the currency word', () => {
    expect(formatMoney(-12345 as Paisa)).toBe('-Rs 123.45')
    expect(formatMoney(rupees(-1250))).toBe('-Rs 1,250')
  })

  it('formatPaisa is the same function', () => {
    expect(formatPaisa).toBe(formatMoney)
  })
})

describe('parseMoney', () => {
  it('accepts what the product itself prints', () => {
    expect(parseMoney('Rs 1,39,506')).toBe(13_950_600)
    expect(parseMoney('1,39,506')).toBe(13_950_600)
    expect(parseMoney('139506')).toBe(13_950_600)
    expect(parseMoney('139506.50')).toBe(13_950_650)
    expect(parseMoney('-500')).toBe(-50_000)
  })

  it('returns null rather than a wrong number for junk', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('Rs')).toBeNull()
    expect(parseMoney('-')).toBeNull()
    expect(parseMoney('.')).toBeNull()
  })

  it('eliminates IEEE 754 float drift on boundary numbers (e.g. 19.99)', () => {
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('0.01')).toBe(1)
    expect(parseMoney('-19.99')).toBe(-1999)
    expect(parseMoney('1234.567')).toBe(123457)
    expect(parseMoney('1234.562')).toBe(123456)
  })
})

/* ── §2.1 · the calculation ORDER ───────────────────────────────────────── */

describe('price() — Foundation §2.1 calculation order', () => {
  it('runs subtotal → discount → taxable → VAT → total → outstanding', () => {
    const b = price({
      equipment: rupees(100000),
      discountPercent: 10,
      vatPercent: 13,
      payments: rupees(0),
    })
    expect(b.subtotal).toBe(rupees(100000))
    expect(b.discount).toBe(rupees(10000))
    expect(b.taxable).toBe(rupees(90000))
    // VAT is charged on the DISCOUNTED base. If the order ever flips so VAT is
    // taken on the subtotal, this reads Rs 13,000 and the total Rs 1,03,000.
    expect(b.vat).toBe(rupees(11700))
    expect(b.vat).not.toBe(rupees(13000))
    expect(b.rentalTotal).toBe(rupees(101700))
    expect(b.outstanding).toBe(rupees(101700))
  })

  it('sums every priced component into the subtotal, treating absent ones as zero', () => {
    const b = price({
      equipment: rupees(10000),
      subRental: rupees(2000),
      services: rupees(500),
      crew: rupees(1500),
      transport: rupees(1000),
      discountPercent: 0,
      vatPercent: 0,
      payments: rupees(0),
    })
    expect(b.subtotal).toBe(rupees(15000))

    const bare = price({ equipment: rupees(10000), discountPercent: 0, vatPercent: 0, payments: rupees(0) })
    expect(bare.subtotal).toBe(rupees(10000))
  })

  it('§2.1 — transport is Rs 0 on client pickup, and that must not shift the VAT base', () => {
    const pickup = price({ equipment: rupees(50000), transport: rupees(0), discountPercent: 0, vatPercent: 13, payments: rupees(0) })
    const delivered = price({ equipment: rupees(50000), transport: rupees(2000), discountPercent: 0, vatPercent: 13, payments: rupees(0) })
    expect(pickup.taxable).toBe(rupees(50000))
    expect(delivered.taxable).toBe(rupees(52000))
    expect(delivered.vat).toBe(rupees(6760))
  })

  it('rounds half-up to a whole rupee at EACH step, not once at the end', () => {
    // 7% of 1,32,750 is exactly 9,292.50 — the half-up step is visible here.
    const b = price({ equipment: rupees(132750), discountPercent: 7, vatPercent: 13, payments: rupees(0) })
    expect(b.discount).toBe(rupees(9293))
    expect(b.discount).not.toBe(929250) // the unrounded 9,292.50
    // Every rounded step lands on a whole rupee — no stray paisa anywhere.
    expect(b.discount % 100).toBe(0)
    expect(b.vat % 100).toBe(0)
    expect(b.rentalTotal % 100).toBe(0)
  })

  it('a zero discount leaves the taxable base equal to the subtotal', () => {
    const b = price({ equipment: rupees(77777), discountPercent: 0, vatPercent: 13, payments: rupees(0) })
    expect(b.discount).toBe(0)
    expect(b.taxable).toBe(b.subtotal)
  })

  it('a zero VAT rate produces a total equal to the taxable base', () => {
    const b = price({ equipment: rupees(1000), discountPercent: 5, vatPercent: 0, payments: rupees(0) })
    expect(b.vat).toBe(0)
    expect(b.rentalTotal).toBe(b.taxable)
  })

  it('never reads the VAT rate from a hardcoded 13 — it comes from the input', () => {
    const at13 = price({ equipment: rupees(1000), discountPercent: 0, vatPercent: 13, payments: rupees(0) })
    const at18 = price({ equipment: rupees(1000), discountPercent: 0, vatPercent: 18, payments: rupees(0) })
    expect(at13.vat).toBe(rupees(130))
    expect(at18.vat).toBe(rupees(180))
  })

  it('calculatePrice is the same function', () => {
    expect(calculatePrice).toBe(price)
  })
})

/* ── Law 5 · deposits are liabilities ───────────────────────────────────── */

describe('price() — Law 5: deposits never reduce Outstanding', () => {
  const base: PriceInput = {
    equipment: rupees(100000),
    discountPercent: 0,
    vatPercent: 13,
    payments: rupees(20000),
  }

  it('Outstanding is exactly Rental Total minus rental payments', () => {
    const b = price(base)
    expect(b.rentalTotal).toBe(rupees(113000))
    expect(b.outstanding).toBe(rupees(93000))
    expect(b.outstanding).toBe(b.rentalTotal - b.payments)
  })

  it('the breakdown exposes no deposit field at all', () => {
    const b = price(base)
    expect(Object.keys(b).filter((k) => /deposit|security/i.test(k))).toEqual([])
    expect(Object.keys(b).sort()).toEqual(
      ['discount', 'outstanding', 'payments', 'rentalTotal', 'subtotal', 'taxable', 'vat'].sort(),
    )
  })

  it('a deposit smuggled into the input changes nothing — it is not a priced component', () => {
    // If someone ever wires a `securityDeposit` field into `subtotal` or
    // subtracts it from `outstanding`, this fails. That is Law 5's whole point:
    // the deposit must not be expressible in the rental calculation.
    const contaminated = {
      ...base,
      securityDeposit: rupees(50000),
      deposit: rupees(50000),
      depositPaisa: rupees(50000),
    } as unknown as PriceInput
    expect(price(contaminated)).toEqual(price(base))
  })

  it('a deposit is not a payment: outstanding tracks rental payments only', () => {
    const withDepositTakenAsPayment = price({ ...base, payments: rupees(70000) })
    // Sanity: if a Rs 50,000 deposit were ever added to `payments`, outstanding
    // would drop by 50,000. It must not, so `payments` may only ever be fed
    // rental payments by the caller.
    expect(withDepositTakenAsPayment.outstanding).toBe(rupees(43000))
    expect(price(base).outstanding).toBe(rupees(93000))
  })
})

/* ── §2.8 · the reference case ──────────────────────────────────────────── */

describe('the §2.8 reference case', () => {
  it('the module-level self-assertion reports no error', () => {
    expect(REFERENCE_CASE_ERROR).toBeNull()
  })

  it('produces 9,293 / 1,23,457 / 16,049 / 1,39,506 / 1,24,506', () => {
    expect(toRupees(REFERENCE_CASE.discount)).toBe(9293)
    expect(toRupees(REFERENCE_CASE.taxable)).toBe(123457)
    expect(toRupees(REFERENCE_CASE.vat)).toBe(16049)
    expect(toRupees(REFERENCE_CASE.rentalTotal)).toBe(139506)
    expect(toRupees(REFERENCE_CASE.outstanding)).toBe(124506)
  })

  it('is recomputed identically from the documented inputs', () => {
    expect(price({ equipment: rupees(132750), discountPercent: 7, vatPercent: 13, payments: rupees(15000) })).toEqual(
      REFERENCE_CASE,
    )
  })

  it('shows none of the superseded seed figures §2.8 calls a defect', () => {
    const superseded = [139208, 124208, 91550, 108548, 58548]
    const shown = [
      toRupees(REFERENCE_CASE.rentalTotal),
      toRupees(REFERENCE_CASE.outstanding),
      toRupees(REFERENCE_CASE.taxable),
      toRupees(REFERENCE_CASE.subtotal),
    ]
    for (const bad of superseded) expect(shown).not.toContain(bad)
  })

  it('is one rupee below what full-precision (round-once-at-the-end) arithmetic gives', () => {
    // Documented in money.ts: carrying precision yields 1,39,507. If the
    // per-step rounding is ever removed, the reference case moves by Rs 1.
    const sub = 132750
    const fullPrecisionTotal = Math.round((sub - sub * 0.07) * 1.13)
    expect(fullPrecisionTotal).toBe(139507)
    expect(toRupees(REFERENCE_CASE.rentalTotal)).toBe(139506)
  })
})

/* ── discount gate — GONE. Law 10 as amended 31 Aug 2026 ────────────────── */

describe('discountGate — ungated (D3, Babin 31 Aug: "don\'t put any gate on discount")', () => {
  it('allows any percentage 0–100 with no reason, no approver, no cap, no role', () => {
    for (const pct of [0, 10, 11, 25, 25.01, 40, 100]) {
      expect(discountGate(pct, '', null).ok).toBe(true)
    }
    // The 100 here is the ARITHMETIC ceiling a percentage has, not a chosen cap.
    expect(DISCOUNT_CAP).toBe(100)
  })

  /*
   * R3-1, fixed 16 Aug 2026 and DELIBERATELY KEPT through the gate removal.
   * `-5` once fell through and drew an approving green tick on Settings ▸
   * Tools. A negative discount is a price increase; removing the gate does
   * not reopen that hole.
   */
  it('still refuses a NEGATIVE percent — a price increase is not a discount', () => {
    const neg = discountGate(-5, '', null)
    expect(neg.ok).toBe(false)
    expect(neg.ok === false && neg.why).toMatch(/negative|price increase/i)

    expect(discountGate(-0.01, '', null).ok).toBe(false)
    expect(discountGate(0, '', null).ok).toBe(true)
  })

  it('agrees with the other implementations on the sign', () => {
    // The point of R3-1 was disagreement between engines, not the rule itself.
    expect(discountGate(-5, '', null).ok).toBe(false)
    expect(canApproveDiscount('Owner', -5)).toBe(false)
  })

  it('refuses above 100% — a negative price, not a discount', () => {
    const over = discountGate(100.01, '', null)
    expect(over.ok).toBe(false)
    expect(over.ok === false && over.why).toMatch(/negative price/)
  })

  it('ignores reason and approver entirely — required never, harmless always', () => {
    expect(discountGate(40, '', null).ok).toBe(true)
    expect(discountGate(40, 'a reason nobody asked for', 'usr-owner').ok).toBe(true)
  })
})

/* ── crew coordination fee — Crew Booking spec v3.2 §2 ──────────────────── */

describe('crewBilling — Model A vs Model B', () => {
  const shared = {
    crewDays: 6,
    payoutsPaisa: rupees(30000),
    expensesPaisa: rupees(4000),
    feePerCrewDayPaisa: rupees(1500),
  }

  it('Model A recharges expenses at cost as their own billed line; margin is the fee', () => {
    const r = crewBilling({ ...shared, rechargeExpenses: true })
    expect(r.coordinationFeePaisa).toBe(rupees(9000)) // 6 crew-days x Rs 1,500
    expect(r.billedPaisa).toBe(rupees(43000)) // payouts + fee + expenses
    expect(r.costPaisa).toBe(rupees(34000)) // payouts + expenses
    expect(r.marginPaisa).toBe(rupees(9000)) // the fee, whole
  })

  it('Model B absorbs expenses: they leave the billed line and eat the margin', () => {
    const r = crewBilling({ ...shared, rechargeExpenses: false })
    expect(r.coordinationFeePaisa).toBe(rupees(9000))
    expect(r.billedPaisa).toBe(rupees(39000)) // payouts + fee, no expense line
    expect(r.costPaisa).toBe(rupees(34000)) // cost is identical either way
    expect(r.marginPaisa).toBe(rupees(5000)) // fee - expenses
  })

  it('Model B can go margin-negative, which is why the spec recommends A', () => {
    const r = crewBilling({ ...shared, expensesPaisa: rupees(20000), rechargeExpenses: false })
    expect(r.marginPaisa).toBe(rupees(-11000))
    const a = crewBilling({ ...shared, expensesPaisa: rupees(20000), rechargeExpenses: true })
    expect(a.marginPaisa).toBe(rupees(9000))
  })

  it('an unconfigured fee reads "Not configured", never a guessed zero', () => {
    const r = crewBilling({ crewDays: 6, payoutsPaisa: rupees(30000), expensesPaisa: rupees(4000), rechargeExpenses: true })
    expect(r.coordinationFeePaisa).toBeNull()
    expect(r.billedPaisa).toBeNull()
    expect(r.marginPaisa).toBeNull()
    // Cost is still knowable without a fee, so it is still reported.
    expect(r.costPaisa).toBe(rupees(34000))
  })

  it('the fee is never paid to crew — it is absent from cost', () => {
    const r = crewBilling({ ...shared, rechargeExpenses: true })
    expect(r.costPaisa).toBe(shared.payoutsPaisa + shared.expensesPaisa)
    expect(r.costPaisa).not.toBe(shared.payoutsPaisa + shared.expensesPaisa + rupees(9000))
  })

  it('zero crew-days earns no coordination fee', () => {
    const r = crewBilling({ ...shared, crewDays: 0, rechargeExpenses: true })
    expect(r.coordinationFeePaisa).toBe(0)
    expect(r.billedPaisa).toBe(rupees(34000))
  })
})

/* ── late fee tiers — Decisions 8 Aug 2026 §3 Q2 ────────────────────────── */

describe('lateFee — the three tier boundaries', () => {
  const scheduled = new Date(Date.UTC(2026, 6, 31, 10, 0))
  const dayRate = rupees(5000)
  const late = (minutes: number, rate: Paisa = dayRate) =>
    lateFee({ scheduledReturnAt: scheduled, actualReturnAt: new Date(scheduled.getTime() + minutes * 60_000), dayRatePaisa: rate })

  it('an on-time or early return is never negative and never charged', () => {
    expect(late(0)).toEqual({ overageMinutes: 0, band: 'None', fullDaysCharged: 0, feePaisa: 0 })
    const early = late(-240)
    expect(early.overageMinutes).toBe(0)
    expect(early.band).toBe('None')
    expect(early.feePaisa).toBe(0)
  })

  it('≤30 minutes is the grace band — exactly 30 is still free', () => {
    expect(late(1).band).toBe('None')
    expect(late(29).band).toBe('None')
    expect(late(30).band).toBe('None')
    expect(late(30).feePaisa).toBe(0)
  })

  it('one minute past grace crosses into Half Day', () => {
    expect(late(30).band).toBe('None')
    expect(late(30.01).band).toBe('Half Day')
    expect(late(31).band).toBe('Half Day')
    expect(late(31).feePaisa).toBe(rupees(2500))
    expect(late(31).fullDaysCharged).toBe(0)
  })

  it('under 2h stays Half Day right up to the boundary', () => {
    expect(late(119).band).toBe('Half Day')
    expect(late(119.99).band).toBe('Half Day')
  })

  it('exactly 2h is Full Day — a threshold, not a proration', () => {
    expect(late(120).band).toBe('Full Day')
    expect(late(120).fullDaysCharged).toBe(1)
    expect(late(120).feePaisa).toBe(rupees(5000))
    // 2h01m and 23h59m owe the same one day.
    expect(late(121).feePaisa).toBe(rupees(5000))
    expect(late(1439).feePaisa).toBe(rupees(5000))
    expect(late(1439).fullDaysCharged).toBe(1)
  })

  it('charges a further day for every started 24h block beyond the first', () => {
    expect(late(1440).fullDaysCharged).toBe(1) // exactly 24h is still one day
    expect(late(1441).fullDaysCharged).toBe(2)
    expect(late(2880).fullDaysCharged).toBe(2)
    expect(late(2881).fullDaysCharged).toBe(3)
    expect(late(2881).feePaisa).toBe(rupees(15000))
  })

  it('halves an odd day rate half-up, to a whole rupee', () => {
    // Rs 2,501 / 2 = Rs 1,250.50 -> Rs 1,251
    expect(late(60, rupees(2501)).feePaisa).toBe(rupees(1251))
    expect(late(60, rupees(2501)).feePaisa % 100).toBe(0)
  })

  it('reports the exact elapsed overage rather than a pre-rounded minute count', () => {
    expect(late(30.5).overageMinutes).toBeCloseTo(30.5, 6)
    expect(late(30.5).band).toBe('Half Day')
  })

  it('a zero day rate produces a zero fee but still names the band', () => {
    const r = late(180, rupees(0))
    expect(r.band).toBe('Full Day')
    expect(r.feePaisa).toBe(0)
  })
})

/* ── calculateBookingProfit — AUD-019 Subrental & AUD-030 Integer Paisa ──── */

describe('calculateBookingProfit — subrental cost integration (AUD-019)', () => {
  it('includes external vendor subrental costs in booking profit and margin calculation', () => {
    const revenue = rupees(50000)

    // Base booking with equipment cost only
    const base = calculateBookingProfit({
      revenuePaisa: revenue,
      equipmentCostPaisa: rupees(10000),
    })
    expect(base.totalCostPaisa).toBe(rupees(10000))
    expect(base.grossProfitPaisa).toBe(rupees(40000))
    expect(base.grossMarginPercent).toBe(80)

    // Adding 10k subrental cost reduces gross profit by 10k and decreases gross margin
    const withSubRental = calculateBookingProfit({
      revenuePaisa: revenue,
      equipmentCostPaisa: rupees(10000),
      subRentalCostPaisa: rupees(10000),
    })
    expect(withSubRental.totalCostPaisa).toBe(rupees(20000))
    expect(withSubRental.grossProfitPaisa).toBe(rupees(30000))
    expect(withSubRental.grossMarginPercent).toBe(60)
  })

  it('standardizes on integer paisa with zero rounding discrepancy on odd rates (AUD-030)', () => {
    const result = calculateBookingProfit({
      revenuePaisa: rupees(33333),
      subRentalCostPaisa: rupees(11111),
      crewCostPaisa: rupees(7777),
    })
    expect(Number.isInteger(result.totalCostPaisa)).toBe(true)
    expect(Number.isInteger(result.grossProfitPaisa)).toBe(true)
    expect(result.totalCostPaisa).toBe(rupees(18888))
    expect(result.grossProfitPaisa).toBe(rupees(14445))
  })
})

