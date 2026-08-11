/**
 * Hover Intel System v2.1 — the Document card.
 *
 * Mirrors `clientIntel.ts`/`equipmentIntel.ts`'s split: this file only
 * decides what a field says once `lib/fieldGating.ts` (or, for this entity,
 * the page itself) has already cleared it to render.
 *
 * Documents are unlike Client/Equipment in one structural way: there is no
 * money **amount** anywhere on `DocRow` — no total, no balance, nothing a
 * field-level money gate would ever need to strip. The money boundary for
 * this entity is enforced one level up, in `Documents.tsx` (`canViewMoney` →
 * `documentsFor(money)`/`categoriesFor(money)`), which removes every
 * `finance: true` row from the array **before** it ever reaches this file —
 * Law 6, "Warehouse sees no money — enforced by RLS, not the UI," applied to
 * a whole document rather than to one field inside it. A row that reaches
 * `documentGlance`/`documentDetailGroups` has therefore already cleared that
 * gate for the viewing role; the one `canViewMoneyField` call below is
 * deliberate defence-in-depth on the "this is a finance document" indicator,
 * not a claim that some other field here still needs stripping.
 */

import type { DocRow } from './documents'
import { CATEGORIES, DOC_STATUS, NOT_BUILT, RELATED_TARGET } from './documents'
import { formatAd } from '../lib/bs'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'

/**
 * "signed 27 Jul 2026" / "issued 26 Jul 2026" / "drafted 21 Jul 2026" — the
 * lifecycle phrase the glance spec's example ("Agreement · BR-2041 · signed
 * 26 Jul") is built from. `createdAd` is the one date this row model carries;
 * for a `Signed`/`Issued` document that date and the signing/issuing date are
 * the same event in this data set, so nothing here is invented to fill a gap.
 */
function lifecyclePhrase(row: DocRow): string {
  const when = formatAd(row.createdAd)
  switch (row.status) {
    case 'Signed':
      return `signed ${when}`
    case 'Issued':
      return `issued ${when}`
    case 'Draft':
      return `drafted ${when}`
    case 'Pending Signature':
      return `awaiting signature since ${when}`
    case 'Pending Approval':
      return `awaiting approval since ${when}`
    case 'Void':
      return `voided · created ${when}`
    case 'Expired':
      return `expired · created ${when}`
    default:
      return when
  }
}

export function documentGlance(row: DocRow, gctx: GateContext): IntelGlance {
  const tone = DOC_STATUS[row.status]
  const categoryIcon = CATEGORIES.find((c) => c.key === row.category)?.icon ?? 'file'

  const badges = [
    { label: row.category },
    ...(row.ageing ? [{ label: `${row.ageing} old`, tone: (row.ageingSevere ? 'danger' : 'progress') as StatusKey }] : []),
    // Defence-in-depth (see file header): the indicator itself is gated the
    // same way the whole row already was upstream, never shown to a role
    // that cannot view money even as a redundant label.
    ...(row.finance && canViewMoneyField(gctx, 'booking') ? [{ label: 'Finance document' }] : []),
  ]

  const lines: string[] = [`${row.party} · ${row.branch}`, row.recordState]

  return {
    avatarLabel: row.type.slice(0, 2).toUpperCase(),
    avatarIcon: categoryIcon,
    avatarTone: tone,
    title: row.name,
    statusDot: tone,
    subtitle: `${row.type} · ${row.relatedTo} · ${lifecyclePhrase(row)}`,
    badges,
    lines,
    ...(row.relatedKind === 'booking' ? { primaryAction: { label: `Open ${row.relatedTo}`, to: `/rentals/${row.relatedTo}` } } : {}),
  }
}

export function documentDetailGroups(row: DocRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const target = RELATED_TARGET[row.relatedKind]

  groups.push({
    title: 'Identity',
    fields: [
      { label: 'Document ID', value: row.id },
      { label: 'Name', value: row.name },
      { label: 'Type', value: row.type },
      { label: 'Category', value: row.category },
      { label: 'Branch', value: row.branch },
    ],
  })

  groups.push({
    title: 'Status',
    fields: [
      { label: 'Lifecycle status', value: row.status },
      { label: 'Record state', value: row.recordState },
      { label: 'Created', value: `${formatAd(row.createdAd)}, ${row.createdTime}` },
      ...(row.ageing
        ? ([{ label: 'Signature ageing', value: row.ageingSevere ? `${row.ageing} — overdue` : row.ageing }] as IntelField[])
        : []),
    ],
  })

  // §11 — Related To points at the source record, never at another document.
  // Booking is the only target screen that exists today, so it is the only
  // one that renders as a real trigger; the rest state why they don't.
  groups.push({
    title: 'Linked record',
    fields: [
      row.relatedKind === 'booking'
        ? { label: target.label, value: row.relatedTo, trigger: { label: 'Open', to: `/rentals/${row.relatedTo}` } }
        : {
            label: target.label,
            value:
              row.relatedTo === '—'
                ? 'Not linked — this row is a template, not an issued document'
                : `${row.relatedTo} — ${target.label} screen not built yet`,
          },
      { label: 'Client / Vendor', value: row.party },
      // Same defence-in-depth as the glance badge — see file header.
      ...(row.finance && canViewMoneyField(gctx, 'booking') ? ([{ label: 'Finance document', value: 'Yes' }] as IntelField[]) : []),
    ],
  })

  // §HIS-Doc — no per-document signer identity exists in this data model
  // (see `documents.ts`'s doc comment on `DocRow.signer`); the seeded rows
  // state the real counterparty of record rather than a guessed name, and
  // every other row honestly says so instead of guessing one.
  groups.push({
    title: 'Signature',
    fields: [{ label: 'Signer', value: row.signer ?? 'Not on file' }],
  })

  // §HIS-Doc — this row's own revision history, not the template's pinned
  // version (§7). Only pushed with real content; nothing is rendered "empty".
  if (row.versions?.length) {
    groups.push({
      title: 'Versions',
      fields: row.versions.map((v): IntelField => ({ label: v.version, value: v.ad })),
    })
  }

  // Download is real, wired storage everywhere else this row's actions are
  // drawn (the table's own row-level action icon says the same thing) —
  // document storage and generation are unwired, so the card states that
  // rather than offering a link that goes nowhere.
  groups.push({
    title: 'File',
    fields: [{ label: 'Download', value: NOT_BUILT }],
  })

  return groups
}
