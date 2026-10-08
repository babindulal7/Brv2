/**
 * Hover Intel System v2.1 — the Cases card (Damage + Missing, Tier 1).
 *
 * One shared `caseGlance`/`caseDetailGroups` pair for `data/cases.ts`'s
 * `Case` record, branching internally on `CaseType` the same way
 * `clientIntel.ts`/`equipmentIntel.ts` never check a role literal directly —
 * every visibility decision goes through `lib/fieldGating.ts`.
 *
 * Damage and Missing get the two shapes the spec asks for; Theft, Dispute
 * and Vendor get a generic fallback that reuses Damage's Value group
 * (minus the pickup/return compare and the 25k approval path, which are
 * Damage-specific) plus a plain "close paths" list, so no case type can
 * reach this card and crash it.
 *
 * `CasesWorkspace.tsx` is the page these cards decorate — routed at
 * `/inventory/cases` and `/inventory/cases/:id` since 30 Aug (crumbs
 * Inventory ▸ Cases; `/operations/cases` survives as a replace-redirect that
 * carries the `:id`). It reads the SAME `data/cases.ts` seed this file reads,
 * so card and page cannot disagree; its old inline dataset is gone.
 */

import type { Case, CaseType } from './cases'
import {
  CASE_TYPE_ICON,
  CASE_STATUS_META,
  CASE_PRIORITY_META,
  CASE_FLAG_META,
  DISPOSITIONS_BY_TYPE,
  CASE_WORKSPACE_ROUTE,
  ageDays,
  agingNote,
  openedBsLabel,
} from './cases'
import { formatMoney, rupees } from '../lib/money'
import { formatAd } from '../lib/bs'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField, IntelBadge } from '../components/ui/IntelCard'

/* ── shared helpers ───────────────────────────────────────────────────── */

function equipmentSummary(c: Case): string {
  if (c.equipment === 'Multiple') return 'Multiple items'
  const items = c.equipment
  if (items.length === 0) return '—'
  if (items.length === 1) {
    const only = items[0]
    return only ? `${only.name} (${only.serial})` : '—'
  }
  return `${items.length} items — ${items.map((e) => e.name).join(', ')}`
}

/** The most recent real narrative line on file, if any — never an invented note. */
function latestNote(c: Case): string | undefined {
  if (!c.timelineExtra || c.timelineExtra.length === 0) return undefined
  const sorted = c.timelineExtra.slice().sort((a, b) => b.at.getTime() - a.at.getTime())
  return sorted[0]?.text
}

function glanceSubtitle(c: Case): string {
  const date = formatAd(c.openedAd)
  switch (c.type) {
    case 'Damage':
      if (c.status === 'Awaiting Decision') return `Reported ${date} · awaiting Manager approval`
      if (c.disposition) return `Reported ${date} · ${c.disposition}`
      return `Reported ${date} · ${c.status}`
    case 'Missing':
      return `Missing since ${date} · last ${c.linked.linkedRecordId}`
    default:
      return `Opened ${date} · ${c.status}`
  }
}

/** §11's Damage approval path — the threshold is derived from the case's own `assessedPaisa`, never a guessed figure. */
const CASE_APPROVAL_THRESHOLD_PAISA = rupees(25000)
function requiresOwnerApproval(c: Case): boolean {
  return c.assessedPaisa > CASE_APPROVAL_THRESHOLD_PAISA
}

/* ── Glance ────────────────────────────────────────────────────────────── */

export function caseGlance(c: Case, gctx: GateContext): IntelGlance {
  const priorityTone = CASE_PRIORITY_META[c.priority].token
  const statusTone = CASE_STATUS_META[c.status].token

  const badges: IntelBadge[] = [
    { label: c.priority, tone: priorityTone },
    { label: c.status, tone: statusTone },
    ...c.flags.slice(0, 2).map((f): IntelBadge => ({ label: f, tone: CASE_FLAG_META[f].token })),
  ]

  const lines: string[] = [`${c.counterpartyKind} · ${c.counterpartyName}`, equipmentSummary(c)]
  if (canViewMoneyField(gctx, 'asset-finance')) {
    lines.push(`Assessed ${formatMoney(c.assessedPaisa)}`)
  }
  const note = agingNote(c)
  if (note) lines.push(note)

  return {
    avatarLabel: c.type.slice(0, 2).toUpperCase(),
    avatarIcon: CASE_TYPE_ICON[c.type],
    avatarTone: priorityTone,
    title: c.title,
    statusDot: statusTone,
    subtitle: glanceSubtitle(c),
    badges,
    lines,
    primaryAction: { label: 'Open case', to: CASE_WORKSPACE_ROUTE(c.id) },
  }
}

/* ── Detail groups ─────────────────────────────────────────────────────── */

function summaryGroup(c: Case): IntelGroup {
  const fields: IntelField[] = [
    { label: 'Case ID', value: c.id },
    { label: 'Type', value: c.type },
    { label: 'Counterparty', value: `${c.counterpartyKind} · ${c.counterpartyName}` },
    { label: 'Equipment', value: equipmentSummary(c) },
    { label: 'Priority', value: c.priority },
    { label: 'Status', value: c.status },
    { label: 'Opened', value: `${openedBsLabel(c.openedAd)} · ${formatAd(c.openedAd)}` },
    { label: 'Age', value: `${ageDays(c.openedAd)} days` },
    { label: 'Owner', value: `${c.owner} (${c.ownerRole})` },
  ]
  const note = agingNote(c)
  if (note) fields.push({ label: 'Aging alert', value: note })
  return { title: 'Case Summary', fields }
}

/** Damage gets the pickup-vs-return compare (§6.1); every other type gets its general evidence, or an honest "none". */
function evidenceGroup(c: Case): IntelGroup {
  if (c.type === 'Damage') {
    const pickup = c.evidence.pickup ?? []
    const ret = c.evidence.return ?? []
    return {
      title: 'Evidence — Pickup vs Return',
      fields: [
        {
          label: 'At pickup',
          value: pickup.length > 0 ? `${pickup.length} photo${pickup.length === 1 ? '' : 's'} · latest ${pickup[pickup.length - 1]?.at ?? '—'}` : 'No pickup photos on file',
        },
        {
          label: 'At return',
          value: ret.length > 0 ? `${ret.length} photo${ret.length === 1 ? '' : 's'} · latest ${ret[ret.length - 1]?.at ?? '—'}` : 'No return photos on file',
        },
      ],
    }
  }
  const general = c.evidence.general ?? []
  return {
    title: 'Evidence',
    fields: general.length > 0 ? general.map((p): IntelField => ({ label: p.file, value: p.at })) : [{ label: 'Evidence', value: 'No evidence uploaded yet.' }],
  }
}

/** Assessed/replacement value — Damage/Missing name it slightly differently; Theft/Dispute/Vendor get the plain "Assessed value" reading. Omitted entirely (never masked) when the role can't see asset-finance money. */
function valueGroup(c: Case, gctx: GateContext): IntelGroup | null {
  if (!canViewMoneyField(gctx, 'asset-finance')) return null
  const label = c.type === 'Damage' ? 'Estimated repair/damage value' : c.type === 'Missing' ? 'Estimated replacement value' : 'Assessed value'
  const fields: IntelField[] = [{ label, value: formatMoney(c.assessedPaisa) }]
  if (c.type === 'Damage') {
    // No serial-level join exists between Cases' equipment and Inventory's
    // ParentRow/ChildRow yet (checked: none of the seeded Damage cases'
    // serials appear in `data/inventory.ts`) — stated honestly rather than
    // reusing a different unit's replacement value.
    fields.push({ label: 'Replacement value (from Inventory)', value: 'Not on file — this case’s equipment serial is not cross-referenced with the Inventory module yet' })
  }
  fields.push({ label: 'Deposit held', value: formatMoney(c.depositHeldPaisa) })
  return { title: 'Value', fields }
}

/** Damage-only — the Rs 25,000 approval path. The threshold crossing is stated even to roles that can't see the exact figure; the figure itself stays behind the asset-finance gate. */
function approvalGroup(c: Case, gctx: GateContext): IntelGroup {
  const requiresOwner = requiresOwnerApproval(c)
  const fields: IntelField[] = [
    { label: 'Threshold', value: `${formatMoney(CASE_APPROVAL_THRESHOLD_PAISA)} — above needs Owner sign-off, at or below needs Manager` },
    { label: 'This case', value: requiresOwner ? 'Above threshold — requires Owner sign-off' : 'At or below threshold — Manager can approve directly' },
  ]
  if (canViewMoneyField(gctx, 'asset-finance')) {
    fields.push({ label: 'Assessed value', value: formatMoney(c.assessedPaisa) })
  }
  fields.push({
    label: 'Approved',
    value: c.approval ? `${c.approval.approvedBy} · ${formatAd(c.approval.approvedAd)}` : requiresOwner ? 'Not yet approved — awaiting Owner' : 'Not yet approved',
  })
  return { title: 'Approval Path', fields }
}

/** Missing-only — note, the type's close paths, and the Stock-Check link. */
function missingGroup(c: Case): IntelGroup {
  const note = latestNote(c)
  const dispositions = DISPOSITIONS_BY_TYPE[c.type]
  const fields: IntelField[] = [
    { label: 'Note', value: note ?? 'No note on file for this case.' },
    { label: 'Close paths available', value: dispositions.join(' · ') },
    { label: 'Current disposition', value: c.disposition ?? 'Not yet decided' },
  ]
  // No per-session route exists yet — `/inventory/stock-check` is a single
  // fixed-session page (`StockCheck.tsx`), so the trigger opens that page
  // rather than deep-linking to this exact session.
  if (c.stockCheckSessionNo) {
    fields.push({ label: 'Stock-Check session', value: c.stockCheckSessionNo, trigger: { label: 'Open', to: '/inventory/stock-check' } })
  } else {
    fields.push({ label: 'Stock-Check session', value: 'Not linked to a Stock-Check session' })
  }
  return { title: 'Missing — Close Paths', fields }
}

/** Theft/Dispute/Vendor generic fallback — Damage's shape minus the pickup/return compare and the 25k path, which are Damage-specific. */
function genericResolutionGroup(c: Case): IntelGroup {
  const dispositions = DISPOSITIONS_BY_TYPE[c.type]
  return {
    title: 'Close Paths',
    fields: [
      { label: 'Options available', value: dispositions.join(' · ') },
      { label: 'Current disposition', value: c.disposition ?? 'Not yet decided' },
    ],
  }
}

function linkedGroup(c: Case, gctx: GateContext): IntelGroup {
  const fields: IntelField[] =
    c.linked.linkedRecordKind === 'Booking'
      ? [{ label: 'Linked booking', value: c.linked.linkedRecordId, trigger: { label: 'Open', to: `/rentals/${c.linked.linkedRecordId}` } }]
      : [{ label: 'Linked sub-rental', value: c.linked.linkedRecordId }]

  if (c.linked.clientName) fields.push({ label: 'Client', value: c.linked.clientName })
  if (c.linked.partnerName) fields.push({ label: 'Partner', value: c.linked.partnerName })
  // Damage's "linked ticket" — the Maintenance module has no detail route
  // yet, so this is reference text only, the same honest fallback
  // `CasesQueue.tsx`'s own rail already uses for this exact gap.
  if (c.linked.maintenanceJobId) fields.push({ label: 'Linked ticket (Maintenance)', value: c.linked.maintenanceJobId })
  if (canViewMoneyField(gctx, 'booking') && c.linked.invoiceId) fields.push({ label: 'Invoice', value: c.linked.invoiceId })
  if (canViewMoneyField(gctx, 'booking') && c.linked.insuranceClaim) fields.push({ label: 'Insurance claim', value: c.linked.insuranceClaim })

  return { title: 'Linked Records', fields }
}

function flagsGroup(c: Case): IntelGroup | null {
  if (c.flags.length === 0) return null
  return { title: 'Flags', fields: c.flags.map((f): IntelField => ({ label: f, value: 'Active' })) }
}

/** Newest first, date+time labels so two same-day entries never collide as React keys. */
function timelineFields(c: Case): IntelField[] {
  const entries =
    c.timelineExtra && c.timelineExtra.length > 0
      ? c.timelineExtra
      : [{ actor: c.owner, at: c.openedAd, text: `Case opened${c.linked.linkedRecordKind === 'Booking' ? ` from ${c.linked.linkedRecordId}` : ''}` }]
  return entries
    .slice()
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 4)
    .map((t): IntelField => ({
      label: `${formatAd(t.at)} · ${t.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' })}`,
      value: `${t.text} — ${t.actor}`,
    }))
}

export function caseDetailGroups(c: Case, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = [summaryGroup(c), evidenceGroup(c)]

  const vg = valueGroup(c, gctx)
  if (vg) groups.push(vg)

  const byType: Record<CaseType, () => IntelGroup> = {
    Damage: () => approvalGroup(c, gctx),
    Missing: () => missingGroup(c),
    Theft: () => genericResolutionGroup(c),
    Dispute: () => genericResolutionGroup(c),
    Vendor: () => genericResolutionGroup(c),
  }
  groups.push(byType[c.type]())

  groups.push(linkedGroup(c, gctx))

  const fg = flagsGroup(c)
  if (fg) groups.push(fg)

  groups.push({ title: 'Timeline', fields: timelineFields(c) })

  return groups
}
