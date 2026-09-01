import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { safeUpdate } from '../../lib/dataAccess'

/**
 * # RELEASE_BOOKING_LINE_UNIT — the serial chip's ×, §4.39 ruled option (a)
 *
 * A creation-time unit assignment ends by RELEASE, never by delete: 0044's Law
 * 3 backstop rejects DELETE on `booking_line_units` for every role including
 * Owner (verified live 31 Aug 2026), and migration 0076 gives the row the
 * `released_at`/`released_by` pair instead — the row stays, marked ended, the
 * same shape `inventory_reservations` has always used for its holds.
 *
 * ## The capability — `unit.release`, mirrored not invented
 *
 * §4.20's ruled method: the RLS policy on the table this action writes.
 * `booking_line_units_all` (0024, confirmed against pg_policies 31 Aug 2026):
 *
 *     using     (auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
 *     with check(auth_user_role() in ('Owner','Admin','Manager','Coordinator','Warehouse'))
 *
 * — exactly `rbac.canWriteBookingDesk`'s BOOKING_DESK set, the same mapping
 * `note.create` uses for the same five roles.
 *
 * ## The confirm-past-Packed guard is the SCREEN's, on purpose
 *
 * v2.5 §10.4 rules a confirmation when the booking is past Packed. A
 * confirmation is consent UX — it belongs where the operator is, and putting a
 * stage refusal here instead would turn "are you sure" into "you may not",
 * which is a different (unruled) rule. The action stays stage-blind; the
 * database stays the arbiter of what a released row may do next (0076's
 * freeze trigger).
 *
 * ## Failure shapes worth naming
 *
 *  - **Column absent** (0076 not applied yet): the update fails with 42703 —
 *    surfaced verbatim as "not saved", because it wasn't. Mock mode carries
 *    the columns already, so the flow is drivable before the apply.
 *  - **Already released**: 0076's freeze trigger raises; translated to a
 *    sentence naming the earlier release rather than the trigger.
 *  - **Offline**: refused, not queued — same call as `addBookingNote`: a
 *    release the database has not confirmed must not disappear a chip.
 */

export type ReleaseBookingLineUnitInput = {
  /** `booking_line_units.id` — the assignment row, not the physical unit. */
  unitRowId: string
  /** The serial/tag the operator saw — only for the refusal sentences. */
  unitLabel?: string | undefined
  /** **Law 8** — minted where the × was pressed, reused across retries. */
  clientUuid?: string | undefined
}

export type ReleaseBookingLineUnitResult = {
  unitRowId: string
  releasedAt: string
}

export const releaseBookingLineUnitConfig: ActionConfig<ReleaseBookingLineUnitInput, ReleaseBookingLineUnitResult> = {
  name: 'RELEASE_BOOKING_LINE_UNIT',
  permissions: ['unit.release'],

  /** `true` — writes `booking_line_units` through `safeUpdate` and verifies the
   *  row came back carrying the `released_at` Postgres accepted. */
  implemented: true,

  validate: (input) => {
    if (!input.unitRowId || input.unitRowId.trim() === '') {
      throw new Error('Nothing names the unit assignment to release, so nothing was changed.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error('This release carries no idempotency key, so a retry could not be told from a second press. Nothing was sent.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error(
        'This device is offline. The release was not queued — a chip must not disappear before the database confirms the assignment ended.',
      )
    }

    const label = input.unitLabel?.trim() || 'this unit'
    const releasedAt = new Date().toISOString()

    let updated
    try {
      updated = await safeUpdate(
        /* Absent from the hand-declared types/database.ts Update map for the
         * release pair — same cast, same reason, as addBookingNote's table. */
        'booking_line_units' as never,
        input.unitRowId,
        { released_at: releasedAt, released_by: ctx.userId } as never,
        input.clientUuid,
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('released at') || message.includes('is history')) {
        // 0076's freeze trigger — a second press, or a colleague got there first.
        throw new Error(`${label} was already released — the chip should clear on the next refresh. Nothing was changed twice.`)
      }
      if (message.includes('released_at') && (message.includes('does not exist') || message.includes('42703'))) {
        throw new Error(
          'The database does not carry the release columns yet (migration 0076 is drafted, not applied), so nothing was saved.',
        )
      }
      throw new Error(message)
    }

    /* Same persistence check as the other implemented actions: `safeUpdate`'s
     * offline/queue branches echo the payload back, so only trust a row that
     * carries what Postgres confirmed. The echoed payload and a real row both
     * carry `released_at` — the queue branch is already refused above by the
     * navigator check, and a mid-flight network failure returns the echo, which
     * is why the error field is checked before the shape. */
    if (updated.error) {
      throw new Error(
        `The release could not be confirmed against the database, so treat ${label} as still assigned: ${
          (updated.error as { message?: string }).message ?? String(updated.error)
        }`,
      )
    }
    const persisted = updated.data as unknown as { id?: string; released_at?: string } | null
    if (!persisted || typeof persisted.id !== 'string' || !persisted.released_at) {
      throw new Error(
        `The release was not confirmed as written, so treat ${label} as still assigned. Check the connection and try again.`,
      )
    }

    return {
      result: { unitRowId: input.unitRowId, releasedAt: persisted.released_at },
      events: [
        {
          type: EVENT_TYPES.UNIT_RELEASED,
          payload: { unitRowId: input.unitRowId, releasedAt: persisted.released_at, userId: ctx.userId },
        },
      ],
    }
  },
}

export const releaseBookingLineUnit = createAction(releaseBookingLineUnitConfig)
