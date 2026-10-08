/**
 * Hover Intel System v2.1 §2 — the Equipment card.
 *
 * Mirrors `clientIntel.ts`'s split: every gating decision goes through
 * `lib/fieldGating.ts`, this file only decides what a field says once it has
 * already been cleared to render. §5's own gap list governs what gets a real
 * value versus an honest "Not available" — `utilizationPct`/`recoveryPct`
 * stay unseeded per the TODO(decision) already on `ParentRow` (PLAN.md §4),
 * so nothing here invents a percentage to fill the Utilization or Money
 * groups.
 */

import type { ParentRow, ChildRow, InvStatus } from './inventory'
import { formatMoney } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField, canViewUtilization } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'

/*
 * IMPORTED, not re-declared.
 *
 * This file carried a byte-identical private copy of `INV_TONE`, and the copy
 * drifted exactly as you would expect: the canonical table in `./inventory`
 * moved `Retired` from `neutral` to `dim` under v4.1 §4 (gray means "not
 * started yet", which is Quote; "finished" is the dim hue) and this one stayed
 * on `neutral`. Nothing enforced the pairing because nothing referenced it —
 * two tables, one meaning, no link.
 *
 * Importing kills the whole class rather than re-fixing one row: there is now
 * one table, and a future hue ruling reaches both consumers or neither.
 */
import { INV_TONE } from './inventory'

/** Worst-first, so a glance dot never reads "healthy" over a Missing unit. */
const ALARM_ORDER: InvStatus[] = ['Missing', 'Maintenance', 'Inspection', 'Cleaning', 'Reserved', 'Packed', 'On Rent', 'In Stock', 'Returning', 'Retired']

function dominantStatus(row: ParentRow): InvStatus {
  const present = new Set(row.breakdown.map((b) => b.status))
  return ALARM_ORDER.find((s) => present.has(s)) ?? row.breakdown[0]?.status ?? 'In Stock'
}

/** `/inventory/:assetId` matches a parent's `code` or any child's `serial` — see App.tsx. */
function assetDetailPath(row: ParentRow): string {
  const key = row.children?.[0]?.serial ?? row.code ?? row.name
  return `/inventory/${encodeURIComponent(key)}`
}

export function equipmentGlance(row: ParentRow, gctx: GateContext): IntelGlance {
  const status = dominantStatus(row)
  const badges = [
    ...row.breakdown.slice(0, 2).map((b) => ({ label: `${b.count} ${b.status}` })),
    ...(row.isSubRented ? [{ label: 'External', tone: 'ext' as StatusKey }] : []),
  ]

  const lines: string[] = [`${row.bookings} · ${row.stock}`]
  if (row.isSubRented && row.supplier) lines.push(`Sub-rented from ${row.supplier}`)
  if (canViewMoneyField(gctx, 'asset-finance')) {
    lines.push(`Replacement ${formatMoney(row.replacement)}`)
  }

  return {
    avatarLabel: row.category.slice(0, 2).toUpperCase(),
    avatarIcon: 'package',
    avatarTone: INV_TONE[status],
    title: row.name,
    statusDot: INV_TONE[status],
    subtitle: row.category,
    badges,
    lines,
  }
}

export function equipmentDetailGroups(row: ParentRow, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const serialised = Boolean(row.children?.length)

  groups.push({
    title: 'Identity',
    fields: [
      { label: 'Name', value: row.name },
      { label: 'Category', value: row.category },
      { label: 'Internal code', value: row.code ?? '—' },
      { label: 'Brand', value: row.brand ?? '—' },
      { label: 'Ownership', value: row.isSubRented ? `External — ${row.supplier ?? 'supplier not on file'}` : 'Owned' },
    ],
  })

  groups.push({
    title: 'State',
    fields: [
      { label: 'Condition', value: row.condition },
      { label: 'Stock', value: row.stock },
      ...row.breakdown.map((b): IntelField => ({ label: b.status, value: String(b.count) })),
    ],
  })

  groups.push({
    title: 'Place',
    fields: [
      { label: 'Location', value: row.location },
      { label: 'Bookings', value: row.bookings },
    ],
  })

  if (row.bundles?.length || row.substitutes?.length) {
    groups.push({
      title: 'Structure',
      fields: [
        ...(row.bundles?.length ? [{ label: 'Belongs to bundle(s)', value: row.bundles.join(', ') }] : []),
        ...(row.substitutes?.length ? [{ label: 'Substitutes', value: row.substitutes.join(', ') }] : []),
      ],
    })
  }

  if (serialised) {
    groups.push({
      title: 'Units',
      fields: (row.children ?? []).map((c): IntelField => ({
        label: c.internalRef ? `${c.serial} (${c.internalRef})` : c.serial,
        value: `${c.status} · ${c.location}`,
        trigger: { label: 'Open', to: `/inventory/${encodeURIComponent(c.serial)}` },
      })),
    })
  }

  // §2 Utilization — "% visible to Manager+; hidden from floor", the same
  // rule `canViewUtilization` already applies for §4.1's floor carve-out.
  if (canViewUtilization(gctx)) {
    const totalRentals = (row.children ?? []).reduce((sum, c) => sum + (c.rentalCount ?? 0), 0)
    groups.push({
      title: 'Utilization',
      fields: [
        { label: 'Time utilization', value: row.utilizationPct !== undefined ? `${row.utilizationPct}%` : 'Not available — needs the utilization engine (TODO(decision), PLAN.md §4)' },
        { label: 'Rental count', value: totalRentals > 0 ? String(totalRentals) : '—' },
      ],
    })
  }

  if (canViewMoneyField(gctx, 'asset-finance')) {
    groups.push({
      title: 'Money',
      fields: [
        { label: 'Purchase price', value: row.purchasePricePaisa !== undefined ? formatMoney(row.purchasePricePaisa) : '—' },
        { label: 'Replacement value', value: formatMoney(row.replacement) },
        { label: 'Revenue earned', value: 'Not available — needs the utilization/revenue engine (TODO(decision), PLAN.md §4)' },
        { label: 'ROI / recovery %', value: row.recoveryPct !== undefined ? `${row.recoveryPct}%` : 'Not available (TODO(decision), PLAN.md §4)' },
      ],
    })
  }

  // §2 Care — "cost figures gated; dates open". Warranty/service dates render
  // for every role; a depreciation book value would be money-gated the same
  // way as the Money group above, but no such figure is modelled yet.
  groups.push({
    title: 'Care',
    fields: [
      { label: 'Warranty', value: row.warranty ? `${row.warranty.status}${row.warranty.expiryAd ? ` · expires ${row.warranty.expiryAd}` : ''}` : '—' },
      { label: 'Last service', value: row.lastServiceAd ?? '—' },
      { label: 'Next service due', value: row.nextServiceDueAd ?? '—' },
      { label: 'Maintenance tickets open', value: row.maintenanceTicketsOpen !== undefined ? String(row.maintenanceTicketsOpen) : '—' },
      { label: 'Damage cases open', value: row.damageCasesOpen !== undefined ? String(row.damageCasesOpen) : '—' },
    ],
  })

  const withHistory = (row.children ?? []).filter((c): c is ChildRow & { history: NonNullable<ChildRow['history']> } => Boolean(c.history?.length))
  if (withHistory.length > 0) {
    groups.push({
      title: 'History',
      fields: withHistory.flatMap((c) =>
        c.history.map(
          (h): IntelField => ({
            label: `${c.serial} · ${h.bookingNo}`,
            value: `${h.client} · ${h.ad} · ${h.days} day${h.days === 1 ? '' : 's'}`,
            trigger: { label: 'Open', to: `/rentals/${h.bookingNo}` },
          }),
        ),
      ),
    })
  }

  return groups
}

export { assetDetailPath }
