/**
 * settleDeposit.ts — Babin Rentals OS
 *
 * Immutable deposit release and charge application.
 *
 * ## Architecture & Guarantees (Audit G1 / Law 5 / Law 4)
 *
 * 1. Law 5 — Deposits are liabilities, never part of Rental Total.
 *    Held in `security_deposits` (booking liability account).
 *    All movements (cash-in, release, application) are recorded in `deposit_movements`.
 * 2. Law 4 — Immutable ledger rows: `deposit_movements` is append-only.
 *    The `sync_deposit_balances()` trigger on `deposit_movements` reconciles:
 *      - `received_amount = sum(Received)`
 *      - `refunded_amount = sum(Released)`
 *      - `applied_amount = sum(Applied)`
 *      - `pending_amount = greatest(0, required_amount - received_amount)`
 * 3. Law 1 — UI never computes or directly writes movements.
 * 4. RL-05 & Close Gate — Close rental requires `received_amount - refunded_amount - applied_amount === 0`.
 *    This action writes the `deposit_movements` rows (`Released` and/or `Applied`) that bring the held balance to zero.
 * 5. Capability: `deposit.release` (docs/PERMISSIONS.md §4.6) — Owner · Admin · Manager · Accounts.
 * 6. Fail-closed: Never queued offline (`queueOnFailure: false`).
 */

import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { idempotentInsert } from '../../lib/dataAccess'
import { supabase } from '../../lib/supabase'
import { formatMoney, rupees, toRupees, type Paisa } from '../../lib/money'
import type { DepositChargeType, DepositMovementType } from '../../types/database'

/** Convert DB rupees amount (number or string) to whole Paisa */
function amountToPaisa(val: number | string | null | undefined): Paisa {
  return rupees(Number(val ?? 0))
}

export type SettleDepositInput = {
  /** The booking number (e.g. 'B-715') or booking UUID */
  bookingRef: string
  /**
   * Amount in whole Paisa to release (refund back) to the client.
   * Can be 0 if entire deposit is applied to damages/penalties.
   */
  releasePaisa: Paisa
  /**
   * Optional amount in whole Paisa to apply against damage/missing/late penalties.
   */
  appliedPaisa?: Paisa | undefined
  /**
   * Penalty charge type if appliedPaisa > 0 ('Damage', 'Missing', or 'Late').
   */
  chargeType?: DepositChargeType | undefined
  /**
   * Reason for applying deposit (required and >= 5 chars if appliedPaisa > 0).
   */
  appliedReason?: string | undefined
  /**
   * Optional bank account UUID used for the release/refund payment.
   */
  bankAccountId?: string | null | undefined
  /**
   * Optional external transaction reference for the release payment.
   */
  transactionRef?: string | null | undefined
  /**
   * Law 8 client idempotency key for this settlement operation.
   */
  clientUuid: string
}

export type SettleDepositResult = {
  success: true
  depositId: string
  bookingNo: string
  releasedPaisa: Paisa
  appliedPaisa: Paisa
  movementNos: string[]
  remainingHeldPaisa: Paisa
}

export const settleDepositConfig: ActionConfig<SettleDepositInput, SettleDepositResult> = {
  name: 'SETTLE_DEPOSIT',
  permissions: ['deposit.release'],
  implemented: true,

  validate: (input) => {
    if (!input.bookingRef || input.bookingRef.trim() === '') {
      throw new Error('A booking reference is required to settle a deposit.')
    }
    if (!input.clientUuid || input.clientUuid.trim() === '') {
      throw new Error('This settlement carries no idempotency key (Law 8).')
    }

    if (!Number.isFinite(input.releasePaisa) || input.releasePaisa < 0) {
      throw new Error('Release amount cannot be negative.')
    }
    const applied = input.appliedPaisa ?? (0 as Paisa)
    if (!Number.isFinite(applied) || applied < 0) {
      throw new Error('Applied amount cannot be negative.')
    }
    if (input.releasePaisa === 0 && applied === 0) {
      throw new Error('Settlement must specify a non-zero release or applied amount.')
    }

    if (applied > 0) {
      if (!input.chargeType) {
        throw new Error('A charge type (Damage, Missing, or Late) is required when applying a deposit.')
      }
      if (!input.appliedReason || input.appliedReason.trim().length < 10) {
        throw new Error('A detailed reason (at least 10 characters) is required when applying deposit to charges.')
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('This device is offline. Deposit settlement cannot be queued offline and is refused.')
    }

    // 1. Resolve security_deposit record for the booking
    const bookingRef = input.bookingRef.trim()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingRef)

    let bookingId: string | null = null
    let bookingNo: string = ''

    if (isUuid) {
      const { data: bRow, error: bErr } = await supabase
        .from('bookings')
        .select('id, booking_no')
        .eq('id', bookingRef)
        .maybeSingle()
      if (bErr || !bRow) {
        throw new Error(`Booking ${bookingRef} not found.`)
      }
      bookingId = bRow.id
      bookingNo = bRow.booking_no
    } else {
      const { data: bRow, error: bErr } = await supabase
        .from('bookings')
        .select('id, booking_no')
        .eq('booking_no', bookingRef)
        .maybeSingle()
      if (bErr || !bRow) {
        throw new Error(`Booking ${bookingRef} not found.`)
      }
      bookingId = bRow.id
      bookingNo = bRow.booking_no
    }

    const { data: depositRow, error: depErr } = await supabase
      .from('security_deposits')
      .select('id, deposit_no, received_amount, refunded_amount, applied_amount')
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (depErr) {
      throw new Error(`Could not read deposit for ${bookingNo}: ${depErr.message}`)
    }
    if (!depositRow) {
      throw new Error(`No security deposit record exists for booking ${bookingNo}.`)
    }

    const currentHeldPaisa = (
      amountToPaisa(depositRow.received_amount) -
      amountToPaisa(depositRow.refunded_amount) -
      amountToPaisa(depositRow.applied_amount)
    ) as Paisa

    const appliedPaisa = input.appliedPaisa ?? (0 as Paisa)
    const totalToSettle = (input.releasePaisa + appliedPaisa) as Paisa

    if (totalToSettle > currentHeldPaisa) {
      throw new Error(
        `Cannot settle ${formatMoney(totalToSettle)}; only ${formatMoney(currentHeldPaisa)} is currently held.`,
      )
    }

    // 2. Fetch existing movements count to mint deterministic unique movement_nos
    const { count: existingCount, error: countErr } = await supabase
      .from('deposit_movements')
      .select('id', { count: 'exact', head: true })
      .eq('security_deposit_id', depositRow.id)

    if (countErr) {
      throw new Error(`Could not count deposit movements for ${depositRow.deposit_no}: ${countErr.message}`)
    }

    let movementIndex = (existingCount ?? 0) + 1
    const movementNos: string[] = []

    // 3. Insert 'Applied' movement if applicable
    if (appliedPaisa > 0) {
      const appliedNo = `${depositRow.deposit_no}-M${movementIndex++}`
      const appliedUuid = `${input.clientUuid}-applied`
      const result = await idempotentInsert('deposit_movements', {
        client_uuid: appliedUuid,
        movement_no: appliedNo,
        security_deposit_id: depositRow.id,
        movement_type: 'Applied' as DepositMovementType,
        amount: toRupees(appliedPaisa),
        charge_type: input.chargeType ?? null,
        applied_reason: input.appliedReason?.trim() ?? null,
        handled_by: ctx.userId,
      }, { queueOnFailure: false })

      if (result.error) {
        throw new Error(`Failed to record deposit charge application: ${result.error.message}`)
      }
      movementNos.push(appliedNo)
    }

    // 4. Insert 'Released' movement if applicable
    if (input.releasePaisa > 0) {
      const releaseNo = `${depositRow.deposit_no}-M${movementIndex++}`
      const releaseUuid = `${input.clientUuid}-release`
      const result = await idempotentInsert('deposit_movements', {
        client_uuid: releaseUuid,
        movement_no: releaseNo,
        security_deposit_id: depositRow.id,
        movement_type: 'Released' as DepositMovementType,
        amount: toRupees(input.releasePaisa),
        bank_account_id: input.bankAccountId ?? null,
        transaction_ref: input.transactionRef?.trim() ?? null,
        handled_by: ctx.userId,
      }, { queueOnFailure: false })

      if (result.error) {
        throw new Error(`Failed to record deposit release: ${result.error.message}`)
      }
      movementNos.push(releaseNo)
    }

    const remainingHeld = (currentHeldPaisa - totalToSettle) as Paisa

    const events = [
      {
        type: EVENT_TYPES.DEPOSIT_SETTLED,
        payload: {
          depositId: depositRow.id,
          bookingNo,
          releasedPaisa: input.releasePaisa,
          appliedPaisa,
          remainingHeldPaisa: remainingHeld,
          settledBy: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        depositId: depositRow.id,
        bookingNo,
        releasedPaisa: input.releasePaisa,
        appliedPaisa,
        movementNos,
        remainingHeldPaisa: remainingHeld,
      },
      events,
    }
  },
}

export const settleDeposit = createAction<SettleDepositInput, SettleDepositResult>(settleDepositConfig)
