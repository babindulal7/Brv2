import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { newClientUuid } from '../../lib/supabase'
import { idempotentInsert } from '../../lib/dataAccess'
import type { CrewRoleDb } from '../../types/database'

/**
 * # CREATE_RENTAL — the booking row, written as ONE transaction
 *
 * ## What this replaced
 *
 * ```ts
 * console.log(`[DB TX] Executing CREATE_RENTAL for ${input.id}`)
 * return { result: { rentalId: 'new-id' }, events }
 * ```
 *
 * A `console.log`, a fabricated `'new-id'`, and an input type whose only field
 * was `id: string` marked *"Placeholder for actual input schema"*. The
 * dispatcher's `implemented` default (false) is the only reason no operator was
 * ever handed `new-id` as a booking reference.
 *
 * ## Why this is an RPC and not four PostgREST calls
 *
 * A booking is a header, its lines, and its discounts — and the discounts are
 * the reason the whole thing must be one transaction. `booking_discounts.
 * audit_event_id` is NOT NULL, so each discount needs an `audit_events` row
 * written FIRST. Four separate PostgREST calls can fail after the second, and
 * PostgREST gives a browser no transaction to roll back with, so the failure
 * mode is a booking header with some of its lines and none of its discounts —
 * a row that reconciles to nothing and that nobody can tell apart from a
 * correctly-priced one.
 *
 * So the whole payload goes to `create_booking(p_payload jsonb)`, which does it
 * under one commit. **That function exists twice, deliberately:**
 *
 *  - `supabase/migrations/0063_create_booking_function.sql` — the Postgres half.
 *    Written, and **parked unapplied** against a database holding 121 real
 *    bookings; applying it needs explicit approval.
 *  - `lib/mock/client.ts` — the local half, mirroring 0063's payload shape,
 *    return shape and Law 8 replay behaviour exactly.
 *
 * **One implementation of what a booking is, two backends.** This action calls
 * one `.rpc('create_booking')` and works in both modes; if one side changes,
 * both must. That is the whole point of the seam and the reason nothing here
 * re-implements any part of it.
 *
 * ## Law 8 — the idempotency key is the caller's, not this file's
 *
 * `clientUuid` is minted **where the operator pressed the button** and reused
 * across every retry of that one press. `bookings.client_uuid` carries a unique
 * constraint, and `create_booking` checks it *before writing anything or moving
 * the sequence* — so a replay returns the existing booking, writes nothing, and
 * does not burn a `B-` number. The result carries `replayed` so a caller can
 * tell "created" from "you already did this", which a bare success cannot.
 *
 * One is minted here if the caller omits it, because a missing key must not be
 * a reason to refuse the write — but a caller that mints per-render rather than
 * per-press has defeated the law, and no signature can catch that.
 *
 * ## Law 9 — `days` is passed through, never defaulted
 *
 * Every priced line states its own `days`. `booking_lines.days` has a database
 * default, so letting it fall through would satisfy the constraint while hiding
 * a caller that never set it — which is exactly the shape of bug Law 9 exists
 * to prevent. `create_booking` raises on a line with no `days`; this file
 * refuses it one layer earlier, with a sentence naming the line.
 *
 * ## No pricing, by construction
 *
 * Rates and discounts are passed through as given. `lib/money.ts` owns the
 * calculation order and `lib/discount.ts` owns the thresholds; the 25% cap and
 * the reason+approver requirement are enforced by table CHECKs and by
 * `trg_booking_discounts_stacking`. Re-checking any of it here would create a
 * second implementation that can disagree with the database — which Law 10
 * forbids by name.
 */

/** `bookings.delivery_type`, read live from the enum on 16 Aug 2026. */
export type DeliveryType = 'Customer Pickup' | 'Babin Delivery' | 'Courier' | 'Third Party'

/** `booking_lines.line_type`, read live from the enum on 16 Aug 2026. */
export type BookingLineType = 'Equipment' | 'Bundle' | 'Accessory' | 'Service' | 'Sub-rental' | 'Manual item'

/**
 * Maps the UI's label to the stored enum value.
 *
 * **This is the mapping `NewRental.tsx` says must exist.** Law 17 renamed the
 * customer-facing label to **Client Pickup** (PLAN.md §6.1 — the word
 * "customer" appears nowhere in the UI), while the Postgres enum still spells
 * that member `'Customer Pickup'` (`0001_enums.sql:34`). `NewRental.tsx`'s own
 * `TODO(decision)` states the rule: *"Whoever wires this screen to a real write
 * must map label → enum value"*, and warns against "correcting" the mirrors in
 * `types/database.ts`, `data/handover.ts` and `booqable/map/orders.ts` to match
 * the label.
 *
 * This is that map, in the one place the label crosses into a write. It is NOT
 * a rename and it does not move any stored data — the coordinated schema-wide
 * rename is still `AUDIT_FINDINGS.md` P3, unstarted.
 */
export function deliveryTypeFromLabel(label: string): DeliveryType {
  if (label === 'Client Pickup') return 'Customer Pickup'
  if (label === 'Babin Delivery' || label === 'Courier' || label === 'Third Party') return label
  if (label === 'Customer Pickup') return label
  throw new Error(
    `"${label}" is not a delivery type. The UI's labels are Client Pickup, Babin Delivery, Courier and ` +
      'Third Party; the stored enum spells the first one "Customer Pickup". Nothing was sent.',
  )
}

export interface CreateRentalLine {
  /** **Law 8, per ROW.** Each line carries its own key — not the action's. */
  clientUuid?: string
  lineType: BookingLineType
  /** `booking_lines.product_id` — a uuid. Null for Bundle/Service/Manual lines. */
  productId?: string | null
  bundleId?: string | null
  description?: string | null
  /** Physical units. `booking_lines_qty_positive` refuses zero at the database. */
  qty: number
  /** **Law 9 — mandatory, never defaulted.** */
  days: number
  /** Rupees, as the column stores them. Pricing is not computed here. */
  rate?: number
  discountAmount?: number
  isIncluded?: boolean
  parentLineId?: string | null
  supplierId?: string | null
  supplierCost?: number | null
  markupAmount?: number | null
  lineNote?: string | null
  sortOrder?: number
  /**
   * **D5, ruled 30 Aug 2026** (REFERENCE_SPEC v2.5 Appendix A0) — serials
   * assigned at creation. `product_units.id` uuids, at most `qty` of them,
   * chosen least-used among available by the caller (the 27 Jul lock;
   * `queries/availability.ts` owns the read, `lib/availability.ts` the rule).
   *
   * **Optional, and absent is a legal answer** — the D5 fallback: where
   * availability cannot be known locally (`inventory_reservations` is
   * Booqable-mastered during the bridge — dataAccess.ts:201), the caller sends
   * NO units rather than guessing, and Pack confirms or fills. Each unit row
   * gets its own Law 8 key in `execute`, exactly like lines and discounts.
   */
  units?: readonly string[]
}

export interface CreateRentalDiscount {
  clientUuid?: string
  discountSource: string
  percent: number
  reason?: string | null
  approverId?: string | null
  couponId?: string | null
}

/**
 * A priced crew member on the booking — `booking_crew_lines` (0002:314-340).
 *
 * `role` must be a `crew_role` enum member. The seed roster speaks a different
 * vocabulary ("Director of Photography", "1st AC", "Drone Operator"); mapping
 * one onto the other is a product call this action does not make — a role the
 * enum does not carry is refused by name in `validate`. TODO(decision): the
 * roster ↔ enum mapping, or a roster read from `users`.
 */
export interface CreateRentalCrewLine {
  /** Law 8, per ROW. */
  clientUuid?: string
  /** `users.id` when the crew member is staff; null for an external name. */
  crewMemberId?: string | null
  name: string
  role: CrewRoleDb
  phone?: string | null
  /** Rupees, as the columns store them. */
  dayRate: number
  days: number
  overtime?: number
  accommodation?: number
  meals?: number
}

/** The booking's one transport row — `booking_transport` (0002:373-395). Rupees. */
export interface CreateRentalTransport {
  clientUuid?: string
  deliveryCharge: number
  fuelCharge: number
  vehicle?: string | null
  numberPlate?: string | null
  driverContact?: string | null
  specialInstructions?: string | null
}

/**
 * Thrown when the header, lines and discounts landed (one transaction in
 * `create_booking`) but a crew or transport row written AFTER it did not. The
 * booking exists and is named, so a caller can say so instead of "nothing was
 * written" — which would be false.
 */
export class CreateRentalPartialError extends Error {
  constructor(
    public readonly bookingId: string,
    public readonly bookingNo: string,
    public readonly unwritten: string,
    cause: unknown,
  ) {
    super(
      `Booking ${bookingNo} was created as a Quote, but its ${unwritten} could not be written: ` +
        `${cause instanceof Error ? cause.message : String(cause)}. The Quote exists without it.`,
    )
    this.name = 'CreateRentalPartialError'
  }
}

/**
 * The `crew_role` enum members this action accepts, in one place.
 *
 * Exported because a screen that staffs a booking has to be able to *say*, on
 * the row, that a person's role will be refused — and law 1 forbids it from
 * restating the list to work that out. `NewRental.tsx`'s crew picker derives
 * its warning from this value; nothing outside this file decides membership.
 *
 * `as const satisfies` rather than a `readonly CrewRoleDb[]` annotation: the
 * `satisfies` clause still checks every entry is a real enum member, and the
 * literal type it keeps is what lets a caller compute the *complement* against
 * the seed roster at compile time instead of typing it out again.
 */
export const CREW_ROLES = [
  'Rental Coordinator',
  'Warehouse Staff',
  'Driver',
  'Camera Assistant',
  'Delivery Staff',
  'Director',
  'DoP',
  'Focus Puller',
  'Gaffer',
  'Grip',
  'Drone Pilot',
  'Sound Recordist',
] as const satisfies readonly CrewRoleDb[]

export type CreateRentalInput = {
  /** **Law 8.** Minted where the operator pressed the button; reused on retry. */
  clientUuid?: string
  /** `clients.id` — a **uuid**, not a `C-` code. See the note in `validate`. */
  clientId: string
  branchId: string
  contactId?: string | null
  project?: string | null
  /** AD/UTC, full ISO instant carrying an offset (Law 7). */
  pickupAt: string
  returnAt: string
  /** The stored enum value. Use `deliveryTypeFromLabel` if you hold a UI label. */
  deliveryType: DeliveryType
  pickupLocation?: string | null
  returnLocation?: string | null
  quoteExpiresAt?: string | null
  /** Deposits are liabilities (Law 5) — this never touches Rental Total. */
  depositRequired?: number
  lines: CreateRentalLine[]
  discounts?: CreateRentalDiscount[]
  /**
   * Written AFTER `create_booking` returns, each row with its own Law 8 key,
   * so a retry of the same press lands the same rows once. They are not in the
   * RPC's transaction: a failure here raises `CreateRentalPartialError`, which
   * names the Quote that does exist (BUG_AUDIT_LIFECYCLE NR-02).
   */
  crew?: CreateRentalCrewLine[]
  transport?: CreateRentalTransport | null
}

export type CreateRentalResult = {
  success: true
  bookingId: string
  bookingNo: string
  /** Always `Quote` — a booking is created as a quotation and confirmed later. */
  stage: string
  lineCount: number
  /**
   * True when this exact `clientUuid` had already created a booking. The row is
   * the original; **nothing was written and no `B-` number was consumed**.
   * Reported rather than hidden, because "created" and "you already did this"
   * are different facts and a caller may want to say so.
   */
  replayed: boolean
  /** `booking_crew_lines` rows this call wrote (0 on a replay). */
  crewLines: number
  /** Whether a `booking_transport` row was written by this call. */
  transportWritten: boolean
}

/** A UUID, so a `C-1` client code cannot be sent where a uuid is required. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Full ISO instant carrying an offset — the same guard `confirmRental` uses. */
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

function assertInstant(value: string, field: string): void {
  if (!ISO_INSTANT_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(
      `${field} must be a full ISO instant carrying an offset — "2026-09-01T09:00:00+05:45" or a Z form ` +
        `(Law 7). Received ${JSON.stringify(value)}, which either is not an instant or has no offset and ` +
        "would be read as the device's local time. Nothing was sent.",
    )
  }
}

export const createRentalConfig: ActionConfig<CreateRentalInput, CreateRentalResult> = {
  name: 'CREATE_RENTAL',
  /* Ruled 16 Aug 2026 (PLAN.md §4.29) — the booking desk five, mirroring
     `bookings_insert`. It resolved to no rule until that pass, which would have
     denied this action to every role including Owner the moment it got a body. */
  permissions: ['rental.create'],

  /**
   * `true` because `execute` calls `create_booking` and returns only what that
   * function reports having written.
   *
   * ⚠ **Driven against the LOCAL store, not the live database.** `0063` is
   * parked unapplied, so `create_booking` does not exist on the Supabase
   * project yet — against it this action returns a `42883`, correctly and
   * loudly. `implemented: true` is still right: the body genuinely writes
   * wherever the function exists, which today is the local corpus.
   */
  implemented: true,

  validate: (input) => {
    /*
     * The uuid checks are not pedantry. `NewRental.tsx` holds its client list as
     * `data/clients.ts`, whose ids are `'C-1'`, `'C-2'` — client CODES. Sending
     * one as `client_id` would fail the FK deep inside the function with a
     * Postgres message about a malformed uuid, three layers from the operator.
     * Refused here, by name, instead.
     */
    if (!UUID_RE.test(input.clientId)) {
      throw new Error(
        `clientId must be a clients.id uuid, not a client code. Received ${JSON.stringify(input.clientId)}. ` +
          'A "C-" value is the code column; look the client up first. Nothing was sent.',
      )
    }
    if (!UUID_RE.test(input.branchId)) {
      throw new Error(`branchId must be a uuid. Received ${JSON.stringify(input.branchId)}. Nothing was sent.`)
    }

    assertInstant(input.pickupAt, 'pickupAt')
    assertInstant(input.returnAt, 'returnAt')
    if (Date.parse(input.returnAt) < Date.parse(input.pickupAt)) {
      throw new Error(
        `The return (${input.returnAt}) is before the pickup (${input.pickupAt}). Nothing was sent.`,
      )
    }
    if (input.quoteExpiresAt != null) assertInstant(input.quoteExpiresAt, 'quoteExpiresAt')

    if (input.clientUuid !== undefined && input.clientUuid.trim() === '') {
      throw new Error(
        'The idempotency key is present but empty. Pass the key minted where the operator pressed the button, ' +
          'or omit it — an empty string is neither. Nothing was sent.',
      )
    }

    /*
     * A booking with no lines is not a booking. The database would accept the
     * header, and the result would be a Quote that prices to zero and that
     * Confirm then refuses ("has no live lines"), discovered later by someone
     * else. Refused at the point it can still be explained.
     */
    if (input.lines.length === 0) {
      throw new Error('A booking needs at least one line — there is nothing to price or to pack. Nothing was sent.')
    }

    for (const [i, line] of input.lines.entries()) {
      const label = line.description ?? `line ${i + 1}`
      /* Law 9. `create_booking` raises on this too; refusing here names the
         line rather than its generated key. */
      if (!Number.isInteger(line.days) || line.days < 1) {
        throw new Error(
          `${label} has no usable Days (${JSON.stringify(line.days)}). Law 9 requires a whole number of days, ` +
            'at least one, stated on every priced line and never defaulted. Nothing was sent.',
        )
      }
      if (!Number.isInteger(line.qty) || line.qty < 1) {
        throw new Error(`${label} has a quantity of ${JSON.stringify(line.qty)}; it must be at least 1. Nothing was sent.`)
      }
      if (line.productId != null && !UUID_RE.test(line.productId)) {
        throw new Error(`${label} carries a productId that is not a uuid (${JSON.stringify(line.productId)}). Nothing was sent.`)
      }
      if (line.bundleId != null && !UUID_RE.test(line.bundleId)) {
        throw new Error(`${label} carries a bundleId that is not a uuid (${JSON.stringify(line.bundleId)}). Nothing was sent.`)
      }

      /* D5 — units are optional; when present they must be coherent with the
         line. Refused HERE by line label rather than three layers down as a
         constraint message. The RPC re-checks all of it (a second caller may
         not come through this file), but this is the refusal an operator reads. */
      const units = line.units ?? []
      if (units.length > line.qty) {
        throw new Error(
          `${label} carries ${units.length} assigned units for a quantity of ${line.qty}. A line cannot name ` +
            'more serials than items. Nothing was sent.',
        )
      }
      for (const assetId of units) {
        if (!UUID_RE.test(assetId)) {
          throw new Error(
            `${label} carries an assigned unit that is not a product_units.id uuid (${JSON.stringify(assetId)}). ` +
              'Nothing was sent.',
          )
        }
      }
    }

    /* One physical unit cannot be assigned twice on one booking. The schema
       has no unique constraint saying so, which is exactly why it is said here
       and again inside create_booking. */
    const seen = new Set<string>()
    for (const line of input.lines) {
      for (const assetId of line.units ?? []) {
        if (seen.has(assetId)) {
          throw new Error(
            `The same physical unit (${assetId}) is assigned to two lines of this booking. One serial covers ` +
              'one item. Nothing was sent.',
          )
        }
        seen.add(assetId)
      }
    }

    for (const [i, c] of (input.crew ?? []).entries()) {
      const label = `Crew line ${i + 1} (${c.name || 'unnamed'})`
      if (!c.name.trim()) throw new Error(`${label} has no name. Nothing was sent.`)
      if (!CREW_ROLES.includes(c.role)) {
        throw new Error(
          `${label}: "${String(c.role)}" is not a crew_role the database accepts (${CREW_ROLES.join(', ')}). ` +
            'The roster vocabulary and the enum differ, and no mapping is ruled. Nothing was sent.',
        )
      }
      if (!Number.isInteger(c.days) || c.days < 1) throw new Error(`${label}: days must be a whole number ≥ 1. Nothing was sent.`)
      for (const [k, v] of Object.entries({ dayRate: c.dayRate, overtime: c.overtime ?? 0, accommodation: c.accommodation ?? 0, meals: c.meals ?? 0 })) {
        if (!Number.isFinite(v) || v < 0) throw new Error(`${label}: ${k} must be a non-negative rupee amount. Nothing was sent.`)
      }
      if (c.crewMemberId != null && !UUID_RE.test(c.crewMemberId)) {
        throw new Error(`${label}: crewMemberId must be a users.id uuid or null. Nothing was sent.`)
      }
    }
    if (input.transport) {
      const t = input.transport
      if (!Number.isFinite(t.deliveryCharge) || t.deliveryCharge < 0 || !Number.isFinite(t.fuelCharge) || t.fuelCharge < 0) {
        throw new Error('Transport charges must be non-negative rupee amounts (booking_transport_charges_non_negative). Nothing was sent.')
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    /*
     * OFFLINE — refused, not queued.
     *
     * The same reasoning as `confirmRental`: this is one RPC, and the offline
     * outbox has no path for an RPC at all (it queues table inserts). A queued
     * "create" that silently became nothing, having already returned success
     * and a booking number the operator wrote down, is the failure this whole
     * action layer exists to prevent.
     *
     * Note the local store is NOT reached by this branch in mock mode:
     * `dataAccess`'s `shouldQueueOffline()` is what knows about `IS_MOCK`, and
     * `ctx.isOnline` describes the *network*, which the local corpus does not
     * use. A caller in mock mode passes `isOnline: true` because it is talking
     * to something always reachable.
     */
    const offline = ctx.isOnline === false || (typeof navigator !== 'undefined' && navigator.onLine === false)
    if (offline) {
      throw new Error(
        'This device is offline, so the booking was not created. Creating a booking writes its header, lines ' +
          'and discounts in one transaction, which cannot be queued and replayed safely. Try again when you ' +
          'are back online — nothing entered has been lost.',
      )
    }

    const clientUuid = input.clientUuid ?? newClientUuid()

    /* Built once, here, in the shape `create_booking` reads. Snake_case because
       it crosses into SQL — this is the boundary, and the payload is the
       function's argument, not a TypeScript value that happens to be nearby. */
    const payload = {
      client_uuid: clientUuid,
      created_by: ctx.userId,
      branch_id: input.branchId,
      client_id: input.clientId,
      contact_id: input.contactId ?? null,
      project: input.project ?? null,
      pickup_at: input.pickupAt,
      return_at: input.returnAt,
      delivery_type: input.deliveryType,
      pickup_location: input.pickupLocation ?? null,
      return_location: input.returnLocation ?? null,
      quote_expires_at: input.quoteExpiresAt ?? null,
      deposit_required: input.depositRequired ?? 0,
      lines: input.lines.map((line, i) => ({
        /* One key per ROW. A line reusing the action's key would collide on
           `booking_lines.client_uuid`, which is unique. */
        client_uuid: line.clientUuid ?? newClientUuid(),
        line_type: line.lineType,
        parent_line_id: line.parentLineId ?? null,
        product_id: line.productId ?? null,
        bundle_id: line.bundleId ?? null,
        description: line.description ?? null,
        qty: line.qty,
        days: line.days,
        rate: line.rate ?? 0,
        discount_amount: line.discountAmount ?? 0,
        is_included: line.isIncluded ?? false,
        supplier_id: line.supplierId ?? null,
        supplier_cost: line.supplierCost ?? null,
        markup_amount: line.markupAmount ?? null,
        line_note: line.lineNote ?? null,
        sort_order: line.sortOrder ?? i,
        /* D5 — serials at creation. One Law 8 key per unit ROW
           (`booking_line_units.client_uuid` is NOT NULL UNIQUE). An empty
           array is the unit-less fallback and writes nothing. */
        units: (line.units ?? []).map((assetId) => ({
          client_uuid: newClientUuid(),
          asset_id: assetId,
        })),
      })),
      discounts: (input.discounts ?? []).map((d) => ({
        client_uuid: d.clientUuid ?? newClientUuid(),
        discount_source: d.discountSource,
        percent: d.percent,
        reason: d.reason ?? null,
        approver_id: d.approverId ?? null,
        coupon_id: d.couponId ?? null,
      })),
    }

    /* `p_payload` is the function's named parameter. Passing the payload
       directly instead is refused with "client_uuid is required" — a real
       confusion worth naming, because the message points at the wrong thing. */
    const { data, error } = await supabase.rpc('create_booking', { p_payload: payload })

    if (error) {
      throw new Error(
        `The booking was not created: ${error.message}` +
          (error.code === '42883'
            ? ' — create_booking() does not exist on this backend. `0063_create_booking_function.sql` is ' +
              'written but parked unapplied against the Supabase project; the local store implements it.'
            : ''),
      )
    }

    /*
     * PERSISTENCE CHECK. `create_booking` returns the row it wrote; a null or
     * shapeless answer means something returned success without writing, which
     * is the exact class this action layer was rebuilt to stop reporting.
     */
    const row = data as { booking_id?: unknown; booking_no?: unknown; stage?: unknown; line_count?: unknown; replayed?: unknown } | null
    if (!row || typeof row.booking_id !== 'string' || typeof row.booking_no !== 'string') {
      throw new Error(
        'create_booking returned no booking, so treat this as NOT created even though no error was raised. ' +
          `Received: ${JSON.stringify(data)}`,
      )
    }

    const replayed = row.replayed === true

    /* Crew and transport, after the header. Each row carries its own key, so a
       retry of the same press (same keys) resolves to the rows already there
       rather than a second set — `idempotentInsert` treats the client_uuid
       duplicate as the replay it is. On a replay of the header these are
       attempted too, for the same reason: the first attempt may have died
       between the RPC and here. */
    let crewLines = 0
    let transportWritten = false
    try {
      for (const c of input.crew ?? []) {
        await idempotentInsert(
          'booking_crew_lines',
          {
            client_uuid: c.clientUuid ?? newClientUuid(),
            booking_id: row.booking_id,
            crew_member_id: c.crewMemberId ?? null,
            name: c.name.trim(),
            crew_role: c.role,
            phone: c.phone ?? null,
            day_rate: c.dayRate,
            days: c.days,
            overtime: c.overtime ?? 0,
            accommodation: c.accommodation ?? 0,
            meals: c.meals ?? 0,
            created_by: ctx.userId,
          },
          { returnRow: false },
        )
        crewLines += 1
      }
    } catch (cause) {
      throw new CreateRentalPartialError(row.booking_id, row.booking_no, `crew lines (${crewLines} of ${(input.crew ?? []).length} written)`, cause)
    }
    if (input.transport) {
      try {
        const t = input.transport
        await idempotentInsert(
          'booking_transport',
          {
            client_uuid: t.clientUuid ?? newClientUuid(),
            booking_id: row.booking_id,
            delivery_charge: t.deliveryCharge,
            fuel_charge: t.fuelCharge,
            vehicle: t.vehicle ?? null,
            number_plate: t.numberPlate ?? null,
            driver_contact: t.driverContact ?? null,
            special_instructions: t.specialInstructions ?? null,
            created_by: ctx.userId,
          },
          { returnRow: false },
        )
        transportWritten = true
      } catch (cause) {
        throw new CreateRentalPartialError(row.booking_id, row.booking_no, 'transport row', cause)
      }
    }

    const result: CreateRentalResult = {
      success: true as const,
      bookingId: row.booking_id,
      bookingNo: row.booking_no,
      stage: typeof row.stage === 'string' ? row.stage : 'Quote',
      /* A replay returns the ORIGINAL booking and reports no line count — it
         wrote none. Reporting the count the caller asked for would claim work
         this call did not do. */
      lineCount: typeof row.line_count === 'number' ? row.line_count : 0,
      replayed,
      crewLines,
      transportWritten,
    }

    return {
      result,
      /* A replay created nothing, so it announces nothing. Emitting
         RENTAL_CREATED on every retry would have every subscriber act twice on
         one booking. */
      events: replayed
        ? []
        : [
            {
              type: EVENT_TYPES.RENTAL_CREATED,
              payload: {
                bookingId: result.bookingId,
                bookingNo: result.bookingNo,
                clientId: input.clientId,
                branchId: input.branchId,
                stage: result.stage,
                lines: result.lineCount,
                clientUuid,
                userId: ctx.userId,
              },
            },
          ],
    }
  },
}

export const createRental = createAction(createRentalConfig)
