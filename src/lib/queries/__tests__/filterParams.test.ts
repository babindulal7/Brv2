/**
 * Filters ⇄ the query string, §18.
 *
 * The claims worth pinning here are the ones that make a URL trustworthy: a set
 * that survives a round trip unchanged, a removed filter that does not come
 * back, and params belonging to someone else that are still there afterwards.
 */
import { describe, it, expect } from 'vitest'
import {
  conflictingColumns,
  parseExtras,
  parseFilterParams,
  writeFilterParams,
  RESERVED_PARAMS,
  type FilterParamSchema,
} from '../filterParams'
import type { ListFilters } from '../listQuery'

const SCHEMA: FilterParamSchema = {
  chips: ['stage', 'category'],
  presence: ['cancelled_at'],
  dateColumn: 'pickup_at',
  sortColumns: ['pickup_at', 'return_at'],
  pageSize: 20,
}

const write = (filters: ListFilters, from = '') =>
  writeFilterParams(new URLSearchParams(from), filters, SCHEMA).toString()

const read = (search: string) => parseFilterParams(new URLSearchParams(search), SCHEMA)

describe('writeFilterParams', () => {
  it('writes nothing for an empty filter set', () => {
    expect(write({})).toBe('')
  })

  it('writes each chip value as its own repeated param, not a comma list', () => {
    // Repeated keys have no delimiter to collide with — see the module header.
    expect(write({ chips: { stage: ['Booked', 'Packed'] } })).toBe('stage=Booked&stage=Packed')
  })

  it('leaves params it does not own exactly where they were', () => {
    const out = write({ chips: { stage: ['Booked'] } }, 'tab=money&ref=email')
    expect(out).toContain('tab=money')
    expect(out).toContain('ref=email')
  })

  it('DROPS a param whose filter has gone', () => {
    // The failure this prevents: ?stage=Booked left on a URL whose Stage group
    // is empty silently reapplies itself on the next refresh.
    expect(write({}, 'stage=Booked&q=fx3')).toBe('')
  })

  it('omits the sort direction when it is the default', () => {
    expect(write({ sort: { column: 'pickup_at', ascending: true } })).toBe('sort=pickup_at')
    expect(write({ sort: { column: 'pickup_at', ascending: false } })).toBe('dir=desc&sort=pickup_at')
  })

  it('refuses to write a sort column the page did not declare', () => {
    expect(write({ sort: { column: 'secret_cost', ascending: true } })).toBe('')
  })

  it('writes the page 1-based, and omits page 1', () => {
    expect(write({ page: { index: 0, size: 20 } })).toBe('')
    expect(write({ page: { index: 3, size: 20 } })).toBe('page=4')
  })

  it('is stable — the same filters always produce the same string', () => {
    const a = write({ chips: { stage: ['Booked'], category: ['Camera'] }, search: 'fx3' })
    const b = write({ search: 'fx3', chips: { category: ['Camera'], stage: ['Booked'] } })
    expect(a).toBe(b)
  })
})

describe('parseFilterParams', () => {
  it('ignores params the page did not declare', () => {
    // A filter layer that swallowed ?tab= would send tab IN ('money') to Postgres.
    expect(read('tab=money&utm_source=email')).toEqual({})
  })

  it('reads repeated chip params into one group', () => {
    expect(read('stage=Booked&stage=Packed').chips?.stage).toEqual(['Booked', 'Packed'])
  })

  it('de-duplicates a doubled value', () => {
    // Two identical chips with one removal between them is not a state anyone asked for.
    expect(read('stage=Booked&stage=Booked').chips?.stage).toEqual(['Booked'])
  })

  it('reads presence as a tri-state, and treats anything else as absent', () => {
    expect(read('has_cancelled_at=0').presence?.cancelled_at).toBe(false)
    expect(read('has_cancelled_at=1').presence?.cancelled_at).toBe(true)
    expect(read('has_cancelled_at=maybe').presence).toBeUndefined()
  })

  it('reads a one-ended date range', () => {
    expect(read('from=2026-08-01')).toEqual({ dateRange: { column: 'pickup_at', fromAd: '2026-08-01' } })
  })

  it('ignores a sort column the page did not declare', () => {
    expect(read('sort=secret_cost').sort).toBeUndefined()
  })

  it('treats a hand-edited page of 0 or -3 as page 1 rather than an error', () => {
    expect(read('page=0').page).toBeUndefined()
    expect(read('page=-3').page).toBeUndefined()
    expect(read('page=nonsense').page).toBeUndefined()
    expect(read('page=4').page).toEqual({ index: 3, size: 20 })
  })

  it('round-trips a full filter set unchanged', () => {
    const filters: ListFilters = {
      search: 'fx3',
      chips: { stage: ['Booked', 'Packed'], category: ['Camera'] },
      presence: { cancelled_at: false },
      dateRange: { column: 'pickup_at', fromAd: '2026-08-01', toAd: '2026-08-07' },
      sort: { column: 'return_at', ascending: false },
      page: { index: 2, size: 20 },
    }
    expect(read(write(filters))).toEqual(filters)
  })

  it('round-trips a search term containing a comma', () => {
    // `Karki, Rupesh` is the term that forced listQuery's sanitiser to exist.
    // A comma-delimited param list would split it into two filters here.
    expect(read(write({ search: 'Karki, Rupesh' })).search).toBe('Karki, Rupesh')
  })
})

describe('parseExtras — non-column params', () => {
  const SCHEMA_X: FilterParamSchema = { chips: ['stage'], extras: ['quick', 'ref'] }

  it('reads a declared extra and ignores an undeclared one', () => {
    expect(parseExtras(new URLSearchParams('quick=Overdue&tab=money'), SCHEMA_X)).toEqual({ quick: 'Overdue' })
  })

  it('never puts an extra into the filters', () => {
    // `?quick=Overdue` must not become `view IN ('Overdue')` against a column
    // that does not exist.
    expect(parseFilterParams(new URLSearchParams('quick=Overdue'), SCHEMA_X)).toEqual({})
  })
})

describe('allow — a query string is user input', () => {
  const GUARDED: FilterParamSchema = {
    chips: ['stage'],
    extras: ['quick'],
    allow: { stage: ['Booked', 'Packed'], quick: ['Overdue'] },
  }

  it('drops a chip value outside the declared vocabulary', () => {
    const out = parseFilterParams(new URLSearchParams('stage=Booked&stage=Nonsense'), GUARDED)
    expect(out.chips?.stage).toEqual(['Booked'])
  })

  it('drops the group entirely when nothing survives', () => {
    // Not an empty array: `applyListFilters` reads `[]` as "no constraint".
    expect(parseFilterParams(new URLSearchParams('stage=DropTable'), GUARDED).chips).toBeUndefined()
  })

  it('drops an extra outside its vocabulary', () => {
    expect(parseExtras(new URLSearchParams('quick=DropTable'), GUARDED)).toEqual({})
    expect(parseExtras(new URLSearchParams('quick=Overdue'), GUARDED)).toEqual({ quick: 'Overdue' })
  })

  it('accepts anything for a param with no list, which is right for free text', () => {
    expect(parseFilterParams(new URLSearchParams('q=whatever the user typed'), GUARDED).search).toBe(
      'whatever the user typed',
    )
  })
})

describe('conflictingColumns', () => {
  it('names a chip column that would be eaten by a reserved param', () => {
    expect(conflictingColumns({ chips: ['stage', 'sort', 'q'] })).toEqual(['sort', 'q'])
  })

  it('names a chip column that would collide with the presence prefix', () => {
    expect(conflictingColumns({ chips: ['has_deposit'] })).toEqual(['has_deposit'])
  })

  it('passes a schema with no collisions', () => {
    expect(conflictingColumns(SCHEMA)).toEqual([])
    expect(RESERVED_PARAMS).toContain('page')
  })
})
