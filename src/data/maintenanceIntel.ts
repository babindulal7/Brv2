/**
 * Hover Intel System v2.1 — the Maintenance card (Tier 1).
 *
 * Mirrors `clientIntel.ts` / `equipmentIntel.ts`'s split: every gating
 * decision goes through `lib/fieldGating.ts`, this file only decides what a
 * field says once it has already been cleared to render.
 *
 * `MaintenanceRecord` and its `MAINTENANCE_DATA` seed array live inline in
 * `modules/inventory/Maintenance.tsx` rather than in a dedicated `data/`
 * module — unlike `ClientRecord`/`ParentRow`, which this file's siblings
 * import from a data file. Only the *type* is imported back from the page
 * component here (a type-only import, erased at compile time, so it cannot
 * create a runtime circular dependency with `Maintenance.tsx`, which imports
 * this file's two builder functions). `STATUS_TONE`/`PRIORITY_TONE` below
 * therefore keep their own small copies rather than importing the page
 * component's versions as *values* — see the report for this as a real,
 * structural gap the next pass on this entity should close by moving
 * `MaintenanceRecord`/`MAINTENANCE_DATA` into a `data/maintenanceJobs.ts` of
 * their own, the way `inventory.ts` and `clients.ts` already do.
 */

import type { MaintenanceRecord } from '../modules/inventory/Maintenance'
import { formatMoney } from '../lib/money'
import type { Paisa } from '../lib/money'
import { toBs, formatBs, formatAd } from '../lib/bs'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'

/**
 * Mirrors `Maintenance.tsx`'s own `STATUS_TONE` — §4.2's five hues plus gold,
 * `At Vendor` taking the gold outline reserved for kit in an external
 * party's hands. Kept as its own copy rather than an imported value; see the
 * file header.
 */
const STATUS_TONE: Record<MaintenanceRecord['status'], StatusKey> = {
  Scheduled: 'primary',
  'In Progress': 'progress',
  'Waiting Parts': 'progress',
  'At Vendor': 'ext',
  Completed: 'in',
  Cancelled: 'neutral',
}

const PRIORITY_TONE: Record<MaintenanceRecord['priority'], StatusKey> = {
  Critical: 'danger',
  High: 'danger',
  Medium: 'progress',
  Low: 'neutral',
}

function estCompletionLabel(row: MaintenanceRecord): string {
  if (!row.estCompletion) return '—'
  const bs = toBs(row.estCompletion)
  return bs ? `${formatBs(bs, { suffix: true })} · ${formatAd(row.estCompletion)}` : formatAd(row.estCompletion)
}

export function maintenanceGlance(row: MaintenanceRecord, gctx: GateContext): IntelGlance {
  const badges = [
    { label: row.status, tone: STATUS_TONE[row.status] },
    ...(row.priority === 'Critical' || row.priority === 'High'
      ? [{ label: `${row.priority} priority`, tone: PRIORITY_TONE[row.priority] }]
      : []),
  ]

  const lines: string[] = [`${row.type}${row.bookingImpact ? ' · blocks booking' : ''}`]
  if (row.estCompletion) lines.push(`ETA ${estCompletionLabel(row)}`)
  if (row.downtimeDays !== undefined) {
    lines.push(`${row.downtimeDays} day${row.downtimeDays === 1 ? '' : 's'} out of service so far`)
  }
  // §4.1 "asset-finance" — maintenance cost is equipment finance, the same
  // tier as the Equipment card's replacement value/purchase price, so it is
  // omitted here exactly as those are for a role that cannot see it.
  if (canViewMoneyField(gctx, 'asset-finance')) {
    if (row.costActualPaisa !== undefined) {
      lines.push(`Actual cost ${formatMoney(row.costActualPaisa)}`)
    } else if (row.costEstPaisa > 0) {
      lines.push(`Estimated cost ${formatMoney(row.costEstPaisa)}`)
    }
  }

  return {
    avatarLabel: row.equipmentName.slice(0, 2).toUpperCase(),
    avatarIcon: 'tool',
    avatarTone: STATUS_TONE[row.status],
    title: row.equipmentName,
    statusDot: row.flags.includes('Overdue') ? 'danger' : STATUS_TONE[row.status],
    subtitle: `${row.id} · ${row.serialNumber}`,
    badges,
    lines,
  }
}

export function maintenanceDetailGroups(row: MaintenanceRecord, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []

  groups.push({
    title: 'Job',
    fields: [
      { label: 'Job ID', value: row.id },
      { label: 'Equipment', value: row.equipmentName },
      { label: 'Serial', value: row.serialNumber },
      { label: 'Type', value: row.type },
      { label: 'Priority', value: row.priority },
      { label: 'Status', value: row.status },
    ],
  })

  groups.push({
    title: 'Repair',
    fields: [
      { label: /* Booking flags (§1.9) */ "Booking flags", value: row.flags.length ? row.flags.join(', ') : 'None' },
      { label: 'Conditions', value: row.conditions.length ? row.conditions.join(', ') : 'None' },
      { label: 'Technician', value: row.technician ?? '—' },
      { label: 'Vendor', value: row.vendor ?? '—' },
      { label: 'Est. completion', value: estCompletionLabel(row) },
      {
        label: 'Downtime so far',
        value: row.downtimeDays !== undefined ? `${row.downtimeDays} day${row.downtimeDays === 1 ? '' : 's'}` : 'Not tracked',
      },
    ],
  })

  // "Linked damage" — always present as a group (like the Equipment card's
  // Place/Activity groups), with an honest absence value rather than the
  // group being omitted, since this is a data gap, not a role gate.
  groups.push({
    title: 'Linked records',
    fields: [
      row.linkedCaseId
        ? ({ label: 'Linked damage case', value: row.linkedCaseId, trigger: { label: 'Open case', to: `/inventory/cases/${row.linkedCaseId}` } } as IntelField)
        : ({ label: 'Linked damage case', value: 'No case on file' } as IntelField),
      row.bookingImpact
        ? ({ label: 'Booking impact', value: row.bookingImpact, trigger: { label: 'Open booking', to: `/rentals/${row.bookingImpact}` } } as IntelField)
        : ({ label: 'Booking impact', value: 'Not holding a booking' } as IntelField),
    ],
  })

  // Parts — structural/optional data, omitted entirely when there is none
  // logged, the same convention `equipmentDetailGroups` uses for its
  // Structure/Units groups. Part *names* are not money and always render;
  // a part's cost is asset-finance money and is individually gated below —
  // never a masked placeholder, simply absent from the value.
  if (row.parts?.length) {
    groups.push({
      title: 'Parts',
      fields: row.parts.map(
        (p): IntelField => ({
          label: p.name,
          value: canViewMoneyField(gctx, 'asset-finance')
            ? p.costPaisa !== undefined
              ? formatMoney(p.costPaisa)
              : 'Cost not itemised (bundled in vendor quote)'
            : 'Logged',
        }),
      ),
    })
  }

  // §4.1 "asset-finance" — maintenance cost, same tier as the Equipment
  // card's replacement value/purchase price (§4.1 explicitly excludes
  // Coordinator: "no crew pay, no supplier margin"). The whole group is
  // omitted from construction for a role that cannot see it — Law 6 /
  // HIS v2.1 §4.5 — never rendered then hidden.
  if (canViewMoneyField(gctx, 'asset-finance')) {
    const partsCosted = row.parts?.filter((p) => p.costPaisa !== undefined) ?? []
    const partsCostTotal = partsCosted.length ? (partsCosted.reduce((sum, p) => sum + (p.costPaisa as Paisa), 0) as Paisa) : undefined

    groups.push({
      title: 'Cost',
      fields: [
        { label: 'Estimated cost', value: row.costEstPaisa > 0 ? formatMoney(row.costEstPaisa) : 'Not quoted' },
        { label: 'Actual cost', value: row.costActualPaisa !== undefined ? formatMoney(row.costActualPaisa) : 'Not yet closed' },
        ...(partsCostTotal !== undefined ? [{ label: 'Parts cost (itemised)', value: formatMoney(partsCostTotal) }] : []),
      ],
    })
  }

  return groups
}
