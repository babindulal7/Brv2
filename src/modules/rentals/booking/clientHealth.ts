/**
 * **Client health engine — "New Booking" spec §12–13.**
 *
 * One pure module, no JSX, so the combobox row, the quick-view drawer, the
 * history drawer and (later) any other screen that needs "is this client OK to
 * book?" all read the *same* verdict instead of each re-deriving it from
 * `outstandingPaisa` by hand. That re-derivation is exactly how the same client
 * ends up green on one screen and red on another.
 *
 * ## Why the verdict carries reasons
 *
 * CLAUDE.md's "never colour alone" law: a colour is never the sole carrier of
 * meaning. So `clientHealth()` never returns just a level — it returns the
 * level *with* the human-readable reasons that produced it. The chip renders
 * icon + label + colour, and the quick-view and tooltip render the reasons.
 * There is deliberately no code path that gets a colour without a sentence.
 *
 * ## What this module refuses to do
 *
 * Several signals §12–13 names are simply **not in the data layer**
 * (`src/data/clients.ts`). Rather than invent a plausible number — which would
 * make a fabricated figure look like a fact on a booking screen — those signals
 * are modelled as an *input* (`ClientHealthSignals`) that the caller may supply
 * once a real source exists, and `deriveClientHealthSignals()` returns them
 * genuinely **absent** today. An absent signal contributes nothing; it never
 * silently reads as zero-and-therefore-fine, and the quick-view renders it as
 * an honest em-dash.
 *
 * ## The one absent signal that is NOT allowed to contribute nothing
 *
 * "Contributes nothing" is the right default for a signal that can only ever
 * *add* a reason — an overdue invoice count that is missing cannot make a
 * client look better than they are.
 *
 * **Credit used is different.** It is the denominator of a blocker
 * ("credit limit exceeded"), so treating its absence as nothing is the same as
 * asserting the client is within their limit. See `creditCheck` below: when the
 * check cannot be run it returns `unavailable`, and `clientHealth` raises that
 * as a *critical* reason. A safety check that cannot be computed withholds the
 * verdict; it does not pass it.
 */

import { formatMoney, rupees } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import type { StatusKey } from '../../../lib/status'
import type { ClientRecord } from '../../../data/clients'
import type { IconName } from '../../../components/ui/Icon'

/* ════════════════════════════════════════════════════════════════════════
 * THRESHOLDS — the one block a human rules on
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ **TODO(decision)** — every number in this block is a *placeholder*, not a
 * ruling.
 *
 * The New Booking spec §12–13 says "significant outstanding balance" (Red) and
 * "small outstanding balance" (Orange), and "credit limit exceeded" (Red) vs
 * "credit limit approaching" (Orange). It never states where significant stops
 * being small, or how close "approaching" is. PLAN.md carries no ruling on it
 * either. These are business rules for the owner, not a developer's guess to
 * bury inline — so they live here, named, in one place, and every threshold in
 * the engine reads from this object. Change a number here and every screen
 * moves together.
 *
 * Record the real values in PLAN.md §4 and delete this warning.
 */
export const CLIENT_HEALTH_THRESHOLDS = {
  /**
   * At or above this outstanding balance the client is Red ("significant").
   * Below it, but above zero, the client is Orange ("small").
   *
   * Placeholder rationale, stated so it can be argued with: Rs 50,000 is
   * roughly one mid-size camera package for a few days in this catalogue, i.e.
   * about one unpaid booking. Not a ruling.
   */
  significantOutstandingPaisa: rupees(50_000) as Paisa,

  /**
   * Fraction of the credit limit at or above which the client is Orange
   * ("approaching"). Exceeding the limit outright (ratio > 1) is Red.
   */
  creditLimitApproachingRatio: 0.8,

  /**
   * Whether a client with **no credit limit configured** (`creditLimitPaisa`
   * is 0) counts as "credit limit exceeded" the moment they owe anything.
   *
   * Placeholder answer: **no**. A zero in this seed layer reads as "no credit
   * facility has been set up yet", not "this client is allowed zero credit" —
   * and the outstanding-balance thresholds above already catch a real balance.
   * Treating 0 as a hard limit would turn every un-configured client red on
   * their first unpaid rupee. Genuinely ambiguous; needs a ruling.
   */
  zeroCreditLimitMeansNoCredit: true,

  /**
   * Whether KYC state feeds health at all.
   *
   * §12–13 does **not** enumerate KYC. But a client whose KYC was *Rejected*
   * reading "Good — no issues" on the booking screen is the kind of quiet
   * omission this product's laws exist to prevent, so it is included and
   * flagged rather than silently dropped. Set to `false` to take KYC out of
   * health entirely without touching the engine.
   */
  kycAffectsHealth: true,

  /**
   * Days-until-due at or under which "payment due soon" fires (Orange).
   * Inert today — nothing in the data layer carries an invoice due date; see
   * `ClientHealthSignals.paymentDueInDays`.
   */
  paymentDueSoonDays: 7,
} as const

/* ════════════════════════════════════════════════════════════════════════
 * SIGNALS THE DATA LAYER DOES NOT CARRY YET
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Signals §12–13 names that **no field in `src/data/clients.ts` supplies**.
 *
 * Every one is optional and every one is genuinely absent today. The engine
 * accepts them so that the day a real source exists (Phase 2's booking /
 * invoice / return queries) the wiring is a one-line change at the call site
 * rather than a rewrite of the rules.
 *
 * ⚠ TODO(decision) — none of these can be derived from the current seed layer:
 *
 * - `overdueInvoiceCount` — there is no invoices table, and no client-scoped
 *   invoice list, anywhere in `src/data/`. `booking.ts`'s `PAYMENT_HISTORY` is
 *   two rows belonging to one demo booking, not a per-client ledger.
 * - `unreturnedUnitCount` — `bookings.actual_return_at` is a column nothing in
 *   the repo ever writes (see the note on `lateFee` in `lib/money.ts`), so
 *   "still out past the return date" is not computable.
 * - `currentlyMissingUnitCount` / `unresolvedDamageChargePaisa` —
 *   `ClientRecord.reliability` carries *lifetime case counts*
 *   (`missingCases`, `damageCases`) with **no resolution state**. A settled
 *   damage case from last year and an open one from yesterday are the same
 *   number there. Those lifetime counts are therefore treated below as
 *   *history* (Orange, "previous issue"), never as an open Red condition —
 *   promoting them to Red would flag long-resolved cases forever.
 * - `depositPendingPaisa` — `depositHeldPaisa` is the deposit *held*, which is
 *   the opposite of pending. Deposit-pending is a per-booking figure and lives
 *   on the booking, not the client.
 * - `paymentDueInDays` — no due dates exist; see `overdueInvoiceCount`.
 * - `creditUsedPaisa` — the one whose absence is *dangerous* rather than merely
 *   incomplete. See `creditCheck`.
 */
export interface ClientHealthSignals {
  /**
   * How much of the client's approved credit limit is currently committed.
   *
   * **The only source this engine will accept for the credit-limit check.**
   * Supply it only from a figure something actually computed; leaving it absent
   * is not a neutral choice, it makes the check report `unavailable` and the
   * client read as Attention Required. That is deliberate — see `creditCheck`.
   *
   * ⚠ TODO(decision) — nothing in the app can produce this today. There is no
   * `credit_used` column, no view exposes one, and no formula has been ruled
   * (`lib/queries/clients.ts` carries the same TODO). Until a rule exists,
   * every client with a configured credit limit is unverifiable, and says so.
   */
  creditUsedPaisa?: Paisa
  /** Count of the client's invoices past their due date. */
  overdueInvoiceCount?: number
  /** Units still out past their scheduled return. */
  unreturnedUnitCount?: number
  /** Units currently recorded missing (not a lifetime case count). */
  currentlyMissingUnitCount?: number
  /** Damage charge raised and not yet settled or written off. */
  unresolvedDamageChargePaisa?: Paisa
  /** Deposit invoiced/required and not yet received. */
  depositPendingPaisa?: Paisa
  /** Days until the client's soonest payment falls due. Negative = already past. */
  paymentDueInDays?: number
}

/**
 * What the data layer can honestly supply today: **nothing**.
 *
 * Returned as an empty object rather than a set of zeroes on purpose — see the
 * "Not configured, never zero" convention `lib/money.ts` already follows for
 * the crew coordination fee. A caller that wants the seam visible can call
 * this; a caller that has real values passes them directly.
 */
export function deriveClientHealthSignals(_client: ClientRecord): ClientHealthSignals {
  // TODO(decision) — populate from the real booking / invoice / return queries
  // once Phase 2's data layer exists. Deliberately empty: an invented 0 here
  // would render as a fact on the booking screen.
  return {}
}

/* ════════════════════════════════════════════════════════════════════════
 * THE VERDICT
 * ════════════════════════════════════════════════════════════════════════ */

/** §13's three bands. Ordered worst-last so comparisons stay obvious. */
export type ClientHealthLevel = 'good' | 'warning' | 'attention'

export type ClientHealthSeverity = 'critical' | 'warning'

export interface ClientHealthReason {
  /** Stable machine key — safe to test against, unlike the prose. */
  code: string
  /** Human-readable, already money-formatted. This is what the UI shows. */
  text: string
  severity: ClientHealthSeverity
}

export interface ClientHealthVerdict {
  level: ClientHealthLevel
  /** The word that always travels with the colour. Never render the colour without it. */
  label: 'Good' | 'Warning' | 'Attention Required'
  /** Paired glyph — the second non-colour carrier. */
  icon: IconName
  /** Foundation §4.2 token key; resolve through `STATUS` at the call site. */
  tone: StatusKey
  /** Everything that fired, critical first. Empty only when the level is `good`. */
  reasons: ClientHealthReason[]
  /** One line fit for a tooltip or an accessible name. */
  summary: string
}

/** Level → the label / icon / tone triple. Exported so a chip cannot invent its own. */
export function healthPresentation(level: ClientHealthLevel): {
  label: ClientHealthVerdict['label']
  icon: IconName
  tone: StatusKey
} {
  switch (level) {
    case 'attention':
      // `error` is Tabler's alert-circle — a different silhouette from the
      // warning triangle, so the two read apart in greyscale as well as colour.
      return { label: 'Attention Required', icon: 'error', tone: 'danger' }
    case 'warning':
      return { label: 'Warning', icon: 'alert_triangle', tone: 'progress' }
    case 'good':
      return { label: 'Good', icon: 'check', tone: 'in' }
  }
}

/**
 * Whether the credit-limit check can be run for this client, and its result if
 * it can.
 *
 * ## Why this replaced `creditUtilisation(client): number | null`
 *
 * That function divided `client.creditUsedPaisa` by `client.creditLimitPaisa`
 * and returned `null` for one reason only — no limit configured. Two different
 * facts therefore shared one representation, and callers read both as benign:
 *
 *   1. "there is no limit, so there is nothing to exceed" — genuinely benign;
 *   2. "we cannot tell how much of the limit is used" — **not benign at all**.
 *
 * Case 2 was unreachable only by accident. `ClientRecord.creditUsedPaisa` has
 * no source: there is no `credit_used` column, no view publishes one, and no
 * formula has been ruled, so `toClientRecord` in `lib/queries/clients.ts` sets
 * it to `0`. The only non-zero values anywhere are the hand-typed demo numbers
 * in `CLIENTS_DATA`. On the day the New Booking screen reads real clients
 * instead of that seed, every utilisation becomes `0 / limit = 0`,
 * "Credit limit exceeded" stops firing for every client alive, and nothing
 * anywhere shows a symptom — a safety gate failing open, silently, on the
 * screen where money decisions are taken.
 *
 * So the figure comes from `ClientHealthSignals.creditUsedPaisa`, which a
 * caller passes only when something really computed it, and its absence is
 * reported as `unavailable` instead of being computed as zero. `clientHealth`
 * raises `unavailable` as a **critical** reason.
 *
 * `ClientRecord.creditUsedPaisa` is deliberately **not read here**. It cannot
 * distinguish "this client has committed nothing" from "nobody computed this",
 * and a check that gates money must not guess which of the two it is holding.
 * Do not reconnect it — the way to make this compute again is a ruled formula
 * plus a caller that supplies the signal.
 */
export type CreditCheck =
  /**
   * No credit facility configured, so there is no limit to exceed. This is a
   * fact about the client, not a gap in the data — `approved_credit_limit` is a
   * real column and 0/absent is a real answer. See `zeroCreditLimitMeansNoCredit`.
   */
  | { state: 'not-applicable' }
  /**
   * A limit **is** configured, but how much of it is used is not computed
   * anywhere. The check could not be run; nothing may report the client as
   * within their limit.
   */
  | { state: 'unavailable'; limitPaisa: Paisa }
  | { state: 'computed'; ratio: number; usedPaisa: Paisa; limitPaisa: Paisa }

export function creditCheck(client: ClientRecord, signals: ClientHealthSignals = {}): CreditCheck {
  const limitPaisa = client.creditLimitPaisa
  if (limitPaisa <= 0) return { state: 'not-applicable' }

  const usedPaisa = signals.creditUsedPaisa
  if (usedPaisa === undefined) return { state: 'unavailable', limitPaisa }

  return { state: 'computed', ratio: usedPaisa / limitPaisa, usedPaisa, limitPaisa }
}

/**
 * §13's strict priority: **any** critical condition → Red; else **any** warning
 * condition → Orange; else Green. Not a score, not a weighted sum — one Red
 * signal outranks any number of Orange ones, which is what makes the colour
 * mean the same thing every time it appears.
 */
export function clientHealth(
  client: ClientRecord,
  signals: ClientHealthSignals = deriveClientHealthSignals(client),
): ClientHealthVerdict {
  const T = CLIENT_HEALTH_THRESHOLDS
  const critical: ClientHealthReason[] = []
  const warning: ClientHealthReason[] = []

  const crit = (code: string, text: string) => critical.push({ code, text, severity: 'critical' })
  const warn = (code: string, text: string) => warning.push({ code, text, severity: 'warning' })

  /* ── Red · §12 "critical" ─────────────────────────────────────────── */

  // "serious payment issue" — On-Stop is the strongest form the data carries,
  // and it is already the app-wide bar on new bookings (see `clientIntel.ts`).
  if (client.isBlocked || client.onStop) {
    const why = client.onStop?.reason ?? client.blockReason
    crit('on-stop', why ? `On-Stop — ${why}` : 'On-Stop — blocked from new bookings')
  }

  // "significant outstanding balance"
  if (client.outstandingPaisa >= T.significantOutstandingPaisa) {
    crit(
      'outstanding-significant',
      `Outstanding ${formatMoney(client.outstandingPaisa)} — at or above the ${formatMoney(
        T.significantOutstandingPaisa,
      )} attention threshold`,
    )
  }

  // "credit limit exceeded" — and, when the check cannot be run at all, a
  // critical that says exactly that. `creditCheck`'s doc has the reasoning: an
  // uncomputable credit check withholds the verdict rather than passing it, so
  // this branch can never quietly become "fine".
  const credit = creditCheck(client, signals)
  if (credit.state === 'computed' && credit.ratio > 1) {
    crit(
      'credit-exceeded',
      `Credit limit exceeded — ${formatMoney(credit.usedPaisa)} used against a ${formatMoney(
        credit.limitPaisa,
      )} limit`,
    )
  } else if (credit.state === 'unavailable') {
    crit(
      'credit-check-unavailable',
      `Credit limit ${formatMoney(credit.limitPaisa)} is set, but credit used is not computed anywhere — ` +
        'the credit-limit check could not be run. Unverified, not within limit.',
    )
  } else if (credit.state === 'not-applicable' && !T.zeroCreditLimitMeansNoCredit && client.outstandingPaisa > 0) {
    crit('credit-none-configured', 'No credit limit configured and a balance is outstanding')
  }

  // "overdue invoice" — absent today; fires only when a caller supplies it.
  if (signals.overdueInvoiceCount !== undefined && signals.overdueInvoiceCount > 0) {
    crit(
      'invoice-overdue',
      `${signals.overdueInvoiceCount} overdue invoice${signals.overdueInvoiceCount === 1 ? '' : 's'}`,
    )
  }

  // "unreturned / missing equipment" — current, not historical. Absent today.
  if (signals.unreturnedUnitCount !== undefined && signals.unreturnedUnitCount > 0) {
    crit(
      'equipment-unreturned',
      `${signals.unreturnedUnitCount} item${signals.unreturnedUnitCount === 1 ? '' : 's'} not returned`,
    )
  }
  if (signals.currentlyMissingUnitCount !== undefined && signals.currentlyMissingUnitCount > 0) {
    crit(
      'equipment-missing',
      `${signals.currentlyMissingUnitCount} item${signals.currentlyMissingUnitCount === 1 ? '' : 's'} recorded missing`,
    )
  }

  // "unresolved damage charge" — absent today.
  if (signals.unresolvedDamageChargePaisa !== undefined && signals.unresolvedDamageChargePaisa > 0) {
    crit('damage-unresolved', `Unresolved damage charge ${formatMoney(signals.unresolvedDamageChargePaisa)}`)
  }

  // KYC — not enumerated by §12; included behind a flag, see the threshold block.
  if (T.kycAffectsHealth && client.kycStatus === 'Rejected') {
    crit('kyc-rejected', 'KYC rejected — identity documents were not accepted')
  }

  /* ── Orange · §12 "warning" ───────────────────────────────────────── */

  // "small outstanding balance" — anything above zero that did not already
  // trip the significant threshold above.
  if (client.outstandingPaisa > 0 && client.outstandingPaisa < T.significantOutstandingPaisa) {
    warn('outstanding-small', `Outstanding ${formatMoney(client.outstandingPaisa)}`)
  }

  // "credit limit approaching" — only ever from a figure that was really
  // computed. An unavailable check has already fired a critical above; it must
  // not also produce a softer, reassuring-sounding percentage here.
  if (credit.state === 'computed' && credit.ratio >= T.creditLimitApproachingRatio && credit.ratio <= 1) {
    warn(
      'credit-approaching',
      `Credit ${Math.round(credit.ratio * 100)}% used — ${formatMoney(credit.usedPaisa)} of ${formatMoney(
        credit.limitPaisa,
      )}`,
    )
  }

  // "previous late return" — a real lifetime count where the record carries one.
  const lateReturns = client.reliability?.lateReturns
  if (lateReturns !== undefined && lateReturns > 0) {
    warn(
      'late-returns',
      `${lateReturns} late return${lateReturns === 1 ? '' : 's'} on record` +
        (client.reliability && client.reliability.totalReturns > 0
          ? ` of ${client.reliability.totalReturns}`
          : ''),
    )
  }

  // "minor unresolved issue" — the lifetime damage / missing case counts. See
  // the TODO(decision) on `ClientHealthSignals`: these carry no resolution
  // state, so they are history, never an open Red condition.
  const damageCases = client.reliability?.damageCases
  if (damageCases !== undefined && damageCases > 0) {
    warn('damage-history', `${damageCases} previous damage case${damageCases === 1 ? '' : 's'}`)
  }
  const missingCases = client.reliability?.missingCases
  if (missingCases !== undefined && missingCases > 0) {
    warn('missing-history', `${missingCases} previous missing-item case${missingCases === 1 ? '' : 's'}`)
  }

  // "deposit pending" — absent today.
  if (signals.depositPendingPaisa !== undefined && signals.depositPendingPaisa > 0) {
    warn('deposit-pending', `Deposit pending ${formatMoney(signals.depositPendingPaisa)}`)
  }

  // "payment due soon" — absent today.
  if (signals.paymentDueInDays !== undefined && signals.paymentDueInDays <= T.paymentDueSoonDays) {
    warn(
      'payment-due-soon',
      signals.paymentDueInDays <= 0
        ? 'Payment due today'
        : `Payment due in ${signals.paymentDueInDays} day${signals.paymentDueInDays === 1 ? '' : 's'}`,
    )
  }

  // KYC, warning band.
  if (T.kycAffectsHealth && (client.kycStatus === 'Pending Review' || client.kycStatus === 'Not Submitted')) {
    warn('kyc-incomplete', `KYC ${client.kycStatus.toLowerCase()}`)
  }

  /* ── Verdict ──────────────────────────────────────────────────────── */

  const level: ClientHealthLevel =
    critical.length > 0 ? 'attention' : warning.length > 0 ? 'warning' : 'good'
  const { label, icon, tone } = healthPresentation(level)
  const reasons = [...critical, ...warning]

  const summary =
    level === 'good'
      ? 'Good — no outstanding balance, credit or reliability issues on record'
      : `${label} — ${reasons.map((r) => r.text).join(' · ')}`

  return { level, label, icon, tone, reasons, summary }
}

/**
 * The accessible name fragment for a client row or the health control, so the
 * health never reaches a screen-reader user as colour-only. Kept here beside
 * the verdict so the visual chip and the spoken name cannot drift.
 */
export function healthAccessibleName(client: ClientRecord, verdict: ClientHealthVerdict): string {
  return `${client.name}. Client health: ${verdict.summary}`
}

/**
 * Ordering helper for lists that should surface problems first — same strict
 * priority as `clientHealth`, expressed as a sortable rank.
 */
export const HEALTH_RANK: Record<ClientHealthLevel, number> = {
  attention: 0,
  warning: 1,
  good: 2,
}
