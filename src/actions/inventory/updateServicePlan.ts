import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { safeUpdate } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'

/**
 * # UPDATE_SERVICE_PLAN — the three intervals that make a model badge
 *
 * RULING 2026-09-08 (R-28): the preventive-service interval lives on the product
 * **model**, not the category and not the unit. `0103` adds the columns and the
 * view that derives due-ness from them; this is the only way to write them.
 *
 * ## Without this, the whole ruling is inert
 *
 * All three intervals are nullable and **null means that trigger is off**, which
 * is the correct default for every model in the catalogue — nothing should start
 * warning on the day the migration lands. But it also means that until a model is
 * given a plan, `product_units_service_v` returns a null `due_reason` for every
 * unit of it, no badge ever renders, and the feature is a view nobody can reach.
 * The card on the model's Maintenance tab is the reach; this is what it saves
 * through.
 *
 * ## Only what the operator changed, and null is a value
 *
 * `patch` carries changed keys ONLY — `updateClient`'s contract — because an edit
 * of the day interval must not silently clear the meter interval.
 *
 * `null` is therefore meaningful and is NOT the same as absent: sending
 * `serviceIntervalDays: null` turns the time trigger **off**, and omitting the
 * key leaves it as it was. That distinction is the whole of R-28's "null = that
 * trigger is off", so the payload is built from `Object.prototype.hasOwnProperty`
 * rather than from truthiness — `0` and `null` both survive the trip, and the
 * CHECK below refuses the `0`.
 *
 * ## What it refuses, and why not more
 *
 * An interval of zero or less, and a negative grace. Both are also CHECK
 * constraints in `0103` (`products_service_intervals_positive`,
 * `products_service_grace_non_negative`), and the database is the arbiter — this
 * refuses first only so the operator gets a sentence rather than a constraint
 * name. Nothing else is validated here: what a *sensible* interval is for a
 * camera versus a light stand is a business figure, it is ⭐, and inventing a
 * ceiling would be exactly the kind of guess CLAUDE.md forbids.
 *
 * ## Law 6 — no money
 *
 * Not one money column is read or written. `products` carries six rate columns
 * and a purchase price; none is named in the select, the payload or the echo, so
 * a Manager editing a service interval never touches them and a mask never has to
 * catch it.
 *
 * ## The read-back is the only proof
 *
 * An UPDATE refused by RLS returns **zero rows and no error**. Without the echo
 * this would report a saved plan that was never written — the failure mode
 * `updateBundle` records for the same reason. The echo names its columns and
 * none of them is money.
 *
 * ⚠ `0103` is NOT applied to any project (N-5), so `src/types/database.ts` does
 * not carry these six columns yet and the payload is cast at the boundary. When
 * the migration lands and `npm run db:types` is re-run, the cast comes off and
 * nothing else changes.
 */

export type UpdateServicePlanInput = {
  /** `products.id`. */
  productId: string
  /**
   * Changed keys only. `null` turns a trigger off; an absent key leaves it alone.
   */
  patch: {
    serviceIntervalDays?: number | null
    serviceIntervalRentalDays?: number | null
    serviceIntervalMeterHours?: number | null
    serviceGraceDays?: number
  }
  /** Law 8 — the offline envelope key, minted where the operator pressed Save. */
  clientUuid?: string
}

export type UpdateServicePlanResult = {
  success: true
  productId: string
  productName: string
  /** True when at least one interval is set — what `hasServicePlan` reads. */
  hasPlan: boolean
  /** The keys this save actually wrote, in the order they were sent. */
  changed: readonly string[]
}

const COLUMN_OF: Record<string, string> = {
  serviceIntervalDays: 'service_interval_days',
  serviceIntervalRentalDays: 'service_interval_rental_days',
  serviceIntervalMeterHours: 'service_interval_meter_hours',
  serviceGraceDays: 'service_grace_days',
}

const LABEL_OF: Record<string, string> = {
  serviceIntervalDays: 'the calendar interval',
  serviceIntervalRentalDays: 'the rental-day interval',
  serviceIntervalMeterHours: 'the meter-hour interval',
  serviceGraceDays: 'the grace window',
}

export const updateServicePlanConfig: ActionConfig<UpdateServicePlanInput, UpdateServicePlanResult> = {
  name: 'UPDATE_SERVICE_PLAN',
  permissions: ['inventory.edit_service_plan'],
  implemented: true,

  validate(input: UpdateServicePlanInput) {
    if (!input.productId || input.productId.trim() === '') {
      throw new Error('A service plan is saved against a product. No product was named.')
    }

    const keys = Object.keys(input.patch)
    if (keys.length === 0) {
      throw new Error('Nothing was changed, so nothing was saved.')
    }
    for (const key of keys) {
      if (!(key in COLUMN_OF)) {
        throw new Error(`${key} is not part of a service plan. Nothing was saved.`)
      }
    }

    for (const key of ['serviceIntervalDays', 'serviceIntervalRentalDays', 'serviceIntervalMeterHours'] as const) {
      const value = input.patch[key]
      if (value === undefined || value === null) continue
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(
          `${LABEL_OF[key]} must be more than zero — clear it instead to turn that trigger off. Nothing was saved.`,
        )
      }
    }

    const grace = input.patch.serviceGraceDays
    if (grace !== undefined && (!Number.isFinite(grace) || grace < 0)) {
      throw new Error('The grace window cannot be negative. Zero means a due unit is overdue at once.')
    }
  },

  async execute(input: UpdateServicePlanInput, ctx: ActionContext) {
    const { data: before, error: readError } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', input.productId)
      .maybeSingle()

    if (readError) {
      throw new Error(`Could not read the product, so no service plan was saved: ${readError.message}`)
    }
    if (!before) {
      throw new Error(`No product matches ${input.productId}. Nothing was saved.`)
    }

    /* Built key by key, so `null` (turn this trigger off) survives and an absent
       key is genuinely absent. A spread of the patch object would do the same
       thing today and would stop doing it the first time a caller passed
       `undefined` explicitly. */
    const payload: Record<string, number | null> = {}
    const changed: string[] = []
    for (const [key, column] of Object.entries(COLUMN_OF)) {
      if (!Object.prototype.hasOwnProperty.call(input.patch, key)) continue
      const value = (input.patch as Record<string, number | null | undefined>)[key]
      if (value === undefined) continue
      payload[column] = value
      changed.push(key)
    }

    if (changed.length === 0) {
      throw new Error('Nothing was changed, so nothing was saved.')
    }

    /* `as never` for the six columns 0103 adds: the migration is N-5 blocked, so
       the generated Database types do not carry them yet. Same device, same
       reason, as `queries/availability.ts`'s hold insert. */
    const { data: after, error } = (await safeUpdate(
      'products',
      input.productId,
      payload as never,
      input.clientUuid,
    )) as { data: Record<string, unknown> | null; error: { message: string } | null }

    if (error) {
      throw new Error(`The service plan was not saved: ${error.message}`)
    }
    if (!after) {
      /* Zero rows and no error is what RLS looks like. Reporting success here
         would tell a Manager their plan was saved when the row never moved. */
      throw new Error(
        `The service plan for ${String(before.name)} was not saved — the database accepted the request and changed no row, ` +
          'which means this session may not edit it. Nothing was written.',
      )
    }

    const row = after as Record<string, number | null>
    const hasPlan =
      row['service_interval_days'] !== null ||
      row['service_interval_rental_days'] !== null ||
      row['service_interval_meter_hours'] !== null

    return {
      result: {
        success: true as const,
        productId: input.productId,
        productName: String(before.name),
        hasPlan,
        changed,
      },
      events: [
        {
          type: EVENT_TYPES.PRODUCT_SERVICE_PLAN_UPDATED,
          payload: {
            productId: input.productId,
            productName: String(before.name),
            changed,
            hasPlan,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const updateServicePlan = createAction(updateServicePlanConfig)
