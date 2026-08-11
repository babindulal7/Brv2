/**
 * Hover Intel System v2.1 §1 — the Client card.
 *
 * Builds an already-gated `IntelGlance`/`IntelGroup[]` pair for one
 * `ClientRecord`. Every field-level decision goes through `lib/fieldGating.ts`
 * — this file never checks a role literal itself, so `ClientsDirectory.tsx`
 * and `ClientDetail.tsx` cannot drift into gating the same field two
 * different ways.
 *
 * §4.1's explicit Coordinator carve-out ("Coordinator = booking-level money +
 * client balance/deposit only") is honoured field-by-field inside the Money
 * group. Where the spec has no such carve-out — Commercial's discount terms,
 * for instance, just says "Gated" — the stricter full-tier reading is used,
 * consistent with the same rule's "no asset ROI, no crew pay, no supplier
 * margin" trend of keeping Coordinator to booking + balance only.
 */

import { createElement } from 'react'
import type { ClientRecord } from './clients'
import { TIER_TONE } from './clients'
import { formatMoney } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField, canViewPII, canViewDocuments, canViewNotes, canViewOnStopReason, moneyScope } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import { STATUS } from '../lib/status'
import type { StatusKey } from '../lib/status'

function isOnStop(client: ClientRecord): boolean {
  return Boolean(client.isBlocked || client.onStop)
}

/**
 * Risk-tag keyword list — a display-classification call, not a business rule
 * (the same category `lateReturns >= 2` below is documented as): which free-text
 * `client.tags` strings read as risk-flavoured ("Payment Risk", "Chargeback
 * Hold") versus neutral/positive ("Gold Tier", "Broadcast"). Matched
 * case-insensitively as a substring so "Payment Risk" and "On Hold" both hit
 * without enumerating every possible tag. A tag that matches none of these
 * keeps rendering as a plain neutral badge, exactly as it did before this fix.
 */
const RISK_TAG_KEYWORDS = ['risk', 'overdue', 'hold', 'flag', 'block', 'dispute', 'chargeback']

function isRiskTag(tag: string): boolean {
  const lower = tag.toLowerCase()
  return RISK_TAG_KEYWORDS.some((kw) => lower.includes(kw))
}

/**
 * De-emphasized field value for a genuinely-undecided "Open ⭐" placeholder —
 * a display-classification call, not a business rule, same escape hatch as
 * `riskField` below: `IntelField.value` is typed `ReactNode` precisely so a
 * builder can hand back a `--muted`-coloured span instead of a plain string
 * (see also `supplierIntel.ts`'s gold badge for the same pattern). The
 * placeholder text and "Open ⭐ #N" decision-tracking label are unchanged —
 * this only lowers how loud the field reads next to real data in the same
 * group, which is why callers also move it to the end of its group.
 */
function mutedField(label: string, text: string): IntelField {
  return {
    label,
    value: createElement('span', { style: { color: 'var(--muted)', fontStyle: 'italic' } }, text),
  }
}

/**
 * Reliability risk tone — "never colour alone" (CLAUDE.md's Law list),
 * applied to a single `IntelField.value` rather than the whole field/badge
 * component. `IntelField` carries no `tone`/`variant` prop of its own (only
 * `label`/`value`/`trigger` — see `components/ui/IntelCard.tsx`), so this
 * follows the same escape hatch `supplierIntel.ts`'s gold "Active external
 * units" badge and `crewIntel.ts`'s month strip already use: `IntelField.value`
 * is typed `ReactNode` precisely so a builder can hand back a coloured
 * `createElement` span instead of a plain string. `createElement`, not JSX,
 * because this stays a plain `.ts` module like every sibling card builder.
 *
 * The colour (`STATUS.danger`'s bg/fg pair — red is "the only alarm colour",
 * `lib/status.ts`) is paired with a text qualifier appended to the value
 * itself ("· Flagged"), not left to carry the warning alone — the same
 * bg/fg/padding/radius shape `IntelCard.tsx`'s own `Glance` badge rendering
 * uses for `IntelBadge`, reused here so a toned Reliability field reads as
 * the same "badge" language the rest of the card already speaks.
 */
function riskField(label: string, text: string, atRisk: boolean): IntelField {
  if (!atRisk) return { label, value: text }
  const tone: StatusKey = 'danger'
  const t = STATUS[tone]
  return {
    label,
    value: createElement(
      'span',
      {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          height: 20,
          padding: '0 7px',
          borderRadius: 'var(--r-badge)',
          background: t.bg,
          color: t.fg,
          fontSize: 'var(--t-meta)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        },
      },
      `${text} · Flagged`,
    ),
  }
}

export function clientGlance(client: ClientRecord, gctx: GateContext): IntelGlance {
  const onStop = isOnStop(client)

  const badges = [
    { label: client.membership, tone: TIER_TONE[client.membership] },
    ...(client.tags ?? []).slice(0, 2).map((t) => ({ label: t, ...(isRiskTag(t) ? { tone: 'danger' as StatusKey } : {}) })),
  ]

  const lines: string[] = [
    `${client.currentRentalsCount} active rental${client.currentRentalsCount === 1 ? '' : 's'} · ${client.totalRentalsCount} lifetime`,
  ]
  if (canViewMoneyField(gctx, 'client-balance')) {
    lines.push(
      client.outstandingPaisa > 0
        ? `Owes ${formatMoney(client.outstandingPaisa)} · deposit ${formatMoney(client.depositHeldPaisa)} held`
        : `No balance due · deposit ${formatMoney(client.depositHeldPaisa)} held`,
    )
  }
  if (onStop) {
    lines.push('On-Stop — blocked from new bookings')
  }

  return {
    avatarLabel: client.name.slice(0, 2).toUpperCase(),
    avatarTone: TIER_TONE[client.membership],
    title: client.name,
    statusDot: onStop ? 'danger' : 'in',
    subtitle: `${client.clientType}${client.company ? ` · ${client.company}` : ''}`,
    badges,
    lines,
    // §4.4's "block is visible to everyone who tries to book" is served by the
    // status dot and the On-Stop line above; the action itself is simply
    // absent when blocked, the same "forbidden things are absent" rule the
    // rest of the app follows rather than a disabled button with no reason.
    ...(onStop ? {} : { primaryAction: { label: 'New booking', to: '/rentals/new' } }),
  }
}

export function clientDetailGroups(client: ClientRecord, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const onStop = isOnStop(client)

  groups.push({
    title: 'Identity',
    fields: [
      { label: 'Name', value: client.name },
      ...(client.company ? [{ label: 'Company', value: client.company }] : []),
      { label: 'Customer type', value: client.clientType },
      { label: 'Tags', value: client.tags?.length ? client.tags.join(', ') : '—' },
      { label: 'Client since', value: client.clientSinceAd ?? '—' },
      { label: 'PAN / VAT no.', value: client.pan ?? 'Not on file' },
    ],
  })

  if (canViewPII(gctx)) {
    const addresses = client.addresses ?? [{ kind: 'Billing' as const, label: 'On file', address: client.address }]
    groups.push({
      title: 'Contact',
      fields: [
        { label: 'Phone', value: client.phone },
        { label: 'Email', value: client.email || '—' },
        ...addresses.map((a) => ({ label: `${a.kind} address (${a.label})`, value: a.address })),
      ],
    })
  }

  groups.push({
    title: 'Membership',
    fields: [
      { label: 'Level', value: client.membership },
      { label: 'Member since', value: client.clientSinceAd ?? '—' },
      // Open ⭐ #2 — no benefit matrix is ruled yet. Stated, not guessed.
      // Muted + last: a genuinely-undecided product question, not data — see `mutedField`.
      mutedField('Benefits', 'Not yet defined (Open ⭐ #2 — membership benefit matrix)'),
    ],
  })

  if (moneyScope(gctx) === 'full') {
    groups.push({
      title: 'Commercial',
      fields: [
        { label: 'Standing discount', value: client.standingDiscountPercent !== undefined ? `${client.standingDiscountPercent}%` : '—' },
        { label: 'Discount source', value: client.discountSource ?? '—' },
        { label: 'Payment terms', value: client.paymentTerms ?? '—' },
        // Open ⭐ #1 — no per-category deposit-% table is ruled yet.
        // Muted + last: a genuinely-undecided product question, not data — see `mutedField`.
        mutedField('Deposit override', 'Not set (Open ⭐ #1 — per-category deposit % table)'),
      ],
    })
  }

  const moneyFields: IntelField[] = []
  if (canViewMoneyField(gctx, 'client-balance')) {
    moneyFields.push(
      { label: 'Outstanding balance', value: formatMoney(client.outstandingPaisa) },
      { label: 'Deposit held', value: formatMoney(client.depositHeldPaisa) },
    )
  }
  if (moneyScope(gctx) === 'full') {
    moneyFields.push(
      { label: 'Pay-later used / limit', value: `${formatMoney(client.creditUsedPaisa)} / ${formatMoney(client.creditLimitPaisa)}` },
      { label: 'Lifetime value', value: formatMoney(client.totalSpentPaisa) },
    )
  }
  if (moneyFields.length > 0) groups.push({ title: 'Money', fields: moneyFields })

  // §4.4 — the block itself is never gated, only its reason/setter.
  groups.push({
    title: 'Credit control',
    fields: [
      { label: 'On-Stop', value: onStop ? 'Blocked from new bookings' : 'Clear' },
      ...(onStop && canViewOnStopReason(gctx)
        ? ([
            { label: 'Reason', value: client.onStop?.reason ?? client.blockReason ?? '—' },
            { label: 'Set by', value: client.onStop?.setBy ?? '—' },
            { label: 'Set on', value: client.onStop?.setAd ?? '—' },
          ] as IntelField[])
        : []),
    ],
  })

  groups.push({
    title: 'Activity',
    fields: [
      ...client.activeBookings.map((b): IntelField => ({ label: b, value: 'Currently booked', trigger: { label: 'Open', to: `/rentals/${b}` } })),
      { label: 'Last rental', value: client.lastRentalBs === '—' ? 'No rental yet' : `${client.lastRentalBs} BS · ${client.lastRentalAd}` },
    ],
  })

  // Reliability [NEW] — counts visible to all staff; no ₨-recovered figure
  // exists in this data model yet, so there is nothing here to money-gate.
  //
  // Design-critique fix: damage/missing cases and a high late-return count
  // used to render as plain, uncoloured fields — the one Reliability block
  // in the app that skipped CLAUDE.md's "never colour alone" law every other
  // status indicator here follows. `damageCases`/`missingCases` map directly
  // onto `lib/status.ts`'s own doc for 'danger' ("Red — Overdue, Damaged,
  // Missing, Blocked. The only alarm colour."), so any count above zero gets
  // flagged. `lateReturns` has no ruled threshold anywhere in this file or
  // `bookingIntel.ts` (the closest precedent, `DISCOUNT_APPROVAL_THRESHOLD`,
  // is a money policy, not a risk one) — `>= 2` is a judgment call, not a
  // decision to cite, made because 1 late return in dozens of rentals reads
  // as noise while repeat lateness reads as a pattern.
  if (client.reliability) {
    const r = client.reliability
    groups.push({
      title: 'Reliability',
      fields: [
        riskField('Late returns', `${r.lateReturns} / ${r.totalReturns}`, r.lateReturns >= 2),
        riskField('Damage cases', String(r.damageCases), r.damageCases > 0),
        riskField('Missing cases', String(r.missingCases), r.missingCases > 0),
        { label: 'Avg days late', value: r.avgDaysLateOverall.toFixed(1) },
      ],
    })
  }

  if (canViewDocuments(gctx)) {
    groups.push({
      title: 'Documents',
      fields: [
        { label: 'KYC status', value: client.kycStatus },
        { label: 'Documents on file', value: String(client.kycDocsCount) },
      ],
    })
  }

  if (canViewNotes(gctx) && client.notes) {
    groups.push({ title: 'Notes', fields: [{ label: 'Internal note', value: client.notes }] })
  }

  return groups
}
