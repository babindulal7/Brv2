// @vitest-environment jsdom
/**
 * # Handover Workspace — which rows a hand press is allowed to move
 *
 * HO-12's first falsehood, isolated. The control now called **Mark Ready
 * Picked Up** was `Bulk Scan`: it scanned nothing, and it wrote over rows that
 * were already marked — including rows whose mark came from a real scan, which
 * lost their own `pickedAtIso` and `via` to the press.
 *
 * `rowsReadyToPickUp` is the whole rule, so it is pinned here rather than only
 * through the rendered log. The two exclusions are different in kind and both
 * matter: a mark made this session carries provenance the press must not
 * destroy, and a `prior` row was recorded by an EARLIER session and can never
 * be re-dispatched from this screen at all.
 *
 * The environment pragma is per `vitest.config.ts` (the suite defaults to
 * `node`); nothing here renders, but importing the module pulls in the
 * component tree, and jsdom is the cheap way to keep that import honest.
 */
import { describe, expect, it } from 'vitest'
import { rowsReadyToPickUp, type HandRow, type Mark } from '../HandoverWorkspace'

function row(over: Partial<HandRow> & { key: string }): HandRow {
  return {
    lineId: 'l-1',
    assetId: `asset-${over.key}`,
    serial: `SN-${over.key}`,
    name: `Sony FX3 · ${over.key}`,
    qty: 1,
    required: true,
    location: 'A2-01',
    group: 'Sony FX3',
    prior: null,
    ...over,
  }
}

describe('rowsReadyToPickUp — only a row that is still Ready', () => {
  it('takes every untouched row when nothing is marked', () => {
    const rows = [row({ key: 'u-1' }), row({ key: 'u-2' })]
    expect(rowsReadyToPickUp(rows, {}).map((r) => r.key)).toEqual(['u-1', 'u-2'])
  })

  it('leaves a scanned mark alone — the defect that cost a real scan its provenance', () => {
    const rows = [row({ key: 'u-1' }), row({ key: 'u-2' })]
    const marks: Record<string, Mark> = {
      'u-1': { state: 'Picked Up', pickedAtIso: '2026-09-07T04:00:00.000Z', via: 'scan' },
    }
    expect(rowsReadyToPickUp(rows, marks).map((r) => r.key)).toEqual(['u-2'])
  })

  it('leaves a Missing mark alone, reason and all', () => {
    const rows = [row({ key: 'u-1' }), row({ key: 'u-2' })]
    const marks: Record<string, Mark> = {
      'u-1': { state: 'Missing', reason: 'not on the shelf, crew is checking van 2' },
    }
    expect(rowsReadyToPickUp(rows, marks).map((r) => r.key)).toEqual(['u-2'])
  })

  it('never touches a row an earlier session already recorded', () => {
    const rows = [row({ key: 'u-1', prior: 'Picked Up' }), row({ key: 'u-2', prior: 'Missing' }), row({ key: 'u-3' })]
    expect(rowsReadyToPickUp(rows, {}).map((r) => r.key)).toEqual(['u-3'])
  })

  it('is empty when every row is resolved, so the press can say so instead of doing nothing', () => {
    const rows = [row({ key: 'u-1', prior: 'Picked Up' }), row({ key: 'u-2' })]
    const marks: Record<string, Mark> = { 'u-2': { state: 'Picked Up', via: 'manual' } }
    expect(rowsReadyToPickUp(rows, marks)).toEqual([])
  })
})
