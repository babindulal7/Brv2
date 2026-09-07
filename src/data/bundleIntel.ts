/**
 * Hover Intel System v2.1 — the Bundle card.
 *
 * Mirrors `clientIntel.ts` / `equipmentIntel.ts`'s split: every gating
 * decision goes through `lib/fieldGating.ts`, this file only decides what a
 * field says once it has already been cleared to render. Nothing here is
 * computed independently of `data/bundles.ts` — `factsOf`, `ratioLabelOf`
 * and `isPriced` are the same single source of truth `Bundles.tsx` itself
 * reads, so the card cannot show a total that disagrees with the table row
 * it hovers over (§1's whole point).
 *
 * The condensed spec asks for a "final price" field gated to the `'booking'`
 * money category — Coordinator can see a bundle's daily rate the same way
 * they can see a booking's invoice total, per HIS v2.1 §4.1's carve-out.
 * Crew/vehicle are never priced here (§8 — they are priced in the booking's
 * own Crew/Transport sections), so there is nothing asset-finance-gated on
 * this card at all.
 */

import type { BundleRecord, BundleLine, BundleState } from './bundles'
import { factsOf, ratioLabelOf, isPriced, iconFor } from './bundles'
import { formatMoney } from '../lib/money'
import type { GateContext } from '../lib/fieldGating'
import { canViewMoneyField } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'
import type { StatusKey } from '../lib/status'

const BUNDLE_TONE: Record<BundleState | 'Archived', StatusKey> = {
  Available: 'in',
  Reserved: 'primary',
  'On Rent': 'out',
  'Partially Available': 'progress',
  'On Maintenance': 'progress',
  Archived: 'neutral',
}

/** Glance-line readiness phrase — same state precedence `factsOf` already resolved. */
function readinessLabel(state: BundleState, archived?: boolean): string {
  if (archived) return 'Archived'
  switch (state) {
    case 'Available':
      return 'Bookable now'
    case 'Partially Available':
      return 'Partially bookable'
    case 'Reserved':
      return 'Reserved for a future booking'
    case 'On Rent':
      return 'Out with client'
    case 'On Maintenance':
      return 'On maintenance'
  }
}

/** Structure group's per-line description — mandatory/replaceable render as "not set", never guessed. */
function lineDetail(l: BundleLine): string {
  const bits: string[] = [
    `${l.unitsAvailable} of ${l.unitsStock} available (needs ${l.quantity})`,
    l.mandatory === undefined ? 'Mandatory: not set' : l.mandatory ? 'Mandatory' : 'Optional',
    l.replaceable === undefined ? 'Replaceable: not set' : l.replaceable ? 'Replaceable' : 'Fixed — no substitute',
  ]
  return bits.join(' · ')
}

export function bundleGlance(b: BundleRecord, gctx: GateContext): IntelGlance {
  const facts = factsOf(b)
  const state = b.archived ? 'Archived' : facts.state

  const badges = [
    { label: state, tone: BUNDLE_TONE[state] },
    ...b.tags.slice(0, 2).map((t) => ({ label: t })),
  ]

  const headline = `${readinessLabel(facts.state, b.archived)} · ${b.lines.length} component${b.lines.length === 1 ? '' : 's'}${b.nextConflictAd ? ` · next conflict ${b.nextConflictAd}` : ''}`
  const lines: string[] = [headline]
  if (facts.blockedItems > 0) {
    lines.push(`${facts.blockedItems} unit${facts.blockedItems === 1 ? '' : 's'} short across ${facts.blockedLines.length} line${facts.blockedLines.length === 1 ? '' : 's'}`)
  }
  if (canViewMoneyField(gctx, 'booking')) {
    lines.push(`${formatMoney(b.bundleRatePaisa)}/day`)
  }

  return {
    avatarLabel: b.category.slice(0, 2).toUpperCase(),
    avatarIcon: iconFor(b.category),
    avatarTone: BUNDLE_TONE[state],
    title: b.name,
    statusDot: BUNDLE_TONE[state],
    subtitle: b.category,
    badges,
    lines,
    /*
     * The detail page exists as of 7 Sep 2026, so this card gets its door back.
     * The comment here used to say the opposite — "linking to a route that does
     * not exist would be worse than no button at all" — which was right at the
     * time and is why the field was absent rather than broken.
     *
     * No window is appended: this is a pure function of a record and has no
     * access to the caller's `?from=`/`?to=`, and the detail page defaults to
     * today→tomorrow. A hover card is a glance, not a measurement; the links
     * that carry a measured window are the row menu and the preview footer,
     * both built by the pane that owns the dates.
     */
    primaryAction: { label: 'Open bundle', to: `/inventory/bundles/${b.id}` },
  }
}

export function bundleDetailGroups(b: BundleRecord, gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []
  const facts = factsOf(b)
  const state = b.archived ? 'Archived' : facts.state

  groups.push({
    title: 'Identity',
    fields: [
      { label: 'Bundle ID', value: b.id },
      { label: 'Name', value: b.name },
      { label: 'Category', value: `${b.category} (Primary)` },
      { label: 'Tags', value: b.tags.length ? b.tags.join(', ') : '—' },
      {
        label: 'Lock mode',
        value:
          b.lockMode === 'Physical'
            ? 'Physical — specific serials reserved for this bundle instance'
            : b.lockMode === 'Virtual'
              ? 'Virtual — any available unit of each model may be assigned (default)'
              : 'Not set — defaults to Virtual (§10: a bundle stores models, never serials)',
      },
    ],
  })

  groups.push({
    title: 'Availability',
    fields: [
      { label: 'State', value: state },
      { label: 'Ready', value: ratioLabelOf(facts) },
      {
        label: 'Blocked components',
        value: facts.blockedItems > 0 ? `${facts.blockedItems} short across ${facts.blockedLines.length} line${facts.blockedLines.length === 1 ? '' : 's'}` : 'None — all components available',
      },
      { label: 'Next conflict', value: b.nextConflictAd ?? 'None recorded' },
    ],
  })

  // §5/§10 — the component tree, parent (group) → children (model), with
  // whatever mandatory/replaceable data has actually been triaged for that line.
  groups.push({
    title: 'Components',
    fields: b.lines.map(
      (l): IntelField => ({
        label: `${l.group} · ${l.model}${isPriced(l) ? '' : ' (not in rate)'}`,
        value: lineDetail(l),
      }),
    ),
  })

  const withSubstitutes = b.lines.filter((l) => l.substitutes && l.substitutes.length > 0)
  if (withSubstitutes.length > 0) {
    groups.push({
      title: 'Substitute suggestions',
      fields: withSubstitutes.map(
        (l): IntelField => ({
          label: l.model,
          value: (l.substitutes ?? []).join(', '),
        }),
      ),
    })
  }

  if (b.booking) {
    const booking = b.booking
    groups.push({
      title: 'Current booking',
      fields: [
        { label: 'Booking', value: booking.id, trigger: { label: 'Open', to: `/rentals/${booking.id}` } },
        { label: 'Client', value: booking.client },
        { label: 'Status', value: booking.state === 'out' ? 'Out with client' : 'Reserved (future)' },
      ],
    })
  }

  // §11 / §4.1 — final price is gated to the 'booking' money category, the
  // same carve-out that lets Coordinator see a booking's invoice total.
  if (canViewMoneyField(gctx, 'booking')) {
    groups.push({
      title: 'Money',
      fields: [
        { label: 'Bundle daily rate', value: formatMoney(b.bundleRatePaisa) },
        { label: 'Sum of parts (equipment only)', value: formatMoney(facts.sumOfPartsPaisa) },
        { label: 'You save', value: `${formatMoney(facts.savingPaisa)} (${facts.savingPct}%)` },
        { label: 'Final price', value: formatMoney(b.bundleRatePaisa) },
      ],
    })
  }

  return groups
}
