/**
 * Hover Intel System v2.1 — the Production card (Tier 3).
 *
 * Same split as `clientIntel.ts`/`bookingIntel.ts`: every gating decision
 * goes through `lib/fieldGating.ts`, this file only decides what a field
 * says once it has already been cleared to render.
 *
 * Production carries no money figure of its own (the wave brief is explicit:
 * "not money-sensitive by itself... no gating prerequisite needed here"), so
 * `gctx` has exactly one job below — the same `canViewPII` gate
 * `clientIntel.ts` already uses for phone numbers, applied to a crew
 * member's phone. That is a real, pre-existing gate, not a new one invented
 * for this card.
 *
 * `crew` is passed in already filtered to the production, the same way
 * `CrewBooking.tsx` passes an already-grouped `CrewAssignment[]` into
 * `crewGlance`/`crewDetailGroups`. `CrewAssignment` here comes from
 * `data/crew.ts` — while this wave was in flight, a concurrent session
 * finished extracting Crew's `CrewAssignment`/`CREW_DATA` out of the page
 * component (`modules/crew/CrewBooking.tsx`, which had them inline) into
 * that dedicated data file, exactly the move `maintenanceIntel.ts`'s own
 * header already flagged as the pattern to converge on. `crewIntel.ts` was
 * repointed to `data/crew.ts` by that same session; this file follows the
 * same, now-current source rather than the page component, so it doesn't
 * build against a type that session is mid-way through retiring. Only a
 * *type* import either way — the actual cross-reference (which
 * `CrewAssignment` rows link to which production) happens in
 * `RentalsList.tsx`, which needs a real *value* import of `data/crew.ts`'s
 * `CREW_DATA` to do that filtering.
 */

import { ROWS } from './rentals'
import type { ProductionRecord } from './productions'
import type { CrewAssignment } from './crew'
import { formatAd, toBs, formatBs } from '../lib/bs'
import type { GateContext } from '../lib/fieldGating'
import { canViewPII } from '../lib/fieldGating'
import type { IntelGlance, IntelGroup, IntelField } from '../components/ui/IntelCard'

/** "31 Jul 2026 · 16 Shrawan 2083 BS", or just the AD label outside the one
 *  month `lib/bs.ts` can vouch for — the same fallback `bookingIntel.ts`'s
 *  `bsLabel` uses rather than a guessed BS date. */
function adAndBs(d: Date): string {
  const bs = toBs(d)
  return bs ? `${formatAd(d)} · ${formatBs(bs)}` : formatAd(d)
}

/**
 * §11 (`data/crew.ts`): "`Cancelled` is not a fifth state, it is a boolean
 * on top of whichever state a booking died at" — so a genuinely-confirmed
 * assignment is `status === 'Confirmed' && !cancelled`, not `status`
 * alone. Getting this wrong would count a cancelled-but-still-`Confirmed`
 * row as real crew.
 */
export function isReallyConfirmed(c: CrewAssignment): boolean {
  return c.status === 'Confirmed' && !c.cancelled
}

function crewLine(crew: readonly CrewAssignment[]): string {
  if (crew.length === 0) return 'No crew linked yet'
  const confirmed = crew.filter(isReallyConfirmed).length
  return `Crew ${confirmed}/${crew.length} confirmed`
}

export function productionGlance(production: ProductionRecord, crew: CrewAssignment[]): IntelGlance {
  const n = production.linkedBookingIds.length
  const rentalsLine = `${n} linked rental${n === 1 ? '' : 's'}`
  const first = production.linkedBookingIds[0]

  return {
    avatarLabel: production.client.slice(0, 2).toUpperCase(),
    avatarIcon: 'video',
    title: production.name,
    subtitle: production.client,
    lines: [`${rentalsLine} · ${crewLine(crew)}`],
    ...(first ? { primaryAction: { label: 'Open first booking', to: `/rentals/${first}` } } : {}),
  }
}

export function productionDetailGroups(production: ProductionRecord, crew: CrewAssignment[], gctx: GateContext): IntelGroup[] {
  const groups: IntelGroup[] = []

  groups.push({
    title: 'Production',
    fields: [
      { label: 'Client', value: production.client },
      { label: 'Start (earliest pickup)', value: adAndBs(production.startAd) },
      { label: 'End (latest return)', value: adAndBs(production.endAd) },
    ],
  })

  groups.push({
    title: 'Linked bookings',
    fields: production.linkedBookingIds.map((id): IntelField => {
      const row = ROWS.find((r) => r.bookingNo === id)
      return {
        label: id,
        value: row ? `${row.status}${row.statusNote ? ` — ${row.statusNote}` : ''}` : 'Not on file',
        trigger: { label: 'Open', to: `/rentals/${id}` },
      }
    }),
  })

  groups.push({
    title: 'Crew',
    fields:
      crew.length > 0
        ? crew.map((c): IntelField => ({
            label: c.name,
            value: [
              canViewPII(gctx) ? `${c.role} · ${c.phone}` : c.role,
              c.cancelled ? `${c.status} · Cancelled` : c.status,
            ].join(' — '),
          }))
        : [
            {
              label: 'Crew',
              value: "No crew linked yet — no CrewAssignment in data/crew.ts names this production's booking.",
            },
          ],
  })

  groups.push({
    title: 'Crew Assist',
    fields: [{ label: 'Full crew roster', value: 'Book or review crew for this production', trigger: { label: 'Open Crew Assist', to: '/operations/crew' } }],
  })

  return groups
}
