/**
 * **Clients — the copy guards.**
 *
 * Four of the five defects this suite pins were the same defect: a sentence on
 * a Clients screen that was true once, or never, and that nothing compared
 * against the thing it described. A label outran its query; a cap that had been
 * rescinded stayed in the prose in five places; a reason was invented to fill a
 * field that is always empty; a column header promised data the view does not
 * carry.
 *
 * Type-checking cannot catch any of that — every one of them compiled — so the
 * guard has to read the source as TEXT. That is the same technique
 * `lib/__tests__/breakpoints.test.ts` uses for the three files that cannot
 * import each other, and for the same reason: the alternative is hoping.
 *
 * `?raw` rather than `node:fs`: this project ships no `@types/node`, so
 * `readFileSync` fails `npm run typecheck`, which is a gate here. `?raw` is
 * typed by `vite/client` (src/vite-env.d.ts) and behaves identically under
 * vitest.
 */
import { describe, it, expect } from 'vitest'
import directorySrc from '../ClientsDirectory.tsx?raw'
import clientsSrc from '../Clients.tsx?raw'
import membershipSrc from '../Membership.tsx?raw'
import membershipData from '../../../data/membership.ts?raw'
import { PLANS, COMPARISON_ROWS, STACK_NOTE } from '../../../data/membership'

/**
 * A source file minus its comments. Every assertion below is about what the
 * SCREEN says, and the comments deliberately quote the wording they replaced —
 * without this, each fix would trip its own guard.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

const SCREENS: Array<[string, string]> = [
  ['ClientsDirectory.tsx', directorySrc],
  ['Clients.tsx', clientsSrc],
  ['Membership.tsx', membershipSrc],
  ['data/membership.ts', membershipData],
]

describe('CL-04 — the directory KPI is labelled with what it counts', () => {
  /*
   * `active_bookings_count` is
   *   count(*) filter (where b.stage <> 'Closed' and b.cancelled_at is null)
   * (0054_rls_backstops_and_directory_block_flag.sql:321), so it counts Quote,
   * Booked, Packed, On Rent AND Returned. "On Rent" was a claim about one of
   * those five.
   */
  it('renders no "On Rent" label over active_bookings_count', () => {
    const src = code(directorySrc)
    expect(src).not.toMatch(/label: 'On Rent'/)
    expect(src).not.toMatch(/label="On Rent"/)
    // The card and table cells both read `{client.currentRentalsCount} on rent`.
    expect(src).not.toMatch(/\bon rent\b/i)
  })

  it('states Open rentals on the KPI, chip and saved view', () => {
    const src = code(directorySrc)
    expect(src).toContain(`label: 'Open rentals',`)
    expect(src).toContain(`{ label: 'Open rentals', key: 'active', count: metrics.onRent }`)
    expect(src).toContain(`{ label: 'Open rentals', filter: 'active'`)
  })

  /*
   * The rule is that nothing MINTS `on-rent`, not that the string is absent.
   * A wire value outlives the build — it sits in bookmarks and pasted links —
   * so `LEGACY_FILTER_PARAM` still READS it and maps it to `active`. The first
   * version of this test asserted the string was gone from the file, which
   * would have been satisfied by silently unfiltering every old link: exactly
   * the quiet lie CL-04 was raised about.
   */
  it('no longer mints `on-rent`, but still understands a link that carries it', () => {
    const src = code(directorySrc)
    // FILTER_PARAM is the mint side: the chip must never produce it again.
    const mint = src.slice(src.indexOf('const FILTER_PARAM'), src.indexOf('const LEGACY_FILTER_PARAM'))
    expect(mint).not.toContain(`'on-rent'`)
    // The read side must keep it, pointed at the renamed filter.
    const legacy = src.slice(src.indexOf('const LEGACY_FILTER_PARAM'))
    expect(legacy).toContain(`'on-rent': 'active'`)
  })

  it('does not call the same figure "Current Rentals" in a header or an export', () => {
    expect(code(directorySrc)).not.toContain('Current Rentals')
    expect(code(clientsSrc)).not.toContain('Current Rentals')
  })
})

describe('CL-07 — the rescinded discount cap is gone from every surface', () => {
  /*
   * D3, Babin's final word 31 Aug 2026: "don't put any gate on discount."
   * Confirmed against the live schema, not the migration headers:
   * booking_discounts / invoices / invoice_lines each carry a 0..100
   * `*_percent_sane` CHECK and nothing narrower, and the deployed
   * `enforce_booking_discount_stacking()` raises only past a stacked 100.
   */
  it.each(SCREENS)('%s states no cap, ceiling or stacking limit', (_name, src) => {
    const body = code(src)
    expect(body).not.toMatch(/max cap/i)
    expect(body).not.toMatch(/capped at/i)
    expect(body).not.toMatch(/25\s*%/)
  })

  it('leaves the tier discount strings intact apart from the cap', () => {
    expect(PLANS.map((p) => p.discounts[0])).toEqual([
      '10% Individual discount',
      '15% Individual discount',
      '20% Individual discount',
      '20% Individual discount',
      '20% Individual discount',
    ])
  })

  it('keeps the comparison table reading a percentage out of those strings', () => {
    // `pick` splits on ' Individual'. Trimming the suffix must not have
    // orphaned the row into em dashes.
    const row = COMPARISON_ROWS.find((r) => r.label === 'Individual Discount')
    expect(row).toBeDefined()
    expect(PLANS.map((p) => row!.pick(p))).toEqual(['10%', '15%', '20%', '20%', '20%'])
  })

  it('replaces the cap with the exclusive-source rule that actually survives', () => {
    // 0074 KEPT the 0002 stacking matrix: Student / College / Named-client
    // rates stack with nothing. That is a rule, not a cap.
    expect(STACK_NOTE).toContain('Student')
    expect(STACK_NOTE).toContain('College')
    expect(STACK_NOTE).toContain('Named-client')
    expect(STACK_NOTE).not.toMatch(/cap/i)
    expect(STACK_NOTE).not.toMatch(/25/)
  })
})

describe('CL-11 — no invented block reason', () => {
  /*
   * `client_flags.reason` is a real column, but `client_directory_v` publishes
   * only `is_blocked` (31 columns, confirmed live), so `toClientRecord` leaves
   * `blockReason` absent — `clientsQuery.test.ts` asserts that separately.
   */
  it('never substitutes a sentence for a reason nobody recorded', () => {
    expect(code(directorySrc)).not.toContain('account under review')
  })

  it('reuses ClientDetail\'s wording rather than inventing a third', () => {
    expect(code(directorySrc)).toContain(
      'The reason is recorded on the flag but is not carried by this view.',
    )
  })
})

describe('CL-12 — nothing promises a company field the view has no column for', () => {
  it('does not advertise company in the search placeholder', () => {
    expect(code(directorySrc)).not.toMatch(/placeholder="[^"]*company/i)
  })

  it('emits no always-empty Company column in either CSV', () => {
    expect(code(directorySrc)).not.toContain(`'Company',`)
    expect(code(clientsSrc)).not.toContain(`'Company',`)
  })
})
