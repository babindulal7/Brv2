/**
 * The mock engine compares timestamps as INSTANTS, not strings.
 *
 * What this pins (1 Sep 2026 Dashboard sweep, finding #1): rows store `Z`-form
 * ISO instants; `operationalDayBounds` emits `+05:45`-offset bounds; and the
 * old lexicographic `cmp` compared the two FORMATS instead of the two moments —
 * `'…T04:15:00Z' >= '…T06:00:00+05:45'` is false as strings even though
 * 04:15Z is 10:00 NPT, inside the operating day. Every mock date-ranged read
 * silently dropped the 00:00–06:00Z band: the whole Nepal working morning.
 *
 * The suite drives the exported builder, not the private `cmp`, so it pins the
 * behaviour a screen actually gets.
 */
import { describe, it, expect } from 'vitest'
import { createBuilder, type EngineHooks, type Row } from '../engine'

const ROWS: Row[] = [
  // 10:00 NPT — the row the string path lost.
  { id: 'morning', pickup_at: '2026-09-01T04:15:00Z' },
  // 12:00 NPT — visible either way (06:15 sorts above the bound's "06:00…").
  { id: 'noon', pickup_at: '2026-09-01T06:15:00Z' },
  // The previous NPT day, 23:00 — string comparison would have INCLUDED it
  // against a Z-form floor, and must stay excluded against the offset form.
  { id: 'yesterday', pickup_at: '2026-08-31T17:15:00Z' },
  { id: 'unscheduled', pickup_at: null },
]

const hooks: EngineHooks = {
  read: () => ROWS,
  insert: () => ({ rows: [], error: null }),
  update: () => [],
  remove: () => [],
}

/** The exact bound shape `operationalDayBounds` produces: offset ISO, 06:00 NPT. */
const DAY_FROM = '2026-09-01T06:00:00.000+05:45'
const DAY_TO = '2026-09-02T05:59:59.999+05:45'

async function run(build: (b: ReturnType<typeof createBuilder>) => unknown) {
  const b = createBuilder('bookings', hooks)
  build(b)
  return (await (b as unknown as PromiseLike<{ data: Row[] | null }>)) as { data: Row[] | null }
}

describe('timestamp comparison across offset formats', () => {
  it('a Z-form morning instant is INSIDE an offset-form operating day', async () => {
    const res = await run((b) => b.select('id').gte('pickup_at', DAY_FROM).lte('pickup_at', DAY_TO))
    const ids = (res.data ?? []).map((r) => r['id'])
    expect(ids).toContain('morning')
    expect(ids).toContain('noon')
    expect(ids).not.toContain('yesterday')
  })

  it('nulls stay NULLS LAST for ascending order, matching Postgres', async () => {
    const res = await run((b) => b.select('id').order('pickup_at', { ascending: true }))
    const ids = (res.data ?? []).map((r) => r['id'])
    expect(ids).toEqual(['yesterday', 'morning', 'noon', 'unscheduled'])
  })

  it('date-only strings keep the plain string path — one uniform format, same order either way', async () => {
    const rows: Row[] = [
      { id: 'a', due_date_ad: '2026-09-02' },
      { id: 'b', due_date_ad: '2026-08-31' },
    ]
    const local: EngineHooks = { ...hooks, read: () => rows }
    const b = createBuilder('bookings', local)
    b.select('id').gte('due_date_ad', '2026-09-01')
    const res = (await (b as unknown as PromiseLike<{ data: Row[] | null }>)) as { data: Row[] | null }
    expect((res.data ?? []).map((r) => r['id'])).toEqual(['a'])
  })
})
