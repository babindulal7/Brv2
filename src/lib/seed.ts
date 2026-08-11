/**
 * **Seed corpus generator** — PLAN.md Phase 1, last checklist line:
 * *"Seed data **generated through the engines**, never hand-typed."*
 *
 * `supabase/migrations/0012_seed_data.sql` is reference data only — number
 * sequences, branches, warehouses, users, a fiscal period, bank accounts,
 * expense and inventory categories. Not one booking, client, product, invoice
 * or payment exists in it, so nothing in the seed exercises `money.ts`'s
 * calculation order, `workflow.ts`'s stage machine, `discount.ts`'s Law 10
 * gate or `validation.ts`'s causal-order rule. A regression in any of the four
 * would leave the seed looking exactly as healthy as it does now.
 *
 * This module is the missing half. It **runs** those four engines (plus
 * `bs.ts`, the Date Engine) over a declared corpus, refuses to emit if any of
 * them disagrees with the specs, and prints the SQL. The emitted file is
 * therefore a *legal output of the engines* by construction rather than by
 * inspection — which is the whole point of the checklist line.
 *
 * `Appendix/Sample Data.md`, verbatim, on why:
 *
 * > Hand-typed demo data produced all of the following in the build:
 * > 21 items on an 18-item booking · a return timestamped before its pickup ·
 * > payments larger than the booking total · a booking confirmed at 09:20
 * > sitting below events at 05:30.
 *
 * ## How to regenerate
 *
 * ```
 * npm run seed:sql
 * ```
 *
 * `scripts/emit-seed-sql.mjs` calls {@link seedSql} and writes the migration.
 * Re-running produces a byte-identical file — every identifier in it is
 * derived, never random (see {@link seedUuid}).
 *
 * ## What this file does NOT do
 *
 * It does not apply anything. `CLAUDE.md`: *"Never apply a migration to a live
 * Supabase project without explicit approval."* The output is a file.
 *
 * ## Deliberate gaps
 *
 * `Sample Data.md`'s "what good seed data must contain" list is longer than
 * this corpus. Not modelled here, each for a stated reason:
 *
 *   - **A booking crossing a BS month boundary.** `bs.ts` carries the length
 *     of exactly one month (Shrawan 2083) and returns `null` outside it, so
 *     the Date Engine cannot currently *verify* such a booking. Emitting one
 *     it cannot check would be hand-typed data wearing a generator's clothes.
 *   - **A reversed payment.** `payment_reversals` rows never flow back into
 *     `invoices.paid_amount` (PLAN.md §6.8 records this, unfixed and blocked
 *     on a flooring/reversal formula ruling). A seeded reversal would make
 *     the invoice's own reconciliation assertion below false.
 *   - **Operation sessions, cases, damage findings, a blocked client, the ten
 *     inventory states.** Each needs tables outside the four engines this
 *     checklist line names; adding them here would widen the change past the
 *     one item it closes.
 */

import { price, rupees, toRupees, REFERENCE_CASE, REFERENCE_CASE_ERROR, discountGate } from './money.ts'
import type { Paisa, PriceBreakdown } from './money.ts'
import { validateDiscount } from './discount.ts'
import { validateRentalDates } from './validation.ts'
import { assertItemCounts, canAdvance, closeGates, BOOKING_STATUS, STATUS_ORDER } from './workflow.ts'
import type { BookingStatus } from './workflow.ts'
import { toBs, formatBs } from './bs.ts'

/* ── 0 · the corpus, declared ──────────────────────────────────────────────
 *
 * Everything below this point is *input*. Every figure that reaches the SQL is
 * computed from it by an engine — no total, no tax, no outstanding and no
 * stage is written down twice.
 */

/**
 * Settings ▸ Finance. `price()`'s contract is explicit that the VAT rate is
 * "from Settings ▸ Finance, never hardcoded" — there is no Settings table row
 * for it yet, so the seed's value is stated once, here, and matches both
 * `invoices.vat_rate`'s schema default (0.1300, `0006_finance.sql`) and
 * `Sample Data.md`'s worked example.
 */
const VAT_PERCENT = 13

/** `0012_seed_data.sql` section 1's rows. Record numbers are formatted from these, never typed. */
interface SequenceSpec {
  key: string
  prefix: string
  padding: number
  /** `null` on `equipment` — `EQ000234` carries no year segment. */
  year: number | null
}

const SEQUENCES = {
  booking: { key: 'booking', prefix: 'BK-', padding: 4, year: 2026 },
  client: { key: 'client', prefix: 'CL-', padding: 4, year: 2026 },
  invoice: { key: 'invoice', prefix: 'INV-', padding: 4, year: 2026 },
  payment: { key: 'payment', prefix: 'PAY-', padding: 4, year: 2026 },
  deposit: { key: 'deposit', prefix: 'DEP-', padding: 4, year: 2026 },
  equipment: { key: 'equipment', prefix: 'EQ', padding: 6, year: null },
} as const satisfies Record<string, SequenceSpec>

function recordNo(spec: SequenceSpec, value: number): string {
  const counter = String(value).padStart(spec.padding, '0')
  return spec.year === null ? `${spec.prefix}${counter}` : `${spec.prefix}${spec.year}-${counter}`
}

interface ProductSpec {
  /** Feeds `equipment` sequence → `asset_code`. */
  seq: number
  name: string
  brand: string
  model: string
  /** `inventory_categories.code`, seeded by `0012` section 8. */
  categoryCode: string
  /** `storage_zones.code`, seeded by `0012` section 3. */
  zoneCode: string
  dailyRateRupees: number
  replacementValueRupees: number
  /** How many `product_units` rows exist for this product. */
  units: number
  /** `SN-<tag>-<n>`. */
  serialTag: string
  /** First serial number. The lens starts at 35 so its first unit is the spec's `SN-LEN-0035`. */
  serialFrom: number
}

/**
 * Six products, eighteen units — `Sample Data.md`'s "18 items × 3 days" for
 * `BK-2026-0715`, and the daily rates that make the spec's Rs 60,750 equipment
 * subtotal come out of the arithmetic rather than being asserted on top of it.
 * `assertEquals` at the bottom of {@link buildCorpus} is what actually checks
 * that; if a rate here is edited, the generator stops rather than emitting a
 * corpus that quietly contradicts §2.8.
 *
 * `EQ000234` and `SN-LEN-0035` are the identifiers `Sample Data.md` fixes by
 * name; the rest follow from the sequences.
 */
const PRODUCTS: readonly ProductSpec[] = [
  {
    seq: 234,
    name: 'Sony FX9 Cinema Camera',
    brand: 'Sony',
    model: 'PXW-FX9',
    categoryCode: 'camera',
    zoneCode: 'ZONE-CAM-A',
    dailyRateRupees: 6500,
    replacementValueRupees: 1450000,
    units: 1,
    serialTag: 'CAM',
    serialFrom: 1,
  },
  {
    seq: 235,
    name: 'Sony FX6 Cinema Camera',
    brand: 'Sony',
    model: 'ILME-FX6',
    categoryCode: 'camera',
    zoneCode: 'ZONE-CAM-A',
    dailyRateRupees: 4500,
    replacementValueRupees: 890000,
    units: 1,
    serialTag: 'CAM',
    serialFrom: 2,
  },
  {
    seq: 236,
    name: 'NISI Athena 35mm',
    brand: 'NISI',
    model: 'Athena Prime 35mm T1.9',
    categoryCode: 'lens',
    zoneCode: 'ZONE-LENS-B',
    dailyRateRupees: 1000,
    replacementValueRupees: 260000,
    units: 4,
    serialTag: 'LEN',
    serialFrom: 35,
  },
  {
    seq: 237,
    name: 'Aputure LS 600d Pro',
    brand: 'Aputure',
    model: 'LS 600d Pro',
    categoryCode: 'lighting',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 1200,
    replacementValueRupees: 245000,
    units: 2,
    serialTag: 'LIT',
    serialFrom: 1,
  },
  {
    seq: 238,
    name: 'Matthews C-Stand 40in',
    brand: 'Matthews',
    model: 'Hollywood C-Stand',
    categoryCode: 'grip',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 150,
    replacementValueRupees: 32000,
    units: 4,
    serialTag: 'GRP',
    serialFrom: 1,
  },
  {
    seq: 239,
    name: 'Manfrotto 504X Tripod System',
    brand: 'Manfrotto',
    model: '504X / 645 FAST',
    categoryCode: 'support',
    zoneCode: 'ZONE-GRIP-C',
    dailyRateRupees: 375,
    replacementValueRupees: 96000,
    units: 6,
    serialTag: 'SUP',
    serialFrom: 1,
  },
]

interface LineSpec {
  /** `ProductSpec.seq`. */
  product: number
  qty: number
}

interface CrewSpec {
  name: string
  /** `crew_role` enum, `0001_enums.sql`. Never one of the six RBAC roles. */
  role: string
  dayRateRupees: number
}

interface BookingSpec {
  /** Feeds `booking` sequence → `booking_no`. */
  seq: number
  project: string
  /** AD, UTC. Law 7 — BS is rendered from this, never stored. */
  pickupAt: Date
  returnAt: Date
  /** The stage the corpus leaves this booking at. Reached one transition at a time. */
  stage: BookingStatus
  lines: readonly LineSpec[]
  crew: readonly CrewSpec[]
  discountPercent: number
  /** Law 10 — required above 10%; `null` below it, never an empty string. */
  discountReason: string | null
  /** `users.email` of the approver. Law 10 — required above 10%, Owner included. */
  discountApproverEmail: string | null
  paymentRupees: number
  depositRequiredRupees: number
  depositReceivedRupees: number
  /** Whether the packed units are recorded on `booking_line_units`. */
  unitsAssigned: boolean
}

/**
 * `1 Shrawan 2083 BS · 16 Jul 2026, 06:00 AM` — `Sample Data.md`'s date, in
 * Kathmandu (UTC+05:45), stored as the UTC instant. `assertBs` below feeds it
 * back through `bs.ts` and fails the build if it does not render as
 * `1 Shrawan 2083`.
 */
const NPT_OFFSET_MIN = 345

function kathmandu(year: number, monthIndex: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour, minute) - NPT_OFFSET_MIN * 60_000)
}

const BOOKINGS: readonly BookingSpec[] = [
  {
    // `Sample Data.md`'s reference booking. Its figures are the single
    // assertion that catches most financial defects.
    seq: 715,
    project: 'Annapurna Circuit — documentary shoot',
    pickupAt: kathmandu(2026, 6, 16, 6),
    returnAt: kathmandu(2026, 6, 19, 6),
    // Packed, not On Rent: the spec's own gate checklist for this booking
    // reads "✗ Items Handed Over", with Outstanding Payment and Deposit
    // Pending both still warning. `validate_booking_gates()` (0010) would
    // reject On Rent for exactly those two reasons.
    stage: 'Packed',
    lines: [
      { product: 234, qty: 1 },
      { product: 235, qty: 1 },
      { product: 236, qty: 4 },
      { product: 237, qty: 2 },
      { product: 238, qty: 4 },
      { product: 239, qty: 6 },
    ],
    crew: [
      { name: 'Suman Tamang', role: 'Camera Assistant', dayRateRupees: 8000 },
      { name: 'Prakash Gurung', role: 'Gaffer', dayRateRupees: 8000 },
      { name: 'Nabin Rai', role: 'Grip', dayRateRupees: 8000 },
    ],
    discountPercent: 7,
    discountReason: null,
    discountApproverEmail: null,
    paymentRupees: 15000,
    depositRequiredRupees: 50000,
    depositReceivedRupees: 25000,
    unitsAssigned: true,
  },
  {
    // The second booking exists for one reason: `Sample Data.md` requires
    // "a discount above 10% with reason and named approver" in the corpus,
    // and 7% never reaches that branch of the Law 10 gate. It is the row
    // that proves `booking_discounts_over_ten_needs_reason_and_approver`,
    // `invoices_discount_over_ten_needs_reason_and_approver` and
    // `enforce_booking_discount_stacking()` (0044) all accept a *legal*
    // over-threshold discount, not merely that they reject an illegal one.
    seq: 716,
    project: 'Kathmandu Valley — brand film',
    pickupAt: kathmandu(2026, 7, 1, 8),
    returnAt: kathmandu(2026, 7, 3, 8),
    stage: 'Booked',
    lines: [
      { product: 234, qty: 1 },
      { product: 237, qty: 2 },
    ],
    crew: [],
    discountPercent: 15,
    discountReason: 'Repeat production house, three-booking package agreed for Shrawan',
    discountApproverEmail: 'manager@babinrentals.com',
    paymentRupees: 0,
    depositRequiredRupees: 0,
    depositReceivedRupees: 0,
    unitsAssigned: false,
  },
]

/** `CL-2026-0034` — the client id `Sample Data.md` fixes by name. */
const CLIENT = {
  seq: 34,
  name: 'Sagarmatha Pictures Pvt. Ltd.',
  typeParent: 'Organisation',
  orgSubtype: 'Production House',
  phone: '+9779801230034',
  email: 'bookings@sagarmathapictures.com.np',
  addressLine: 'Jhamsikhel, Lalitpur',
  city: 'Lalitpur',
  district: 'Lalitpur',
  segments: ['Documentary', 'Commercial'],
} as const

/* ── 1 · deterministic identity ────────────────────────────────────────────*/

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = 0xffffffffffffffffn

/**
 * FNV-1a, then splitmix64's finalizer. FNV alone avalanches badly on keys that
 * differ only in their last character — `product:EQ000234` and
 * `product:EQ000235` came out sharing their first four hex digits, which looks
 * like a near-collision even though it is not one. The finalizer mixes the
 * whole word so neighbouring keys produce unrelated UUIDs.
 */
function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * FNV_PRIME) & MASK_64
  }
  hash = ((hash ^ (hash >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64
  hash = ((hash ^ (hash >> 27n)) * 0x94d049bb133111ebn) & MASK_64
  return hash ^ (hash >> 31n)
}

/**
 * Law 8 — *"Every write carries a client UUID. Duplicates rejected."* Every
 * row this generator emits needs one, and `dataAccess.ts`'s
 * `generateClientUuid()` is deliberately **not** used: it returns
 * `crypto.randomUUID()`, so regenerating the migration would rewrite all
 * ~60 keys and the diff would be unreadable — worse, a re-applied seed would
 * duplicate rather than conflict, which is the exact failure `client_uuid`
 * exists to prevent.
 *
 * Derived from the row's natural key instead: same corpus in, same keys out,
 * and `on conflict (client_uuid) do nothing` makes a second apply a no-op.
 * Well-formed (version 4 nibble, RFC 4122 variant) but not random — a hash of
 * the key, which is what an idempotency key is supposed to be.
 */
export function seedUuid(key: string): string {
  const high = fnv1a64(`babin-rentals-os/seed/${key}`)
  const low = fnv1a64(`${key}/babin-rentals-os/seed`)
  const nibbles = (high.toString(16).padStart(16, '0') + low.toString(16).padStart(16, '0')).split('')
  nibbles[12] = '4'
  nibbles[16] = '8'
  const hex = nibbles.join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/* ── 2 · the corpus, computed ──────────────────────────────────────────────*/

export interface SeedLine {
  clientUuid: string
  assetCode: string
  description: string
  qty: number
  days: number
  rateRupees: number
  /** `qty × rate × days`. */
  lineTotal: Paisa
  sortOrder: number
}

export interface SeedCrewLine {
  clientUuid: string
  name: string
  role: string
  dayRateRupees: number
  days: number
  lineTotal: Paisa
}

export interface SeedUnit {
  clientUuid: string
  assetCode: string
  assetTag: string
  serialNo: string
  zoneCode: string
  replacementValueRupees: number
}

export interface SeedTransition {
  clientUuid: string
  from: BookingStatus | null
  to: BookingStatus
  occurredAt: Date
}

export interface SeedBooking {
  spec: BookingSpec
  bookingNo: string
  invoiceNo: string
  paymentNo: string | null
  depositNo: string | null
  /** From `validateRentalDates` — never counted here, never defaulted by omission (Law 9). */
  days: number
  lines: readonly SeedLine[]
  crew: readonly SeedCrewLine[]
  units: readonly SeedUnit[]
  transitions: readonly SeedTransition[]
  breakdown: PriceBreakdown
  equipment: Paisa
  crewTotal: Paisa
  /** Law 5 — a liability, never in `breakdown`. */
  depositPending: Paisa
  itemCount: number
  bsPickup: string | null
}

export interface SeedCorpus {
  bookings: readonly SeedBooking[]
  products: readonly ProductSpec[]
  clientCode: string
  /** `sequence_key` → the highest counter the corpus consumes. */
  sequenceHighWater: ReadonlyMap<string, number>
}

function fail(message: string): never {
  throw new Error(`Seed generator refused to emit — ${message}`)
}

function productBySeq(seq: number): ProductSpec {
  const found = PRODUCTS.find((p) => p.seq === seq)
  if (!found) fail(`no product with equipment sequence ${seq} in PRODUCTS`)
  return found
}

/** Paisa is a branded integer; summing needs the brand reapplied once, not per term. */
function sumPaisa(values: readonly Paisa[]): Paisa {
  return values.reduce<number>((total, v) => total + v, 0) as Paisa
}

/**
 * Runs every engine over {@link BOOKINGS} and throws on the first disagreement.
 * Nothing downstream of here decides a figure.
 */
export function buildCorpus(): SeedCorpus {
  // Foundation §2.8's own assertion, checked before anything else: if the
  // Financial Engine does not reproduce the worked example, no seed generated
  // from it is worth writing.
  if (REFERENCE_CASE_ERROR !== null) fail(REFERENCE_CASE_ERROR)

  const highWater = new Map<string, number>()
  const raise = (key: string, value: number): void => {
    highWater.set(key, Math.max(highWater.get(key) ?? 0, value))
  }
  raise(SEQUENCES.client.key, CLIENT.seq)
  for (const product of PRODUCTS) raise(SEQUENCES.equipment.key, product.seq)

  const bookings: SeedBooking[] = []
  let invoiceSeq = 0
  let paymentSeq = 0
  let depositSeq = 0

  for (const spec of BOOKINGS) {
    const bookingNo = recordNo(SEQUENCES.booking, spec.seq)
    raise(SEQUENCES.booking.key, spec.seq)

    /* Validation Engine — causal order, and the day count itself. Law 9 says
     * days is mandatory on every priced line and explicit; taking it from the
     * engine rather than counting it here is what makes that true of the seed. */
    const dates = validateRentalDates(spec.pickupAt.toISOString(), spec.returnAt.toISOString())
    if (!dates.valid) fail(`${bookingNo}: ${dates.error ?? 'invalid rental dates'}`)
    const days = dates.days

    /* Discount Engine — both implementations, cross-checked. `discount.ts` is
     * the Law 10 gate the schema mirrors; `money.ts`'s `discountGate` is the
     * one the Financial Engine ships. A seed that satisfies one and not the
     * other would hide a divergence between them. */
    const verdict = validateDiscount(spec.discountPercent, spec.discountReason, spec.discountApproverEmail)
    const gate = discountGate(spec.discountPercent, spec.discountReason ?? '', spec.discountApproverEmail)
    if (!verdict.valid) fail(`${bookingNo}: ${verdict.error ?? 'discount rejected'}`)
    if (gate.ok !== verdict.valid) {
      fail(`${bookingNo}: discount.ts and money.ts disagree at ${spec.discountPercent}% — ${gate.ok ? 'money.ts accepts' : gate.why}`)
    }
    if (verdict.requiresApproval && (spec.discountReason === null || spec.discountApproverEmail === null)) {
      fail(`${bookingNo}: ${spec.discountPercent}% needs a reason and a named approver (Law 10)`)
    }

    const lines: SeedLine[] = []
    const units: SeedUnit[] = []
    let sortOrder = 0
    for (const line of spec.lines) {
      const product = productBySeq(line.product)
      const assetCode = recordNo(SEQUENCES.equipment, product.seq)
      if (line.qty > product.units) {
        fail(`${bookingNo}: ${assetCode} is booked ${line.qty}× but only ${product.units} unit(s) exist`)
      }
      lines.push({
        clientUuid: seedUuid(`booking_line:${bookingNo}:${assetCode}`),
        assetCode,
        // `ProductSpec.name` already leads with the brand; the brand is its own
        // column on `products` and repeating it here read as "Sony Sony FX9".
        description: product.name,
        qty: line.qty,
        days,
        rateRupees: product.dailyRateRupees,
        lineTotal: (rupees(product.dailyRateRupees) * line.qty * days) as Paisa,
        sortOrder: (sortOrder += 10),
      })
      if (spec.unitsAssigned) {
        for (let n = 0; n < line.qty; n += 1) {
          const assetTag = `${assetCode}-U${String(n + 1).padStart(2, '0')}`
          units.push({
            clientUuid: seedUuid(`booking_line_unit:${bookingNo}:${assetTag}`),
            assetCode,
            assetTag,
            serialNo: `SN-${product.serialTag}-${String(product.serialFrom + n).padStart(4, '0')}`,
            zoneCode: product.zoneCode,
            replacementValueRupees: product.replacementValueRupees,
          })
        }
      }
    }

    const crew: SeedCrewLine[] = spec.crew.map((member) => ({
      clientUuid: seedUuid(`booking_crew_line:${bookingNo}:${member.name}`),
      name: member.name,
      role: member.role,
      dayRateRupees: member.dayRateRupees,
      days,
      lineTotal: (rupees(member.dayRateRupees) * days) as Paisa,
    }))

    /* Financial Engine — the calculation order, §2.1. Every money figure in
     * the emitted SQL comes out of this one call. */
    const equipment = sumPaisa(lines.map((l) => l.lineTotal))
    const crewTotal = sumPaisa(crew.map((c) => c.lineTotal))
    const breakdown = price({
      equipment,
      crew: crewTotal,
      // §2.1 — "Rs 0 on client pickup". Explicit, not omitted.
      transport: rupees(0),
      discountPercent: spec.discountPercent,
      vatPercent: VAT_PERCENT,
      payments: rupees(spec.paymentRupees),
    })

    if (breakdown.outstanding < 0) fail(`${bookingNo}: payments exceed the rental total`)

    /* Status Engine — the stage is reached one legal transition at a time,
     * starting from the genesis row at Quote. `canAdvance` is what rejects a
     * skipped stage; the DB's own trigger (0021) re-checks the same rule when
     * these rows land. */
    const target = BOOKING_STATUS[spec.stage]
    const path = STATUS_ORDER.filter((s) => BOOKING_STATUS[s].order <= target.order)
    const transitions: SeedTransition[] = []
    let previous: BookingStatus | null = null
    let offsetMinutes = 0
    for (const stage of path) {
      if (previous !== null && !canAdvance(previous, stage)) {
        fail(`${bookingNo}: ${previous} → ${stage} is not a legal advance`)
      }
      transitions.push({
        clientUuid: seedUuid(`booking_stage_transition:${bookingNo}:${stage}`),
        from: previous,
        to: stage,
        // Causal order: strictly increasing, and all before pickup. The
        // "booking confirmed at 09:20 sitting below events at 05:30" defect
        // came from timestamps that did not order.
        occurredAt: new Date(spec.pickupAt.getTime() - (72 - offsetMinutes) * 60 * 60_000),
      })
      previous = stage
      offsetMinutes += 1
    }

    /* Status Engine §1.6 — the item-quantity invariant. This is the check that
     * makes "21 items on an 18-item booking" unrepresentable. */
    const itemCount = lines.reduce((total, l) => total + l.qty, 0)
    if (spec.unitsAssigned) {
      assertItemCounts({ Ready: units.length, 'Picked Up': 0, Returned: 0, Missing: 0 }, itemCount)
    }

    /* Status Engine §1.7 — a booking carrying an outstanding balance must not
     * be closeable. Asserted here so the corpus cannot drift into a state the
     * close gates would wave through. */
    const depositPending = (rupees(spec.depositRequiredRupees) - rupees(spec.depositReceivedRupees)) as Paisa
    if (depositPending < 0) fail(`${bookingNo}: deposit received exceeds deposit required`)
    const gates = closeGates({
      rentalOutstandingPaisa: breakdown.outstanding,
      depositResolved: depositPending === 0,
      openCases: 0,
      damageChargesPendingApproval: 0,
    })
    const closeable = gates.every((g) => g.passing)
    if (closeable !== (spec.stage === 'Closed')) {
      fail(
        `${bookingNo}: close gates say closeable=${String(closeable)} but the corpus leaves it at ${spec.stage} — ` +
          gates.filter((g) => !g.passing).map((g) => `${g.label} (${g.blocking ?? ''})`).join(', '),
      )
    }

    invoiceSeq += 1
    raise(SEQUENCES.invoice.key, invoiceSeq)
    let paymentNo: string | null = null
    if (spec.paymentRupees > 0) {
      paymentSeq += 1
      raise(SEQUENCES.payment.key, paymentSeq)
      paymentNo = recordNo(SEQUENCES.payment, paymentSeq)
    }
    let depositNo: string | null = null
    if (spec.depositRequiredRupees > 0) {
      depositSeq += 1
      raise(SEQUENCES.deposit.key, depositSeq)
      depositNo = recordNo(SEQUENCES.deposit, depositSeq)
    }

    /* Date Engine — Law 7. BS never reaches a column; it is derived here only
     * so the generator can prove the stored UTC instant is the day the spec
     * names. `bs.ts` vouches for Shrawan 2083 and returns null elsewhere. */
    const bs = toBs(spec.pickupAt)

    bookings.push({
      spec,
      bookingNo,
      invoiceNo: recordNo(SEQUENCES.invoice, invoiceSeq),
      paymentNo,
      depositNo,
      days,
      lines,
      crew,
      units,
      transitions,
      breakdown,
      equipment,
      crewTotal,
      depositPending,
      itemCount,
      bsPickup: bs === null ? null : formatBs(bs),
    })
  }

  /* The one figure the specs state independently of this generator. If the
   * reference booking's composition ever stops reproducing §2.8, the seed
   * stops being emitted rather than silently becoming the new truth. */
  const reference = bookings.find((b) => b.bookingNo === 'BK-2026-0715')
  if (!reference) fail('BK-2026-0715 is missing from the corpus — Sample Data.md names it as the reference booking')
  const mismatches = (Object.keys(REFERENCE_CASE) as Array<keyof PriceBreakdown>)
    .filter((k) => reference.breakdown[k] !== REFERENCE_CASE[k])
    .map((k) => `${k}: corpus Rs ${toRupees(reference.breakdown[k])}, §2.8 Rs ${toRupees(REFERENCE_CASE[k])}`)
  if (mismatches.length > 0) fail(`BK-2026-0715 does not reproduce Foundation §2.8 — ${mismatches.join('; ')}`)
  if (reference.itemCount !== 18) fail(`BK-2026-0715 must carry 18 items (Sample Data.md), corpus has ${reference.itemCount}`)
  if (reference.days !== 3) fail(`BK-2026-0715 must run 3 days (Sample Data.md), corpus has ${reference.days}`)
  if (reference.bsPickup !== '1 Shrawan 2083 BS') {
    fail(`BK-2026-0715 pickup must render as 1 Shrawan 2083 BS (Sample Data.md), bs.ts renders ${reference.bsPickup ?? 'null'}`)
  }

  return {
    bookings,
    products: PRODUCTS,
    clientCode: recordNo(SEQUENCES.client, CLIENT.seq),
    sequenceHighWater: highWater,
  }
}

/* ── 3 · SQL emission ──────────────────────────────────────────────────────*/

function txt(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function uuid(value: string): string {
  return `'${value}'::uuid`
}

/** Paisa → the `numeric(14,2)` the schema stores. Money never crosses as a float literal. */
function money(value: Paisa): string {
  return toRupees(value).toFixed(2)
}

function ts(value: Date): string {
  return `'${value.toISOString()}'::timestamptz`
}

function textArray(values: readonly string[]): string {
  return `array[${values.map(txt).join(', ')}]`
}

const BRANCH = `(select id from branches where branch_code = 'BR-KTM-01')`
const WAREHOUSE = `(select id from warehouses where warehouse_code = 'WH-KTM-MAIN')`
const BANK = `(select id from bank_accounts where account_number = '01201017500001')`

function user(email: string): string {
  return `(select id from users where email = ${txt(email)})`
}

function zone(code: string): string {
  return `(select id from storage_zones where code = ${txt(code)})`
}

function category(code: string): string {
  return `(select id from inventory_categories where code = ${txt(code)})`
}

function client(code: string): string {
  return `(select id from clients where client_code = ${txt(code)})`
}

function product(assetCode: string): string {
  return `(select id from products where asset_code = ${txt(assetCode)})`
}

function unit(assetTag: string): string {
  return `(select id from product_units where asset_tag = ${txt(assetTag)})`
}

function booking(bookingNo: string): string {
  return `(select id from bookings where booking_no = ${txt(bookingNo)})`
}

function invoice(invoiceNo: string): string {
  return `(select id from invoices where invoice_no = ${txt(invoiceNo)})`
}

function deposit(depositNo: string): string {
  return `(select id from security_deposits where deposit_no = ${txt(depositNo)})`
}

function byClientUuid(table: string, clientUuid: string): string {
  return `(select id from ${table} where client_uuid = ${uuid(clientUuid)})`
}

const OWNER = user('owner@babinrentals.com')
const WAREHOUSE_STAFF = user('warehouse@babinrentals.com')
const BILLING = user('billing@babinrentals.com')

function section(title: string): string {
  const rule = '-'.repeat(77)
  return `-- ${rule}\n-- ${title}\n-- ${rule}`
}

/**
 * Renders {@link buildCorpus}'s output as the seed migration. Pure string
 * assembly — every decision was already taken by an engine upstream.
 */
export function emitSql(corpus: SeedCorpus): string {
  const out: string[] = []
  const reference = corpus.bookings.find((b) => b.bookingNo === 'BK-2026-0715')
  if (!reference) fail('emitSql called without the reference booking')

  out.push(`-- =============================================================================
-- Seed corpus — GENERATED FILE. Do not edit by hand.
--
--   source:    src/lib/seed.ts
--   regenerate: npm run seed:sql
--
-- PLAN.md Phase 1's last checklist line asks for seed data "generated through
-- the engines, never hand-typed". Every figure below came out of
-- src/lib/money.ts (calculation order, §2.1/§2.4), src/lib/workflow.ts (the
-- canonical six stages and the §1.6 item invariant), src/lib/discount.ts
-- (Law 10), src/lib/validation.ts (causal order and the day count) and
-- src/lib/bs.ts (Law 7 — BS derived, never stored). The generator refuses to
-- emit if any of them disagrees with Appendix/Sample Data.md, so this file
-- cannot drift away from the engines without the drift being fatal at
-- generation time.
--
-- 0012_seed_data.sql stays exactly as it is: it seeds the reference data this
-- file depends on (branches, warehouses, users, categories, bank accounts,
-- number sequences) and every reference below resolves through those rows'
-- natural keys, never through 0012's literal UUIDs.
--
-- NOT APPLIED. CLAUDE.md: "Never apply a migration to a live Supabase project
-- without explicit approval." This file has been generated and reviewed, not
-- executed — no local Postgres instance exists in this repo.
--
-- Re-applying is a no-op: every insert carries a derived client_uuid (Law 8)
-- and conflicts on its natural key.
-- =============================================================================

begin;
`)

  /* clients */
  out.push(section('1 · Client'))
  out.push(`insert into clients (
  client_uuid, client_code, type_parent, org_subtype, name, phone, email,
  address_line, city, district, country, payment_terms, client_since,
  segments, preferred_contact_channels, status, created_by
) values (
  ${uuid(seedUuid(`client:${corpus.clientCode}`))},
  ${txt(corpus.clientCode)},
  ${txt(CLIENT.typeParent)}::client_type_parent,
  ${txt(CLIENT.orgSubtype)}::client_organisation_subtype,
  ${txt(CLIENT.name)},
  ${txt(CLIENT.phone)},
  ${txt(CLIENT.email)},
  ${txt(CLIENT.addressLine)},
  ${txt(CLIENT.city)},
  ${txt(CLIENT.district)},
  'Nepal',
  'Immediate'::payment_terms,
  date '2024-03-11',
  ${textArray(CLIENT.segments)}::client_segment[],
  array['Email', 'WhatsApp']::preferred_contact_channel[],
  'Active'::client_status,
  ${BILLING}
)
on conflict (client_code) do nothing;
`)

  /* products */
  out.push(section('2 · Products — the catalogue the booking lines price against'))
  for (const p of corpus.products) {
    const assetCode = recordNo(SEQUENCES.equipment, p.seq)
    out.push(`insert into products (
  client_uuid, asset_code, name, category_id, brand, model, tracking_mode, status,
  total_quantity, daily_rate, replacement_value, min_rental_days, rental_enabled, is_active, created_by
) values (
  ${uuid(seedUuid(`product:${assetCode}`))},
  ${txt(assetCode)},
  ${txt(p.name)},
  ${category(p.categoryCode)},
  ${txt(p.brand)},
  ${txt(p.model)},
  'Serialised'::product_tracking_mode,
  'Active'::product_record_state,
  ${p.units},
  ${p.dailyRateRupees.toFixed(2)},
  ${p.replacementValueRupees.toFixed(2)},
  1,
  true,
  true,
  ${OWNER}
)
on conflict (asset_code) do nothing;
`)
  }

  /* product_units */
  out.push(section('3 · Product units — one row per physical item'))
  for (const b of corpus.bookings) {
    for (const u of b.units) {
      out.push(`insert into product_units (
  client_uuid, product_id, serial_no, asset_tag, status, condition,
  branch_id, warehouse_id, storage_zone_id, replacement_value, created_by
) values (
  ${uuid(seedUuid(`product_unit:${u.assetTag}`))},
  ${product(u.assetCode)},
  ${txt(u.serialNo)},
  ${txt(u.assetTag)},
  -- The reference booking is at Packed, so its units are Packed too.
  'Packed'::inventory_state,
  'Good'::unit_condition,
  ${BRANCH},
  ${WAREHOUSE},
  ${zone(u.zoneCode)},
  ${u.replacementValueRupees.toFixed(2)},
  ${WAREHOUSE_STAFF}
)
on conflict (asset_tag) do nothing;
`)
    }
  }

  /* bookings and their children */
  for (const b of corpus.bookings) {
    const s = b.spec
    out.push(section(`4 · ${b.bookingNo} — ${s.project}`))
    out.push(`-- ${b.itemCount} item(s) × ${b.days} day(s), ${b.crew.length} crew.
-- Pickup renders as ${b.bsPickup ?? 'a BS date bs.ts cannot vouch for'} (Law 7 — derived, never stored).
-- Engine figures: subtotal Rs ${money(b.breakdown.subtotal)} · discount ${s.discountPercent}% Rs ${money(b.breakdown.discount)}
--   · taxable Rs ${money(b.breakdown.taxable)} · VAT ${VAT_PERCENT}% Rs ${money(b.breakdown.vat)}
--   · rental total Rs ${money(b.breakdown.rentalTotal)} · payments Rs ${money(b.breakdown.payments)}
--   · outstanding Rs ${money(b.breakdown.outstanding)}
insert into bookings (
  client_uuid, booking_no, branch_id, client_id, project,
  pickup_at, return_at, delivery_type, deposit_required, created_by, updated_by
) values (
  ${uuid(seedUuid(`booking:${b.bookingNo}`))},
  ${txt(b.bookingNo)},
  ${BRANCH},
  ${client(corpus.clientCode)},
  ${txt(s.project)},
  ${ts(s.pickupAt)},
  ${ts(s.returnAt)},
  -- Sample Data.md: transport Rs 0 — the client collects. 'Customer Pickup' is
  -- the delivery_type enum member's own spelling (0001), not UI copy; Law 17
  -- governs what the screens say, and no screen renders this literal.
  'Customer Pickup'::delivery_type,
  ${money(rupees(s.depositRequiredRupees))},
  ${BILLING},
  ${BILLING}
)
on conflict (booking_no) do nothing;
`)

    for (const line of b.lines) {
      out.push(`insert into booking_lines (
  client_uuid, booking_id, line_type, product_id, description, qty, days, rate, sort_order, created_by
) values (
  ${uuid(line.clientUuid)},
  ${booking(b.bookingNo)},
  'Equipment'::booking_line_type,
  ${product(line.assetCode)},
  ${txt(line.description)},
  ${line.qty},
  -- Law 9: days is written explicitly on every priced line, never by omission.
  ${line.days},
  ${line.rateRupees.toFixed(2)},
  ${line.sortOrder},
  ${BILLING}
)
on conflict (client_uuid) do nothing;
`)
    }

    // Packing finished when the booking reached Packed, not later — a
    // packed_at after its own stage transition is the "confirmed at 09:20
    // sitting below events at 05:30" defect in another table.
    const packedAt = b.transitions.find((t) => t.to === 'Packed')?.occurredAt ?? s.pickupAt
    for (const u of b.units) {
      const parent = b.lines.find((l) => l.assetCode === u.assetCode)
      if (!parent) fail(`${b.bookingNo}: unit ${u.assetTag} has no booking line`)
      out.push(`insert into booking_line_units (
  client_uuid, booking_line_id, asset_id, qty, unit_state, is_required, packed, packed_at, packed_by, created_by
) values (
  ${uuid(u.clientUuid)},
  ${byClientUuid('booking_lines', parent.clientUuid)},
  ${unit(u.assetTag)},
  1,
  'Ready'::item_quantity_state,
  true,
  true,
  ${ts(packedAt)},
  ${WAREHOUSE_STAFF},
  ${WAREHOUSE_STAFF}
)
on conflict (client_uuid) do nothing;
`)
    }

    for (const c of b.crew) {
      out.push(`insert into booking_crew_lines (
  client_uuid, booking_id, name, crew_role, day_rate, days, created_by
) values (
  ${uuid(c.clientUuid)},
  ${booking(b.bookingNo)},
  ${txt(c.name)},
  ${txt(c.role)}::crew_role,
  ${c.dayRateRupees.toFixed(2)},
  ${c.days},
  ${BILLING}
)
on conflict (client_uuid) do nothing;
`)
    }

    /* Law 10 — the discount row, and the audit event it is required to carry.
     *
     * `actor_role` below is 'Coordinator', not 'Billing'. 'Billing' is retired
     * vocabulary: 0013_business_8_roles.sql renamed that enum value in place
     * ("the coordinator takes the advance", PLAN.md §4.3), which also rewrote
     * 0012's seeded user. This generator kept emitting the old label and
     * aborted the entire corpus on its first real apply, 11 Aug 2026. It is
     * NOT 'Accounts' — PLAN.md §6.25 records that exact mis-mapping being
     * caught before it shipped. The `BILLING` constant is only an email lookup
     * (billing@babinrentals.com), which is still a real seeded row. */
    const discountAuditUuid = seedUuid(`audit_event:discount:${b.bookingNo}`)
    const approver = s.discountApproverEmail === null ? 'null' : user(s.discountApproverEmail)
    out.push(`-- Law 10. ${
      s.discountPercent > 10
        ? `${s.discountPercent}% is above the 10% threshold, so the reason (>=10 chars) and the named approver below are what make this row legal — for anyone, Owner included.`
        : `${s.discountPercent}% is at or below the 10% threshold: no reason and no approver, which is what discount.ts returned.`
    }
insert into audit_events (
  client_uuid, event_class, category, module, action, severity, status,
  table_name, record_id, actor_id, actor_role, branch_id, reason
) values (
  ${uuid(discountAuditUuid)},
  'discount'::audit_event_class,
  'Finance'::audit_category,
  'Rentals'::audit_module,
  'Approve'::audit_action,
  'Informational'::audit_severity,
  'Success'::audit_status,
  'booking_discounts',
  ${booking(b.bookingNo)},
  ${BILLING},
  'Coordinator'::system_role,
  ${BRANCH},
  ${s.discountReason === null ? txt(`${s.discountPercent}% applied — at or below the Law 10 approval threshold`) : txt(s.discountReason)}
)
on conflict (client_uuid) do nothing;

insert into booking_discounts (
  client_uuid, booking_id, branch_id, discount_source, percent, reason, approver_id,
  applied_by, applied_at, audit_event_id
) values (
  ${uuid(seedUuid(`booking_discount:${b.bookingNo}`))},
  ${booking(b.bookingNo)},
  ${BRANCH},
  'Manual'::discount_source,
  ${s.discountPercent.toFixed(2)},
  ${s.discountReason === null ? 'null' : txt(s.discountReason)},
  ${approver},
  ${BILLING},
  ${ts(b.transitions[0]?.occurredAt ?? s.pickupAt)},
  ${byClientUuid('audit_events', discountAuditUuid)}
)
on conflict (client_uuid) do nothing;
`)

    /* Invoice. Inserted with the engine's figures; the invoice_lines trigger
     * then recomputes them with its own arithmetic, which is why the restate
     * block below exists. */
    const dueDate = new Date(s.returnAt.getTime() + 7 * 24 * 60 * 60_000)
    out.push(`insert into invoices (
  client_uuid, invoice_no, booking_id, client_id, branch_id, status,
  issue_date, due_date, subtotal, discount_amount, discount_percent, discount_reason,
  discount_approved_by, taxable_amount, vat_rate, vat_amount, total_amount,
  paid_amount, outstanding_amount, created_by, updated_by
) values (
  ${uuid(seedUuid(`invoice:${b.invoiceNo}`))},
  ${txt(b.invoiceNo)},
  ${booking(b.bookingNo)},
  ${client(corpus.clientCode)},
  ${BRANCH},
  'Sent'::invoice_status,
  ${`date '${s.pickupAt.toISOString().slice(0, 10)}'`},
  ${`date '${dueDate.toISOString().slice(0, 10)}'`},
  ${money(b.breakdown.subtotal)},
  ${money(b.breakdown.discount)},
  ${s.discountPercent.toFixed(2)},
  ${s.discountReason === null ? 'null' : txt(s.discountReason)},
  ${approver},
  ${money(b.breakdown.taxable)},
  ${(VAT_PERCENT / 100).toFixed(4)},
  ${money(b.breakdown.vat)},
  ${money(b.breakdown.rentalTotal)},
  0.00,
  ${money(b.breakdown.rentalTotal)},
  ${BILLING},
  ${BILLING}
)
on conflict (invoice_no) do nothing;
`)

    let invoiceSort = 0
    for (const line of b.lines) {
      out.push(`insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  ${uuid(seedUuid(`invoice_line:${b.invoiceNo}:${line.assetCode}`))},
  ${invoice(b.invoiceNo)},
  'Equipment Rental'::line_kind,
  ${txt(line.description)},
  ${line.qty},
  ${line.days},
  ${line.rateRupees.toFixed(2)},
  ${money(line.lineTotal)},
  ${(invoiceSort += 10)}
)
on conflict (client_uuid) do nothing;
`)
    }
    if (b.crew.length > 0) {
      const crewRate = b.crew[0]?.dayRateRupees ?? 0
      out.push(`insert into invoice_lines (
  client_uuid, invoice_id, line_kind, description, quantity, days, unit_rate, line_total, sort_order
) values (
  ${uuid(seedUuid(`invoice_line:${b.invoiceNo}:crew`))},
  ${invoice(b.invoiceNo)},
  'Crew Charges'::line_kind,
  ${txt(`Crew — ${b.crew.map((c) => c.role).join(', ')}`)},
  ${b.crew.length},
  ${b.days},
  ${crewRate.toFixed(2)},
  ${money(b.crewTotal)},
  ${(invoiceSort += 10)}
)
on conflict (client_uuid) do nothing;
`)
    }

    /* The restate. See the migration header and PLAN.md: 0010's
     * recalculate_invoice_totals() rounds to 2dp and hardcodes 0.13, so it
     * does not reproduce §2.4's half-up-to-whole-rupee-at-each-step. */
    out.push(`-- The invoice_lines trigger (recalculate_invoice_totals(), 0010) has just
-- overwritten the four calculated columns with its own arithmetic: it rounds
-- to 2 decimal places rather than §2.4's "Half Up, applied at each displayed
-- step" (whole rupees), and it hardcodes 0.13 instead of reading
-- invoices.vat_rate. On this invoice that is the difference between the
-- engine's Rs ${money(b.breakdown.rentalTotal)} and the trigger's own figure. The Financial Engine is
-- authoritative (Foundation §2.4, §2.8), so the engine's figures are restated
-- here. The NOTICE records the deviation at apply time rather than hiding it;
-- fixing the trigger belongs to Phase 1's "constraints and triggers" lines,
-- not to this seed.
do $$
declare
  v_trigger_total numeric(14,2);
begin
  select total_amount into v_trigger_total from invoices where invoice_no = ${txt(b.invoiceNo)};
  if v_trigger_total is distinct from ${money(b.breakdown.rentalTotal)} then
    raise notice 'Seed %: recalculate_invoice_totals() produced a total of %, the Financial Engine produces %. Engine figure restated.',
      ${txt(b.invoiceNo)}, v_trigger_total, ${money(b.breakdown.rentalTotal)};
  end if;
end $$;

update invoices set
  subtotal           = ${money(b.breakdown.subtotal)},
  discount_amount    = ${money(b.breakdown.discount)},
  taxable_amount     = ${money(b.breakdown.taxable)},
  vat_amount         = ${money(b.breakdown.vat)},
  total_amount       = ${money(b.breakdown.rentalTotal)},
  outstanding_amount = ${money(b.breakdown.rentalTotal)} - paid_amount,
  updated_by         = ${BILLING}
where invoice_no = ${txt(b.invoiceNo)};
`)

    /* Law 5 — the deposit, in its own liability account. */
    if (b.depositNo !== null) {
      out.push(`-- Law 5: deposits are liabilities. security_deposits is a separate account
-- from the invoice; nothing below touches total_amount or outstanding_amount,
-- and the assertion block at the foot of this file proves it.
insert into security_deposits (
  client_uuid, deposit_no, booking_id, client_id, branch_id, required_amount, created_by, updated_by
) values (
  ${uuid(seedUuid(`security_deposit:${b.depositNo}`))},
  ${txt(b.depositNo)},
  ${booking(b.bookingNo)},
  ${client(corpus.clientCode)},
  ${BRANCH},
  ${money(rupees(s.depositRequiredRupees))},
  ${BILLING},
  ${BILLING}
)
on conflict (deposit_no) do nothing;
`)
      if (s.depositReceivedRupees > 0) {
        const movementNo = `${b.depositNo}-M1`
        out.push(`insert into deposit_movements (
  client_uuid, movement_no, security_deposit_id, movement_type, amount, bank_account_id, handled_by
) values (
  ${uuid(seedUuid(`deposit_movement:${movementNo}`))},
  ${txt(movementNo)},
  ${deposit(b.depositNo)},
  'Received'::deposit_movement_type,
  ${money(rupees(s.depositReceivedRupees))},
  ${BANK},
  ${BILLING}
)
on conflict (movement_no) do nothing;
`)
      }
    }

    /* Law 4 — payments are ledger rows, immutable once written. */
    if (b.paymentNo !== null) {
      out.push(`insert into payments (
  client_uuid, payment_no, booking_id, invoice_id, client_id, branch_id,
  amount, payment_type, status, payment_date, bank_account_id, received_by
) values (
  ${uuid(seedUuid(`payment:${b.paymentNo}`))},
  ${txt(b.paymentNo)},
  ${booking(b.bookingNo)},
  ${invoice(b.invoiceNo)},
  ${client(corpus.clientCode)},
  ${BRANCH},
  ${money(b.breakdown.payments)},
  -- Law 5 again: a deposit is never a payment_type here; the schema forbids it.
  'Advance Payment'::payment_type,
  'Received'::payment_status,
  ${ts(new Date(s.pickupAt.getTime() - 48 * 60 * 60_000))},
  ${BANK},
  ${BILLING}
)
on conflict (payment_no) do nothing;
`)
    }

    /* The stage machine. booking_stage_transitions is the sole writer of
     * bookings.stage (0021); the rows below walk the booking up one legal
     * step at a time, and the DB re-validates each one. */
    out.push(`-- Status Engine: ${b.transitions.map((t) => t.to).join(' → ')}. Forward-only,
-- no skipping, causal order — checked by workflow.ts at generation time and
-- again by apply_booking_stage_transition() (0021) when these rows land.`)
    for (const t of b.transitions) {
      out.push(`insert into booking_stage_transitions (
  client_uuid, booking_id, branch_id, from_stage, to_stage, occurred_at, actor_id, actor_role, source
) values (
  ${uuid(t.clientUuid)},
  ${booking(b.bookingNo)},
  ${BRANCH},
  ${t.from === null ? 'null' : `${txt(t.from)}::booking_stage`},
  ${txt(t.to)}::booking_stage,
  ${ts(t.occurredAt)},
  ${t.to === 'Packed' ? WAREHOUSE_STAFF : BILLING},
  ${t.to === 'Packed' ? txt('Warehouse') : txt('Coordinator')},
  'seed'
)
on conflict (client_uuid) do nothing;
`)
    }
  }

  /* number_sequences */
  out.push(section('5 · Number sequences — advanced past everything the corpus consumed'))
  out.push(`-- Without this the next booking the app numbers would collide with a seeded
-- one. greatest() so a re-apply, or a sequence already ahead, is never rewound.`)
  for (const [key, value] of [...corpus.sequenceHighWater].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`update number_sequences
   set current_value = greatest(current_value, ${value}), updated_at = now()
 where sequence_key = ${txt(key)};`)
  }
  out.push('')

  /* assertions */
  out.push(section('6 · Reconciliation assertions'))
  out.push(`-- Foundation §2.8: "Any screen showing 1,39,208 / 1,24,208 / 91,550 / 1,08,548
-- / 58,548 is rendering superseded seed data and is a defect." These figures
-- are Sample Data.md's, not this generator's — the generator already refused
-- to emit unless money.ts reproduces them, so this block closes the loop by
-- checking the database agrees once every trigger has run.
do $$
declare
  v_subtotal    numeric(14,2);
  v_discount    numeric(14,2);
  v_taxable     numeric(14,2);
  v_vat         numeric(14,2);
  v_total       numeric(14,2);
  v_paid        numeric(14,2);
  v_outstanding numeric(14,2);
  v_status      invoice_status;
  v_lines       numeric(14,2);
  v_pending     numeric(14,2);
  v_stage       booking_stage;
  v_items       integer;
  v_units       integer;
begin
  select subtotal, discount_amount, taxable_amount, vat_amount, total_amount,
         paid_amount, outstanding_amount, status
    into v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding, v_status
    from invoices where invoice_no = ${txt(reference.invoiceNo)};

  if (v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding)
     is distinct from
     (${money(reference.breakdown.subtotal)}, ${money(reference.breakdown.discount)}, ${money(reference.breakdown.taxable)}, ${money(reference.breakdown.vat)}, ${money(reference.breakdown.rentalTotal)}, ${money(reference.breakdown.payments)}, ${money(reference.breakdown.outstanding)}) then
    raise exception 'Foundation §2.8 violated on %: got subtotal %, discount %, taxable %, VAT %, total %, paid %, outstanding %.',
      ${txt(reference.invoiceNo)}, v_subtotal, v_discount, v_taxable, v_vat, v_total, v_paid, v_outstanding;
  end if;

  if v_status is distinct from 'Partially Paid'::invoice_status then
    raise exception 'Payment sync failed: % is % after a part payment, expected Partially Paid.', ${txt(reference.invoiceNo)}, v_status;
  end if;

  select coalesce(sum(line_total), 0) into v_lines
    from invoice_lines where invoice_id = ${invoice(reference.invoiceNo)};
  if v_lines is distinct from v_subtotal then
    raise exception 'Invoice % does not reconcile: lines sum to % but subtotal is %.', ${txt(reference.invoiceNo)}, v_lines, v_subtotal;
  end if;

  -- Law 5. Rs ${money(rupees(reference.spec.depositReceivedRupees))} of deposit has been received against this booking;
  -- outstanding must be untouched by it.
  select pending_amount into v_pending
    from security_deposits where booking_id = ${booking(reference.bookingNo)};
  if v_pending is distinct from ${money(reference.depositPending)} then
    raise exception 'Law 5: deposit pending on % is %, expected %.', ${txt(reference.bookingNo)}, v_pending, ${money(reference.depositPending)};
  end if;
  if v_outstanding is distinct from ${money(reference.breakdown.outstanding)} then
    raise exception 'Law 5: the deposit moved Rental Outstanding on % to %.', ${txt(reference.bookingNo)}, v_outstanding;
  end if;

  -- The "21 items on an 18-item booking" defect, made detectable.
  select coalesce(sum(qty), 0) into v_items from booking_lines where booking_id = ${booking(reference.bookingNo)};
  select count(*) into v_units
    from booking_line_units blu
    join booking_lines bl on bl.id = blu.booking_line_id
   where bl.booking_id = ${booking(reference.bookingNo)};
  if v_items is distinct from ${reference.itemCount} or v_units is distinct from ${reference.itemCount} then
    raise exception 'Item invariant violated on %: % line items but % assigned units, expected % of each.',
      ${txt(reference.bookingNo)}, v_items, v_units, ${reference.itemCount};
  end if;
`)
  for (const b of corpus.bookings) {
    out.push(`  select stage into v_stage from bookings where booking_no = ${txt(b.bookingNo)};
  if v_stage is distinct from ${txt(b.spec.stage)}::booking_stage then
    raise exception 'Stage machine: % is at %, the corpus put it at %.', ${txt(b.bookingNo)}, v_stage, ${txt(b.spec.stage)};
  end if;
`)
  }
  out.push(`  raise notice 'Seed corpus verified: % booking(s), Foundation §2.8 reconciles.', ${corpus.bookings.length};
end $$;

commit;
`)

  return out.join('\n')
}

/** `buildCorpus()` then `emitSql()`. What `npm run seed:sql` calls. */
export function seedSql(): string {
  return emitSql(buildCorpus())
}
