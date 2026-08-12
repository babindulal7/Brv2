/**
 * §10's option counts.
 *
 * One rule carries the whole feature and it is the one that is easy to get
 * wrong, so it is asserted twice from two directions: an option is counted with
 * its OWN group's selection dropped, and with every other group still applied.
 */
import { describe, it, expect } from 'vitest'
import { countFacet } from '../facetCounts'
import type { ListFilters } from '../listQuery'

/** Records what was asked, and answers with the number of predicates it saw. */
function recorder(answer: (filters: ListFilters) => number | null = () => 1) {
  const calls: ListFilters[] = []
  return {
    calls,
    countRows: async (filters: ListFilters) => {
      calls.push(filters)
      return answer(filters)
    },
  }
}

describe('countFacet', () => {
  it('asks once per option', async () => {
    const r = recorder()
    const counts = await countFacet(r.countRows, {}, 'stage', ['Booked', 'Packed', 'Out'])
    expect(r.calls).toHaveLength(3)
    expect(counts).toEqual({ Booked: 1, Packed: 1, Out: 1 })
  })

  it('drops the group it is counting, so ticking one option does not zero its siblings', async () => {
    const r = recorder()
    await countFacet(r.countRows, { chips: { stage: ['Booked'] } }, 'stage', ['Booked', 'Packed'])
    // Every call carries exactly the one value it is counting — never the
    // existing Booked selection, which would make `Packed` come back 0 and the
    // group impossible to widen.
    expect(r.calls.map((c) => c.chips?.stage)).toEqual([['Booked'], ['Packed']])
  })

  it('KEEPS every other group, so the number is specific to where the user is', async () => {
    const r = recorder()
    await countFacet(
      r.countRows,
      { chips: { stage: ['Booked'], category: ['Camera'] }, search: 'fx3', presence: { cancelled_at: false } },
      'stage',
      ['Packed'],
    )
    const only = r.calls[0]!
    expect(only.chips?.category).toEqual(['Camera'])
    expect(only.search).toBe('fx3')
    expect(only.presence).toEqual({ cancelled_at: false })
  })

  it('never counts a single page or an ordering', async () => {
    const r = recorder()
    await countFacet(r.countRows, { page: { index: 3, size: 20 }, sort: { column: 'pickup_at' } }, 'stage', ['Packed'])
    // A count of page 4 is not a count.
    expect(r.calls[0]!.page).toBeUndefined()
    expect(r.calls[0]!.sort).toBeUndefined()
  })

  it('reports a failed count as null, never as 0', async () => {
    // 0 tells the operator that clicking this option empties the list. That is
    // a lie in the one direction that stops them looking.
    const countRows = async (filters: ListFilters) => {
      if (filters.chips?.['stage']?.[0] === 'Packed') throw new Error('JWT expired')
      return 7
    }
    const counts = await countFacet(countRows, {}, 'stage', ['Booked', 'Packed'])
    expect(counts).toEqual({ Booked: 7, Packed: null })
  })
})
