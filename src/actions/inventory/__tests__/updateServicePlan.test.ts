import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * RULING 2026-09-08 (R-28) — the write half.
 *
 * What this file pins is the part a type cannot: that **null and absent are
 * different**. R-28's whole "null = that trigger is off" rests on it, and the
 * two obvious implementations — a spread of the patch, or a truthiness check —
 * each get it wrong in a different direction. A spread carries an explicit
 * `undefined` into the payload and clears a column nobody touched; a truthiness
 * check drops `null` and makes turning a trigger off impossible.
 *
 * Also pinned: an UPDATE that RLS refused returns zero rows and NO error, and
 * reporting that as a saved plan is the failure mode this action exists to
 * avoid.
 */

const db = vi.hoisted(() => {
  const state = {
    /** The row `select id, name` hands back, or null for "no such product". */
    product: { id: 'prod-1', name: 'NISI Athena 35mm' } as Record<string, unknown> | null,
    readError: null as { message: string } | null,
    /** What `safeUpdate` returns — null data is RLS refusing silently. */
    updated: {
      service_interval_days: 90,
      service_interval_rental_days: null,
      service_interval_meter_hours: null,
      service_grace_days: 7,
    } as Record<string, unknown> | null,
    updateError: null as { message: string } | null,
    /** Every payload `safeUpdate` was handed, in order. */
    writes: [] as Array<{ table: string; id: string; payload: Record<string, unknown> }>,
    selected: [] as string[],
  }
  function reset(): void {
    state.product = { id: 'prod-1', name: 'NISI Athena 35mm' }
    state.readError = null
    state.updated = {
      service_interval_days: 90,
      service_interval_rental_days: null,
      service_interval_meter_hours: null,
      service_grace_days: 7,
    }
    state.updateError = null
    state.writes = []
    state.selected = []
  }
  return { state, reset }
})

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => {
      const builder: Record<string, unknown> = {
        select(columns: string) {
          db.state.selected.push(columns)
          return builder
        },
        eq() {
          return builder
        },
        maybeSingle: () => Promise.resolve({ data: db.state.product, error: db.state.readError }),
      }
      return builder
    },
  },
  newClientUuid: () => 'test-key',
}))

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: async (table: string, id: string, payload: Record<string, unknown>) => {
    db.state.writes.push({ table, id, payload })
    return { data: db.state.updated, error: db.state.updateError }
  },
}))

const { updateServicePlanConfig } = await import('../updateServicePlan')

const MANAGER = { userId: 'usr-manager', role: 'Manager' as const, isOnline: true }

async function save(patch: Record<string, unknown>) {
  const input = { productId: 'prod-1', patch } as Parameters<typeof updateServicePlanConfig.validate>[0]
  await updateServicePlanConfig.validate(input)
  return updateServicePlanConfig.execute(input, MANAGER)
}

beforeEach(() => {
  db.reset()
})

describe('validate — what never reaches the database', () => {
  /* `validate` is synchronous and THROWS — it is not a promise. Asserting with
     `rejects` here passed vacuously on the first draft and had to be corrected;
     the shape of the assertion is part of what this case pins. */
  it('refuses a save with no product', async () => {
    await expect(save({ serviceIntervalDays: 90 })).resolves.toBeDefined()
    const input = { productId: '  ', patch: { serviceIntervalDays: 90 } } as never
    expect(() => updateServicePlanConfig.validate(input)).toThrow(/No product was named/)
  })

  it('refuses an empty patch rather than writing nothing and reporting success', async () => {
    await expect(save({})).rejects.toThrow(/Nothing was changed/)
  })

  it('refuses a key that is not part of a service plan', async () => {
    await expect(save({ dailyRate: 5000 })).rejects.toThrow(/not part of a service plan/)
  })

  /* Also a CHECK in 0103. Refused here first only so the operator gets a
     sentence instead of `products_service_intervals_positive`. */
  it('refuses a zero or negative interval, and says how to turn it off instead', async () => {
    await expect(save({ serviceIntervalDays: 0 })).rejects.toThrow(/clear it instead/)
    await expect(save({ serviceIntervalRentalDays: -1 })).rejects.toThrow(/clear it instead/)
  })

  it('refuses a negative grace, and accepts zero — zero is a real answer', async () => {
    await expect(save({ serviceGraceDays: -1 })).rejects.toThrow(/cannot be negative/)
    await expect(save({ serviceGraceDays: 0 })).resolves.toBeDefined()
  })
})

describe('the payload — null turns a trigger off, absent leaves it alone', () => {
  it('writes only the keys the operator changed', async () => {
    await save({ serviceIntervalDays: 90 })

    expect(db.state.writes).toHaveLength(1)
    expect(db.state.writes[0]?.payload).toEqual({ service_interval_days: 90 })
  })

  /* The whole of R-28's "null = that trigger is off". A truthiness check would
     drop this and make turning a trigger off impossible from the UI. */
  it('carries an explicit null through, because null IS the off switch', async () => {
    await save({ serviceIntervalRentalDays: null })

    expect(db.state.writes[0]?.payload).toEqual({ service_interval_rental_days: null })
  })

  /* And the other direction: an explicitly-undefined key must not clear a
     column nobody touched, which a spread of the patch object would do. */
  it('ignores a key sent as undefined rather than clearing that column', async () => {
    await save({ serviceIntervalDays: 90, serviceIntervalMeterHours: undefined })

    expect(db.state.writes[0]?.payload).toEqual({ service_interval_days: 90 })
  })

  it('maps every field to its snake_case column, and touches no other', async () => {
    await save({
      serviceIntervalDays: 90,
      serviceIntervalRentalDays: 40,
      serviceIntervalMeterHours: 250,
      serviceGraceDays: 14,
    })

    expect(db.state.writes[0]?.payload).toEqual({
      service_interval_days: 90,
      service_interval_rental_days: 40,
      service_interval_meter_hours: 250,
      service_grace_days: 14,
    })
    expect(db.state.writes[0]?.table).toBe('products')
  })
})

describe('Law 6 — a service interval is not money', () => {
  it('names no money column in the read', async () => {
    await save({ serviceIntervalDays: 90 })

    for (const columns of db.state.selected) {
      expect(columns).not.toMatch(/rate|price|cost|amount|deposit/i)
    }
  })

  it('carries no money column in the write', async () => {
    await save({ serviceIntervalDays: 90 })

    for (const key of Object.keys(db.state.writes[0]?.payload ?? {})) {
      expect(key).not.toMatch(/rate|price|cost|amount|deposit/i)
    }
  })
})

describe('the read-back is the only proof the write landed', () => {
  /* An UPDATE refused by RLS returns zero rows and NO error. Without this
     branch a Coordinator would be told their plan was saved. */
  it('refuses to report success when the update changed no row', async () => {
    db.state.updated = null

    await expect(save({ serviceIntervalDays: 90 })).rejects.toThrow(/changed no row/)
  })

  it('reports the plan as set when any interval came back non-null', async () => {
    const { result } = await save({ serviceIntervalDays: 90 })

    expect(result.hasPlan).toBe(true)
    expect(result.changed).toEqual(['serviceIntervalDays'])
    expect(result.productName).toBe('NISI Athena 35mm')
  })

  it('reports the plan as gone when the last interval was cleared', async () => {
    db.state.updated = {
      service_interval_days: null,
      service_interval_rental_days: null,
      service_interval_meter_hours: null,
      service_grace_days: 7,
    }

    const { result } = await save({ serviceIntervalDays: null })

    expect(result.hasPlan).toBe(false)
  })

  it('refuses a product that does not exist, before writing anything', async () => {
    db.state.product = null

    await expect(save({ serviceIntervalDays: 90 })).rejects.toThrow(/No product matches/)
    expect(db.state.writes).toHaveLength(0)
  })

  it('surfaces a write error rather than swallowing it', async () => {
    db.state.updateError = { message: 'permission denied for table products' }

    await expect(save({ serviceIntervalDays: 90 })).rejects.toThrow(/permission denied/)
  })
})

describe('the capability it declares', () => {
  /* Declared AND mapped in the same change. An unmapped capability resolves to
     `undefined`, which the dispatcher reads as a denial for every role
     including Owner — the gap that made `rental.confirm` unreachable. */
  it('names inventory.edit_service_plan, and core.ts answers it', async () => {
    expect(updateServicePlanConfig.permissions).toEqual(['inventory.edit_service_plan'])

    const core = import.meta.glob('../../core.ts', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >
    const source = Object.values(core)[0] ?? ''
    expect(source).toContain("case 'inventory.edit_service_plan':")
  })

  it('is implemented, so the dispatcher does not throw ActionNotImplementedError', () => {
    expect(updateServicePlanConfig.implemented).toBe(true)
  })
})
