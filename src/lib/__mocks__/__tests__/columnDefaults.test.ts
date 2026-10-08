/**
 * The mock store fills the column defaults Postgres fills on INSERT.
 *
 * What this pins (8 Oct 2026): `recordPayment` leaves `payments.payment_date`
 * out because the column is `timestamptz not null default now()` (0006:187).
 * The mock stored the row without it, and Finance → Payments rendered the
 * missing date as 1/1/1970. The same gap left `clients.client_since` and
 * `stock_transfers.requested_at` empty on rows written in mock mode.
 *
 * Each case loads a fresh copy of the client, because the store and the
 * localStorage replay log are built once, at import.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Row } from '../engine'

const OVERLAY_KEY = 'babin.mock.overlay.v1'

/** The builder types `data` as `unknown`; every read here is one row. */
const row = (data: unknown) => data as Row | null

/** A localStorage stand-in; this suite runs in `node`. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed))
  return {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  }
}

async function freshClient(seed?: Record<string, string>) {
  vi.resetModules()
  vi.stubGlobal('localStorage', memoryStorage(seed))
  return (await import('../client')).mockSupabase
}

function clockAt(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('mock insert — column defaults', () => {
  it('gives a payment inserted without payment_date the insert instant, as now() does', async () => {
    clockAt('2026-10-08T09:15:00.000Z')
    const db = await freshClient()

    const { data, error } = await db
      .from('payments')
      .insert({ client_uuid: 'pay-1', payment_no: 'PAY-2026-0001', amount: 500, status: 'Received' })
      .select()
      .single()

    expect(error).toBeNull()
    expect(row(data)?.['payment_date']).toBe('2026-10-08T09:15:00.000Z')
    // One transaction, one now(): the two defaults are the same instant.
    expect(row(data)?.['payment_date']).toBe(row(data)?.['created_at'])

    const read = await db.from('payments').select('payment_no, payment_date').eq('client_uuid', 'pay-1').single()
    expect(read.data).toEqual({ payment_no: 'PAY-2026-0001', payment_date: '2026-10-08T09:15:00.000Z' })
  })

  it('keeps a payment_date the caller sent, null included', async () => {
    clockAt('2026-10-08T09:15:00.000Z')
    const db = await freshClient()

    const given = await db
      .from('payments')
      .insert({ client_uuid: 'pay-2', payment_date: '2026-09-30T04:00:00.000Z' })
      .select()
      .single()
    const nulled = await db.from('payments').insert({ client_uuid: 'pay-3', payment_date: null }).select().single()

    expect(row(given.data)?.['payment_date']).toBe('2026-09-30T04:00:00.000Z')
    expect(row(nulled.data)?.['payment_date']).toBeNull()
  })

  it('fills CURRENT_DATE with the UTC date, and the other now() columns', async () => {
    // 01:45 on 9 Oct in Kathmandu, still 8 Oct in UTC, which is the database's zone.
    clockAt('2026-10-08T20:00:00.000Z')
    const db = await freshClient()

    const client = await db.from('clients').insert({ client_uuid: 'cl-1', name: 'Test Client' }).select().single()
    const transfer = await db.from('stock_transfers').insert({ client_uuid: 'st-1' }).select().single()

    expect(row(client.data)?.['client_since']).toBe('2026-10-08')
    expect(row(client.data)?.['updated_at']).toBe('2026-10-08T20:00:00.000Z')
    expect(row(transfer.data)?.['requested_at']).toBe('2026-10-08T20:00:00.000Z')
  })

  it('dates a payment stored before the fix from its own created_at on the next load', async () => {
    const stored = {
      inserts: [
        {
          table: 'payments',
          row: { id: 'p-old', client_uuid: 'pay-old', payment_no: 'PAY-2026-0002', created_at: '2026-10-08T08:55:12.000Z' },
        },
      ],
      updates: [],
      deletes: [],
      seq: { payment: 2 },
    }
    const db = await freshClient({ [OVERLAY_KEY]: JSON.stringify(stored) })

    const { data } = await db.from('payments').select('payment_date').eq('id', 'p-old').single()

    expect(row(data)?.['payment_date']).toBe('2026-10-08T08:55:12.000Z')
  })
})
