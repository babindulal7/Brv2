import { describe, it, expect } from 'vitest'
import { buildCorpus, seedSql, recordNo, SEQUENCES } from '../seed'
import { compactSeedSql } from '../seedCompact'

/**
 * `seedCompact.ts` states the contract: both emitters render the same
 * engine-derived corpus, and "if the two ever disagree about a number, that is
 * a bug in one of them, not a second opinion." Nothing enforced it.
 *
 * On 2 Sep 2026 that gap let the readable emitter drift to the RETIRED
 * `CL-2026-0034` identifier shape while the transport emitter — the one that
 * actually reached live — kept the ruled `C-34`. The two files were then legal
 * in disjoint schema states (one only BEFORE 0055, the other only AFTER), and
 * no test noticed. This pins the invariant at the level it broke: the set of
 * identifiers, and their shape.
 */
const ids = (sql: string) => new Set([...sql.matchAll(/'((?:C|B)-\d+)'/g)].map((m) => m[1]!))
const RETIRED = /'(?:CL|BK)-\d{4}-\d{4}'/

describe('seed emitters — one corpus, one identifier shape', () => {
  const corpus = buildCorpus()
  const readable = seedSql()
  const compact = compactSeedSql(corpus).join('\n')

  it('emit exactly the same client_code and booking_no set', () => {
    const r = ids(readable)
    const c = ids(compact)
    expect([...r].filter((x) => !c.has(x))).toEqual([])
    expect([...c].filter((x) => !r.has(x))).toEqual([])
    expect(r.size).toBeGreaterThan(0)
  })

  it('both emit the RULED C-<n> / B-<n> shape and never the retired CL-/BK- one', () => {
    expect(readable).not.toMatch(RETIRED)
    expect(compact).not.toMatch(RETIRED)
    for (const id of ids(readable)) expect(id).toMatch(/^[CB]-\d+$/)
  })

  it('every identifier the corpus defines reaches both emitters', () => {
    const defined = new Set<string>([
      ...corpus.clients.map((c) => recordNo(SEQUENCES.client, c.seq)),
      ...corpus.bookings.map((b) => b.bookingNo),
    ])
    expect(ids(readable)).toEqual(defined)
    expect(ids(compact)).toEqual(defined)
  })
})
