/**
 * Booqable `payments` → local `payments` / `security_deposits` /
 * `deposit_movements` / `payment_reversals` mapper.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * THIS IS THE HIGHEST-RISK FILE IN THE WHOLE BOOQABLE INTEGRATION.
 * Read this header in full before changing a line below it. Getting the
 * deposit/payment split wrong corrupts the cash position and every
 * liquidity report built on top of it (spec §8.3, verbatim).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ## Law 17
 *
 * Per PLAN.md §0 law 17, only "client" is used as an identifier in this
 * file — a Booqable `payments` record has no client-shaped field of its own
 * to begin with (it links to an `orders` row, which links to the client
 * resource `clients.ts` owns).
 *
 * ## Field ownership (spec §5.1 / §5.2) — and the tension between them
 *
 * §5.1: "payments/payment_methods maps to a payments mirror, no OS write."
 * This file is PULL-ONLY, exactly like every sibling in this directory —
 * nothing here calls `booqableWrite`/`booqableDelete` from `../client.ts`,
 * and nothing here produces a `sync_outbox` row.
 *
 * §5.2 separately lists **"security deposits and the deposit ledger"** among
 * the things "the OS is SOLE master" of, and says those "never sync in
 * either direction — attempting to push any of them is a defect." Read
 * literally, that sentence is in tension with this file's own brief, which
 * explicitly requires mapping Booqable-classified deposits INTO
 * `security_deposits`/`deposit_movements` — an inbound sync of exactly the
 * domain §5.2 says never syncs.
 *
 * TODO(decision) — this tension is NOT silently resolved either way here.
 * Read as follows, and flagged for a human to confirm:
 *   - §5.2's "never sync" most plausibly governs the OS's own BUSINESS
 *     LOGIC on this domain — deposit *requirement* policy, damage/late/
 *     missing charge application, refund decisions — none of which this
 *     file touches (see "required_amount" below: never inferred from
 *     Booqable, always a caller-supplied default or 0).
 *   - §8.3 (this file's own brief, more specific and more directly on
 *     point) is read as the controlling rule for the narrower question this
 *     file actually answers: when Booqable tells us money changed hands
 *     against a booking and that money is classified as a deposit, it MUST
 *     NOT land in `payments` (revenue) — Law 5's single highest-risk
 *     mapping. Recording the cash-received EVENT in `deposit_movements`
 *     (itself an immutable ledger, same as `payments`) is what keeps that
 *     guarantee real rather than aspirational.
 * If a human resolution decides §5.2 should win outright, the fix is
 * narrow: change `classifyBooqablePayment`'s 'deposit' branch in
 * `mapPayments` below to route straight to `held` (see that type) instead
 * of `securityDepositsToInsert`/`depositMovementsToInsert` — the function is
 * deliberately kept small and single-purpose so that edit is contained.
 *
 * ## Law 1 / Law 2
 *
 * Pure mapping functions only — no Supabase/Booqable I/O in this file. Every
 * external lookup (which booking a payment belongs to, which local ids are
 * already synced, which document numbers have been minted) is resolved by
 * `sync.ts` ahead of time and threaded through `PaymentSyncContext`, never
 * fetched here.
 *
 * ## Law 4 — payments immutable, corrections are reversal rows
 *
 * `payments` has `revoke update` at the database level
 * (`0006_finance.sql`) and `dataAccess.ts`'s `safeUpdate` hard-throws on it
 * too (`immutableTables`). This file NEVER returns anything resembling an
 * UPDATE for `payments`. When a previously-imported Booqable payment's hash
 * changes (`existingPayloadHashes` mismatch) — Booqable "edited" a payment —
 * this mapper returns BOTH:
 *   1. a `payment_reversals` insert, referencing the OLD local `payments.id`
 *      unchanged (the original row is never touched — "the row stays");
 *   2. a NEW `payments` insert carrying the corrected figures.
 * `sync.ts` is expected to insert both, then repoint `external_refs` (a
 * plain sync-bridge table, not money, not on `immutableTables`) at the new
 * row. `deposit_movements` carries the SAME `revoke update` /
 * `immutableTables` protection but this file defines NO correction
 * mechanism for it — see "Law 4 does not extend a defined correction path
 * to deposit_movements" below.
 *
 * ## Law 5 — THE classifier (spec §8.3) — fact 4 CONFIRMED 10 Aug 2026
 *
 * UNCONFIRMED_BOOQABLE_FACTS[4] (`types.ts`) is now resolved against the
 * official v4 docs (#payments, #payment-charges, #payment-authorizations,
 * #payment-refunds, #deposit-holds), and the answer INVERTS the original
 * assumption: a deposit is NOT a payment kind. Every payment record —
 * charges, authorizations AND refunds — carries a documented money split:
 * `amount_in_cents` ("The main payment amount (e.g., rental charges)"),
 * `deposit_in_cents` ("The deposit portion"), `total_in_cents` ("Always
 * equals amount + deposit"). The Payments resource is polymorphic on its
 * JSON:API `type` (payment_charges | payment_authorizations |
 * payment_refunds) and NONE of those types means "deposit". A single charge
 * can be part revenue, part deposit — mixed payments are legal and common.
 *
 * `classifyBooqablePayment` therefore uses the DOCUMENTED split as the
 * PRIMARY signal, over a FOUR-way output (the brief's original three plus
 * `'mixed'` — see "The two-row split" below for why the fourth member is the
 * honest shape and why the split is NOT done above the classifier):
 *   (a) confidently a deposit           → `security_deposits`/`deposit_movements`
 *       — a succeeded charge whose money is ENTIRELY deposit
 *         (deposit_in_cents > 0, amount_in_cents === 0), or an amount-only
 *         charge taken through the SECURITY DEPOSIT payment method (the
 *         spec's own configured fallback, kept as the SECONDARY signal).
 *   (b) confidently an ordinary payment → `payments` (insert-only)
 *       — a succeeded charge whose money is entirely amount
 *         (amount_in_cents > 0, deposit_in_cents === 0, method not the
 *         SECURITY DEPOSIT marker), or an amount-only refund through a method
 *         that is likewise not the SECURITY DEPOSIT marker (local
 *         payment_type 'Refund'). The method test applies to refunds exactly
 *         as it does to charges — see the third 'ambiguous' bullet below.
 *   (c) mixed                           → BOTH, split by portion (see below)
 *       — a succeeded CHARGE carrying both portions (amount_in_cents > 0
 *         AND deposit_in_cents > 0) whose two portions reconcile to
 *         total_in_cents.
 *   (d) ambiguous                       → `held`, imported into NEITHER
 *       table until a human classifies it. "A held row is recoverable, a
 *       misfiled one is not" (brief, verbatim). Held ON PURPOSE, not for
 *       lack of documentation:
 *         - ANY record whose portions are NEGATIVE or do not sum to total
 *           (amount < 0 || deposit < 0 || amount + deposit !== total). The
 *           sum test alone is not enough: it is the PORTIONS that get
 *           written, and a +amount/−deposit pair can reconcile to total
 *           while overstating revenue (or, mirrored, the trust liability) by
 *           the size of the negative side. Either way money exists that the
 *           two dimensions do not honestly account for, so no portion can be
 *           routed safely — least of all split in two. This check runs
 *           FIRST, for every record, and subsumes the older narrower guard
 *           for "both portions 0 but total > 0."
 *         - refunds carrying ANY deposit portion, AND refunds taken through
 *           the SECURITY DEPOSIT method: either way a deposit-refund is a
 *           trust RELEASE ('Released' movements are OS-side actions per
 *           §5.2 and this mapper only produces 'Received' ones) — held
 *           rather than misfiled as a revenue reversal. BOTH signals are
 *           required, not just the first: on an account that collects
 *           deposits as plain amount-only charges through that method (the
 *           secondary signal's whole reason for existing, below), every
 *           deposit REFUND is by construction amount-only too, so
 *           `deposit > 0` never fires for it — and a refund reaching
 *           `payments` as payment_type 'Refund' is trust money in the
 *           revenue ledger, reducing revenue while the `security_deposits`
 *           liability sits untouched. Deliberately checked BEFORE the mixed
 *           branch, so a mixed REFUND is held whole and never split: only
 *           charges are ever split.
 *         - a mixed CHARGE also taken through the SECURITY DEPOSIT method:
 *           the explicit `deposit_in_cents` dimension says "part revenue,"
 *           the configured method name says "all trust." Two authoritative
 *           signals contradicting each other is precisely the case Law 5
 *           wants a human on, not a coin flip.
 *         - authorizations that reach classification at all (see below —
 *           the loop skips them before classifying).
 *
 * Secondary signal, unchanged from the spec's own fallback plan: a payment
 * method named exactly `SECURITY DEPOSIT` (`ctx.paymentMethodNames`,
 * case-sensitive per "named exactly") marks an amount-only charge as a
 * deposit — for accounts that collect deposits as plain charges through a
 * dedicated method rather than via Booqable's deposit_in_cents dimension. It
 * marks the OTHER direction too: an amount-only REFUND through that same
 * method is a release of that same trust money, and is HELD (there is no
 * inbound release mechanism here), never booked as a revenue reversal.
 * The old `payment_type`-string signal sets are GONE: the `payment_type`
 * attribute they guessed at does not exist on the wire.
 *
 * ## Law 5 — the two-row split (mixed payments)
 *
 * Because a deposit is a DIMENSION and not a kind, a large share of real
 * charges are part revenue and part trust money. Holding all of them (the
 * previous conservative behaviour, correct while the architecture could not
 * express two destinations) piles most of production into the review queue
 * and defeats the bridge. A mixed charge is now SPLIT:
 *
 *   ONE Booqable payment record  →  a `payments` row carrying ONLY
 *                                   `amount_in_cents` (revenue), AND a
 *                                   `deposit_movements` row (plus its parent
 *                                   `security_deposits` row when the booking
 *                                   has none yet) carrying ONLY
 *                                   `deposit_in_cents` (trust).
 *
 * `total_in_cents` is NEVER written to either table. The invariant
 * `amount + deposit === total`, AND that neither portion is negative, are
 * both asserted before the split (and before every other classification) —
 * a record that violates the docs' own arithmetic, or that carries a portion
 * running the wrong way, is not safe to split and is held instead.
 *
 * Why a fourth classification rather than splitting above the classifier:
 * the brief's own rule is "every Booqable payment passes through this ONE
 * function before it reaches ANY destination array — never scatter this
 * logic across multiple call sites." A split decided in `mapPayments` (or
 * worse, in `sync.ts`) would be a SECOND place deciding revenue-vs-trust,
 * which is the exact failure mode Law 5 exists to prevent. Adding a member
 * to `PaymentClassification` is also a type-level WIDENING: the two
 * importers (`sync.ts`'s pre-pass, which compares against
 * `'ordinary_payment'`/`'deposit'` in an `if`/`else if` chain, and
 * `conflicts.ts`, which imports only `HeldPaymentRecord`) still compile
 * unchanged. `sync.ts` must nevertheless learn to MINT for the new member —
 * see "Atomicity" below and the sync-side requirements this pass reports.
 *
 * Atomicity — a split is all-or-nothing. Both halves need their own minted
 * document number (`payments.payment_no` AND `deposit_movements.movement_no`,
 * plus `security_deposits.deposit_no` on a booking's first deposit). If ANY
 * of them is missing, the mapper emits NEITHER row and logs a conflict:
 * half a split is a corrupted cash position, which is worse than a held
 * record.
 *
 * Law 9 — the two rows derive from ONE Booqable payment id, so their
 * `client_uuid` seeds MUST differ. They already do: `sync.ts`'s
 * `deterministicClientUuid(table, key)` hashes `booqable:<table>:<key>`, and
 * the TABLE component alone separates them —
 * `booqable:payments:<bqPaymentId>` vs
 * `booqable:deposit_movements:<bqPaymentId>` vs
 * `booqable:security_deposits:<bookingLocalId>`. The `key` component MUST
 * stay the bare Booqable payment id for the two payment-derived rows: any
 * suffix ("…:revenue") would change the seed and re-duplicate every already
 * imported row on the next pull instead of deduping via `idempotentInsert`'s
 * 23505 path.
 *
 * ONE documented exception, and only one: the Law-4 CORRECTION insert
 * (`PaymentInsertOp.correctionOfLocalId`, §4 below). That is the single push
 * in this file that emits a SECOND `payments` row for an external id which
 * already owns one, so the bare-id seed there resolves to the client_uuid the
 * ORIGINAL row already carries and `idempotentInsert` returns the original
 * instead of inserting the replacement — leaving the payment reversed to zero
 * with no replacement, and `external_refs` stamped as fully synced. For that
 * op alone the seed is suffixed with the record's payload HASH, which is a
 * pure function of the wire state: a retry of the SAME correction still
 * derives the SAME uuid (Law 9 dedup preserved), while a genuinely different
 * Booqable-side state derives a different one and inserts a real new row.
 * Never suffix with `payment_no`/`reversal_no` — both are minted per run.
 *
 * `external_refs`, by contrast, does NOT already disambiguate: its unique
 * key is `(provider, entity, external_id)`, so one Booqable payment id
 * mapping to two local rows needs two DIFFERENT `entity` values or the
 * second upsert silently overwrites the first's `local_id`. That is a
 * `sync.ts` change, reported by this pass, not something this pure mapper
 * can do.
 *
 * Partial-import repair — if a split's first row lands and the process dies
 * before the second, a later pull sees exactly ONE of the two refs. That is
 * indistinguishable, from the ref maps alone, from a genuine
 * RECLASSIFICATION (a record imported as ordinary that now reads mixed).
 * The payload hash is the discriminator: an UNCHANGED hash proves the record
 * was already mixed when the surviving ref was written, so the missing half
 * is emitted (an insert-only completion, never a correction). A CHANGED hash
 * cannot prove that, so it is logged and skipped. See `mapPayments`.
 *
 * Not imported at all (skipped before classification, by design):
 *   - `payment_authorizations` — pre-authorizations, not settled cash; a
 *     capture produces its own PaymentCharge (mode 'capture'), so importing
 *     the authorization too would double-count. Their cancel/expiry is also
 *     the docs' deposit-release path 1 (`deposit_released_in_cents` — no
 *     refund record is produced). TODO(decision): a third event class
 *     ("authorization released") is needed to mirror that release into the
 *     local deposit ledger; not invented in this pass.
 *   - records whose `status` is not `succeeded` — created/started/pending/
 *     action_required/processing/failed/canceled/expired records are not
 *     money that changed hands (charge status enum, docs). Skipping them is
 *     not a spec-§7 "silent drop": there is no completed event to record
 *     yet, and the record imports normally on the first pull after it
 *     succeeds (it never entered `external_refs`, so it is not
 *     hash-skipped).
 *
 * `deposit_holds` (docs #deposit-holds) never appear in the payments list —
 * they are a separate POST-only resource that WITHHOLDS already-collected
 *  deposit (creating a `deposit_charge` order line). They are structurally
 * outside this mapper; noted so nobody goes looking for a hold branch here.
 *
 * ## Law 4 does not extend a defined correction path to deposit_movements
 *
 * The brief's reversal instruction names `payments` specifically. If a
 * Booqable payment previously classified as a deposit (already sitting in
 * `deposit_movements`) later changes value, this file does NOT invent a
 * deposit-side reversal/correction mechanism — `deposit_movements` has no
 * `payment_reversals`-shaped sibling table in `0006_finance.sql`, and
 * inventing one here would be exactly the kind of unstated product decision
 * CLAUDE.md forbids. That case is logged to `conflicts` (field
 * `'deposit_movement_changed'`) and otherwise left untouched — a human
 * decides whether a correcting `'Released'`/`'Applied'` movement is needed.
 *
 * ## Reclassification on resync — never auto-moved between tables
 *
 * If a payment already imported as an ORDINARY payment (`existingPaymentRefs`
 * has it) re-classifies as `'deposit'`, `'mixed'` or `'ambiguous'` on a later
 * pull (its hash changed AND its Booqable-side signals now point elsewhere),
 * this file does NOT auto-migrate it into `deposit_movements`/`held` — that would mean
 * revenue quietly turning into a liability (or vice versa) with no human
 * decision point, the exact failure mode Law 5 exists to prevent. Logged to
 * `conflicts` (field `'classification'`) instead; the original `payments`
 * row is left exactly as it was.
 *
 * ## Money
 *
 * `amount_in_cents` maps 1:1 into `Paisa` — multiply nothing (Law 8 / spec
 * §8.2). BUT the real DB columns (`payments.amount`, `security_deposits.*`,
 * `deposit_movements.amount`, `payment_reversals.amount`) are all
 * `numeric(14,2)` DECIMAL rupee columns in `0006_finance.sql` — the same
 * money-boundary convention `orders.ts` already documents for
 * `booking_lines.rate`/`.discount_amount` and `products.ts` documents for
 * `products.daily_rate`. `toRupees()` is applied at the point a `Paisa`
 * value is placed into one of this file's `Local*Fields` objects —
 * arithmetic-only, never a display read.
 *
 * `total_in_cents <= 0` is rejected outright (both `payments_amount_positive`
 * and `deposit_movements_amount_positive` CHECK `amount > 0`) — logged to
 * `conflicts` and skipped before classification even runs. The guard is on
 * TOTAL, not `amount_in_cents`, because a pure-deposit charge legitimately
 * has `amount_in_cents === 0` (docs: total = amount + deposit); whichever
 * single portion a classified record routes is then itself > 0.
 *
 * Currency — spec §8.2 "Assert currency equals NPR on every import" is now
 * implementable PER RECORD: `currency` is a documented payment attribute
 * (CONFIRMED 10 Aug 2026, `types.ts` §12). Each record is asserted against
 * `'NPR'` and a mismatch skips + logs that record, never converts. The
 * batch-level `ctx.accountCurrency` assertion is retained as a cheap
 * account-wide tripwire (and because the context field is part of the
 * exported contract `sync.ts` already fulfils).
 *
 * ## §5.3 — invoice_id is ALWAYS null
 *
 * "The OS's own `invoices` table stays completely empty until cutover — no
 * mapper or sync code should ever insert into the `invoices` table." This
 * file never resolves or writes `payments.invoice_id` to anything but
 * `null` — there is no local invoice row an imported payment could
 * legitimately reference during the bridge. (Booqable's own invoice
 * documents mirror read-only into `external_invoices` via `documents.ts`,
 * a completely separate table from this schema's `invoices`.)
 *
 * ## booking / client / branch resolution
 *
 * A Booqable payment attribute set (`types.ts` §12) carries only `order_id`
 * — no field of its own resolving to `ResolvedOrder.clientLocalId`, no
 * `location_id` of its own either. `ctx.resolveOrder` is a
 * caller-supplied lookup returning the already-synced local booking/client/
 * branch triple for that order (from `orders.ts`'s own sync pass), exactly
 * mirroring `stock.ts`'s `resolveProductLocalId`/`resolveLocation` pattern —
 * one lookup, no second network round trip issued from inside this pure
 * mapper (Law 2). A payment whose order has not been synced yet is skipped
 * and reported, never inserted with a guessed booking.
 *
 * ## Document numbers — minted, never taken from Booqable; two gaps flagged
 *
 * `payments.payment_no` and `security_deposits.deposit_no` are both
 * `NOT NULL UNIQUE` with registered `number_sequences` prefixes (`PAY`,
 * `DEP` — `0007_admin_security.sql` line ~344) — same "caller mints, mapper
 * never invents" pattern `clients.ts`/`orders.ts` already use for
 * `client_code`/`booking_no`.
 *
 * TODO(decision) — `payment_reversals.reversal_no` and
 * `deposit_movements.movement_no` are ALSO `NOT NULL UNIQUE`, but
 * `0007_admin_security.sql`'s own comment enumerating registered prefixes
 * (`BK`/`CL`/`INV`/`PAY`/`DEP`/`EXP`/`EQ`) names NEITHER. `sync.ts` cannot
 * call `next_document_number('...')` for these two columns until a new
 * sequence key is registered by a future migration. Until then,
 * `ctx.mintedReversalNumbers`/`ctx.mintedDepositMovementNumbers` are
 * whatever `sync.ts` supplies by some other means; a record with no minted
 * number available is skipped and logged, never inserted with a guessed
 * number.
 *
 * ## The reversal's `approved_by` — caller-supplied, never invented
 *
 * `payment_reversals.approved_by` is `NOT NULL`. Auto-approving a financial
 * reversal from an unattended sync pass, using the same actor as
 * `reversed_by`, would be inventing an approval-policy decision this file
 * has no basis to make (the column's very existence implies a real human
 * approval is normally intended, the same shape of gate Law 10 enforces for
 * discounts). `ctx.systemReversalApproverUserId` is a SEPARATE, OPTIONAL
 * caller-supplied value — if absent, a Law-4 correction is logged to
 * `conflicts` and skipped rather than auto-approved.
 *
 * ## required_amount — never inferred from Booqable
 *
 * `security_deposits.required_amount` has no Booqable-side source at all. A
 * product-level `products.deposit_in_cents` exists on the wire
 * (`types.ts` §4) but is explicitly flagged there as answering a DIFFERENT
 * question (Booqable's per-item default deposit, not what this specific
 * booking's deposit requirement is) — never read into this field, per that
 * file's own warning not to conflate the two. `ctx.defaultRequiredDepositAmount`
 * (decimal rupees, optional, defaults to 0 — matching the column's own
 * `default 0`) is the only source; a real per-booking deposit REQUIREMENT
 * policy is Settings/OS-side business logic, out of scope for this pull
 * mapper.
 *
 * ## `security_deposits` balance columns — never written directly
 *
 * `received_amount`/`refunded_amount`/`applied_amount`/`pending_amount` are
 * NOT independently computed here. `sync_deposit_balances()`
 * (`0010_triggers_functions.sql`) recalculates all four automatically,
 * AFTER INSERT on `deposit_movements`, by summing that table — the moment
 * this mapper's `deposit_movements` insert lands, the trigger derives the
 * correct balance. This file only ever inserts a FRESH `security_deposits`
 * row (all four balance columns `0`, matching the column defaults) when a
 * booking has none yet — never an update to an existing one, which is also
 * why `security_deposits` needs no `LocalRowUpdate`-shaped export at all in
 * this file, unlike most sibling mappers.
 *
 * ## `bank_account_id` / `transaction_ref` — left null
 *
 * `BooqablePaymentAttributes` has a `payment_method_id`, but Booqable
 * "payment methods" (a client-facing label like "Cash"/"Card") is a
 * different concept from this schema's own `bank_accounts` (this business's
 * own bank/wallet accounts for RECEIVING money) — spec §5.1 places
 * `payment_methods` in "a payments mirror," not `bank_accounts`. No
 * confident mapping exists between the two, so both columns are always
 * `null` on every insert this file produces. The Booqable payment method's
 * name (when resolvable) is folded into `payments.notes` instead, purely
 * for audit traceability — never parsed back out of that free-text field by
 * anything.
 */

import type { Paisa } from '../../money'
import { toRupees } from '../../money'
import type { BooqableId, BooqablePaymentAttributes, BooqablePaymentResourceType } from '../types'
import type { BooqableFlatResource } from '../client'

/**
 * One flattened payment record off the wire. The type parameter is the
 * documented polymorphic discriminator (`payment_charges` |
 * `payment_authorizations` | `payment_refunds` — `types.ts` §12), NOT a
 * literal `'payments'`: /payments returns a MIX of the three subtypes and
 * the resource-level `type` is the only kind marker each record carries.
 */
export type BooqablePaymentRecord = BooqableFlatResource<BooqablePaymentResourceType, BooqablePaymentAttributes>

/* ── shared result / context shapes — same conflict shape every sibling
 * mapper uses; no generic `PullResult<TInsert, TUpdate>` here because this
 * file never returns an UPDATE for anything (see file header). ─────────── */

/**
 * Mirrors `sync_conflicts` (`0040_booqable_sync.sql`) minus DB-defaulted
 * columns, same shape as every sibling mapper. `owner` is always
 * `'booqable'` — every field this file ever writes is on the
 * Booqable-is-master side of §5.1 (with the §5.2 tension flagged above); a
 * conflict row only ever means "the inbound value could not be safely
 * applied," never a local-wins case.
 */
export interface SyncConflictInsert {
  entity: string
  local_id: string | null
  external_id: string | null
  field: string
  local_value: string | null
  external_value: string | null
  owner: 'booqable'
}

function conflict(localId: string | null, externalId: string | null, field: string, localValue: string | null, externalValue: string | null): SyncConflictInsert {
  return { entity: 'payments', local_id: localId, external_id: externalId, field, local_value: localValue, external_value: externalValue, owner: 'booqable' }
}

/** Cheap, non-cryptographic stable hash for change detection only (spec §7 rule 3) — same FNV-1a-32-over-sorted-JSON approach every sibling mapper uses, duplicated rather than imported so this file stays self-contained. Hashes only the fields this mapper actually reads — a Booqable-side change to a field this file ignores must never trigger a false "changed" result. */
export function computePaymentPayloadHash(record: BooqablePaymentRecord): string {
  const relevant = {
    type: record.type,
    status: record.status,
    amount_in_cents: record.amount_in_cents,
    deposit_in_cents: record.deposit_in_cents,
    total_in_cents: record.total_in_cents,
    currency: record.currency,
    payment_method_id: record.payment_method_id,
    succeeded_at: record.succeeded_at,
    order_id: record.order_id,
  }
  const stable = JSON.stringify(sortKeysDeep(relevant))
  let hash = 0x811c9dc5
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/* ── §1 · classifyBooqablePayment — THE Law 5 gate ───────────────────────
 * See file header "Law 5 — THE classifier" for the full reasoning.
 * UNCONFIRMED_BOOQABLE_FACTS[4] was CONFIRMED 10 Aug 2026 — the primary
 * signal is now the DOCUMENTED per-record money split (amount_in_cents vs
 * deposit_in_cents, total = amount + deposit), not guessed type strings.
 * The old DEPOSIT_TYPE_SIGNALS / ORDINARY_PAYMENT_TYPE_SIGNALS sets are
 * gone with the `payment_type` attribute they guessed at (it does not
 * exist on the wire). ──────────────────────────────────────────────────── */

/**
 * FOUR-way, not three — `'mixed'` was added when the two-row split was built
 * (see file header "Law 5 — the two-row split"). This is a type WIDENING:
 * existing consumers comparing against the other three members still compile.
 * A consumer that must handle every member exhaustively has to add a `'mixed'`
 * arm; `sync.ts`'s number-minting pre-pass is the one that materially must
 * (a mixed record needs BOTH a `payment_no` and a `movement_no` minted, or
 * the mapper refuses to emit either half).
 */
export type PaymentClassification = 'deposit' | 'ordinary_payment' | 'mixed' | 'ambiguous'

/** Spec §8.3's own stated fallback string — case-sensitive ("named exactly"), matched against a Booqable `payment_methods.name`. Kept as the SECONDARY signal: an account may collect deposits as plain amount-only charges through a method deliberately named this. */
export const SECURITY_DEPOSIT_METHOD_NAME = 'SECURITY DEPOSIT'

/** The SECONDARY signal's test, defined ONCE so `classifyBooqablePayment`, `heldReason` and the trust-side guard in `mapPayments` can never disagree about what counts as the marker method. */
function isSecurityDepositMethodName(paymentMethodName: string | null): boolean {
  return paymentMethodName !== null && paymentMethodName.trim() === SECURITY_DEPOSIT_METHOD_NAME
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * classifyBooqablePayment — every Booqable payment passes through this ONE
 * function before it reaches ANY destination array in `mapPayments` below.
 * Never scatter this logic across multiple call sites (brief, verbatim).
 *
 * Decision table, IN EVALUATION ORDER (docs-confirmed split as primary
 * signal — see file header for why each 'ambiguous' row is held on purpose,
 * and for why 'mixed' is a classifier member rather than a decision taken
 * above the classifier):
 *   payment_authorizations               → ambiguous (not settled cash; the
 *                                           loop normally skips these before
 *                                           classifying — this is defence in
 *                                           depth for any other caller)
 *   amount < 0 OR deposit < 0 OR
 *     amount + deposit !== total         → ambiguous (a portion running the
 *                                           wrong way, or money neither
 *                                           dimension accounts for — either
 *                                           way unroutable, and certainly
 *                                           unsplittable; subsumes the old
 *                                           both-portions-0 guard. The sum
 *                                           test alone does NOT catch a
 *                                           +amount/−deposit pair that still
 *                                           reconciles to total, and it is
 *                                           the PORTIONS that get written)
 *   payment_refunds, deposit > 0
 *     OR method = SECURITY DEPOSIT       → ambiguous (trust release — no
 *                                           inbound 'Released' mechanism, on
 *                                           EITHER signal: on an account that
 *                                           collects deposits as amount-only
 *                                           charges through that method, every
 *                                           deposit refund is amount-only too
 *                                           and deposit > 0 never fires;
 *                                           checked BEFORE the mixed row, so
 *                                           a mixed refund is held, never
 *                                           split — only charges split)
 *   payment_refunds, amount only,
 *     method not SECURITY DEPOSIT        → ordinary_payment (local 'Refund')
 *   ── payment_charges from here ──
 *   amount > 0 AND deposit > 0,
 *     method = SECURITY DEPOSIT          → ambiguous (contradictory signals:
 *                                           the dimension says part revenue,
 *                                           the method name says all trust)
 *   amount > 0 AND deposit > 0 (mixed)   → mixed — SPLIT: amount portion to
 *                                           `payments`, deposit portion to
 *                                           `security_deposits`/
 *                                           `deposit_movements`. Never the
 *                                           total in either.
 *   deposit > 0, amount === 0            → deposit
 *   amount > 0, method = SECURITY DEPOSIT → deposit (secondary signal)
 *   amount > 0 otherwise                 → ordinary_payment (docs: the
 *                                           amount portion IS the main/
 *                                           rental money, deposit excluded)
 * ═══════════════════════════════════════════════════════════════════════
 */
export function classifyBooqablePayment(
  record: BooqablePaymentRecord,
  paymentMethodName: string | null,
): PaymentClassification {
  if (record.type === 'payment_authorizations') {
    return 'ambiguous'
  }

  const amount = record.amount_in_cents
  const deposit = record.deposit_in_cents
  const isSecurityDepositMethod = isSecurityDepositMethodName(paymentMethodName)

  // Documented arithmetic invariant, checked FIRST and for EVERY record: the
  // docs state total_in_cents "Always equals amount + deposit". A record that
  // violates its own documentation has money in it that neither dimension
  // accounts for — routing any portion of it would silently lose the
  // remainder, and splitting it would invent an allocation. Held instead,
  // same doctrine as every other ambiguous row (a held row is recoverable, a
  // misfiled one is not). This subsumes the older, narrower guard that only
  // caught `amount === 0 && deposit === 0 && total > 0`.
  //
  // The sum test alone is NOT sufficient, because it is the PORTIONS that get
  // written, not the total: amount 50000 / deposit -20000 / total 30000
  // satisfies it, yet would book 500.00 of revenue against 300.00 actually
  // received, and the mirror case (amount -30000 / deposit 80000 / total
  // 50000) would overstate the trust liability by the same trick. Neither
  // portion may run the wrong way.
  if (amount < 0 || deposit < 0 || amount + deposit !== record.total_in_cents) {
    return 'ambiguous'
  }

  if (record.type === 'payment_refunds') {
    // A refund's deposit portion is a trust RELEASE — held, never a revenue
    // reversal, and never split (this mapper only produces 'Received'
    // movements). The SECURITY DEPOSIT method is the SAME fact arriving by the
    // file's other documented signal: on an account that collects deposits as
    // plain amount-only charges through that method, a deposit refund is by
    // construction amount-only too, so `deposit > 0` never fires for it and
    // the record would otherwise be booked into `payments` as a 'Refund' —
    // trust money in the revenue ledger, reducing revenue while leaving the
    // liability untouched (Law 5). Held on either signal. Only an amount-only
    // refund through some OTHER method is an ordinary revenue reversal.
    return deposit > 0 || isSecurityDepositMethod ? 'ambiguous' : 'ordinary_payment'
  }

  // payment_charges from here on.
  if (amount > 0 && deposit > 0) {
    // Contradictory signals — the explicit deposit dimension says "part
    // revenue," the configured SECURITY DEPOSIT method says "all trust."
    // Law 5 wants a human here, not a coin flip.
    if (isSecurityDepositMethod) {
      return 'ambiguous'
    }
    // MIXED — part revenue, part trust, in one wire record. Split downstream
    // by portion; the total is never written to either table.
    return 'mixed'
  }

  if (deposit > 0) {
    return 'deposit'
  }

  // Secondary signal — spec §8.3's configured marker, for deposits an
  // account collects as plain amount-only charges via a dedicated method.
  if (isSecurityDepositMethod) {
    return 'deposit'
  }

  return 'ordinary_payment'
}

/** Local `payment_type` for a CONFIDENTLY-ORDINARY payment — keyed off the documented polymorphic discriminator (CONFIRMED, fact 4): refunds map to the local 'Refund' enum member, charges to 'Advance Payment' (this table's own column default). Never reachable for a 'deposit' classification (payments_no_security_deposit CHECK would reject it anyway). */
function mapLocalPaymentType(bqType: BooqablePaymentResourceType): LocalPaymentType {
  return bqType === 'payment_refunds' ? 'Refund' : 'Advance Payment'
}

/** Folds the Booqable payment identity (when resolvable) into `payments.notes` for audit traceability only — never parsed back out by anything. See file header's `bank_account_id`/`transaction_ref` note for why this is the only place the method name is recorded. `isSplit` appends the one fact a reader of a mixed record's revenue row most needs: this row is a PORTION, and the rest of the wire record's money is in the trust ledger, not missing. */
function buildPaymentNote(record: BooqablePaymentRecord, paymentMethodName: string | null, isSplit = false): string {
  const methodLabel = paymentMethodName ?? record.payment_method_id ?? 'none'
  const base = `Booqable ${record.type} · provider: ${record.provider ?? 'none'} · payment_method: ${methodLabel}`
  return isSplit
    ? `${base} · mixed payment split (Law 5): revenue portion only — deposit portion ${record.deposit_in_cents} (minor units) recorded in deposit_movements`
    : base
}

/**
 * Why an ambiguous record is held, in the words a human reviewing the queue
 * needs. Mixed CHARGES are no longer here — they split (see file header);
 * everything still listed is held on purpose, and each string names the
 * specific condition so nobody has to re-derive it from the raw figures.
 */
function heldReason(record: BooqablePaymentRecord, paymentMethodName: string | null): string {
  if (record.amount_in_cents < 0 || record.deposit_in_cents < 0) {
    return `Booqable payment carries a NEGATIVE portion (amount_in_cents ${record.amount_in_cents}, deposit_in_cents ${record.deposit_in_cents}, total_in_cents ${record.total_in_cents}) — the two may still sum to the total, but it is the PORTIONS that get written, so routing them would overstate revenue or the deposit liability by the size of the negative side. Held per Law 5.`
  }
  if (record.amount_in_cents + record.deposit_in_cents !== record.total_in_cents) {
    return `Booqable payment violates the documented arithmetic (amount_in_cents ${record.amount_in_cents} + deposit_in_cents ${record.deposit_in_cents} !== total_in_cents ${record.total_in_cents}) — money exists that neither dimension accounts for, so no portion can be routed and the record cannot be split. Held per Law 5.`
  }
  if (record.type === 'payment_authorizations') {
    return 'Booqable payment_authorization — a pre-authorization, not settled cash. Its capture produces its own charge record and its cancel/expiry is a deposit release with no inbound mechanism here. Held rather than double-counted.'
  }
  if (record.type === 'payment_refunds' && record.deposit_in_cents > 0) {
    return 'Deposit-carrying Booqable refund — a trust RELEASE, and this mapper has no inbound release mechanism (Released movements are OS-side, spec §5.2). Held per Law 5 until a human records the release.'
  }
  if (record.type === 'payment_refunds' && isSecurityDepositMethodName(paymentMethodName)) {
    return `Booqable refund taken through the "${SECURITY_DEPOSIT_METHOD_NAME}" payment method — a trust RELEASE by the file's SECONDARY signal, carrying no deposit_in_cents portion because this account collects deposits as plain amount-only charges through that same method. This mapper has no inbound release mechanism (Released movements are OS-side, spec §5.2), and booking it into payments would put trust money in the revenue ledger. Held per Law 5 until a human records the release.`
  }
  if (record.amount_in_cents > 0 && record.deposit_in_cents > 0) {
    return `Mixed Booqable charge taken through the "${paymentMethodName ?? SECURITY_DEPOSIT_METHOD_NAME}" payment method — the deposit_in_cents dimension says part of it is revenue, the configured SECURITY DEPOSIT method name says all of it is trust money. Two authoritative signals contradicting each other; held per Law 5 for a human to resolve rather than split on a guess.`
  }
  return 'Booqable payment could not be confidently classified as revenue or trust money. Held per Law 5 — a held row is recoverable, a misfiled one is not.'
}

/* ── §2 · local row shapes — hand-typed from `0006_finance.sql`, not
 * imported from `types/database.ts` (same documented schema-drift caveat
 * `stock.ts`/`clients.ts` already give for that file). Only the columns
 * this mapper actually populates are modelled. ─────────────────────────── */

export type LocalPaymentType = 'Advance Payment' | 'Refund'

export interface LocalPaymentFields {
  booking_id: string
  /** Always `null` during the bridge — see file header §5.3 note. */
  invoice_id: null
  client_id: string
  branch_id: string
  /** Decimal rupees — `payments.amount` is `numeric(14,2)`; `toRupees()` applied at this DB-write boundary. */
  amount: number
  payment_type: LocalPaymentType
  /** Booqable's own `status` enum IS now confirmed (`types.ts` §12) and the mapper filters to `status === 'succeeded'` before anything is imported — so every row that reaches this table is settled money and lands as 'Received'. */
  status: 'Received'
  /** `succeeded_at ?? created_at` — `payments.payment_date` is `NOT NULL`; `succeeded_at` is the documented success timestamp (CONFIRMED, fact 4 — there is no plain `paid_at` on the wire) and is nullable in the type (`types.ts` §12). Both are raw Booqable AD/UTC ISO-8601 strings — Law 8, never converted here. The mapper only imports `status === 'succeeded'` records, so `succeeded_at` should be present in practice; the `created_at` fallback is defensive. */
  payment_date: string
  /** Always `null` — see file header. */
  bank_account_id: null
  /** Always `null` — see file header. */
  transaction_ref: null
  notes: string | null
  received_by: string
}

export interface LocalPaymentInsert extends LocalPaymentFields {
  payment_no: string
}

export interface LocalPaymentReversalFields {
  original_payment_id: string
  /** Decimal rupees — the ORIGINAL payment's amount, supplied by `ctx.existingPaymentAmounts` (this pure mapper never re-reads the database). */
  amount: number
  reason: string
  reversed_by: string
  approved_by: string
}

export interface LocalPaymentReversalInsert extends LocalPaymentReversalFields {
  reversal_no: string
}

export interface LocalSecurityDepositFields {
  booking_id: string
  client_id: string
  branch_id: string
  /** Decimal rupees. Never inferred from Booqable — see file header. */
  required_amount: number
  /** Always `0` on insert — the `sync_deposit_balances()` trigger recalculates this the moment the paired `deposit_movements` row lands. See file header. */
  received_amount: number
  refunded_amount: number
  applied_amount: number
  pending_amount: number
  created_by: string
}

export interface LocalSecurityDepositInsert extends LocalSecurityDepositFields {
  deposit_no: string
}

export interface LocalDepositMovementFields {
  /** This mapper only ever produces 'Received' movements — a Booqable payment event is money coming IN. 'Released'/'Applied' are OS-side deposit-lifecycle actions (spec §5.2), never inbound from Booqable. */
  movement_type: 'Received'
  /** Decimal rupees. */
  amount: number
  bank_account_id: null
  transaction_ref: null
  charge_type: null
  applied_reason: null
  handled_by: string
}

export interface LocalDepositMovementInsert extends LocalDepositMovementFields {
  movement_no: string
}

/* ── §3 · context — everything `sync.ts` must resolve/supply before calling
 * `mapPayments`. See the file-header TODO(decision)s for why each of these
 * can't be computed in here without inventing an answer. ───────────────── */

export interface ResolvedOrder {
  bookingLocalId: string
  clientLocalId: string
  branchLocalId: string
}

export interface PaymentSyncContext {
  /** Resolves a Booqable `order_id` to the already-synced local booking/client/branch triple (from `orders.ts`'s own sync pass) — one lookup, never a second network round trip from inside this pure mapper (Law 2). `undefined` ⇒ the parent order has not been synced yet; the payment is skipped and reported, never inserted with a guessed booking. */
  resolveOrder(orderExternalId: BooqableId): ResolvedOrder | undefined

  /** `external_refs`, entity `'payments'`, scoped to rows already imported into the ORDINARY `payments` table. Present ⇒ this Booqable payment was previously classified `'ordinary_payment'` and has a local `payments.id`. */
  existingPaymentRefs: ReadonlyMap<BooqableId, string>
  /** The CURRENT (pre-correction) decimal-rupee amount of an already-imported `payments` row, keyed the same way as `existingPaymentRefs` — needed to write a same-amount reversal (Law 4) without this pure mapper re-reading the database. */
  existingPaymentAmounts: ReadonlyMap<BooqableId, number>
  /** `external_refs` rows pointing into `deposit_movements` rather than `payments`. NO LONGER DISJOINT from `existingPaymentRefs`: a MIXED payment is split into one row in each table, so its Booqable id legitimately appears in BOTH maps (see file header "Law 5 — the two-row split"). Because `external_refs` is unique on `(provider, entity, external_id)`, `sync.ts` must record the two sides under DIFFERENT `entity` values — one wire id under a single entity cannot hold two `local_id`s. An id appearing in both maps for a NON-mixed record is a `sync.ts` defect and is logged, never guessed at. */
  existingDepositMovementRefs: ReadonlyMap<BooqableId, string>
  /** `external_refs.payload_hash` covering both maps above by the same external id — spec §7 rule 3 (equal hash ⇒ no write, no log noise), computed via `computePaymentPayloadHash`. For a split pair, `sync.ts` writes the SAME hash to both ref rows (it is one wire record), so this map stays single-valued. The hash is also the discriminator the partial-import repair path relies on — see file header. */
  existingPayloadHashes: ReadonlyMap<BooqableId, string>

  /** Local `security_deposits.id` already on record for a given local `bookings.id`. `security_deposits_booking_key` is UNIQUE on `booking_id` — a second deposit payment against the same booking must accumulate onto this SAME row (via a new `deposit_movements` insert only), never open a second `security_deposits` row. */
  existingSecurityDepositByBookingId: ReadonlyMap<string, string>

  /** Booqable `payment_methods.id` -> `.name` (`types.ts` §13), resolved once by `sync.ts`. Used ONLY by `classifyBooqablePayment`'s Signal 1; never written anywhere by this file. */
  paymentMethodNames: ReadonlyMap<BooqableId, string>

  /** See file header currency note (same gap `documents.ts`/`orders.ts`/`products.ts` already document for their own entities). Asserted against `'NPR'` for the whole batch; a mismatch skips and logs every record in this call, never converts. */
  accountCurrency: string

  /** External Booqable payment id -> a freshly minted `PAY-YYYY-NNNN` from `next_document_number('PAY')` — for every NEW ordinary-payment import, every corrected re-insert after a Law-4 reversal, AND the revenue half of every `'mixed'` record. */
  mintedPaymentNumbers: ReadonlyMap<BooqableId, string>
  /** External Booqable payment id -> a freshly minted `deposit_movements.movement_no` — for every new `'deposit'` import AND the trust half of every `'mixed'` record. TODO(decision) — see file header: no registered `number_sequences` prefix exists for this column yet; whatever `sync.ts` supplies here is used as-is. A `'mixed'` record missing EITHER this or its `mintedPaymentNumbers` entry is abandoned whole (neither half emitted) — half a split is a corrupted cash position. */
  mintedDepositMovementNumbers: ReadonlyMap<BooqableId, string>
  /** Local `bookings.id` -> a freshly minted `DEP-YYYY-NNNN` from `next_document_number('DEP')` — ONE entry per booking that needs a brand-new `security_deposits` row opened in this batch (i.e. not already present in `existingSecurityDepositByBookingId`), counting `'mixed'` records as well as `'deposit'` ones, since a mixed record's trust half opens the same parent row. */
  mintedSecurityDepositNumbers: ReadonlyMap<string, string>
  /** External Booqable payment id -> a freshly minted `payment_reversals.reversal_no`. TODO(decision) — same registered-prefix gap as `mintedDepositMovementNumbers` above. */
  mintedReversalNumbers: ReadonlyMap<BooqableId, string>

  /** `users.id` for `payments.received_by` / `deposit_movements.handled_by` / `payment_reversals.reversed_by` — this sync has no human in the loop, same reasoning `orders.ts`'s `systemActorUserId` already gives. */
  systemActorUserId: string
  /** `users.id` for `payment_reversals.approved_by`. Deliberately SEPARATE from `systemActorUserId` and OPTIONAL — see file header "The reversal's approved_by." Absent ⇒ a Law-4 correction is logged to `conflicts` and skipped, never auto-approved. */
  systemReversalApproverUserId?: string | undefined

  /** Decimal rupees, optional, defaults to `0` (matching the column's own default) — see file header "required_amount." Never inferred from Booqable. */
  defaultRequiredDepositAmount?: number | undefined
}

const EXPECTED_CURRENCY = 'NPR'
const SYNC_REVERSAL_REASON =
  'Booqable payment amount/details changed after import — corrected via reversal (synced automatically), never an in-place edit (Law 4).'

/* ── §4 · result shapes ───────────────────────────────────────────────── */

export interface PaymentInsertOp {
  externalId: BooqableId
  fields: LocalPaymentInsert
  /**
   * Set ONLY on the Law-4 correction path (`payments.id` of the row this
   * insert REPLACES — the one the paired `PaymentReversalInsertOp` reverses).
   * Absent on a first import and on a split's repair completion.
   *
   * Why the discriminator exists at all: the file header's Law 9 note tells
   * `sync.ts` to seed `client_uuid` off the BARE Booqable payment id, which
   * is right for a first import (a retry must dedup onto the row already
   * written) and fatally wrong here — a correction is the ONE case where a
   * SECOND `payments` row is emitted for an external id that already owns
   * one, so the bare-id seed derives the client_uuid the original row already
   * carries and `idempotentInsert` returns the original instead of inserting
   * the replacement. That leaves the payment reversed with no replacement.
   * `sync.ts` branches on this field to use a distinct-but-retry-stable seed
   * (the record's payload hash) for correction inserts only.
   */
  correctionOfLocalId?: string
}

export interface PaymentReversalInsertOp {
  /** The Booqable payment id this reversal corrects — not a fresh external id of its own (Booqable has no reversal-shaped resource); carried only for `sync_log`/traceability. */
  externalId: BooqableId
  fields: LocalPaymentReversalInsert
}

export interface SecurityDepositInsertOp {
  bookingLocalId: string
  fields: LocalSecurityDepositInsert
}

export interface DepositMovementInsertOp {
  externalId: BooqableId
  /** Correlates this op to a `SecurityDepositInsertOp.bookingLocalId` in the SAME batch (or to `ctx.existingSecurityDepositByBookingId`) — `sync.ts` resolves/creates the parent `security_deposits` row FIRST and attaches its id as `security_deposit_id` before inserting these fields; this pure mapper never fabricates that id itself. */
  bookingLocalId: string
  fields: LocalDepositMovementInsert
}

/**
 * A Booqable payment `classifyBooqablePayment` could not confidently place
 * in either destination table. Per this file's brief: "a held row is
 * recoverable, a misfiled one is not." No dedicated review-queue table
 * exists in the schema yet (`0040_booqable_sync.sql` has no such table) —
 * `sync.ts` decides where to persist these (e.g. `sync_conflicts` with a
 * distinguishing field, pending a real review-queue table), but MUST NOT
 * insert a held record into `payments` OR `deposit_movements` under any
 * circumstance.
 */
export interface HeldPaymentRecord {
  externalId: BooqableId
  bookingLocalId: string
  /** The documented polymorphic discriminator (`payment_charges` | `payment_authorizations` | `payment_refunds`) — the field name predates fact 4's confirmation and is kept for `conflicts.ts`'s stable rendering. */
  rawPaymentType: string
  paymentMethodName: string | null
  /** `total_in_cents` — the WHOLE record's money (amount + deposit), since a held record is held whole, never half-filed. */
  amountInCents: number
  reason: string
}

export interface PaymentsPullResult {
  paymentsToInsert: PaymentInsertOp[]
  reversalsToInsert: PaymentReversalInsertOp[]
  securityDepositsToInsert: SecurityDepositInsertOp[]
  depositMovementsToInsert: DepositMovementInsertOp[]
  held: HeldPaymentRecord[]
  conflicts: SyncConflictInsert[]
}

const EMPTY_RESULT: PaymentsPullResult = {
  paymentsToInsert: [],
  reversalsToInsert: [],
  securityDepositsToInsert: [],
  depositMovementsToInsert: [],
  held: [],
  conflicts: [],
}

/* ── §5 · mapPayments — the whole file's entry point ─────────────────────── */

export function mapPayments(
  records: readonly BooqablePaymentRecord[],
  ctx: PaymentSyncContext,
): PaymentsPullResult {
  // spec §8.2 — assert currency once, account-wide (see file header
  // TODO(decision) on why this cannot be a per-record wire-field check). A
  // non-NPR account currency skips and logs every record in this batch,
  // never converts.
  if (ctx.accountCurrency !== EXPECTED_CURRENCY) {
    const conflicts: SyncConflictInsert[] = records.map((record) =>
      conflict(
        ctx.existingPaymentRefs.get(record.id) ?? ctx.existingDepositMovementRefs.get(record.id) ?? null,
        record.id,
        'currency',
        null,
        ctx.accountCurrency,
      ),
    )
    return { ...EMPTY_RESULT, conflicts }
  }

  const paymentsToInsert: PaymentInsertOp[] = []
  const reversalsToInsert: PaymentReversalInsertOp[] = []
  const securityDepositsToInsert: SecurityDepositInsertOp[] = []
  const depositMovementsToInsert: DepositMovementInsertOp[] = []
  const held: HeldPaymentRecord[] = []
  const conflicts: SyncConflictInsert[] = []

  // Tracks bookings for which this SAME batch has already queued a brand-new
  // security_deposits row, so a second deposit payment against the same
  // booking in one pull accumulates onto the queued row instead of trying
  // to open a second one (security_deposits_booking_key is UNIQUE).
  const securityDepositsQueuedThisBatch = new Set<string>()

  /**
   * Queues the TRUST side of one Booqable payment — the parent
   * `security_deposits` row when the booking has none yet, plus its
   * `deposit_movements` child. Checks every minted number it needs BEFORE
   * pushing anything, so it either queues both rows or queues nothing:
   * a caller mid-split can abandon the whole record on `false` without
   * having already half-filed it. `depositPaisa` is the portion to record —
   * ONLY `deposit_in_cents` for a mixed record, never the total.
   */
  const queueTrustRows = (externalId: BooqableId, resolved: ResolvedOrder, depositPaisa: Paisa): boolean => {
    const movementNo = ctx.mintedDepositMovementNumbers.get(externalId)
    if (movementNo === undefined) {
      conflicts.push(conflict(null, externalId, 'movement_no', null, null))
      return false
    }

    const needsNewParent =
      !ctx.existingSecurityDepositByBookingId.has(resolved.bookingLocalId) &&
      !securityDepositsQueuedThisBatch.has(resolved.bookingLocalId)
    const depositNo = needsNewParent ? ctx.mintedSecurityDepositNumbers.get(resolved.bookingLocalId) : undefined
    if (needsNewParent && depositNo === undefined) {
      conflicts.push(conflict(null, externalId, 'deposit_no', null, null))
      return false
    }

    if (needsNewParent && depositNo !== undefined) {
      securityDepositsToInsert.push({
        bookingLocalId: resolved.bookingLocalId,
        fields: {
          deposit_no: depositNo,
          booking_id: resolved.bookingLocalId,
          client_id: resolved.clientLocalId,
          branch_id: resolved.branchLocalId,
          required_amount: ctx.defaultRequiredDepositAmount ?? 0,
          received_amount: 0,
          refunded_amount: 0,
          applied_amount: 0,
          pending_amount: 0,
          created_by: ctx.systemActorUserId,
        },
      })
      securityDepositsQueuedThisBatch.add(resolved.bookingLocalId)
    }

    depositMovementsToInsert.push({
      externalId,
      bookingLocalId: resolved.bookingLocalId,
      fields: {
        movement_no: movementNo,
        movement_type: 'Received',
        amount: toRupees(depositPaisa),
        bank_account_id: null,
        transaction_ref: null,
        charge_type: null,
        applied_reason: null,
        handled_by: ctx.systemActorUserId,
      },
    })
    return true
  }

  for (const record of records) {
    const externalId = record.id
    const existingPaymentLocalId = ctx.existingPaymentRefs.get(externalId)
    const existingDepositMovementLocalId = ctx.existingDepositMovementRefs.get(externalId)
    /**
     * Both refs present. Legal for exactly ONE reason: this wire record was
     * previously SPLIT (mixed) into a `payments` row and a
     * `deposit_movements` row. For any other classification it is a `sync.ts`
     * defect — handled below, after classification, rather than by a blanket
     * pre-check, because the two cases are only distinguishable once the
     * record has been classified.
     */
    const hasBothRefs = existingPaymentLocalId !== undefined && existingDepositMovementLocalId !== undefined

    const knownLocalId = existingPaymentLocalId ?? existingDepositMovementLocalId ?? null

    // Authorizations are never imported — not settled cash; their capture
    // produces its own PaymentCharge and their cancel/expiry is the docs'
    // deposit-release path (see file header, "Not imported at all").
    // Skipped silently by design: there is no completed money event here.
    if (record.type === 'payment_authorizations') {
      continue
    }

    // Only succeeded records are money that changed hands (docs status
    // enums, `types.ts` §12). A not-yet-succeeded record imports normally
    // on the first pull after it succeeds — see file header for why this
    // is not a spec-§7 silent drop.
    if (record.status !== 'succeeded') {
      continue
    }

    // spec §8.2 per-record currency assertion — `currency` is a documented
    // payment attribute (CONFIRMED, fact 4 pass). Skip + log, never convert.
    if (record.currency !== EXPECTED_CURRENCY) {
      conflicts.push(conflict(knownLocalId, externalId, 'currency', null, record.currency))
      continue
    }

    // Amount guard — both payments_amount_positive and
    // deposit_movements_amount_positive CHECK `amount > 0`. Guarded on
    // TOTAL (= amount + deposit, docs) because a pure-deposit charge
    // legitimately has amount_in_cents === 0; the single routed portion in
    // each classified branch below is then itself > 0.
    if (record.total_in_cents <= 0) {
      conflicts.push(conflict(knownLocalId, externalId, 'amount', null, String(record.total_in_cents)))
      continue
    }

    // order_id is nullable on the wire (cart payments — `types.ts` §12).
    // A payment with no order cannot be attached to any booking; logged,
    // never guessed.
    if (record.order_id === null) {
      conflicts.push(conflict(knownLocalId, externalId, 'order_id', null, null))
      continue
    }

    const resolved = ctx.resolveOrder(record.order_id)
    if (!resolved) {
      conflicts.push(conflict(knownLocalId, externalId, 'order_id', null, record.order_id))
      continue
    }

    const paymentMethodName = record.payment_method_id !== null ? (ctx.paymentMethodNames.get(record.payment_method_id) ?? null) : null
    const classification = classifyBooqablePayment(record, paymentMethodName)

    // The two portions, per the documented split (total = amount + deposit —
    // an invariant the classifier asserts before it routes anything). Exactly
    // ONE of them reaches a table for a 'deposit'/'ordinary_payment' record;
    // BOTH do, into DIFFERENT tables, for a 'mixed' one. `total_in_cents`
    // reaches NEITHER table, ever — that is Law 5's whole point.
    const revenuePaisa = record.amount_in_cents as Paisa
    // The TRUST portion is deliberately NOT computed once for every record.
    // A single shared `deposit_in_cents > 0 ? deposit : amount` ternary is
    // correct today only through an implicit, unasserted coupling — that the
    // ONLY route to a 'deposit' classification with deposit_in_cents === 0 is
    // the SECURITY-DEPOSIT-method branch, where the amount portion genuinely
    // IS the trust money. Any future route to 'deposit' that broke that
    // coupling would send revenue into `deposit_movements` with nothing
    // failing (both portions are plain numbers branded to the same `Paisa`).
    // So each trust-side call site names its own portion instead: a mixed
    // record always has deposit_in_cents > 0 (classifier), and the 'deposit'
    // branch below re-establishes the coupling explicitly before it routes.
    const mixedDepositPaisa = record.deposit_in_cents as Paisa

    /** The revenue row's fields — one builder, so the amount written can only ever be the revenue portion, on all four paths that insert into `payments`. */
    const paymentFields = (paymentNo: string): LocalPaymentInsert => ({
      payment_no: paymentNo,
      booking_id: resolved.bookingLocalId,
      invoice_id: null,
      client_id: resolved.clientLocalId,
      branch_id: resolved.branchLocalId,
      amount: toRupees(revenuePaisa),
      payment_type: mapLocalPaymentType(record.type),
      status: 'Received',
      payment_date: record.succeeded_at ?? record.created_at,
      bank_account_id: null,
      transaction_ref: null,
      notes: buildPaymentNote(record, paymentMethodName, classification === 'mixed'),
      received_by: ctx.systemActorUserId,
    })

    const hash = computePaymentPayloadHash(record)
    const hashUnchanged = ctx.existingPayloadHashes.get(externalId) === hash
    const isResync = knownLocalId !== null
    // A mixed record counts as fully imported only once BOTH of its rows
    // exist. Exactly one ref present ⇒ the split was interrupted between the
    // two writes, and an unchanged hash proves the record was already mixed
    // when the surviving row landed — so it must NOT be skipped as
    // up-to-date; it falls through to the repair path below.
    const halfImportedSplit = classification === 'mixed' && isResync && !hasBothRefs
    if (isResync && hashUnchanged && !halfImportedSplit) {
      // spec §7 rule 3 — unchanged, no write, no log noise.
      continue
    }

    if (isResync) {
      if (classification === 'mixed') {
        if (!hashUnchanged) {
          // A split that changed on Booqable's side. `payments` has a defined
          // Law-4 correction path; `deposit_movements` has none (file header,
          // "Law 4 does not extend a defined correction path…"), so a mixed
          // correction could only ever be applied to HALF the record — the
          // corrupted-cash-position outcome the split exists to avoid.
          // Logged for a human; nothing written, neither row touched.
          conflicts.push(conflict(knownLocalId, externalId, 'mixed_payment_changed', hasBothRefs ? 'split' : 'partial_split', hash))
          continue
        }
        // Unchanged hash + a missing half ⇒ interrupted split. Emit ONLY the
        // absent half: an insert-only completion, never a correction.
        if (existingPaymentLocalId === undefined) {
          const repairPaymentNo = ctx.mintedPaymentNumbers.get(externalId)
          if (repairPaymentNo === undefined) {
            conflicts.push(conflict(knownLocalId, externalId, 'payment_no', null, null))
            continue
          }
          paymentsToInsert.push({ externalId, fields: paymentFields(repairPaymentNo) })
          continue
        }
        // The trust half is the missing one. `queueTrustRows` logs its own
        // conflict and queues nothing if a number is unavailable.
        queueTrustRows(externalId, resolved, mixedDepositPaisa)
        continue
      }

      if (hasBothRefs) {
        // Two local rows for one wire id, but the record no longer reads
        // mixed — a reclassification away from a split, or a `sync.ts` ref
        // defect. Either way never auto-migrated (file header,
        // "Reclassification on resync"). Logged, nothing touched.
        conflicts.push(conflict(knownLocalId, externalId, 'classification', 'mixed', classification))
        continue
      }

      if (existingPaymentLocalId !== undefined) {
        // Previously imported as an ORDINARY payment and something changed.
        if (classification !== 'ordinary_payment') {
          // Reclassification red flag — see file header. Never auto-moved.
          conflicts.push(conflict(existingPaymentLocalId, externalId, 'classification', 'ordinary_payment', classification))
          continue
        }
        if (!ctx.systemReversalApproverUserId) {
          conflicts.push(conflict(existingPaymentLocalId, externalId, 'approved_by', null, null))
          continue
        }
        const reversalNo = ctx.mintedReversalNumbers.get(externalId)
        const newPaymentNo = ctx.mintedPaymentNumbers.get(externalId)
        const originalAmount = ctx.existingPaymentAmounts.get(externalId)
        if (reversalNo === undefined || newPaymentNo === undefined || originalAmount === undefined) {
          conflicts.push(conflict(existingPaymentLocalId, externalId, 'reversal_no', null, null))
          continue
        }

        reversalsToInsert.push({
          externalId,
          fields: {
            reversal_no: reversalNo,
            original_payment_id: existingPaymentLocalId,
            amount: originalAmount,
            reason: SYNC_REVERSAL_REASON,
            reversed_by: ctx.systemActorUserId,
            approved_by: ctx.systemReversalApproverUserId,
          },
        })
        // `correctionOfLocalId` — see PaymentInsertOp. This is the only push
        // in this file that emits a payments row for an external id that
        // ALREADY has one, so it is the only one whose `client_uuid` seed
        // must differ from the bare-id seed the other three use.
        paymentsToInsert.push({ externalId, fields: paymentFields(newPaymentNo), correctionOfLocalId: existingPaymentLocalId })
        continue
      }

      if (existingDepositMovementLocalId !== undefined) {
        // Previously imported as a DEPOSIT and something changed — no
        // correction mechanism defined for deposit_movements. See file
        // header "Law 4 does not extend a defined correction path…".
        conflicts.push(conflict(existingDepositMovementLocalId, externalId, 'deposit_movement_changed', null, hash))
        continue
      }
    }

    // Brand-new Booqable payment id — never seen by either external_refs map.
    if (classification === 'deposit') {
      // Exactly TWO documented routes reach 'deposit', and they carry the
      // trust money in DIFFERENT fields — so which field is the trust portion
      // is decided here, explicitly, never by a fallback ternary:
      //   deposit_in_cents > 0            → that portion is the trust money;
      //   amount-only + SECURITY DEPOSIT  → the amount portion IS the trust
      //                                     money (spec §8.3's secondary
      //                                     signal).
      // Any OTHER route arriving here with no deposit portion would be
      // ordinary REVENUE heading into the trust ledger — refused and logged,
      // never guessed at. This cannot fire against today's classifier; it
      // exists so that it stays true of tomorrow's.
      let trustPaisa: Paisa
      if (record.deposit_in_cents > 0) {
        trustPaisa = record.deposit_in_cents as Paisa
      } else if (isSecurityDepositMethodName(paymentMethodName)) {
        trustPaisa = record.amount_in_cents as Paisa
      } else {
        conflicts.push(conflict(knownLocalId, externalId, 'deposit_amount', null, String(record.amount_in_cents)))
        continue
      }
      queueTrustRows(externalId, resolved, trustPaisa)
      continue
    }

    // ── THE SPLIT (Law 5) ────────────────────────────────────────────────
    // One wire record becomes TWO ledger rows: the revenue portion into
    // `payments`, the trust portion into `security_deposits`/
    // `deposit_movements`. Never the total in either. All-or-nothing — the
    // `payment_no` is verified BEFORE any trust row is queued, and
    // `queueTrustRows` itself queues nothing unless it has every number it
    // needs, so a missing number leaves the record wholly unimported rather
    // than half-filed.
    if (classification === 'mixed') {
      const splitPaymentNo = ctx.mintedPaymentNumbers.get(externalId)
      if (splitPaymentNo === undefined) {
        conflicts.push(conflict(null, externalId, 'payment_no', null, null))
        continue
      }
      if (!queueTrustRows(externalId, resolved, mixedDepositPaisa)) {
        continue
      }
      paymentsToInsert.push({ externalId, fields: paymentFields(splitPaymentNo) })
      continue
    }

    if (classification === 'ordinary_payment') {
      const paymentNo = ctx.mintedPaymentNumbers.get(externalId)
      if (paymentNo === undefined) {
        conflicts.push(conflict(null, externalId, 'payment_no', null, null))
        continue
      }

      paymentsToInsert.push({ externalId, fields: paymentFields(paymentNo) })
      continue
    }

    // classification === 'ambiguous'
    held.push({
      externalId,
      bookingLocalId: resolved.bookingLocalId,
      rawPaymentType: record.type,
      paymentMethodName,
      amountInCents: record.total_in_cents,
      reason: heldReason(record, paymentMethodName),
    })
  }

  return { paymentsToInsert, reversalsToInsert, securityDepositsToInsert, depositMovementsToInsert, held, conflicts }
}

/* ── §6 · uniform dispatcher for sync.ts ─────────────────────────────────
 * Matches `products.ts`/`clients.ts`/`documents.ts`'s `pull(entity,
 * rawRecords, ctx)` call shape so `sync.ts` can drive all seven mapper
 * files identically, even though this file only ever handles the one
 * `'payments'` entity.
 */

export type PaymentEntity = 'payments'

export function pull(
  entity: PaymentEntity,
  rawRecords: readonly BooqablePaymentRecord[],
  ctx: PaymentSyncContext,
): PaymentsPullResult {
  switch (entity) {
    case 'payments':
      return mapPayments(rawRecords, ctx)
  }
}
