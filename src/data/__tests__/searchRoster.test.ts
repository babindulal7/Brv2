/**
 * **`searchRoster` — New Rental's crew picker rule.**
 *
 * The function exists because law 1 says a page states the outcome of a match
 * and does not decide what matches. Its rule is small but it is a *rule*, and
 * an operator staffing a booking sees only its output, so each clause is
 * pinned here:
 *
 *  1. **An empty query is not "no results".** It means "nobody excluded yet",
 *     so the picker opens on the whole remaining roster rather than on an
 *     empty box the operator has to type into to discover anyone exists.
 *  2. **Exclusion is by id.** The people already on the booking are gone from
 *     the list; nobody can be added twice.
 *  3. **Role is searched as well as name.** An operator staffing a booking
 *     types the job at least as often as the person.
 *  4. **Case is irrelevant.** "gaffer" and "Gaffer" are the same search.
 *  5. **A genuine miss returns nothing**, and so does an exhausted roster —
 *     two different empty results the picker's empty state distinguishes.
 *
 * A local fixture roster is passed as the third argument for every assertion
 * about *which* people come back, so these expectations do not move when
 * someone edits `CREW_ROSTER`. The default-argument path — that omitting the
 * roster searches `CREW_ROSTER` itself — is checked separately, against facts
 * that hold for any non-empty roster.
 */
import { describe, it, expect } from 'vitest'
import { CREW_ROSTER, searchRoster } from '../crew'
import type { CrewMember } from '../crew'
import { rupees } from '../../lib/money'

const ROSTER: CrewMember[] = [
  { id: 'F-1', name: 'Bikram Rai', role: 'Director of Photography', phone: '+977 980-0000001', state: 'Booked', dayRatePaisa: rupees(25000) },
  { id: 'F-2', name: 'Sita Tamang', role: '1st AC', phone: '+977 981-0000002', state: 'Available', dayRatePaisa: rupees(15000) },
  { id: 'F-3', name: 'Arjun Magar', role: 'Gaffer', phone: '+977 982-0000003', state: 'On Leave', dayRatePaisa: rupees(12000) },
  { id: 'F-4', name: 'Nima Sherpa', role: 'Gaffer', phone: '+977 984-0000004', state: 'Off Duty', dayRatePaisa: rupees(12000) },
]

const idsOf = (people: readonly CrewMember[]): string[] => people.map((m) => m.id)

describe('searchRoster', () => {
  it('returns the whole roster for an empty query', () => {
    expect(idsOf(searchRoster('', [], ROSTER))).toEqual(['F-1', 'F-2', 'F-3', 'F-4'])
  })

  it('treats a whitespace-only query as empty rather than as a search for a space', () => {
    expect(idsOf(searchRoster('   ', [], ROSTER))).toEqual(['F-1', 'F-2', 'F-3', 'F-4'])
  })

  it('drops the excluded ids, and only those', () => {
    expect(idsOf(searchRoster('', ['F-2', 'F-4'], ROSTER))).toEqual(['F-1', 'F-3'])
  })

  it('applies the exclusion to a query as well as to the empty list', () => {
    // Both gaffers match; one of them is already on the booking.
    expect(idsOf(searchRoster('Gaffer', [], ROSTER))).toEqual(['F-3', 'F-4'])
    expect(idsOf(searchRoster('Gaffer', ['F-3'], ROSTER))).toEqual(['F-4'])
  })

  it('ignores an excluded id that is not on the roster', () => {
    expect(idsOf(searchRoster('', ['not-a-crew-id'], ROSTER))).toEqual(['F-1', 'F-2', 'F-3', 'F-4'])
  })

  it('matches on the name', () => {
    expect(idsOf(searchRoster('Sita', [], ROSTER))).toEqual(['F-2'])
  })

  it('matches on the role, not only on the name', () => {
    // "Director of Photography" is nobody's name; this can only match the role.
    expect(idsOf(searchRoster('Director of Photography', [], ROSTER))).toEqual(['F-1'])
    expect(idsOf(searchRoster('1st AC', [], ROSTER))).toEqual(['F-2'])
  })

  it('matches a substring, not only a whole word', () => {
    expect(idsOf(searchRoster('magar', [], ROSTER))).toEqual(['F-3'])
    expect(idsOf(searchRoster('aff', [], ROSTER))).toEqual(['F-3', 'F-4'])
  })

  it('is case-insensitive on both the query and the field', () => {
    expect(idsOf(searchRoster('gaffer', [], ROSTER))).toEqual(['F-3', 'F-4'])
    expect(idsOf(searchRoster('GAFFER', [], ROSTER))).toEqual(['F-3', 'F-4'])
    expect(idsOf(searchRoster('bIkRaM', [], ROSTER))).toEqual(['F-1'])
  })

  it('returns nothing when nothing matches', () => {
    expect(searchRoster('Steadicam', [], ROSTER)).toEqual([])
  })

  it('returns nothing when everyone is already on the booking', () => {
    // The distinction the picker's empty state depends on: an exhausted roster
    // is empty for EVERY query, including the empty one, whereas a mere miss
    // still returns people when the query is cleared.
    const all = idsOf(ROSTER)
    expect(searchRoster('', all, ROSTER)).toEqual([])
    expect(searchRoster('Gaffer', all, ROSTER)).toEqual([])
  })

  it('does not mutate or alias the roster it was given', () => {
    const before = idsOf(ROSTER)
    const result = searchRoster('', ['F-1'], ROSTER)
    result.push(ROSTER[0] as CrewMember)
    expect(idsOf(ROSTER)).toEqual(before)
  })

  it('searches CREW_ROSTER when no roster is passed', () => {
    expect(searchRoster('')).toHaveLength(CREW_ROSTER.length)
    expect(searchRoster('', CREW_ROSTER.map((m) => m.id))).toEqual([])
  })
})
