import { supabase } from './supabase'
import { DISCOUNT_CAP, price, rupees, type Paisa, type PriceBreakdown } from './money'
import { BOOKING_STATUS, type StatusMeta } from './workflow'
import type { Database } from '../types/supabase'

/**
 * # The single booking query — Law 2 (Single Query Rule)
 *
 * *"One booking query serves every surface. Hard acceptance gate: two different
 * screens rendering the same booking cannot disagree."*
 *
 * This is the DETAIL counterpart to `src/lib/queries/bookings.ts` (the LIST
 * query). The two agree on table names, column names, money units and stage
 * vocabulary by construction — every column below was verified in the same
 * migrations that module cites, and where the two modules read the same column
 * they read the same name.
 *
 * ## ⚠ STATE OF THIS MODULE — read before first use
 *
 * It is now written against the schema that actually exists. What it returns is
 * **facts**: the booking header, its client, its live lines with per-line money
 * and per-unit state. Those are safe to render.
 *
 * What still blocks it, precisely:
 *
 *  1. **It has never been run against a live database.** The nested embed
 *     (`bookings` → `booking_lines_v` → `booking_line_units`) is legal on
 *     paper — `src/types/supabase.ts`, which is GENERATED from the live
 *     database, registers `booking_lines_booking_id_fkey` on
 *     `booking_lines_v` pointing at `bookings` (supabase.ts:10422) and
 *     `booking_line_units_booking_line_id_fkey` with
 *     `referencedRelation: "booking_lines_v"` (supabase.ts:894) — so PostgREST
 *     has already resolved both view relationships. That is
 *     strong evidence, not a test run. If the embed is wrong it fails with a
 *     PostgREST error, which `fetchCanonicalBooking` now throws rather than
 *     swallowing — loud, not silent.
 *  2. **It does not produce a Rental Total, and cannot.** See THE MONEY SEAM.
 *     `priceCanonicalBooking` refuses with a stated reason rather than
 *     returning a plausible wrong number.
 *
 * ## What the previous version got wrong — do not restore any of it
 *
 * The file that stood here read a table shape that has never existed. Left
 * column is what it asked Postgres for; right column is what
 * `0002_bookings.sql` actually declares (`create table booking_lines`, :125):
 *
 * | old read           | reality                                                |
 * |--------------------|--------------------------------------------------------|
 * | `line_kind`        | `line_type` — enum `booking_line_type` (:129)          |
 * | `quantity`         | `qty` (:134)                                            |
 * | `daily_rate`       | `rate` (:136)                                           |
 * | `discount_percent` | `discount_amount` — an AMOUNT in rupees (:137)         |
 * | `line_total`       | does not exist, anywhere                                |
 * | `item_state`       | not on this table — `booking_line_units.unit_state`     |
 *
 * And on the parent: `bookings.delivery_method`, `pickup_datetime`,
 * `return_datetime`, `days`, `project_title`, `shoot_type`, `location`, `notes`
 * — none of those columns exist either. The real names are `delivery_type`
 * (0002:34), `pickup_at` / `return_at` (:31-32) and `project` (:29); the rest
 * have no column at all.
 *
 * **The consequence was not a crash — it was a silent Rs 0.** The old bucketing
 * loop compared `line.lineKind` against `'Equipment Rental'`, `'Sub-Rental'`,
 * `'Services'`, `'Crew Charges'`, `'Transport'`. Those five are the members of
 * the `line_kind` enum (0001:1037), which belongs to `invoice_lines`, NOT to
 * `booking_lines`. No `booking_line_type` value can equal any of them, so
 * **every branch was unreachable**, every bucket stayed 0, and the engine was
 * handed `equipment: 0`. It would have rendered a fully-formed, confident,
 * entirely wrong Rental Total of Rs 0 + 13% VAT on Rs 0. Nothing would have
 * errored. This is the failure mode the whole module is now shaped to make
 * impossible: an unknown figure is `null`, never a zero.
 *
 * A second, quieter one: `vatPercent` was read as `Number(invoice.vat_rate)`.
 * `invoices.vat_rate` is `numeric(5,4) not null default 0.1300` (0006:92) — a
 * FRACTION. Passing `0.13` into `price()`, whose `vatPercent` is a percentage,
 * charges 0.13% VAT instead of 13%. A 100x error in the customer's favour, on
 * every invoice, with no symptom.
 *
 * ## What the REWRITE then got wrong — the same failure, four new routes
 *
 * The rewrite replaced "unknown becomes 0" with "unknown becomes null", and then
 * reintroduced the original failure four times over by letting a zero back in
 * through a side door. Each is documented at its own site; collected here so the
 * shape is visible as one thing:
 *
 *  1. **An absent line embed became Rs 0.** `raw.booking_lines_v ?? []` made
 *     "the lines were not returned" indistinguishable from "there are no lines",
 *     and `sumNet([])` is `0 as Paisa` — non-null — so the refusal guard, which
 *     tests for null, never fired. Fixed by deciding the question once at the
 *     boundary and carrying it as `linesPresence`.
 *  2. **Supplied engine inputs were unvalidated.** `crew`, `transport` and
 *     `payments` were typed `Paisa` and passed straight to `price()`; the only
 *     check in the module was `Number.isFinite(vatPercent)`. `Paisa` is a brand,
 *     not a validation. Fixed by making every field nullable and validating all
 *     of them at the boundary — see BOUNDARY VALIDATION.
 *  3. **The booking discount was applied uncapped.** `Σ percent` went into
 *     `price()` with no reference to `DISCOUNT_CAP`, so a 40% that the database
 *     forbids would have produced a complete, self-consistent total. Fixed by
 *     refusing and surfacing, never clamping — see THE DISCOUNT CAP.
 *  4. **`NaN` was unguarded.** `toPaisa` tested only `=== null`/`=== undefined`,
 *     so anything else became `rupees(NaN)` = `NaN`, which is a `Paisa` to the
 *     compiler and renders as a total.
 *
 * ## And five more the same audit found, closed 12 Aug 2026
 *
 *  5. **A bundle child orphaned by a voided parent.** Nothing cascades
 *     `voided_at` from a Bundle line to its children, so voiding the kit left
 *     live Rs 0 children and took the bundle's whole rate out of the subtotal
 *     silently. See ORPHANED BUNDLE CHILDREN.
 *  6. **`aggregateUnits` used the `?? []` this module condemns**, one level
 *     below the line embed. An absent unit collection counted as zero units, and
 *     the packing gate is `requiredUnpackedQty === 0` — so absence read as a
 *     PASS. Fixed with the same presence discipline: `unitsPresence`.
 *  7. **Unit `qty` was unvalidated**, though every count and the packing gate
 *     are summed from it. Now guarded exactly as line `qty`/`days` are.
 *  8. **An unknown `item_quantity_state` was mishandled two disagreeing ways** —
 *     a new `byState` key holding `NaN` at line level, and the units silently
 *     dropped at roll-up. Now one behaviour: refuse. See `aggregateUnits`.
 *  9. **`withDiscounts` was documented as proving money visibility.** It proves
 *     nothing — it is a caller-asserted boolean and this module holds no
 *     session. The docs now say what it is, and name what actually keeps a
 *     money-blind session's wrong 0% out of a total. See
 *     `FetchCanonicalBookingOptions.withDiscounts`.
 *
 * The rule they are all instances of: **absent is not zero.** A zero is a claim
 * — "nothing was charged". Null is the truth — "this cannot be answered from
 * what was fetched, or you may not see it". (9) is the neighbouring rule:
 * **a comment must not claim a guarantee the code does not provide** — a false
 * guarantee is worse than no guarantee, because the next reader builds on it.
 *
 * ## Money units
 *
 * Postgres stores money as `numeric(14,2)` **in rupees** (0002's header;
 * 0002:199 on `rate`: "Rupees, no sub-rupee values stored"). `lib/money.ts`
 * works in integer paisa. So `rupees(n)` — rupees → paisa, ×100 — is the
 * correct direction at this boundary, the same one `queries/bookings.ts`'s
 * `toPaisa` and `queries/clients.ts` already use. Inverting it is a 100x bug.
 */

type BookingStageDb = Database['public']['Enums']['booking_stage']
type BookingLineTypeDb = Database['public']['Enums']['booking_line_type']
type DeliveryTypeDb = Database['public']['Enums']['delivery_type']
type DiscountSourceDb = Database['public']['Enums']['discount_source']
type ItemQuantityStateDb = Database['public']['Enums']['item_quantity_state']
type ServiceBasisDb = Database['public']['Enums']['service_basis']
type ClientStatusDb = Database['public']['Enums']['client_status']
type ClientTypeParentDb = Database['public']['Enums']['client_type_parent']

/* ── MASKED MONEY · why every money field on this module is nullable ───────
 *
 * `0019_column_level_money_masking.sql:153` revokes SELECT on
 * `(rate, discount_amount, supplier_cost, markup_amount)` on `booking_lines`
 * from `authenticated`, and serves them back through `booking_lines_v`
 * (0019:200, re-emitted with a row predicate at 0048:157) as
 * `case when auth_can_view_money() then rate else null end`.
 *
 * So for the four money-blind roles — Warehouse, Technician, Driver, Client
 * (Law 6; `auth_can_view_money()` in 0014, mirrored by `canViewMoney` in
 * `lib/rbac.ts`) — `rate` and `discount_amount` arrive as **NULL columns on a
 * present row**, not as absent columns and not as an error.
 *
 * ⛔ A masked NULL must never become 0. `Number(null)` is 0, `null ?? 0` is 0,
 * and `0` is a CLAIM — "this line is free". Absent is the truth: "this session
 * is not permitted to know". The generated types already say so
 * (`rate: number | null` on `booking_lines_v.Row`, supabase.ts:10364), and the
 * types below preserve it all the way out: `Paisa | null`, and a subtotal that
 * is `null` the moment any contributing line is masked. There is no default
 * anywhere in this file.
 */

/**
 * Whether a line's `booking_line_units` collection was RETURNED by the query, or
 * merely came back empty — `LinesPresence` one level down, and for the same
 * reason. See `aggregateUnits`.
 *
 *  - `'present'` — the embed was returned. It may hold zero units, and that is a
 *    real state: a Quote has no serials assigned yet.
 *  - `'absent'` — the embed was not returned at all. Every count is `0` because
 *    there was nothing to add up, so no gate may be derived from them.
 */
export type UnitsPresence = 'present' | 'absent'

export interface CanonicalLineUnitStates {
  /**
   * Σ `booking_line_units.qty` — physical units committed to this line, not the
   * number of unit ROWS. A non-serialised row carries qty > 1 (0002:272).
   *
   * `0` is a real and ordinary state — a Quote has no serials assigned yet —
   * **but only when the collection was returned.** ⚠ Check `unitsPresence`
   * first: an embed that did not come back also reads `0` here, and it means
   * "not knowable", not "none committed". Same rule as `lines` / `linesPresence`.
   */
  committedQty: number
  /**
   * Units per state, as COUNTS — deliberately not one summary word.
   *
   * A line reading 3 Ready + 1 Damaged has no single honest state: 'Ready'
   * hides the damage and 'Damaged' condemns three good units. Whichever winner
   * a rule picked, the operator would lose the number they need to act on. So
   * the counts are what this module reports, and any screen that wants a badge
   * derives it *from* them, visibly, at the point it decides.
   *
   * Every one of the five `item_quantity_state` members (0001:42 — Ready,
   * Picked Up, Returned, Missing, Damaged) is always present as a key, so a
   * caller reading `byState.Missing` gets `0` rather than `undefined`.
   */
  byState: Record<ItemQuantityStateDb, number>
  /** Σ qty where `is_required` — the packing gate is defined over these only (0002:275). */
  requiredQty: number
  /**
   * Σ qty where `packed`, over **every** unit — required and optional alike.
   *
   * ⛔ This is NOT the packing gate's numerator and must never be used as one.
   * It is reported because a packing screen wants "how much is in the box";
   * the gate wants "is anything required still out of it", which is a
   * different question over a different population. Use
   * `requiredUnpackedQty` for the gate. See the comment on that field for what
   * conflating the two cost.
   */
  packedQty: number
  /**
   * Σ qty over units that are `is_required` AND are neither `packed` nor in
   * state 'Missing' — precisely the population 0002:288's packing-gate trigger
   * blocks on: *"the booking may not reach 'Ready' while any is_required unit
   * is neither packed nor Missing-with-a-reason."*
   *
   * `0` means the gate passes. This is a per-UNIT predicate summed to a qty,
   * not a comparison between two independent totals, and that distinction is
   * the whole defect it was added to fix.
   *
   * ⛔ WHAT WAS WRONG — do not restore it. The gate read
   * `packedQty + byState.Missing >= requiredQty`. All three tallies range over
   * DIFFERENT populations: `packedQty` counts every packed unit, `byState.Missing`
   * counts every Missing unit, and only `requiredQty` is restricted to
   * `is_required`. So packed OPTIONAL units paid for unpacked REQUIRED ones. A
   * line holding 1 required-unpacked camera body and 1 optional-packed lens cap
   * scored 1 + 0 >= 1 and reported the gate PASSED. The operator sees a green
   * tick and hands over gear that was never packed — the exact "confident,
   * fully-formed, wrong" failure this module exists to make impossible.
   *
   * "Missing-with-a-reason" needs no separate check here: `missing_reason` is
   * forced non-blank whenever `unit_state = 'Missing'` by the CHECK
   * `booking_line_units_missing_needs_reason` (0002:256-259), so a Missing unit
   * that reached the database already carries one. The column is therefore not
   * fetched — reading it back would re-verify a constraint Postgres has already
   * enforced.
   */
  requiredUnpackedQty: number
  /**
   * Σ qty where `damaged`. Separate from `byState.Damaged` on purpose:
   * `damaged` is a boolean column (0002:246) and `unit_state` is an enum, and
   * 0002:282 keys the Closed gate and the Damage Report on the BOOLEAN. A unit
   * can be flagged damaged while its state has moved on to 'Returned'.
   */
  damagedQty: number
}

export interface CanonicalBookingLine {
  id: string
  /**
   * `booking_lines.line_type`, the `booking_line_type` enum (0001:296):
   * Equipment | Bundle | Accessory | Service | Sub-rental | Manual item.
   *
   * NOT `line_kind` (0001:1037), which is `invoice_lines`' enum and shares no
   * member with this one. See the module header for what that mix-up cost.
   */
  lineType: BookingLineTypeDb
  /** `text` **nullable** (0002:133) — only 'Manual item' is forced to carry one (0002:157). */
  description: string | null
  /** `integer not null default 1`, `check (qty > 0)` (0002:134, :152). */
  qty: number
  /** `integer not null default 1`, `check (days >= 1)` (0002:135, :155). Per LINE, not per booking. */
  days: number
  /** `numeric(14,2)` rupees → paisa. **`null` = masked from this session**, never Rs 0. */
  rate: Paisa | null
  /**
   * `booking_lines.discount_amount` — an **AMOUNT in rupees**, not a percent.
   * 0002:201: *"Line discount, subtracted inside step 1. Entirely separate from
   * the booking-level percentage at step 7."*
   *
   * **`null` = masked from this session**, never Rs 0.
   */
  discountAmount: Paisa | null
  /**
   * `qty × rate × days − discount_amount`, in paisa.
   *
   * This formula is **the schema's own**, not an invention here. 0002:177:
   * `constraint booking_lines_discount_within_line check (discount_amount <=
   * qty * rate * days)` — the constraint exists so a line cannot price
   * negative, which only means anything if that expression is the line's gross.
   * There is no stored `line_total` column to disagree with.
   *
   * `null` whenever `rate` or `discountAmount` is masked, and whenever the row
   * contradicts itself — see `netTotalRefusal` and `lineNetTotal`. Not 0.
   *
   * ⚠ `days` does NOT multiply a Flat service. See `lineNetTotal`.
   */
  netTotal: Paisa | null
  /**
   * Why `netTotal` is `null`, when the reason is the row rather than the role.
   *
   * Three states, and callers must tell them apart:
   *
   * | `netTotal` | `netTotalRefusal` | meaning                                   |
   * |------------|-------------------|-------------------------------------------|
   * | a `Paisa`  | `null`            | a real figure                             |
   * | `null`     | `null`            | masked — Law 6, this session sees no money |
   * | `null`     | a sentence        | the row contradicts itself; render this    |
   *
   * A screen showing lines should render the sentence in place of the amount,
   * inline and persistently (Law 12). Do not fall back to a dash, and above all
   * do not fall back to Rs 0 — the whole point is that the amount is *unknown*,
   * which a 0 would deny.
   */
  netTotalRefusal: string | null
  /** `parent_line_id` — self-FK for bundle children (0002:130). */
  parentLineId: string | null
  /**
   * True when this row is a bundle CHILD.
   *
   * 0002:172: `constraint booking_lines_bundle_child_is_free check
   * (parent_line_id is null or (rate = 0 and discount_amount = 0))` — a child
   * prices at zero and the Bundle line carries the rate. So summing `netTotal`
   * across **every** live line cannot double-count a bundle: the children
   * contribute exactly 0 by database constraint, not by this module skipping
   * them. Skipping them would be the more dangerous shape, because it would
   * also silently drop any child that ever did carry a rate. Exposed as a flag
   * so a screen can indent children, and so `linesSubtotal`'s test can prove
   * the parent/child pair sums once.
   *
   * ⚠ That CHECK proves the sum cannot DOUBLE-count a bundle. It proves nothing
   * about the sum being SHORT one, which is the direction `isBundleParentLive`
   * exists for — read it too.
   */
  isBundleChild: boolean
  /**
   * For a bundle CHILD: whether its parent line is among this booking's live
   * lines. `null` on any row that is not a child.
   *
   * `false` is an ORPHAN, and it is a money defect, not a display one. See the
   * ORPHANED BUNDLE CHILDREN block. When it is `false` this line's `netTotal` is
   * `null` and `netTotalRefusal` carries the sentence to render.
   */
  isBundleParentLive: boolean | null
  /**
   * `is_included` — an included accessory prices at 0 while still occupying
   * stock and appearing on the packing list (0002:203).
   *
   * ⚠ Unlike `isBundleChild`, this has **no CHECK behind it** — nothing in any
   * migration forces `rate = 0` when it is true. So this flag and `rate` can
   * disagree, and when they do `netTotal` refuses rather than picking one. Read
   * `lineNetTotal`'s TODO(decision) 2 before changing that. The previous version
   * of this file documented the flag exactly as above and then priced the line
   * as though the flag were not there.
   */
  isIncluded: boolean
  /**
   * `service_basis` — 'Flat' | 'Per day'. Non-null only on Service lines
   * (0002:167 — the CHECK is one-directional: it forces the basis to be present
   * on a Service line, and does not forbid one elsewhere).
   *
   * ⚠ This **changes the arithmetic**: a Flat line is charged once, not once per
   * day. See `lineNetTotal`.
   */
  serviceBasis: ServiceBasisDb | null
  /** `sort_order` — stable display order, and the order Auto Assign Serials walks (0002:205). */
  sortOrder: number
  /**
   * Whether this line's `booking_line_units` embed came back at all — **read
   * this before reading any count in `units`.**
   *
   * `units` reads all-zero in both the `'absent'` case and the genuinely-empty
   * one, exactly as `lines: []` cannot distinguish its two cases. This field
   * does. See `aggregateUnits` for what conflating them produced.
   */
  unitsPresence: UnitsPresence
  /** Per-unit state, as counts. See `CanonicalLineUnitStates` and `unitsPresence`. */
  units: CanonicalLineUnitStates
}

/**
 * Whether the line collection was RETURNED by the query, or merely came back
 * empty. The two are not the same fact and this module must never conflate
 * them — see the block above `linesPresence` in `toCanonical` for the full
 * reasoning and for what conflating them cost.
 *
 *  - `'present'` — the embed was returned. It may hold zero lines, and that is a
 *    real, priceable Rs 0 (a Quote with nothing added, or a booking whose every
 *    line has been voided under Law 3).
 *  - `'absent'` — the embed was not returned at all. Nothing about this
 *    booking's money is knowable, and every derived figure is `null`.
 */
export type LinesPresence = 'present' | 'absent'

/**
 * A row of `booking_discounts` — **the sole home of booking-level discount**
 * (0002:570). See THE MONEY SEAM below for what this is and is not.
 */
export interface CanonicalBookingDiscount {
  id: string
  source: DiscountSourceDb
  /** `numeric(5,2)`. A PERCENTAGE, so it stays numeric (money.ts §2.3). Capped at 25 per row and 25 stacked (0002:593). */
  percent: number
  reason: string | null
  approverId: string | null
  appliedAtAd: string
  couponId: string | null
}

export interface CanonicalClient {
  id: string
  /** `clients.client_code` — `CL-YYYY-NNNN` (0005:41, format CHECK at :89). NOT `client_no`. */
  clientCode: string
  /** `clients.name` (0005:44). There is no `full_name` and no `company_name` — "There is no separate companies table" (0005:36). */
  name: string
  /** `clients.phone` — the unique client identifier, not email (0005:45, unique at :84). NOT `mobile`. */
  phone: string
  /** `clients.email` — **nullable** (0005:46). */
  email: string | null
  /** `clients.pan_vat` — nullable, 9 digits (0005:47, CHECK at :93). NOT `pan_vat_no`. */
  panVat: string | null
  /** `clients.type_parent` — **nullable** (0005:42); not defaulted to 'Individual' here, which would be an invented fact. */
  typeParent: ClientTypeParentDb | null
  status: ClientStatusDb
}

/**
 * The parts of `money.ts`'s `PriceInput` this module can honestly source, and
 * — as `null` — the parts it cannot. Read THE MONEY SEAM before using it.
 */
export interface CanonicalEngineInput {
  /** Σ netTotal over live Equipment / Bundle / Accessory / Manual item lines. `null` if any is masked. */
  equipment: Paisa | null
  /** Σ netTotal over live Sub-rental lines. `null` if any is masked. */
  subRental: Paisa | null
  /** Σ netTotal over live Service lines. `null` if any is masked. */
  services: Paisa | null
  /** Σ netTotal over ALL live lines — what `price()` will add up. `null` if any is masked. */
  linesSubtotal: Paisa | null
  /**
   * Σ `booking_discounts.percent` for this booking.
   *
   * **`null` means "the discount rows were not read", not "0%".** They are read
   * only when the caller passes `withDiscounts` AND the embed comes back.
   *
   * ⚠ `withDiscounts` is a REQUEST, not a proof — see the honest account on
   * `FetchCanonicalBookingOptions.withDiscounts`. A money-blind session that
   * passes it gets `[]` from `booking_discounts_money_blind` (0036:132, `for all
   * using (auth_can_view_money())`, a WHOLE-ROW policy) and therefore a `0` here
   * that may be wrong. What keeps that harmless is a SEPARATE fact, not this
   * flag: 0019 masks `booking_lines_v.rate` for the same four roles, so every
   * live line's `netTotal` is `null`, every bucket is `null`, and
   * `priceCanonicalBooking` refuses before the discount is ever used. Read the
   * note on `withDiscounts` before relying on either half.
   */
  discountPercent: number | null
  /**
   * **Always `null`.** Crew is `booking_crew_lines` (0002:314) — a different
   * table with a different priced shape (day_rate + overtime + accommodation +
   * meals), masked through `booking_crew_lines_v` (0036). Not fetched here.
   */
  crew: null
  /**
   * **Always `null`.** Transport is `booking_transport` (0002:373) —
   * `delivery_charge` + `fuel_charge`, one row per booking. Not fetched here,
   * and note it is UNMASKED money on a base table: no `booking_transport_v`
   * exists in any of the 54 migrations, and its only policies (0054:144-150)
   * are INSERT/UPDATE. Naming those columns in a select hands rupees to the
   * warehouse floor, exactly like `bookings.deposit_required`.
   */
  transport: null
  /**
   * **Always `null`.** No VAT rate exists per booking. See THE MONEY SEAM.
   */
  vatPercent: null
  /**
   * **Always `null`.** Payments are `payments` (0006:176), gated by
   * `payments_select using (auth_is_finance_or_admin())` (0011:61) — NARROWER
   * than money-visibility, so even a Coordinator can get zero rows. Summing an
   * empty result to Rs 0 would report "nothing paid" and therefore a full
   * Outstanding. Not fetched here.
   */
  payments: null
}

export interface CanonicalBooking {
  id: string
  bookingNo: string
  stage: BookingStageDb
  /** 1-based ordinal over the canonical six, derived from `workflow.ts`'s `order`. */
  stageNumber: number
  /** `bookings.project` (0002:29), nullable. NOT `project_title`. */
  project: string | null
  /** `bookings.pickup_at` (0002:31) — timestamptz, AD/UTC. NOT `pickup_datetime`. */
  pickupAtAd: string
  /** `bookings.return_at` (0002:32) — the EXPECTED return. NOT `return_datetime`. */
  returnAtAd: string
  /** `bookings.actual_return_at` (0002:33) — nullable; set by the Return workspace. */
  actualReturnAtAd: string | null
  /**
   * `bookings.delivery_type`, the `delivery_type` enum (0002:34, 0001:279):
   * 'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'.
   *
   * ⚠ These are **Postgres enum members, not UI copy.** Law 17 ("the word
   * customer appears nowhere in the UI") governs what the operator READS — the
   * screens correctly label this option *Client Pickup* — and does not govern
   * what Postgres STORES. Renaming the literal to match the label requires a
   * migration that ALTERs the enum. Comparing against `'Client Pickup'` can
   * never be true and is a booby trap; that exact leak was found in this file
   * on 11 Aug 2026.
   *
   * There is NO `bookings.delivery_method` column — `delivery_method`
   * (0001:33) is a second enum with the same members, used by
   * `operation_sessions.delivery_method`. 0002:88 calls `delivery_type` "the
   * single home for delivery mode". The old code here read `delivery_method`
   * off `bookings`, got `undefined`, and used it to gate whether transport was
   * charged.
   */
  deliveryType: DeliveryTypeDb
  /** `bookings.pickup_location` — free text, nullable (0002:35). Not a branch FK. */
  pickupLocation: string | null
  /** `bookings.return_location` — free text, nullable (0002:36). */
  returnLocation: string | null
  /** `bookings.quote_expires_at` — nullable (0002:37). `null` is "no expiry set", not "expired". */
  quoteExpiresAtAd: string | null
  /** `bookings.version` — optimistic lock, rendered "v4" (0002:100). */
  version: number
  /** `bookings.created_at` (0002:46). The row's insert instant, NOT the Booked-stage transition time. */
  createdAtAd: string
  /** 'Cancelled' is a FLAG, not a stage (0015). It lives in `cancelled_at`. */
  isCancelled: boolean
  cancellationReason: string | null
  /** `closed_at` — Closed is final; once set no further transition is accepted (0002:96). */
  isClosed: boolean
  /**
   * `bookings.deposit_required` — `numeric(14,2)` rupees → paisa.
   *
   * **`null` means "this caller did not ask for it", not "no deposit".** Only
   * ever non-null when `withDeposit` was passed. See DEPOSIT below — this is
   * unmasked money on a base table and the most dangerous column in the file.
   *
   * A stated liability, never part of Rental Total or Outstanding (Law 5;
   * 0002:90).
   */
  depositRequired: Paisa | null
  client: CanonicalClient
  /**
   * Whether the line embed came back at all — **read this before reading
   * `lines`, `units` or any money figure.**
   *
   * `lines` is `[]` in both the `'absent'` and the empty-but-`'present'` case,
   * because the array shape cannot carry the distinction. This field does. When
   * it is `'absent'` every money figure below is `null` and the line-derived
   * gates are `null`; when it is `'present'` an empty `lines` is a genuine,
   * priceable Rs 0.
   */
  linesPresence: LinesPresence
  /**
   * Live (non-voided) lines, sorted by `sort_order`. See LIVE LINES.
   *
   * ⚠ `[]` is ambiguous on its own — check `linesPresence` first. An empty array
   * means "this booking has no live line" only when `linesPresence` is
   * `'present'`.
   */
  lines: CanonicalBookingLine[]
  /**
   * `booking_discounts` rows. **`null` means "not requested, or requested and
   * not returned" — never "no discount"**; see
   * `CanonicalEngineInput.discountPercent`. An empty array means the rows were
   * read and there are none, which is a real 0%.
   */
  discounts: CanonicalBookingDiscount[] | null
  /**
   * Whether the stored discount rows are consistent with the cap the database
   * enforces on them, and the sentence to render when they are not.
   *
   * `null` means the rows were not read — it does **not** mean "no violation".
   * See THE DISCOUNT CAP.
   */
  discountIntegrity: CanonicalDiscountIntegrity | null
  /**
   * Whether every live line's bundle parent is also live, and the sentence to
   * render when one is not.
   *
   * `null` means the lines were not returned — it does **not** mean "no
   * orphan". See ORPHANED BUNDLE CHILDREN.
   */
  bundleIntegrity: CanonicalBundleIntegrity | null
  /**
   * Whether every live line's unit collection came back — **read this before
   * reading any count in `units`, and before trusting the three line-derived
   * gates.**
   *
   * `'absent'` when the lines themselves were not returned, OR when any live
   * line's `booking_line_units` embed was not returned. `'present'` therefore
   * means exactly "every live line's units are accounted for", including the
   * case of no live lines at all — there is nothing left un-returned. That is
   * deliberately not a third state: a flag whose `'present'` sometimes means
   * "nothing was read" is the ambiguity `linesPresence` was created to remove,
   * and reintroducing it here would put it one level down where it is harder to
   * see.
   */
  unitsPresence: UnitsPresence
  /**
   * Booking-wide roll-up of every line's unit states. Same counts-not-a-winner
   * rule.
   *
   * ⚠ This is a roll-up over the lines that were RETURNED. When `linesPresence`
   * or `unitsPresence` is `'absent'` every count here is 0 because there was
   * nothing to add up, not because the booking holds no units — read it together
   * with those fields, the way the gates below do.
   */
  units: CanonicalLineUnitStates
  /** What can be handed to the Financial Engine, and what is missing. */
  engineInput: CanonicalEngineInput
  /**
   * The gates that are actually derivable from the rows fetched here.
   *
   * ⛔ The previous version returned an object with `receiverVerified: true`,
   * `equipmentPacked: true`, `documentsReady: true` and
   * `signaturesComplete: true` — four hardcoded `true`s, sourced from nothing.
   * A checklist that always says "ready" is worse than no checklist: it is a
   * green tick in front of an operator about to hand over unpacked gear. The
   * three with no source in this query are gone rather than faked; where they
   * would come from is recorded in the TODO(decision) below.
   */
  gates: CanonicalBookingGates
}

/**
 * ⚠ The first three gates are `boolean | null`, and the `null` is load-bearing:
 * it means the collection the gate is derived from was not returned — the LINES
 * (`linesPresence`) or, one level down, any live line's UNITS
 * (`unitsPresence`) — so the gate is UNKNOWN.
 *
 * ⛔ Do not write `if (gates.hasDamagedUnit)` and let the falsy `null` read as
 * "no damage" — that is the absent-becomes-zero failure this module is shaped
 * against, and on a handover screen it points the dangerous way. Test for `null`
 * explicitly and render "not known", never a tick and never a cross.
 */
export interface CanonicalBookingGates {
  /**
   * The packing gate, 0002:288 verbatim: the booking may not reach 'Ready'
   * while any `is_required` unit is neither packed nor Missing-with-a-reason.
   * Evaluated here over live lines' units, as `units.requiredUnpackedQty === 0`.
   *
   * `null` when `linesPresence` is `'absent'`: there was nothing to derive it
   * from, and `[].every(…)` — which is what this used to reduce to — is `true`
   * for any predicate, so absence produced a pass.
   *
   * `null` for the same reason when `unitsPresence` is `'absent'` — a line whose
   * unit embed did not come back counts `requiredUnpackedQty` as 0, and `0 === 0`
   * is a PASS. That is the identical failure one level down, and it is the one
   * `aggregateUnits`'s old `?? []` produced.
   *
   * ⛔ The predicate is per UNIT — `is_required && !packed && state <> 'Missing'`
   * tested on ONE row — and must stay that way. It was previously
   * `packedQty + byState.Missing >= requiredQty`, three tallies over three
   * different populations, only one of which was restricted to `is_required`.
   * Packed OPTIONAL units therefore satisfied the gate for unpacked REQUIRED
   * ones and this read `true`, in front of an operator about to hand over gear
   * that was never packed. See `CanonicalLineUnitStates.requiredUnpackedQty`.
   */
  requiredUnitsPacked: boolean | null
  /**
   * Any unit with `damaged` — blocks Closed until charges are settled
   * (0002:282). `null` when the lines or any line's units were not returned;
   * `false` there would assert "nothing is damaged" from nothing read.
   */
  hasDamagedUnit: boolean | null
  /**
   * Any unit in state 'Missing' — blocks Completed (0002:291). `null` when the
   * lines or any line's units were not returned.
   */
  hasMissingUnit: boolean | null
  /**
   * Derived from stage, not from a column: 'On Rent' or later in the canonical
   * six. Pre-0015 this read On Rent | Completed | Closed; 0015:114-116 collapses
   * Inspection, Cleaning and Completed all onto 'Returned'.
   */
  itemsWithClient: boolean
}

/*
 * TODO(decision) — three handover gates have no source in this schema, so they
 * are ABSENT here rather than defaulted:
 *   - `receiverVerified` — who may collect is `bookings.authorized_contact_id`
 *     (0002:28) plus an authorisation letter for a representative (0002:79),
 *     but nothing records that the check was PERFORMED. Probably belongs on
 *     `operation_sessions`, which has no such column today.
 *   - `documentsReady` — 0002:727 states the rule ("fails while any document
 *     the mandatory-documents matrix requires ... has no link here in an Issued
 *     or Signed state") but the matrix itself is not in the schema, and the
 *     document lifecycle lives in the document registry, not `booking_documents`.
 *   - `signaturesComplete` — signatures are per unit AND per session
 *     (`booking_line_units.handover_session_id`, 0002:277: "a later session is
 *     never covered by an earlier session's signature"), so "complete" needs a
 *     rule about which sessions count. Unruled.
 * Each needs a product ruling and probably a migration. Add to PLAN.md §4.
 */

/* ── LIVE LINES · Law 3 ────────────────────────────────────────────────────
 *
 * Nothing is deleted. A removed line is VOIDED — `booking_lines.voided_at`
 * (0002:145, :207 "The Remove row action sets this"), carried through to
 * `booking_lines_v` unchanged (0048:189). Voided lines must not be priced and
 * must not be counted, so the embed filters them in place with
 * `.is('booking_lines_v.voided_at', null)`.
 *
 * PostgREST filters an EMBEDDED resource in place: the booking row still comes
 * back, holding only its live lines. This is the same mechanism
 * `queries/bookings.ts` uses for its item count.
 *
 * The filter is stated TWICE, on purpose, and both statements are load-bearing:
 *
 *   1. on the embed, so voided rows never cross the wire; and
 *   2. in `isLiveLine`, applied by `toCanonical` itself.
 *
 * (2) exists because `toCanonical` is exported. Without it, any caller mapping
 * rows fetched another way included voided lines in the totals and on the
 * packing list, with no error — the filter used to live only in (1). Do not
 * delete either as "redundant": (1) without (2) leaves the exported mapper
 * unguarded, and (2) without (1) ships removed lines to the client before
 * discarding them. The test suite pins the exact filter call.
 */

/* ══ ORPHANED BUNDLE CHILDREN · where the free-child CHECK stops helping ═══
 *
 * `isBundleChild`'s doc reasons from `booking_lines_bundle_child_is_free`
 * (0002:171-173) that summing `netTotal` over every live line cannot
 * DOUBLE-count a bundle: the children are `rate = 0` by CHECK, so only the
 * Bundle line's rate is in the sum. That is true, and it is only half the
 * question. The other half is whether the sum can be SHORT one bundle, and the
 * same CHECK is silent about it.
 *
 * ⛔ WHAT WAS WRONG — the module leaned on that CHECK as though it proved the
 * sum correct in both directions. **Nothing cascades `voided_at` from a bundle
 * parent to its children** — verified across all 55 migrations on 12 Aug 2026:
 * `parent_line_id` appears in exactly five places (the column at 0002:130, the
 * free-child CHECK at :172, `booking_lines_not_own_parent` at :190, the column
 * comment at :195, and two view column lists at 0019:202 / 0048:162). No
 * trigger, no CHECK, no view predicate propagates the void.
 *
 * So this row shape is reachable, today, from a single Remove action:
 *
 *   Bundle 'Doc Kit'      rate 10,000   voided_at 2026-08-09   ← removed
 *     └ Alexa Mini        rate 0        voided_at NULL         ← still live
 *     └ Tripod            rate 0        voided_at NULL         ← still live
 *
 * The parent is filtered out — at the database by
 * `.is('booking_lines_v.voided_at', null)`, and again by `isLiveLine` — while
 * the Rs 0 children stay. Nothing errors. The Rs 10,000 simply leaves the
 * subtotal and the booking composes a smaller, self-consistent, confident
 * total, with the kit's contents still listed on the screen and still on the
 * packing list. That is this module's signature failure exactly: not a crash,
 * a plausible wrong number.
 *
 * ## Detection — the parent is ABSENT, not present-and-voided
 *
 * The naive check is "is my parent's `voided_at` set". It cannot be written:
 * the query filters live lines AT THE DATABASE, so an orphan's parent is not in
 * the returned set at all and there is no row to inspect. The check is
 * therefore over the live lines' OWN ids: a child whose `parent_line_id` is not
 * among them is an orphan, whether the parent was voided, filtered by the
 * view's row predicate (0048:194), or lives on another booking (0002:210 marks
 * the same-booking rule "TRIGGER REQUIRED", and that trigger does not exist
 * either — so a cross-booking parent is also reachable and is also a defect).
 *
 * ## Refuse, and also report — not one or the other
 *
 * The choice offered was "refuse" or "report the orphan explicitly". Doing only
 * one leaves half the hole, the same way the discount cap does (see THE
 * DISCOUNT CAP, which this deliberately mirrors):
 *
 *   - reporting alone still lets a total render, and a total that is short by a
 *     bundle is the number the operator will act on; while
 *   - refusing alone hides WHAT is wrong — "this booking cannot be priced" with
 *     no way for the screen to say which line, on the one screen most likely to
 *     catch a data defect.
 *
 * So both. The orphan's own `netTotal` becomes `null` with a `netTotalRefusal`
 * sentence — which propagates through `sumNet` to every bucket and makes
 * `priceCanonicalBooking` refuse through machinery that already exists — and
 * `CanonicalBooking.bundleIntegrity` names the orphaned lines so a screen can
 * mark them.
 *
 * ⚠ Note the refusal is placed on the CHILD, not on the booking as a whole,
 * even though the money that went missing belonged to the parent. That is on
 * purpose: the child is the row that is actually on screen and actually wrong,
 * and it is the row an operator can act on (restore the bundle, or remove the
 * children too). The parent cannot be pointed at — it is not in the result.
 *
 * TODO(decision) — the real fix is upstream and is a migration, deliberately
 * not written here: either Remove-on-a-Bundle voids its children in the same
 * statement, or a trigger forbids voiding a parent while a child is live.
 * Which of the two is a product ruling about what Remove means on a kit. Until
 * then this refuses. Add to PLAN.md §4.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Whether every live bundle child on this booking still has a live parent, and
 * what to say when one does not.
 *
 * `null` on `CanonicalBooking.bundleIntegrity` means the lines were not read at
 * all. It never means "there is no orphan".
 */
export interface CanonicalBundleIntegrity {
  /**
   * `booking_lines.id` of every live line whose `parent_line_id` is not among
   * this booking's live lines. Empty when there is no orphan.
   */
  orphanedChildIds: string[]
  /** Sentence to render inline (Law 12) when there is an orphan; `null` otherwise. */
  message: string | null
}

/* ── DEPOSIT · why it is opt-in and off by default ─────────────────────────
 *
 * ⛔⛔ `bookings.deposit_required` IS UNMASKED MONEY ON A BASE TABLE. ⛔⛔
 *
 * Verified, and identical to the reasoning in `queries/bookings.ts`: no
 * `revoke select (...) on bookings` exists in any migration, and there is no
 * `bookings_v` view anywhere in 0001-0054. Meanwhile `bookings_select`
 * (0020:102) is `using (auth_is_staff())` and `auth_is_staff()` (0014:65) is
 * `auth_user_role() <> 'Client'` — so all eight internal roles, INCLUDING the
 * three Law 6 declares money-blind (Warehouse, Technician, Driver), can read
 * every booking row. Naming `deposit_required` in a select hands a real rupee
 * figure to the warehouse floor. Postgres will not stop it.
 *
 * Until a `bookings_v` exists the ONLY protection is this module refusing to
 * ask. Hence opt-in, default off; callers gate on `useCanViewMoney()`
 * (`lib/moneyVisibility.ts`), which mirrors `auth_can_view_money()`.
 *
 * TODO(persistence): add `bookings_v` masking `deposit_required` the way 0019
 * masks `booking_lines.rate`, then make this unconditional and delete the flag.
 * That is a migration, deliberately not written here. Same item as
 * `queries/bookings.ts`'s — one fix closes both.
 */

/* ══ THE MONEY SEAM ════════════════════════════════════════════════════════
 *
 * `price()` in `lib/money.ts:125` takes ONE booking-level `discountPercent` and
 * applies it to the WHOLE subtotal, then one `vatPercent`. This module must
 * hand it real values or hand it nothing. It hands it nothing, and here is
 * exactly which parts are settled and which are not.
 *
 * ── SETTLED BY THE SCHEMA, not decided here ──
 *
 * The two discounts are different things and the migration says so outright.
 *
 *   - Per-line `booking_lines.discount_amount` is an amount in rupees, and
 *     0002:201 states its scope: *"Line discount, subtracted inside step 1.
 *     Entirely separate from the booking-level percentage at step 7."* So a
 *     line's net is `qty × rate × days − discount_amount` and the Subtotal is
 *     the sum of those nets. Nothing is back-computed.
 *
 *   - Booking-level discount is a PERCENTAGE and it DOES have a home:
 *     `booking_discounts` (0002:575), whose header calls it *"The sole home of
 *     booking-level discount"*. Its `booking_id` column comment (0002:608)
 *     places it in the calculation order: *"Discount is step 7, applied to the
 *     booking Subtotal, before VAT."* It stacks — `percent`'s own comment
 *     (0002:610) is *"Capped at 25 per row and at 25 summed across stacked
 *     rows"*, so the booking's rate is `sum(percent)` — is hard-capped at 25
 *     both per row and
 *     summed, and above 10 needs a ≥10-char reason and a named approver — the
 *     same three rules `money.ts`'s `DISCOUNT_CAP`, `DISCOUNT_APPROVAL_THRESHOLD`
 *     and `discountGate()` implement, enforced as table CHECKs and a trigger so
 *     no role including Owner can bypass them.
 *
 * So the engine's `discountPercent` is `Σ booking_discounts.percent`, and
 * `equipment` is already NET of line discounts. Back-computing
 * `discountPercent = Σ discount_amount / subtotal × 100` — the lossy option —
 * is not merely inadvisable, it is contradicted by the schema: it would apply
 * the line discounts twice, once inside step 1 and again at step 7.
 *
 * ── NOT SETTLED — TODO(decision) ×3 ──
 *
 * TODO(decision) 1 · **VAT has no source.** `money.ts:94` says the rate comes
 *   "from Settings ▸ Finance, never hardcoded". There is no VAT column on
 *   `bookings` and no finance-settings table holding a rate. The two places 13%
 *   appears are both downstream and both problematic as a source:
 *     - `invoices.vat_rate numeric(5,4) not null default 0.1300` (0006:92) —
 *       exists only once an invoice does, so a Quote has none, and it is a
 *       FRACTION not a percentage (the 100x trap described in the header).
 *     - `recalculate_invoice_totals()` (0010:170) hardcodes `round(v_taxable *
 *       0.13, 2)` — the exact thing money.ts:94 forbids, and it means the
 *       database and the engine could disagree if Settings ever moves.
 *   Whether the rate lives in a Settings table, on the booking, or on the
 *   invoice — and what a Quote uses before an invoice exists — is a product
 *   decision. `vatPercent` is therefore `null` here and 13 is NOT hardcoded.
 *
 * TODO(decision) 2 · **Crew and transport are not fetched.** `PriceInput` has
 *   `crew` and `transport` slots; both live in tables this module does not
 *   read (`booking_crew_lines`, `booking_transport`). §2.1's "Rs 0 on client
 *   pickup" rule also needs `booking_transport.zero_charge_override_by`
 *   (0002:383) to be honoured, which is its own gate. Whether the single
 *   booking query should span all three tables — and pay for that on every
 *   surface — or whether crew/transport are separately fetched, is a product
 *   and performance call. Until then they are `null`, so a total cannot be
 *   computed from a partial subtotal.
 *
 * TODO(decision) 3 · **Payments are not fetched** (see
 *   `CanonicalEngineInput.payments`), so Outstanding cannot be computed either.
 *   Whether the detail surface reads `payments` directly or through a finance
 *   module is unsettled; what is settled is that summing a policy-emptied
 *   result to Rs 0 is not an option.
 *
 * ── THE INTERIM, chosen so it cannot report a wrong number ──
 *
 * `fetchCanonicalBooking` reports the FACTS and no total. `priceCanonicalBooking`
 * is the only path to a `PriceBreakdown`, it takes every unsourceable figure as
 * an EXPLICIT argument the caller must supply from a ruled source, and it
 * REFUSES with a stated reason — never a fallback — when anything is missing or
 * masked. Reporting nothing is sanctioned; reporting a plausible wrong Rental
 * Total is not.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Columns, named explicitly. `select('*')` on a joined query is how a masked
 * column leaks back in — and on `booking_lines` it is worse than a leak: the
 * base table's money columns are REVOKED from `authenticated` (0019:153), so a
 * `*` there is a hard permission error, not a wide result.
 *
 * Money on lines is read through **`booking_lines_v`**, never `booking_lines`.
 * That is not a style preference: 0019 revokes the four money columns from the
 * shared application role outright, so `select rate from booking_lines` fails
 * for every authenticated session including Owner. The view is the only path
 * back to a value, and it re-applies the per-role check per row.
 *
 * `booking_lines_v` exposes exactly the base table's columns (0048's
 * post-condition asserts 23 of them), so every name below is checkable against
 * `create table booking_lines` as well as against the view.
 */
const COLUMNS =
  'id, booking_no, client_id, project, stage, pickup_at, return_at, actual_return_at, ' +
  'delivery_type, pickup_location, return_location, quote_expires_at, ' +
  'cancelled_at, cancellation_reason, closed_at, version, created_at, ' +
  'clients ( id, client_code, name, phone, email, pan_vat, type_parent, status ), ' +
  'booking_lines_v ( ' +
  'id, line_type, parent_line_id, description, qty, days, rate, discount_amount, ' +
  'is_included, service_basis, sort_order, voided_at, ' +
  'booking_line_units ( id, qty, unit_state, is_required, packed, damaged ) ' +
  ')'

/** The `deposit_required` variant. Never reached unless the caller passed `withDeposit`. */
const COLUMNS_WITH_DEPOSIT = `${COLUMNS}, deposit_required`

/**
 * `booking_discounts` embed. Opt-in for a different reason than the deposit:
 * the rows are already safe (whole-row `auth_can_view_money()`, 0036:132), but
 * an EMPTY result from a money-blind session is indistinguishable from a
 * booking with no discount. Not asking is what keeps `discountPercent` `null`
 * ("not knowable") by default; asking is what makes an empty result mean 0%.
 *
 * ⚠ Asking does not make the asker entitled to an answer — see the honest
 * account on `FetchCanonicalBookingOptions.withDiscounts`.
 */
const DISCOUNT_EMBED =
  'booking_discounts ( id, discount_source, percent, reason, approver_id, applied_at, coupon_id )'

/* ── Raw row shapes, exactly as PostgREST returns them ─────────────────── */

export interface RawUnit {
  id: string
  /** `integer not null default 1`, `check (qty > 0)` (0002:254). */
  qty: number
  unit_state: ItemQuantityStateDb
  is_required: boolean
  packed: boolean
  damaged: boolean
}

export interface RawLine {
  /** Nullable in the generated view type — Postgres cannot prove NOT NULL through a view. */
  id: string | null
  line_type: BookingLineTypeDb | null
  parent_line_id: string | null
  description: string | null
  qty: number | null
  days: number | null
  /** `numeric(14,2)` RUPEES, or **NULL when masked** (0019:204). */
  rate: number | null
  /** `numeric(14,2)` RUPEES — an amount. **NULL when masked** (0019:205). */
  discount_amount: number | null
  is_included: boolean | null
  service_basis: ServiceBasisDb | null
  sort_order: number | null
  voided_at: string | null
  booking_line_units: RawUnit[] | null
}

export interface RawDiscount {
  id: string
  discount_source: DiscountSourceDb
  percent: number
  reason: string | null
  approver_id: string | null
  applied_at: string
  coupon_id: string | null
}

export interface RawBooking {
  id: string
  booking_no: string
  client_id: string
  project: string | null
  stage: BookingStageDb
  pickup_at: string
  return_at: string
  actual_return_at: string | null
  delivery_type: DeliveryTypeDb
  pickup_location: string | null
  return_location: string | null
  quote_expires_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  closed_at: string | null
  version: number
  created_at: string
  /** `numeric(14,2)` RUPEES. Absent from the row unless `withDeposit` was set. */
  deposit_required?: number | null
  clients: RawClient | null
  booking_lines_v: RawLine[] | null
  /** Absent unless `withDiscounts` was set. */
  booking_discounts?: RawDiscount[] | null
}

export interface RawClient {
  id: string
  client_code: string
  name: string
  phone: string
  email: string | null
  pan_vat: string | null
  type_parent: ClientTypeParentDb | null
  status: ClientStatusDb
}

/* ── Mapping ───────────────────────────────────────────────────────────── */

/** `typeof` + value, for an error message that says what actually arrived. */
function describe(v: unknown): string {
  return `${typeof v} ${String(v)}`
}

/**
 * `numeric` rupees → `Paisa`, **preserving null**.
 *
 * The single most important function in this file. `null` in means `null` out:
 * a masked column is not Rs 0. Written as its own named function so there is
 * exactly one place a `?? 0` could ever be added, and one place a reviewer has
 * to look to be sure none was.
 *
 * ⛔ WHAT WAS WRONG — do not restore it. This tested `n === null || n ===
 * undefined` and **nothing else**, so any value that was neither fell straight
 * through to `rupees(n)`. `rupees(NaN)` is `Math.round(NaN * 100)` = `NaN`, and
 * `NaN` is a `Paisa` as far as the type system is concerned — the brand is a
 * compile-time tag, not a validation. From there `NaN` survives every step of
 * `price()` (add, round, subtract), renders through `formatMoney` as `Rs NaN`,
 * and — worse than rendering — makes every comparison against it silently
 * false, so an `outstanding > 0` check reports a fully-paid booking.
 *
 * A value that is neither NULL nor a finite number is not a data state this
 * module can legitimately be in: `numeric` columns arrive from PostgREST as JSON
 * numbers or as JSON null, and nothing else. So this throws, naming the column,
 * rather than either manufacturing a number or quietly degrading to `null` —
 * degrading would be a lie about WHY the figure is missing, and would send a
 * schema defect down the same path as a Law 6 mask.
 *
 * If PostgREST ever does start returning `numeric` as a string (money.ts §2.3
 * warns that the raw Postgres driver does), the fix is one deliberate conversion
 * HERE, where it is visible and testable — never a `parseFloat` at a call site.
 */
function toPaisa(column: string, n: number | null | undefined): Paisa | null {
  if (n === null || n === undefined) return null
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(
      `bookingQuery: ${column} came back as ${describe(n as unknown)}, which is neither NULL nor a ` +
        'finite number. A numeric column arrives as a JSON number or JSON null; anything else is a ' +
        'query, view or driver defect. Refusing to convert it rather than letting NaN reach a ' +
        'rendered total, where it would neither throw nor compare.',
    )
  }
  return rupees(n)
}

const EMPTY_STATE_COUNTS: Record<ItemQuantityStateDb, number> = {
  Ready: 0,
  'Picked Up': 0,
  Returned: 0,
  Missing: 0,
  Damaged: 0,
}

function emptyUnitStates(): CanonicalLineUnitStates {
  return {
    committedQty: 0,
    byState: { ...EMPTY_STATE_COUNTS },
    requiredQty: 0,
    packedQty: 0,
    requiredUnpackedQty: 0,
    damagedQty: 0,
  }
}

/** One line's unit counts, together with whether the collection was RETURNED. */
interface LineUnits {
  presence: UnitsPresence
  states: CanonicalLineUnitStates
}

/**
 * Units → counts. Every tally is over `qty`, never over rows: one
 * non-serialised row can represent 12 units (0002:272), and counting it as 1
 * under-reports — the dangerous direction, because a packing list short by 11
 * sends the crew out short by 11.
 *
 * ⛔ WHAT WAS WRONG — do not restore `units ?? []`. This function applied, one
 * level down, exactly the `?? []` the lines path was fixed to stop applying: a
 * unit collection that was NOT RETURNED became the same empty array as a line
 * that genuinely has no units committed, and every count fell out as `0`. Those
 * zeroes then fed the packing gates, and `requiredUnpackedQty === 0` reads as
 * **the gate PASSES** — a green tick sourced from an embed that never arrived,
 * in front of an operator about to hand over gear. `hasDamagedUnit: false` and
 * `hasMissingUnit: false` are the same lie pointing the other way.
 *
 * The counts still come back as zeroes (the shape cannot carry the
 * distinction, exactly as `lines: []` cannot), so the fact is carried alongside
 * them as `presence` — the same discipline, and the same reason, as
 * `linesPresence`. `CanonicalBookingLine.unitsPresence` exposes it per line and
 * `CanonicalBooking.unitsPresence` rolls it up; the gates read the roll-up and
 * return `null` rather than a tick.
 *
 * Two guards on the row itself, for the same reason `toLine` guards `qty` and
 * `days`:
 *
 *  1. `qty` is `integer not null` with `check (qty > 0)` (0002:234, :254), and
 *     EVERY count here is `+= u.qty`. A NaN, a fraction or a negative does not
 *     fail anywhere — it silently becomes `committedQty`, `requiredQty`,
 *     `requiredUnpackedQty` and the gate derived from them. One NaN unit makes
 *     `requiredUnpackedQty` NaN, and `NaN === 0` is false, so the gate reports
 *     BLOCKED for a booking that may be fully packed; one negative unit
 *     subtracts from the blocking count and can cancel a genuinely unpacked
 *     required unit back to 0, which reports PASSED. Both are the fully-formed
 *     wrong answer this module exists to make impossible, so it refuses.
 *  2. An `unit_state` that is not one of the five `item_quantity_state` members
 *     (0001:42) is refused rather than counted. See the block below.
 */
function aggregateUnits(units: RawUnit[] | null | undefined): LineUnits {
  if (units === null || units === undefined) {
    return { presence: 'absent', states: emptyUnitStates() }
  }
  // No `?? []` here, deliberately: the absent case returned above, so by this
  // point `units` is a real collection and the fallback that caused the defect
  // has nowhere left to hide.
  const out = emptyUnitStates()
  for (const u of units) {
    if (!Number.isInteger(u.qty) || u.qty <= 0) {
      throw new Error(
        `booking_line_units row ${String(u.id)} returned qty=${describe(u.qty as unknown)}. ` +
          'booking_line_units constrains qty to a positive integer (0002:254), so this is a query or ' +
          'view defect, not a data state. Every unit count and the packing gate are summed from it; ' +
          'refusing rather than deriving a gate from a value that is not a count.',
      )
    }
    /* ── An unrecognised unit_state refuses, it does not corrupt a count ────
     *
     * ⛔ WHAT WAS WRONG — and it was wrong in TWO disagreeing ways, which is
     * how it survived. Here, `out.byState[u.unit_state] += u.qty` on an
     * unknown member read `undefined`, added qty to it, and wrote a NEW KEY
     * holding `NaN` — so `byState` gained a sixth entry that renders as
     * `NaN` and makes every comparison against it silently false. At roll-up,
     * `addUnitStates` walks `Object.keys` of the ACCUMULATOR (which starts as
     * `emptyUnitStates()`, i.e. the five known members), so that sixth key was
     * never read and the units simply DISAPPEARED from the booking-wide
     * counts. One route invents a NaN, the other drops the units entirely;
     * neither is right and a reader comparing the line to the booking sees two
     * different answers.
     *
     * It is one behaviour now, decided here, at the only boundary where the
     * raw value arrives: refuse. This is reachable for the same reason
     * `bucketOf`'s `default` is — `ItemQuantityStateDb` comes from the
     * GENERATED `src/types/supabase.ts`, so the moment a migration adds a
     * sixth member and the file has not been regenerated, the compiler still
     * believes the five are exhaustive while Postgres is returning a sixth.
     * `hasOwnProperty` rather than `in`, so a unit_state of 'toString' or
     * '__proto__' cannot match a prototype member. */
    if (!Object.prototype.hasOwnProperty.call(EMPTY_STATE_COUNTS, u.unit_state as unknown as string)) {
      throw new Error(
        `bookingQuery: unknown item_quantity_state ${JSON.stringify(u.unit_state)} on booking_line_units ` +
          `row ${String(u.id)}. The enum has exactly five members (0001:42), so this means ` +
          'item_quantity_state gained one and src/types/supabase.ts has not been regenerated. Counting ' +
          'it would either write a NaN into byState or drop the units from the booking roll-up — add ' +
          'the member to EMPTY_STATE_COUNTS rather than letting a unit count go wrong either way.',
      )
    }
    out.committedQty += u.qty
    out.byState[u.unit_state] += u.qty
    if (u.is_required) out.requiredQty += u.qty
    if (u.packed) out.packedQty += u.qty
    // The packing gate, 0002:288, evaluated as ONE predicate on ONE unit —
    // never as a comparison between separately-scoped totals. `is_required`
    // must be re-tested on the same row as `packed` and `unit_state`, because
    // the gate asks about required units only and an optional unit's packing
    // says nothing about them.
    if (u.is_required && !u.packed && u.unit_state !== 'Missing') out.requiredUnpackedQty += u.qty
    if (u.damaged) out.damagedQty += u.qty
  }
  return { presence: 'present', states: out }
}

/**
 * Rolls one line's counts into the booking-wide ones.
 *
 * `byState` is walked over the ACCUMULATOR's keys, which is safe only because
 * `aggregateUnits` refuses an unrecognised `unit_state` at the boundary — so
 * both sides carry exactly the five `item_quantity_state` members and nothing
 * can be present on `b` and missed here. That guard is what makes this loop and
 * the per-line counts agree; if it is ever removed, this silently drops units.
 */
function addUnitStates(a: CanonicalLineUnitStates, b: CanonicalLineUnitStates): CanonicalLineUnitStates {
  const byState = { ...a.byState }
  for (const key of Object.keys(byState) as ItemQuantityStateDb[]) {
    byState[key] += b.byState[key]
  }
  return {
    committedQty: a.committedQty + b.committedQty,
    byState,
    requiredQty: a.requiredQty + b.requiredQty,
    packedQty: a.packedQty + b.packedQty,
    // Additive because it is a count of blocking units, not a ratio or a
    // comparison: a booking blocks if ANY line blocks, so the sum being 0 is
    // exactly "no line blocks". Rolling up a per-line BOOLEAN instead would
    // lose how much is still unpacked, which is the number the floor acts on.
    requiredUnpackedQty: a.requiredUnpackedQty + b.requiredUnpackedQty,
    damagedQty: a.damagedQty + b.damagedQty,
  }
}

/**
 * One line's money, or the stated reason there isn't any.
 *
 * Two different things make `value` null and they must not be confused:
 *
 *  - **masked** (`refusal: null`) — Law 6. The session may not see money. This
 *    is a permission, not a defect; the caller knows its own role and there is
 *    nothing to show the operator.
 *  - **refused** (`refusal: <sentence>`) — the row's own columns contradict each
 *    other, so no honest figure exists. The sentence is written to be rendered
 *    inline next to the line (Law 12 — errors inline, never toasts).
 */
interface LineNet {
  value: Paisa | null
  refusal: string | null
}

/**
 * `qty × rate × days − discount_amount`, in paisa — the schema's own formula
 * (0002:177's `booking_lines_discount_within_line` CHECK), not an invention —
 * **except where the row itself says that formula does not apply.**
 *
 * ⛔ WHAT WAS WRONG — do not collapse this back to one unconditional
 * multiplication. It computed `qty * rate * days - discount` for every line and
 * never looked at `service_basis` or `is_included`, both of which it read,
 * mapped and documented. A Flat service was billed per day, and a line the type
 * doc calls "included, prices at 0" was charged in full. Both produced a
 * confident, fully-formed, wrong number.
 *
 * The two branches below exist because the invariants that would have made the
 * plain formula safe **are documentation, not constraints** — verified across
 * all 55 migrations on 12 Aug 2026:
 *
 *  - `0001:305` ("A Flat service still stores days = 1 explicitly") is a `--`
 *    SQL comment sitting above `create type service_basis`. There is no CHECK
 *    and no trigger. `grep -n "service_basis\|'Flat'" *.sql` returns only the
 *    enum, the column (0002:139), `booking_lines_service_needs_basis` (0002:167,
 *    which forces the basis to be PRESENT on a Service line and nothing more),
 *    and two view column lists. So `days > 1` on a Flat line is reachable data.
 *  - `is_included` is likewise only a column (0002:138), a comment (0002:203)
 *    and two view column lists. **Nothing ties it to `rate = 0.`** Contrast
 *    `booking_lines_bundle_child_is_free` (0002:171-173), which is a real CHECK
 *    forcing `rate = 0 and discount_amount = 0` on every bundle child — that
 *    one the code may rely on, and does. `is_included` has no such backstop, so
 *    an included line carrying a rate is reachable data too.
 *
 * TODO(decision) ×2 — neither contradiction can be resolved here without
 * inventing a pricing rule, so neither is resolved. Both refuse. Add to
 * PLAN.md §4:
 *
 *   1. **A Flat service storing days > 1.** Charge `qty × rate` once and ignore
 *      the stored days, or charge `qty × rate × days` and ignore the stored
 *      basis? The row asserts both and they give different money. Worse, the
 *      database leans the other way than the comment does:
 *      `booking_lines_discount_within_line` bounds the discount by
 *      `qty * rate * days` **unconditionally**, so Postgres would happily accept
 *      a discount sized against three days on a line the enum comment says is
 *      one. Picking either reading here would be inventing the rule. The real
 *      fix is a CHECK — `line_type <> 'Service' or service_basis <> 'Flat' or
 *      days = 1` — which makes this branch dead code and can then delete it.
 *      That is a migration, deliberately not written here.
 *   2. **An included line carrying a non-zero rate.** Is `is_included` an
 *      instruction ("bill this at zero") that should override the stored rate,
 *      or a label describing a line whose rate is already 0? If the former, the
 *      fix is to price it at 0 here; if the latter, the fix is the missing CHECK
 *      (`is_included = false or (rate = 0 and discount_amount = 0)`, exactly
 *      mirroring the bundle-child one). Until that is ruled, this module will
 *      not charge for a line it also describes as included, and will not claim
 *      Rs 0 either — a 0 asserts "nothing was charged", and here that is
 *      precisely what is unknown.
 *
 * Note that a REFUSAL and a masked null land in the same place downstream —
 * `sumNet` propagates either as `null`, so a contradictory line cannot quietly
 * drop out of a subtotal that still renders. That is the intended behaviour:
 * absent, not zero.
 */
function lineNetTotal(input: {
  qty: number
  days: number
  rate: Paisa | null
  discount: Paisa | null
  lineType: BookingLineTypeDb
  serviceBasis: ServiceBasisDb | null
  isIncluded: boolean
}): LineNet {
  const { qty, days, rate, discount, lineType, serviceBasis, isIncluded } = input

  /* ── Defect 1 · service_basis governs whether `days` multiplies ─────────
   *
   * Checked BEFORE the mask test on purpose. `days` and `service_basis` are not
   * masked columns (0019:153 revokes only rate, discount_amount, supplier_cost
   * and markup_amount), so a Warehouse or Driver session can see this
   * contradiction too, and a data defect is worth surfacing to whoever is
   * looking at the booking. Nothing here reveals a rupee figure. */
  if (lineType === 'Service' && serviceBasis === null) {
    return {
      value: null,
      refusal:
        'This Service line does not say whether it is charged flat or per day, so no amount can be shown for it. ' +
        'Every Service line must carry a basis (booking_lines_service_needs_basis); reopen the line and set it.',
    }
  }

  if (serviceBasis === 'Flat' && days !== 1) {
    return {
      value: null,
      refusal:
        `This line is marked Flat but stores ${days} days, so it is not clear whether it is charged once ` +
        `or ${days} times over. No amount is shown for it until the line is corrected. ` +
        'A Flat line is expected to store days = 1.',
    }
  }

  /* ── Law 6 · masked, not defective ────────────────────────────────────── */
  if (rate === null || discount === null) return { value: null, refusal: null }

  /* ── Defect 2 · an included line is never charged ──────────────────────
   *
   * `rate === 0` is the ordinary, consistent case and prices to exactly 0 by
   * the formula below, so it needs no special branch — only the CONTRADICTION
   * does. Requiring the contradiction (rather than forcing every included line
   * to 0) is what keeps this from becoming an invented pricing rule: it does
   * not decide what an included line costs, it declines to decide. */
  if (isIncluded && rate !== 0) {
    return {
      value: null,
      refusal:
        'This line is marked as included — which means it is supplied at no charge — but it also carries a rate. ' +
        'No amount is shown for it until one of the two is corrected, because charging it would contradict the ' +
        'line and showing Rs 0 would discard a rate someone entered.',
    }
  }

  // A Flat line is charged ONCE. The guard above has already established
  // days === 1 here, so the two expressions agree — the branch is written out
  // anyway so the pricing rule is legible in the code, and so that deleting the
  // guard cannot silently change one without the other being noticed.
  const gross = serviceBasis === 'Flat' ? qty * rate : qty * rate * days
  const net = gross - discount

  // `booking_lines_discount_within_line` (0002:177) makes this unreachable from
  // a well-formed row. It is checked anyway because a negative line total is
  // the same class of failure as a zero one: a fully-formed number that is
  // wrong, rendered without complaint.
  if (net < 0) {
    return {
      value: null,
      refusal:
        'This line discounts more than it charges, which would price it negative. ' +
        'No amount is shown for it until the discount is corrected.',
    }
  }

  return { value: net as Paisa, refusal: null }
}

/**
 * Law 3's live-lines predicate, enforced by the MAPPER and not only by the query.
 *
 * ⛔ WHAT WAS WRONG — the `voided_at is null` filter existed in exactly one
 * place: the `.is('booking_lines_v.voided_at', null)` call inside
 * `fetchCanonicalBooking`. But `toCanonical` is EXPORTED, and it re-checked
 * nothing. Any caller mapping rows it fetched some other way — a different
 * query, a realtime payload, a cached page, a test fixture — silently priced
 * and counted voided lines. Removed equipment would reappear in the Subtotal
 * and on the packing list, with no error anywhere.
 *
 * ## Which of the three options this is, and why
 *
 * The choice was: enforce it in the mapper, stop exporting the mapper, or make
 * the contract impossible to misuse. **Enforce it in the mapper.**
 *
 *  - *Un-exporting* would only move the hazard: the suite genuinely needs to map
 *    a raw row without a database, and losing that coverage is how the previous
 *    wrong-column version survived — the mapper is the one place a bad field
 *    mapping is visible as text.
 *  - *"Impossible to misuse"* — a branded `LiveRawLine` type — cannot actually
 *    hold, because rows arrive from PostgREST as untyped JSON and any brand is a
 *    cast someone applies by hand. It would look like a proof and be an
 *    assertion.
 *
 * So the invariant is checked where the data is used, on data that carries the
 * evidence: `voided_at` is already in `COLUMNS`, so no extra fetch is needed.
 * The query-side `.is()` filter STAYS — it is what stops voided rows crossing
 * the wire at all, and the suite still pins it. Two independent enforcements of
 * one rule is the point, not duplication to be tidied away.
 *
 * ## The third state
 *
 * `voided_at` absent (`undefined`, because the column was not selected) is NOT
 * treated as live. It is unprovable, and both silent answers are wrong in the
 * money-affecting direction: assuming live re-admits voided lines, and assuming
 * voided would drop EVERY line and produce a fully-formed Subtotal of Rs 0 —
 * the exact failure in this module's header. So it throws. Absent is not zero,
 * and it is not "fine" either.
 */
function isLiveLine(raw: RawLine): boolean {
  // Read through a widened local rather than `raw.voided_at === undefined`:
  // `RawLine.voided_at` is declared `string | null`, so comparing it to
  // `undefined` is a type error. The declared type stays strict on purpose —
  // TypeScript callers must supply the column — while the runtime check still
  // catches the untyped JSON that actually arrives from PostgREST.
  const voidedAt = raw.voided_at as string | null | undefined
  if (voidedAt === undefined) {
    throw new Error(
      'booking_lines_v row has no voided_at, so it cannot be shown to be live. ' +
        'Law 3: nothing is deleted — a removed line carries voided_at (0002:145) and must not be ' +
        'priced or counted. Select voided_at. Refusing rather than guessing: assuming live would ' +
        'silently re-admit removed lines, and assuming voided would drop every line and report Rs 0.',
    )
  }
  return voidedAt === null
}

/**
 * A raw view row → a line.
 *
 * `qty`, `days`, `line_type`, `sort_order` and `is_included` are NOT NULL on the
 * base table (0002:134, :135, :129, :144, :138), but the generated view type
 * makes every column nullable because Postgres cannot prove NOT NULL through a
 * view. They are asserted rather than defaulted: a null here is a query bug (a
 * column dropped from the select, a renamed view), and defaulting `qty` to 1 or
 * `days` to 1 would turn that bug into a wrong price. Same reasoning
 * `queries/bookings.ts` gives for not coalescing `qty` in its item count.
 */
function toLine(raw: RawLine): CanonicalBookingLine {
  if (raw.id === null || raw.line_type === null || raw.qty === null || raw.days === null) {
    throw new Error(
      'booking_lines_v returned a row missing id, line_type, qty or days. ' +
        'All four are NOT NULL on booking_lines (0002:126-135), so this is a query or view defect, ' +
        'not a data state. Refusing to price it rather than substituting a default.',
    )
  }
  // `is_included` now decides whether a line may be charged at all, so it is
  // asserted rather than defaulted for the same reason `qty` and `days` are.
  // It was previously `raw.is_included ?? false`, and once the flag is
  // load-bearing that default is the unsafe direction: an absent column would
  // silently read as "not included", i.e. "charge it". Own guard, own message,
  // so the existing four-column guard's wording (and the test pinning it)
  // stays exact.
  if (raw.is_included === null || raw.is_included === undefined) {
    throw new Error(
      'booking_lines_v returned a row with no is_included. It is NOT NULL on booking_lines ' +
        '(0002:138), and it decides whether the line may be charged, so a missing value is a query ' +
        'or view defect. Refusing to price it rather than assuming the line is chargeable.',
    )
  }
  /* `qty` and `days` are multiplied into every money figure this module
   * produces, so "not null" is not enough of a check on them. `qty` is
   * `integer not null` with `check (qty > 0)` (0002:134, :152) and `days` is
   * `integer not null` with `check (days >= 1)` (0002:135, :155). A NaN, a
   * fraction or a negative arriving here does not fail anywhere — it silently
   * becomes a total. `NaN` in particular passes the null guard above and then
   * poisons the line, its bucket and the Subtotal without erroring. Checked
   * against the schema's own bounds, in its own guard so the four-column
   * guard's wording above (which the suite pins) stays exact. */
  if (!Number.isInteger(raw.qty) || raw.qty <= 0 || !Number.isInteger(raw.days) || raw.days < 1) {
    throw new Error(
      `booking_lines_v line ${raw.id} returned qty=${describe(raw.qty as unknown)} ` +
        `days=${describe(raw.days as unknown)}. booking_lines constrains qty to a positive integer ` +
        '(0002:152) and days to at least 1 (0002:155), so this is a query or view defect, not a data ' +
        'state. Both multiply into the line total; refusing rather than pricing from them.',
    )
  }
  const rate = toPaisa('booking_lines_v.rate', raw.rate)
  const discountAmount = toPaisa('booking_lines_v.discount_amount', raw.discount_amount)
  const net = lineNetTotal({
    qty: raw.qty,
    days: raw.days,
    rate,
    discount: discountAmount,
    lineType: raw.line_type,
    serviceBasis: raw.service_basis,
    isIncluded: raw.is_included,
  })
  const units = aggregateUnits(raw.booking_line_units)
  return {
    id: raw.id,
    lineType: raw.line_type,
    description: raw.description,
    qty: raw.qty,
    days: raw.days,
    rate,
    discountAmount,
    netTotal: net.value,
    netTotalRefusal: net.refusal,
    parentLineId: raw.parent_line_id,
    isBundleChild: raw.parent_line_id !== null,
    // Cannot be answered from this row alone — it needs the ids of every OTHER
    // live line, which only `toCanonical` has. Filled in by `markOrphanedBundleChildren`
    // there; left null here rather than defaulted to `true`, because `true` is
    // the answer that lets a bundle's money leave the subtotal unnoticed.
    isBundleParentLive: null,
    isIncluded: raw.is_included,
    serviceBasis: raw.service_basis,
    sortOrder: raw.sort_order ?? 0,
    unitsPresence: units.presence,
    units: units.states,
  }
}

/**
 * Resolves `isBundleParentLive` across the whole live set, and refuses any child
 * whose parent is not in it. See ORPHANED BUNDLE CHILDREN for why this exists
 * and why it cannot be done per row.
 *
 * Runs over the ALREADY-FILTERED live lines, which is the point: a parent that
 * was voided is not in `lines` at all — neither the database filter nor
 * `isLiveLine` leaves a row to inspect — so "parent is voided" is unwritable and
 * "parent is not among the live ids" is the question that can actually be asked.
 *
 * Returns fresh line objects; nothing is mutated in place, so a caller holding
 * the un-marked array is unaffected.
 */
function markOrphanedBundleChildren(lines: readonly CanonicalBookingLine[]): {
  lines: CanonicalBookingLine[]
  integrity: CanonicalBundleIntegrity
} {
  const liveIds = new Set(lines.map((l) => l.id))
  const orphanedChildIds: string[] = []

  const marked = lines.map((line) => {
    if (line.parentLineId === null) return { ...line, isBundleParentLive: null }
    if (liveIds.has(line.parentLineId)) return { ...line, isBundleParentLive: true }

    orphanedChildIds.push(line.id)
    const sentence =
      'This line belongs to a bundle whose parent line is not among this booking’s live lines, so the ' +
      'bundle’s rate is not in any total. It prices at Rs 0 by constraint ' +
      '(booking_lines_bundle_child_is_free, 0002:172) while the line carrying the money is gone, so a ' +
      'subtotal computed with it would be short by the whole bundle and would look correct. Restore ' +
      'the bundle line, or remove this line with it.'
    return {
      ...line,
      isBundleParentLive: false,
      // The orphan's own figure is unknowable, not Rs 0 — a 0 here would be the
      // claim "this line was free", which is exactly what makes the missing
      // bundle rate invisible. Nulling it makes `sumNet` return null, which
      // makes every bucket null, which makes `priceCanonicalBooking` refuse.
      netTotal: null,
      // Both reasons are true when a line is orphaned AND contradictory (a Flat
      // service, an included line carrying a rate), and both are actionable, so
      // neither is dropped in favour of the other.
      netTotalRefusal: line.netTotalRefusal === null ? sentence : `${sentence} ${line.netTotalRefusal}`,
    }
  })

  const count = orphanedChildIds.length
  return {
    lines: marked,
    integrity: {
      orphanedChildIds,
      message:
        count === 0
          ? null
          : `${count} line${count === 1 ? '' : 's'} on this booking belong${count === 1 ? 's' : ''} to a ` +
            'bundle whose parent line is not live, so no total can be shown. A bundle child prices at ' +
            'Rs 0 by constraint and the bundle line carries the rate, so losing the parent removes the ' +
            'whole bundle’s money from the subtotal without removing anything from the screen. Nothing ' +
            'cascades voided_at from a bundle parent to its children (verified across 0001-0055), so ' +
            'this is reachable from one Remove action and is a data defect, not a booking worth less.',
    },
  }
}

/**
 * Which `PriceInput` bucket a line type feeds.
 *
 * `price()` sums `equipment + subRental + services + crew + transport` into one
 * Subtotal, so **the split cannot change any total** — it only changes which
 * figure a breakdown card shows. That is why a debatable placement below is a
 * presentation question, not a money bug.
 *
 * TODO(decision) — 'Accessory' and 'Manual item' are placed with equipment
 * because both are rental lines on the equipment side of the booking and
 * `PriceInput` has no "other" slot. Whether the Quote's breakdown should show
 * accessories and ad-hoc items separately is a product call. Recorded because
 * it was chosen, not because it is obvious.
 *
 * Note what is NOT here: no 'Crew Charges' and no 'Transport'. They are not
 * members of `booking_line_type` (0001:296) — crew is `booking_crew_lines` and
 * transport is `booking_transport`. The old version matched on those two
 * strings and four others from the wrong enum, which is why every bucket was 0.
 *
 * ## Why this function has a `default` that can never be reached
 *
 * It could not be reached *by today's types*, and that is exactly the problem
 * the guard is for. `BookingLineTypeDb` comes from `src/types/supabase.ts`,
 * which is GENERATED. The moment a migration adds a seventh
 * `booking_line_type` member and the generated file has not been regenerated —
 * a normal, expected state for hours or days — this switch stops being
 * exhaustive at runtime while still compiling.
 *
 * Without a `default` it then returned `undefined`. `undefined` equals none of
 * `'equipment' | 'subRental' | 'services'`, so the three `.filter()` calls in
 * `toCanonical` all rejected the line and **its money vanished from the
 * subtotal** — the booking still priced, still reconciled with itself, and was
 * simply short by that line. That is the same failure as the Rs 0 in the module
 * header, one line at a time and even harder to spot, because a smaller total
 * looks like a smaller booking.
 *
 * So there are two guards, and both are needed:
 *
 *  - `_exhaustive: never` fails the BUILD the moment the generated enum gains a
 *    member, which is the cheap place to catch it; and
 *  - the `throw` fails the REQUEST if a value reaches here anyway — from an
 *    un-regenerated types file, a hand-built `RawLine`, or `toCanonical` being
 *    called on rows that did not come from this query at all. Refusing the
 *    whole booking is the correct blast radius: a booking that cannot be
 *    bucketed cannot be totalled, and "no total, with a reason" is sanctioned
 *    where "a total, quietly short one line" is not.
 */
function bucketOf(t: BookingLineTypeDb): 'equipment' | 'subRental' | 'services' {
  switch (t) {
    case 'Sub-rental':
      return 'subRental'
    case 'Service':
      return 'services'
    case 'Equipment':
    case 'Bundle':
    case 'Accessory':
    case 'Manual item':
      return 'equipment'
    default: {
      // Compile-time: this assignment fails to typecheck the instant
      // `booking_line_type` gains a member that no case above handles.
      const _exhaustive: never = t
      // Runtime: refuse, never drop.
      throw new Error(
        `bookingQuery: unknown booking_line_type ${JSON.stringify(_exhaustive)}. ` +
          'It has no pricing bucket, so this booking cannot be totalled. This means ' +
          'booking_line_type gained a member and src/types/supabase.ts has not been regenerated — ' +
          'add the case here rather than letting the line fall out of the subtotal.',
      )
    }
  }
}

/**
 * Sums a bucket, propagating "unknown".
 *
 * If ANY contributing line is masked or refused the bucket is `null`, not a
 * partial sum. A subtotal over the visible half of a booking is the most
 * convincing wrong number this module could produce — it is the right order of
 * magnitude, it reconciles with itself, and it is short by whatever was hidden.
 *
 * ## ⚠ `sumNet([])` is `0`, and that is only correct behind a presence check
 *
 * An empty list sums to a real Rs 0, because "these lines were returned and
 * there are none of them" genuinely is Rs 0 — a Quote with nothing added yet, a
 * booking whose every line has been voided (Law 3), or simply a booking with no
 * Sub-rental line when the Sub-rental bucket is summed.
 *
 * ⛔ WHAT WAS WRONG — do not undo the guard in `toCanonical`. That is where the
 * empty list came from: `raw.booking_lines_v ?? []` turned "the embed was NOT
 * RETURNED" into the same empty array as "the embed was returned and is empty".
 * `sumNet` then produced `0 as Paisa` — **non-null** — for `equipment`,
 * `subRental` and `services` alike, so `priceCanonicalBooking`'s refusal guard
 * (which tests for `null`) never fired, and the module composed a confident
 * Rental Total of Rs 0 with 13% VAT on Rs 0. That is precisely the failure the
 * rewrite existed to remove, wearing a different hat. `sumNet` is NOT the place
 * to fix it: it cannot see the difference, because by the time it is called both
 * cases are the same `[]`. The distinction is made once, at the boundary, and
 * carried as `linesPresence`.
 */
function sumNet(lines: readonly CanonicalBookingLine[]): Paisa | null {
  let total = 0
  for (const line of lines) {
    if (line.netTotal === null) return null
    // Backstop, not the primary defence — `toPaisa` and `toLine` refuse a
    // non-finite rate, discount, qty or days before a line is ever built. It
    // stays because this loop is the LAST place a NaN could turn into a
    // rendered total: `NaN + 5` is `NaN`, `NaN === null` is false, and the
    // accumulator would carry it silently to the engine. If this ever throws,
    // an upstream guard has been removed, not merely bypassed.
    if (!Number.isFinite(line.netTotal)) {
      throw new Error(
        `bookingQuery: line ${line.id} has a net total of ${describe(line.netTotal as unknown)}, which ` +
          'is not a finite amount. A non-finite value cannot be summed into a subtotal — it would ' +
          'propagate through price() without erroring and render as a total. This is an upstream ' +
          'defect in toPaisa/toLine validation, not a data state.',
      )
    }
    total += line.netTotal
  }
  return total as Paisa
}

/**
 * 1-based ordinal over the canonical six — derived from `workflow.ts` §1.2's
 * `order` (the single source of stage order) rather than re-declared here.
 * Falls back to 1 (Quote) if the DB ever hands back a pre-0015 stage string the
 * cast at the call site let through.
 */
function stageNumberOf(stage: BookingStageDb): number {
  const meta: StatusMeta | undefined = BOOKING_STATUS[stage]
  return meta ? meta.order + 1 : 1
}

function toDiscount(raw: RawDiscount): CanonicalBookingDiscount {
  return {
    id: raw.id,
    source: raw.discount_source,
    percent: raw.percent,
    reason: raw.reason,
    approverId: raw.approver_id,
    appliedAtAd: raw.applied_at,
    couponId: raw.coupon_id,
  }
}

/* ══ THE DISCOUNT CAP ══════════════════════════════════════════════════════
 *
 * ⛔ WHAT WAS WRONG — do not restore it. `discountPercent` was
 * `Σ booking_discounts.percent` and went straight into `price()` with no cap
 * check of any kind. `price()` applies whatever percentage it is handed:
 * `discountPercent: 60` produces a 60% discount, a taxable, a VAT and a Rental
 * Total, all fully formed, all reconciling with each other, and all describing a
 * discount the business rules say **cannot exist**.
 *
 * The cap is not a preference. It is stated in four places that agree:
 *   - `booking_discounts_hard_cap check (percent >= 0 and percent <= 25)`
 *     (0002:593) — per row;
 *   - `trg_booking_discounts_stacking` (0002:674, re-created for UPDATE as well
 *     as INSERT at 0044:271-273) — refuses when the SUM over the booking would
 *     exceed 25, "the 25 percent hard cap that applies to the stacked total, not
 *     just one row";
 *   - `booking_discounts.percent`'s own comment (0002:610): *"Capped at 25 per
 *     row and at 25 summed across stacked rows"*;
 *   - `DISCOUNT_CAP = 25` in `money.ts`, which this module imports rather than
 *     re-typing the number, so the two cannot drift.
 *
 * ## Why this refuses instead of clamping
 *
 * Clamping to 25 was rejected outright. It invents a number matching NEITHER
 * source: not the stored rows (which say, say, 40) and not the rules (which say
 * a 40 cannot be there at all). The operator would see a plausible total derived
 * from a discount nobody applied, and the underlying data defect — rows that
 * bypassed a database constraint, which is a serious event worth investigating —
 * would be erased by the very screen most likely to notice it.
 *
 * So the inconsistency is made visible in both directions:
 *   - `CanonicalBooking.discountIntegrity` carries the stored sum UNCLAMPED, the
 *     cap it breaks, and a sentence to render, so a screen can show *what* is
 *     wrong; and
 *   - `priceCanonicalBooking` refuses, so no total is composed from it.
 *
 * ## What is deliberately NOT re-checked here
 *
 * The ">10% needs a >=10-character reason and a named approver" rule
 * (`booking_discounts_over_ten_needs_reason_and_approver`, 0002:596, plus the
 * cumulative arm of the same trigger) is a WRITE-time gate — `discountGate()` in
 * money.ts is its client-side twin, for the form that creates a discount. It is
 * not re-derived on this read path, because the trigger applies it to "the row
 * that crosses the cumulative threshold" (0044:248-250) and not to every row, so
 * a read-side re-check would need a rule about which row must carry the reason
 * before it could accuse anything. Refusing a legitimate booking is its own
 * defect. The cap, by contrast, is unambiguous at any point in time: the sum is
 * either over 25 or it is not.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Whether the stored `booking_discounts` rows are consistent with the rules the
 * database claims to enforce on them — and, when they are not, what to say.
 *
 * `null` on `CanonicalBooking.discountIntegrity` means the rows were not read at
 * all. It never means "the rows are fine".
 */
export interface CanonicalDiscountIntegrity {
  /** Σ `booking_discounts.percent`, exactly as stored. **Never clamped.** */
  sumPercent: number
  /** `DISCOUNT_CAP` from money.ts — the same 25 the database enforces. */
  cap: number
  /**
   * What the stored rows break, or `null` when they break nothing.
   *
   * One field rather than a set of booleans on purpose: two flags can disagree
   * with each other, and a reader who checks one and not the other gets a total.
   */
  violation: 'Not a number' | 'Negative' | 'Over cap' | null
  /** Sentence to render inline (Law 12) when `violation` is set; `null` otherwise. */
  message: string | null
}

function checkDiscounts(rows: readonly CanonicalBookingDiscount[]): CanonicalDiscountIntegrity {
  const sumPercent = rows.reduce((sum, d) => sum + d.percent, 0)
  const base = { sumPercent, cap: DISCOUNT_CAP }
  const count = `${rows.length} stored discount row${rows.length === 1 ? '' : 's'}`

  // `percent` is `numeric(5,2) not null`, so a non-number here is a defect, not
  // a state. Checked per row AND on the sum: `0 + null` is `0` in JavaScript, so
  // a single NULL percent would otherwise vanish into a smaller, confident total
  // rather than showing up as a problem.
  const unusable = rows.some((d) => typeof d.percent !== 'number' || !Number.isFinite(d.percent))
  if (unusable || !Number.isFinite(sumPercent)) {
    return {
      ...base,
      violation: 'Not a number',
      message:
        `This booking's discount cannot be read as a percentage (${count}, totalling ` +
        `${describe(sumPercent as unknown)}), so no total can be shown. booking_discounts.percent is ` +
        'numeric(5,2) NOT NULL, so this is a data or query defect rather than a discount of 0%.',
    }
  }

  if (sumPercent < 0 || rows.some((d) => d.percent < 0)) {
    return {
      ...base,
      violation: 'Negative',
      message:
        `This booking's discount reads ${sumPercent}% across ${count}, which is negative. ` +
        'booking_discounts_hard_cap (0002:593) forbids a percent below 0, so no total is shown ' +
        'until the rows are corrected — a negative discount would ADD to the Rental Total.',
    }
  }

  if (sumPercent > DISCOUNT_CAP || rows.some((d) => d.percent > DISCOUNT_CAP)) {
    return {
      ...base,
      violation: 'Over cap',
      message:
        `This booking's ${count} total a ${sumPercent}% discount, above the ${DISCOUNT_CAP}% cap. ` +
        `The cap applies per row and to the stacked total (booking_discounts_hard_cap, 0002:593, and ` +
        'trg_booking_discounts_stacking, 0044:271), so rows in this state should not exist and no ' +
        `total is shown from them. The ${sumPercent}% above is what is stored, not a corrected ` +
        `figure — it is deliberately not clamped to ${DISCOUNT_CAP}%, because that would report a ` +
        'discount matching neither the rows nor the rules.',
    }
  }

  return { ...base, violation: null, message: null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface FetchCanonicalBookingOptions {
  /**
   * Include `bookings.deposit_required`. **Money on an unmasked base table** —
   * read the DEPOSIT block above before setting this. Gate on
   * `useCanViewMoney()` at the call site; nothing in the database will object.
   */
  withDeposit?: boolean
  /**
   * Include the `booking_discounts` rows, and with them a non-null
   * `engineInput.discountPercent`.
   *
   * ## What this flag is — stated exactly, because it used to be overstated
   *
   * ⛔ It is a plain caller-asserted boolean meaning **"ask for the discount
   * rows"**. Nothing in this module verifies anything about the session: the
   * module holds no session, `canViewMoney` in `lib/rbac` takes a role nobody
   * passes here, and `useCanViewMoney` is a React hook this module cannot call.
   *
   * The doc that stood here said `discountPercent` is non-null only once "the
   * caller proved money visibility via `withDiscounts`", and three sites reasoned
   * from that proof. There is no proof. Passing `true` from a Warehouse tablet
   * compiles, runs, and is not refused anywhere.
   *
   * ## What it does and does not buy
   *
   * Requesting is still the right shape, for the reason below it — just not for
   * the reason claimed. "No rows" and "no discount" are the same wire shape, so
   * leaving the flag OFF is what keeps `discountPercent` `null` ("not knowable")
   * rather than a confident and possibly wrong `0`. Turning it ON is a statement
   * that an empty result may be read as 0%.
   *
   * ⚠ THE RESIDUAL HAZARD, named rather than papered over. A money-blind session
   * (Warehouse / Technician / Driver / Client — Law 6) that passes this gets `[]`
   * from `booking_discounts_money_blind` (0036:132, `for all using
   * (auth_can_view_money())`, whole-row), so `discountPercent` becomes `0` on a
   * booking that may carry 25%. That figure is wrong and this module cannot tell.
   *
   * What stops it reaching a rendered total is a SEPARATE, structural fact, and
   * the two are load-bearing together: 0019:153 masks `booking_lines_v.rate` and
   * `discount_amount` for exactly the same four roles, so for such a session
   * every live line's `netTotal` is `null`, every bucket is `null`, and
   * `priceCanonicalBooking` refuses with the Law 6 sentence before the discount
   * is ever multiplied by anything. The only case that still prices is a booking
   * with no live lines, where the subtotal is a real Rs 0 and any discount of it
   * is Rs 0 too. **If line-level money masking is ever relaxed without gating
   * this flag, a money-blind session starts getting a full-price total on a
   * discounted booking.** They must be changed in the same migration.
   *
   * TODO(decision) — whether this option should carry a VERIFIED role instead of
   * a bare boolean (`withDiscounts: SystemRole`, checked through
   * `lib/rbac.canViewMoney` the way `actions/core.ts` resolves permissions) is an
   * API ruling, not something to settle inside a query module: it changes the
   * signature for every future caller and only relocates the assertion unless the
   * role itself comes from a trusted `ActionContext`. Recorded, not invented.
   * Add to PLAN.md §4.
   */
  withDiscounts?: boolean
}

/**
 * Fetches one booking and everything Law 2 says every surface must agree on.
 *
 * Accepts either the UUID primary key or the `BK-YYYY-NNNN` booking number
 * (0002:58's format constraint), so a deep link and a scan both land here.
 *
 * Returns `null` **only** when no such booking exists.
 *
 * ⛔ The previous version returned `null` for `error || !booking` — one branch
 * for "no such booking" and for "permission denied", "column does not exist"
 * and "network down". Every one of those rendered as an empty Not Found page,
 * which is precisely how a schema this wrong survived unnoticed: the query
 * failed on every call and the screen said the booking did not exist. Errors
 * now throw, carrying the database's own message; absence returns `null`.
 */
export async function fetchCanonicalBooking(
  bookingIdOrNo: string,
  opts: FetchCanonicalBookingOptions = {},
): Promise<CanonicalBooking | null> {
  const { withDeposit, withDiscounts } = opts

  const columns = [withDeposit ? COLUMNS_WITH_DEPOSIT : COLUMNS, ...(withDiscounts ? [DISCOUNT_EMBED] : [])].join(', ')

  const query = supabase
    .from('bookings')
    .select(columns)
    // Law 3 — a removed line is voided, never deleted, so it must not be priced.
    .is('booking_lines_v.voided_at', null)

  const { data, error } = (await (UUID.test(bookingIdOrNo)
    ? query.eq('id', bookingIdOrNo)
    : query.eq('booking_no', bookingIdOrNo)
  ).maybeSingle()) as unknown as { data: RawBooking | null; error: { message: string } | null }

  if (error) throw new Error(`fetchCanonicalBooking failed: ${error.message}`)
  if (!data) return null

  return toCanonical(data, { withDiscounts: withDiscounts === true })
}

/**
 * Raw row → `CanonicalBooking`. Exported for the test suite, which is the only
 * place a wrong field mapping is visible as text.
 */
export function toCanonical(raw: RawBooking, opts: { withDiscounts: boolean }): CanonicalBooking {
  const client = raw.clients
  if (!client) {
    // A booking always has a client (`client_id uuid not null` + FK, 0002:26 /
    // 0042:19), so a missing join is a query bug, not a data state. Say so
    // rather than rendering a friendly dash that hides it.
    throw new Error(
      `fetchCanonicalBooking: booking ${raw.booking_no} came back with no client embed. ` +
        'bookings.client_id is NOT NULL with a single FK to clients, so this is a query defect.',
    )
  }

  /* ══ WAS THE LINE COLLECTION RETURNED, OR IS IT MERELY EMPTY? ════════════
   *
   * ⛔ WHAT WAS WRONG — do not collapse this back to `raw.booking_lines_v ?? []`.
   * That one `?? []` erased the difference between two facts that mean opposite
   * things, and every money figure below inherited the erasure:
   *
   *   "the embed was not returned"      → UNKNOWN. Nothing can be totalled.
   *   "the embed was returned, empty"   → a real, priceable Rs 0.
   *
   * Both became `[]`, `sumNet([])` returned `0 as Paisa` — **non-null** — and so
   * `equipment`, `subRental` and `services` were all a confident zero. The
   * refusal guard in `priceCanonicalBooking` tests for `null`, so it never
   * fired, and the module produced a fully-formed Rental Total of Rs 0 with 13%
   * VAT on Rs 0. That is the same failure as the wrong-enum bucketing described
   * in this file's header — a money-blind or lines-absent session getting a
   * composed, confident, wrong total — reached by a different route.
   *
   * PostgREST gives three answers here and they are three different facts:
   *
   *   | wire shape                     | meaning                | money      |
   *   |--------------------------------|------------------------|------------|
   *   | key absent, or `null`          | not returned           | `null`     |
   *   | `[]`                           | returned, no live line | real Rs 0  |
   *   | rows with NULL money columns   | masked, Law 6          | `null`     |
   *
   * Only the middle row may become a number. The first is decided here; the
   * third is decided by `toPaisa` and propagated by `sumNet`.
   *
   * ⚠ THE ONE WAY `[]` COULD STILL LIE, and why it cannot today.
   * `booking_lines_v` carries `where auth_is_staff()` (0048:194), so a non-staff
   * session gets zero ROWS from the view rather than masked ones — an `[]` that
   * really means "not permitted". That cannot be reached through this function
   * as the schema stands, because `bookings_select` is `using (auth_is_staff())`
   * too (0020:101-104): a session that cannot read the view cannot read the
   * booking either, so it never gets a row to map and `fetchCanonicalBooking`
   * returns `null` instead. Those two predicates are load-bearing TOGETHER. If a
   * client-portal SELECT policy is ever added to `bookings` without adding a
   * matching one to `booking_lines_v`, `[]` stops meaning "no lines" and starts
   * meaning "not permitted", and this module will report Rs 0 to the portal.
   * They must be changed in the same migration. */
  const linesPresence: LinesPresence = raw.booking_lines_v == null ? 'absent' : 'present'

  // Sorted here rather than with an `order(..., { referencedTable })` on the
  // embed: `sort_order` is "stable display order, and the order Auto Assign
  // Serials walks" (0002:205), so it must be deterministic even if the embed
  // option name ever shifts. Ties keep PostgREST's order, which is stable
  // enough for equal sort_order values.
  //
  // The Law 3 filter is applied HERE as well as on the query — see `isLiveLine`.
  const liveLines = (raw.booking_lines_v ?? [])
    .filter(isLiveLine)
    .map(toLine)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  /* Applied AFTER the Law 3 filter and over the whole live set, because that is
   * the only position from which the question can be asked at all: a voided
   * bundle parent is not in `liveLines`, so the orphan is detected by its
   * parent's ABSENCE, never by inspecting the parent's `voided_at`. See
   * ORPHANED BUNDLE CHILDREN — without this, voiding a Bundle line silently
   * removes its whole rate from the subtotal and leaves the children on screen. */
  const { lines, integrity: bundleIntegrity } = markOrphanedBundleChildren(liveLines)

  /* Presence of the unit collections, rolled up — the same discipline as
   * `linesPresence`, one level down. 'absent' if the lines themselves were not
   * returned (there was then no row to carry a unit embed at all) or if any live
   * line's embed did not come back. The gates below read this; see
   * `aggregateUnits` for the green tick the old `?? []` produced. */
  const unitsPresence: UnitsPresence =
    linesPresence === 'absent' || lines.some((l) => l.unitsPresence === 'absent') ? 'absent' : 'present'

  /* Every bucket short-circuits on absence BEFORE `sumNet` is reached, because
   * `sumNet([])` is a real Rs 0 and that is the right answer for an
   * empty-but-returned collection only. Written as one helper so a fifth bucket
   * cannot be added later without the presence check coming with it. */
  const sumIfPresent = (of: readonly CanonicalBookingLine[]): Paisa | null =>
    linesPresence === 'absent' ? null : sumNet(of)

  const equipment = sumIfPresent(lines.filter((l) => bucketOf(l.lineType) === 'equipment'))
  const subRental = sumIfPresent(lines.filter((l) => bucketOf(l.lineType) === 'subRental'))
  const services = sumIfPresent(lines.filter((l) => bucketOf(l.lineType) === 'services'))

  /* The same absent-vs-empty rule, applied to the discount embed.
   *
   * `withDiscounts` alone is not enough: it records that the rows were ASKED
   * for, not that they came back. `raw.booking_discounts ?? []` would turn "the
   * embed was requested and not returned" into a confident 0% — a full-price
   * total on what may be a discounted booking. Requested AND returned is the
   * only combination that yields a number.
   *
   * ⚠ A money-blind session is NOT handled here and this comment used to claim
   * it was. `booking_discounts_money_blind` (0036:132) filters ROWS, so such a
   * session gets `[]`; the flag makes that `[]` read as 0%, and the flag proves
   * nothing about the session. What makes the wrong 0% unreachable in a total is
   * line-level money masking, elsewhere — see
   * `FetchCanonicalBookingOptions.withDiscounts`. */
  const rawDiscounts = raw.booking_discounts
  const discounts = opts.withDiscounts && rawDiscounts != null ? rawDiscounts.map(toDiscount) : null

  // `null` when the rows were not requested or did not come back. When they DID,
  // an empty array is a real 0% — that is the whole point of the flag. The sum
  // is never clamped; see THE DISCOUNT CAP above.
  const discountIntegrity = discounts === null ? null : checkDiscounts(discounts)
  const discountPercent = discountIntegrity === null ? null : discountIntegrity.sumPercent

  const units = lines.map((l) => l.units).reduce(addUnitStates, emptyUnitStates())
  const stage = raw.stage

  return {
    id: raw.id,
    bookingNo: raw.booking_no,
    stage,
    stageNumber: stageNumberOf(stage),
    project: raw.project,
    pickupAtAd: raw.pickup_at,
    returnAtAd: raw.return_at,
    actualReturnAtAd: raw.actual_return_at,
    deliveryType: raw.delivery_type,
    pickupLocation: raw.pickup_location,
    returnLocation: raw.return_location,
    quoteExpiresAtAd: raw.quote_expires_at,
    version: raw.version,
    createdAtAd: raw.created_at,
    isCancelled: raw.cancelled_at !== null,
    cancellationReason: raw.cancellation_reason,
    isClosed: raw.closed_at !== null,
    depositRequired: toPaisa('bookings.deposit_required', raw.deposit_required),
    client: {
      id: client.id,
      clientCode: client.client_code,
      name: client.name,
      phone: client.phone,
      email: client.email,
      panVat: client.pan_vat,
      // Nullable in the schema (0005:42) and passed through as null. Defaulting
      // it to 'Individual' — as the old version did — invents a fact that
      // changes the identity-document, VAT, deposit and credit rules (0005:128).
      typeParent: client.type_parent,
      status: client.status,
    },
    linesPresence,
    lines,
    discounts,
    discountIntegrity,
    bundleIntegrity: linesPresence === 'absent' ? null : bundleIntegrity,
    unitsPresence,
    units,
    engineInput: {
      equipment,
      subRental,
      services,
      linesSubtotal: sumIfPresent(lines),
      discountPercent,
      crew: null,
      transport: null,
      vatPercent: null,
      payments: null,
    },
    /* ⛔ The three line-derived gates are `null` — not `false`, and above all not
     * `true` — when the line collection was not returned. `[].every(…)` is
     * `true` for ANY predicate, so an absent collection previously produced
     * `requiredUnitsPacked: true`: the "green tick in front of an operator about
     * to hand over unpacked gear" that this file's header condemns in the four
     * hardcoded `true`s it replaced, reached by accident instead of on purpose.
     * `hasDamagedUnit: false` and `hasMissingUnit: false` are the same lie
     * pointing the other way — "nothing is damaged", asserted from nothing read.
     * `itemsWithClient` comes from `stage`, which is always present, so it stays
     * a boolean in both branches.
     *
     * ⛔ `unitsPresence` is tested for the SAME reason and must stay in this
     * condition. A live line whose `booking_line_units` embed did not come back
     * contributes `requiredUnpackedQty: 0`, and the gate is `=== 0` — so the
     * absence reads as a PASS through arithmetic instead of through
     * `[].every(…)`, which is the same green tick reached one level down. See
     * `aggregateUnits`. */
    gates: {
      ...(linesPresence === 'absent' || unitsPresence === 'absent'
        ? { requiredUnitsPacked: null, hasDamagedUnit: null, hasMissingUnit: null }
        : {
            // 0002:288 verbatim: "the booking may not reach 'Ready' while any
            // is_required unit is neither packed nor Missing-with-a-reason."
            //
            // `requiredUnpackedQty` IS that "any", counted per unit at
            // aggregation time. The gate is therefore a single `=== 0` and not
            // an inequality between totals — see the field's doc for why the
            // inequality that stood here let packed OPTIONAL units satisfy the
            // gate for unpacked REQUIRED ones. A booking with no required units
            // passes, which the wording gives directly: there is no such unit,
            // so nothing blocks.
            requiredUnitsPacked: units.requiredUnpackedQty === 0,
            hasDamagedUnit: units.damagedQty > 0,
            hasMissingUnit: units.byState.Missing > 0,
          }),
      itemsWithClient: stage === 'On Rent' || stage === 'Returned' || stage === 'Closed',
    },
  }
}

/* ── Pricing ───────────────────────────────────────────────────────────── */

/**
 * The figures this module cannot source, which the caller must supply from a
 * ruled source. None is optional — an omitted VAT rate must be a compile error,
 * not a silent 0% or a hardcoded 13%.
 *
 * ⛔ Every field is `| null`, and that is a fix, not a convenience. They were
 * non-nullable, which sounds stricter and is the opposite: it left a caller who
 * had not yet read `booking_crew_lines_v` no way to say so, so the only shape
 * the compiler would accept was `crew: rupees(0)` — a CLAIM that this booking
 * has no crew charges. `null` lets "I do not know" be expressed, and it is
 * refused rather than priced. `rupees(0)` still means what it says: "I read the
 * crew lines and there are none."
 */
export interface SuppliedPriceInputs {
  /**
   * A PERCENTAGE (13, not 0.13) from Settings ▸ Finance — money.ts:94, "never
   * hardcoded". See TODO(decision) 1: there is no column for it yet.
   *
   * `null` = not configured. `0` = a zero-rated booking, which is a claim the
   * caller is entitled to make.
   */
  vatPercent: number | null
  /**
   * Σ crew charges, pre-aggregated by the caller from `booking_crew_lines_v`.
   * `null` = not read. `rupees(0)` = read, and this booking has no crew.
   */
  crew: Paisa | null
  /**
   * Σ transport charges. §2.1: "Rs 0 on client pickup" — the caller applies
   * that rule, because it also has to honour
   * `booking_transport.zero_charge_override_by` (0002:383), and this module
   * does not read that table. `booking.deliveryType === 'Customer Pickup'` is
   * the enum literal to test against; see the note on that field.
   *
   * `null` = not read. `rupees(0)` = read, and nothing is charged for transport.
   */
  transport: Paisa | null
  /**
   * Σ received payments, from the finance surface. Deposits never enter this
   * (Law 5).
   *
   * `null` = not read — which matters more here than anywhere else, because
   * `payments` is gated by `auth_is_finance_or_admin()` (0011:61), NARROWER than
   * money visibility, so a Coordinator can legitimately get zero rows.
   * `rupees(0)` = read, and nothing has been paid yet.
   */
  payments: Paisa | null
}

/* ══ BOUNDARY VALIDATION · everything that reaches `price()` ═══════════════
 *
 * ⛔ WHAT WAS WRONG — do not thin this back out. `crew`, `transport` and
 * `payments` were typed `Paisa` and handed straight to `price()` with no check
 * whatsoever; the single validation in the entire function was
 * `Number.isFinite(supplied.vatPercent)`, which admits −40, 1e9 and 12.5 alike
 * and says nothing at all about the other three.
 *
 * `Paisa` is a BRANDED number, not a validated one. `rupees(NaN)`, a hand-built
 * `-1 as Paisa`, and an `undefined` arriving from an untyped JS caller all
 * satisfy the compiler. And `price()` does no checking of its own by design —
 * it adds, rounds and returns — so a bad value does not throw there, it
 * RENDERS: one `NaN` in `crew` makes subtotal, discount, taxable, VAT,
 * rentalTotal and outstanding all `NaN`; one negative `payments` reports an
 * Outstanding larger than the Rental Total; one fractional paisa breaks money.ts
 * §2.3's "all displayed totals reconcile exactly", which is the whole reason
 * amounts are integers in the first place.
 *
 * ── THE RULE PER FIELD ────────────────────────────────────────────────────
 *
 * · equipment / subRental / services — derived here, validated anyway.
 *     finite · whole paisa · >= 0.
 *     Zero is legitimate: a booking can hold no Sub-rental line at all, and
 *     since the `linesPresence` fix an empty-but-returned collection is a real
 *     Rs 0. Negative is not legitimate:
 *     `booking_lines_discount_within_line` (0002:177) bounds each line's
 *     discount by its own gross, and `lineNetTotal` refuses a negative line on
 *     top of that, so no sum of live lines can go below zero. A negative bucket
 *     means a constraint was bypassed or the arithmetic above is wrong. Both are
 *     defects; neither is a total.
 *
 * · crew — finite · whole paisa · >= 0.
 *     Σ of day_rate + overtime + accommodation + meals over
 *     `booking_crew_lines_v`, every component a charge. Zero is normal (no
 *     crew). Negative is not: a correction to a crew charge is a different row,
 *     not a negative one.
 *
 * · transport — finite · whole paisa · >= 0.
 *     Zero is not merely allowed but REQUIRED by §2.1's "Rs 0 on client pickup",
 *     so refusing 0 here would break the commonest booking in the system.
 *     Negative is not a transport discount; a discount is step 7.
 *
 * · payments — finite · whole paisa · >= 0.
 *     Zero is the ordinary state of an unpaid booking and MUST price — refusing
 *     it would make every fresh booking unpriceable, which is why "0 is normal"
 *     is called out separately from "0 is suspicious" elsewhere.
 *     Negative is refused. Law 4 makes payments immutable and corrections
 *     reversal rows, so a net-negative sum is reachable in principle when
 *     refunds exceed receipts — but it would render an Outstanding ABOVE the
 *     Rental Total, and "the client is owed money" is a finance state that needs
 *     its own presentation, not a silently inflated number.
 *     TODO(decision) — if net-negative payments is ever a real renderable state,
 *     this is the line that changes. Add to PLAN.md §4.
 *
 * · vatPercent — finite · >= 0 · <= 100. **Not** required to be a whole number:
 *     money.ts keeps percentages numeric precisely so 13.5 is expressible.
 *     Above 100 would charge more VAT than the taxable amount; below 0 would
 *     refund it. `0` is allowed and means zero-rated.
 *
 * · discountPercent — finite · >= 0 · <= DISCOUNT_CAP. See THE DISCOUNT CAP.
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * The money-field rule, once: present, finite, a whole number of paisa, not
 * negative. Returns the sentence to show, or `null` when the value is usable.
 */
function rejectAmount(label: string, value: Paisa | null, guidance: string): string | null {
  if (value === null) {
    return `${label} has not been read, so a total cannot be shown. ${guidance}`
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return (
      `${label} is not a usable amount (${describe(value as unknown)}), so a total cannot be shown. ` +
      'A non-finite amount does not fail inside the engine — it produces a total that renders.'
    )
  }
  if (!Number.isInteger(value)) {
    return (
      `${label} is ${value} paisa, which is not a whole paisa, so a total cannot be shown. ` +
      'Amounts are integer paisa (money.ts §2.3) so that every displayed total reconciles exactly; ' +
      'a fraction here would put a later total out by a paisa with no visible cause.'
    )
  }
  if (value < 0) {
    return `${label} is negative (${value} paisa), so a total cannot be shown. ${guidance}`
  }
  return null
}

/** The percentage rule: present, finite, within `[0, max]`. Fractions allowed. */
function rejectPercent(label: string, value: number | null, max: number, guidance: string): string | null {
  if (value === null) {
    return `No ${label} was supplied, so a total cannot be shown. ${guidance}`
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `The ${label} supplied is not a number (${describe(value as unknown)}), so a total cannot be shown. ${guidance}`
  }
  if (value < 0 || value > max) {
    return `The ${label} supplied is ${value}%, outside the permitted range of 0% to ${max}%, so a total cannot be shown. ${guidance}`
  }
  return null
}

/**
 * Either a breakdown, or a stated reason there isn't one. Never a number with
 * a caveat attached.
 */
export type CanonicalTotals =
  | { ok: true; breakdown: PriceBreakdown }
  | { ok: false; reason: string }

/**
 * The ONLY path from a `CanonicalBooking` to a `PriceBreakdown`.
 *
 * It does not compute money — `price()` does, and `price()` alone (Law 1: the
 * engine owns the calculation order; this module shapes its input). What it
 * does is refuse: if any figure the engine needs is unknown, it returns a
 * reason instead of a total. Every refusal below is a case where the
 * alternative was a plausible, confidently-wrong number:
 *
 *   - masked lines → a subtotal short by whatever the session cannot see;
 *   - unread discount rows → a full-price total on a discounted booking;
 *   - a missing VAT rate → 13% assumed, which money.ts:94 forbids.
 *
 * The reason strings are written to be rendered inline and persistently
 * (Law 12 — errors inline, never toasts), so they say what is missing and who
 * can supply it.
 */
export function priceCanonicalBooking(
  booking: CanonicalBooking,
  supplied: SuppliedPriceInputs,
): CanonicalTotals {
  const { equipment, subRental, services, discountPercent } = booking.engineInput

  /* Checked FIRST, because it is the difference between "this booking is worth
   * Rs 0" and "nothing about this booking's contents came back". Both used to be
   * unreachable: an absent embed became `[]`, `sumNet([])` returned a non-null
   * `0 as Paisa`, and none of the guards below — every one of which tests for
   * `null` — fired. The engine was then handed three confident zeroes and
   * composed a Rental Total of Rs 0 with VAT on Rs 0. It gets its own sentence
   * rather than sharing the Law 6 one below, because the remedy is different:
   * this one sends a developer to the query, that one sends an operator to
   * their role. */
  if (booking.linesPresence === 'absent') {
    return {
      ok: false,
      reason:
        'This booking’s lines were not returned by the query, so there is nothing to total. ' +
        'This is not a booking worth Rs 0 — it is a booking whose contents are unknown. ' +
        'Re-fetch it with fetchCanonicalBooking before showing any figure.',
    }
  }

  // Checked BEFORE the masking guard below, because both end in a null bucket
  // and only one of them is about permissions. A contradictory line reported as
  // "not visible to this account" would send the operator to ask for a role
  // change for a problem a role change cannot fix — a refusal with the wrong
  // stated reason is its own kind of confident wrong answer. See
  // `CanonicalBookingLine.netTotalRefusal`.
  const refused = booking.lines.filter((l) => l.netTotalRefusal !== null)
  if (refused.length > 0) {
    return {
      ok: false,
      reason:
        `${refused.length === 1 ? 'A line on this booking cannot' : `${refused.length} lines on this booking cannot`} ` +
        'be priced, so a total cannot be shown. ' +
        refused.map((l) => `${l.description ?? l.lineType}: ${l.netTotalRefusal ?? ''}`).join(' '),
    }
  }

  /* Backstop for a `CanonicalBooking` assembled by hand rather than by
   * `toCanonical` — a fixture, a cached payload, a realtime patch — whose lines
   * carry no orphan refusal. It is normally unreachable, because
   * `markOrphanedBundleChildren` nulls the orphan's `netTotal` and writes the
   * sentence, so the guard above fires first with a message naming the line.
   * It stays for the same reason the discount-cap backstop does: the refusal is
   * enforced on the value that actually reaches `price()`, not only on the one
   * that was inspected. Without it, an orphan whose refusal was lost prices at
   * Rs 0 and the bundle's whole rate leaves the total unnoticed — see
   * ORPHANED BUNDLE CHILDREN. */
  if (booking.bundleIntegrity?.message) {
    return { ok: false, reason: booking.bundleIntegrity.message }
  }

  if (equipment === null || subRental === null || services === null) {
    return {
      ok: false,
      reason:
        'Line amounts are not visible to this account, so a total cannot be shown. ' +
        'Rental figures are restricted to Owner, Admin, Manager, Coordinator and Accounts.',
    }
  }

  /* The three buckets are derived here rather than supplied, but "derived" is
   * not "checked" — each is about to be added into a number an operator will
   * act on. A bad one means the stored rows or this module are wrong, so the
   * guidance says so instead of asking the caller for something. */
  const derived: ReadonlyArray<readonly [string, Paisa]> = [
    ['The equipment total', equipment],
    ['The sub-rental total', subRental],
    ['The services total', services],
  ]
  for (const [label, value] of derived) {
    const bad = rejectAmount(
      label,
      value,
      'It is derived from this booking’s own lines, so this is a defect in the stored rows rather ' +
        'than a figure the caller can supply.',
    )
    if (bad) return { ok: false, reason: bad }
  }

  if (discountPercent === null) {
    return {
      ok: false,
      reason:
        'The booking discount has not been read, so a total cannot be shown. ' +
        'Fetch the booking with { withDiscounts: true } from an account that may see money.',
    }
  }

  // The stored discount rows break the cap the database says it enforces on
  // them. Refuse, and hand back the sentence naming the figure that is actually
  // stored — never a clamp, which would report a discount matching neither the
  // rows nor the rules. See THE DISCOUNT CAP.
  if (booking.discountIntegrity?.message) {
    return { ok: false, reason: booking.discountIntegrity.message }
  }

  // Backstop for a `CanonicalBooking` assembled by hand rather than by
  // `toCanonical` — a fixture, a cached payload, a realtime patch — where
  // `discountPercent` and `discountIntegrity` could disagree. The cap is
  // enforced on the value that actually reaches `price()`, not only on the one
  // that was inspected.
  const badDiscount = rejectPercent(
    'booking discount',
    discountPercent,
    DISCOUNT_CAP,
    `The cap is ${DISCOUNT_CAP}% per row and ${DISCOUNT_CAP}% summed across stacked rows ` +
      '(booking_discounts_hard_cap, 0002:593). No total is shown from a discount the rules say ' +
      'cannot exist, and it is not clamped to fit.',
  )
  if (badDiscount) return { ok: false, reason: badDiscount }

  /* The four supplied figures. `price()` validates none of them — it adds,
   * rounds and returns — so this is the last boundary before a bad number
   * becomes a rendered total. */
  const badVat = rejectPercent('VAT rate', supplied.vatPercent, 100, 'Set it in Settings ▸ Finance.')
  if (badVat) return { ok: false, reason: badVat }

  const badSupplied =
    rejectAmount(
      'Crew charges',
      supplied.crew,
      'Supply the sum of booking_crew_lines_v for this booking, or Rs 0 if it has no crew.',
    ) ??
    rejectAmount(
      'Transport charges',
      supplied.transport,
      'Supply the sum of booking_transport for this booking, or Rs 0 — §2.1 charges Rs 0 on client pickup.',
    ) ??
    rejectAmount(
      'Payments received',
      supplied.payments,
      'Supply the sum of this booking’s payments, or Rs 0 if none has been received. Reading payments ' +
        'needs a Finance or Admin account (0011:61), which is narrower than money visibility, so a ' +
        'Coordinator can get zero rows from a booking that has been paid.',
    )
  if (badSupplied) return { ok: false, reason: badSupplied }

  return {
    ok: true,
    breakdown: price({
      equipment,
      subRental,
      services,
      // The three non-null assertions below are sound ONLY because
      // `rejectAmount` and `rejectPercent` returned null for each of them
      // above — that is what proves they are present, finite, whole and in
      // range. Do not move these lines above those guards.
      crew: supplied.crew!,
      transport: supplied.transport!,
      // Σ booking_discounts.percent — the booking-level percentage at step 7
      // (0002:608, 0002:610). It is NOT derived from the lines: line discounts were
      // already subtracted inside each line's netTotal at step 1, and 0002:201
      // states the two are "entirely separate". Applying the lines' discount
      // again here would charge it twice. Capped, never clamped — a sum above
      // DISCOUNT_CAP has already been refused above.
      discountPercent,
      vatPercent: supplied.vatPercent!,
      payments: supplied.payments!,
    }),
  }
}
