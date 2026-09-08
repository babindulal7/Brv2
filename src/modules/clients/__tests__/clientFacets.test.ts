import { describe, it, expect } from 'vitest'
import { rupees } from '../../../lib/money'
import type { ClientRecord } from '../../../data/clients'
import {
  CLIENT_FACETS,
  clientFacetsFor,
  applyFacets,
  optionsOf,
  facetCountsOf,
  selectionCount,
} from '../clientFacets'

/**
 * The rule these tests exist to defend is the one an operator notices
 * immediately when it is wrong: **a facet is counted with every OTHER facet
 * applied, but not its own.** Get it backwards and picking one membership
 * collapses every other membership to 0, which reads as "there are no Creator
 * clients" rather than "and 12 if you picked Creator instead".
 */

function client(over: Partial<ClientRecord> = {}): ClientRecord {
  return {
    id: 'C-1',
    name: 'Ram Thapa',
    clientType: 'Individual',
    membership: 'Creator',
    phone: '9800000000',
    email: 'ram@example.com',
    currentRentalsCount: 0,
    activeBookings: [],
    outstandingPaisa: rupees(0),
    depositHeldPaisa: rupees(0),
    creditLimitPaisa: rupees(0),
    creditUsedPaisa: rupees(0),
    lastRentalAd: '18 Jul 2026',
    lastRentalBs: '2083/04/03',
    address: 'Boudha',
    ...over,
  } as ClientRecord
}

const ELITE_KTM = client({ id: 'C-1', membership: 'Elite', district: 'Kathmandu' })
const ELITE_PKR = client({ id: 'C-2', membership: 'Elite', district: 'Pokhara' })
const CREATOR_KTM = client({ id: 'C-3', membership: 'Creator', district: 'Kathmandu' })
const ROWS = [ELITE_KTM, ELITE_PKR, CREATOR_KTM]

const membership = CLIENT_FACETS.find((f) => f.key === 'membership')!
const district = CLIENT_FACETS.find((f) => f.key === 'district')!

describe('applyFacets', () => {
  it('ORs within a facet and ANDs across facets', () => {
    // Elite OR Creator = all three.
    expect(applyFacets(ROWS, CLIENT_FACETS, { membership: ['Elite', 'Creator'] })).toHaveLength(3)
    // Elite AND Kathmandu = one.
    const both = applyFacets(ROWS, CLIENT_FACETS, { membership: ['Elite'], district: ['Kathmandu'] })
    expect(both.map((c) => c.id)).toEqual(['C-1'])
  })

  it('returns the rows untouched when nothing is selected', () => {
    expect(applyFacets(ROWS, CLIENT_FACETS, {})).toHaveLength(3)
  })

  it('ignores a facet whose selection is empty', () => {
    expect(applyFacets(ROWS, CLIENT_FACETS, { membership: [] })).toHaveLength(3)
  })

  it('skipKey excludes exactly one facet', () => {
    const sel = { membership: ['Elite'], district: ['Kathmandu'] }
    expect(applyFacets(ROWS, CLIENT_FACETS, sel, 'membership').map((c) => c.id)).toEqual(['C-1', 'C-3'])
    expect(applyFacets(ROWS, CLIENT_FACETS, sel, 'district').map((c) => c.id)).toEqual(['C-1', 'C-2'])
  })
})

describe('facetCountsOf — a facet does not count itself', () => {
  it('keeps sibling options answering "how many instead?" when one is picked', () => {
    const counts = facetCountsOf(membership, ROWS, { membership: ['Elite'] })
    // Elite is selected, but Creator must still report its own 1 — not 0.
    expect(counts['Elite']).toBe(2)
    expect(counts['Creator']).toBe(1)
  })

  it('still narrows by every OTHER facet', () => {
    // Kathmandu selected: Elite has 1 there, Creator has 1, Academy none.
    const counts = facetCountsOf(membership, ROWS, { district: ['Kathmandu'] })
    expect(counts['Elite']).toBe(1)
    expect(counts['Creator']).toBe(1)
    expect(counts['Academy']).toBe(0)
  })

  it('a count never exceeds what the other facets allow', () => {
    const counts = facetCountsOf(district, ROWS, { membership: ['Elite'] })
    expect(counts['Kathmandu']).toBe(1)
    expect(counts['Pokhara']).toBe(1)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(ROWS.length)
  })
})

describe('derived options come from the rows', () => {
  it('offers only districts some client actually has — no dead controls', () => {
    expect(optionsOf(district, ROWS).map((o) => o.value)).toEqual(['Kathmandu', 'Pokhara'])
  })

  it('falls back to city when district is absent', () => {
    const rows = [client({ district: undefined, city: 'Biratnagar' })]
    expect(optionsOf(district, rows).map((o) => o.value)).toEqual(['Biratnagar'])
  })

  it('declared options stay declared even at zero — "no Elite yet" is a fact', () => {
    expect(optionsOf(membership, [CREATOR_KTM]).map((o) => o.value)).toContain('Elite')
  })
})

describe('Law 6 — money facets never reach a money-blind role', () => {
  it('drops every money-shaped facet', () => {
    const blind = clientFacetsFor(false)
    expect(blind.some((f) => f.money)).toBe(false)
    expect(blind.find((f) => f.key === 'outstanding')).toBeUndefined()
    expect(blind.find((f) => f.key === 'deposit')).toBeUndefined()
  })

  it('keeps them for a money-visible role', () => {
    expect(clientFacetsFor(true).find((f) => f.key === 'outstanding')).toBeDefined()
  })

  it('every money-reading facet is flagged, so none can leak by omission', () => {
    // A facet whose predicate touches a paisa field MUST carry money: true.
    for (const f of CLIENT_FACETS) {
      const src = f.match.toString()
      if (/outstandingPaisa|depositHeldPaisa|creditLimitPaisa|creditUsedPaisa/.test(src)) {
        expect(f.money, `${f.key} reads money but is not flagged`).toBe(true)
      }
    }
  })
})

describe('outstanding buckets partition the range', () => {
  const outstanding = CLIENT_FACETS.find((f) => f.key === 'outstanding')!
  const rows = [
    client({ id: 'a', outstandingPaisa: rupees(0) }),
    client({ id: 'b', outstandingPaisa: rupees(49_999) }),
    client({ id: 'c', outstandingPaisa: rupees(120_000) }),
    client({ id: 'd', outstandingPaisa: rupees(500_000) }),
  ]

  it('puts every row in exactly one bucket', () => {
    for (const row of rows) {
      const hits = optionsOf(outstanding, rows).filter((o) => outstanding.match(row, o.value))
      expect(hits, `${row.id} landed in ${hits.length} buckets`).toHaveLength(1)
    }
  })

  it('counts add up to the row total', () => {
    const counts = facetCountsOf(outstanding, rows, {})
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(rows.length)
  })
})

describe('selectionCount', () => {
  it('counts values, not facets', () => {
    expect(selectionCount({})).toBe(0)
    expect(selectionCount({ membership: ['Elite', 'Creator'], district: ['Kathmandu'] })).toBe(3)
  })
})
