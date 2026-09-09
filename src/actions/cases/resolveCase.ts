import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { supabase } from '../../lib/supabase'
import { safeUpdate } from '../../lib/dataAccess'

/**
 * # RESOLVE_CASE — Incident resolution and disposition action
 *
 * Sets the disposition and settles an incident case:
 * - Moves case `status` to 'Resolved' (or 'Closed').
 * - Stamped `settled_at` timestamp.
 * - Stored `disposition` text describing the resolution.
 * - Records optional allocation amounts if specified.
 * - Permissions: Owner, Manager per R-25 / `canApproveDamage`.
 * - Emits `EVENT_TYPES.CASE_RESOLVED`.
 */

export type ResolveCaseInput = {
  /**
   * `cases.id` (UUID) or `cases.case_no` (e.g. `CASE-2026-0001`).
   */
  caseId: string
  /**
   * Stated disposition or resolution note.
   */
  resolution?: string | null | undefined
  /**
   * Target status for the settled case. Defaults to 'Resolved'.
   */
  status?: 'Resolved' | 'Closed' | undefined
  /**
   * Optional allocation amounts (numeric rupees).
   */
  chargedToClientAmount?: number | undefined
  absorbedAmount?: number | undefined
  depositAppliedAmount?: number | undefined
  insuranceClaimedAmount?: number | undefined
  warrantyCoveredAmount?: number | undefined
  recoveredFromPartnerAmount?: number | undefined
  /** Law 8 idempotency key. */
  clientUuid?: string | undefined
}

export type ResolveCaseResult = {
  success: boolean
  caseId: string
  caseNo?: string | undefined
  status: 'Resolved' | 'Closed'
  disposition: string
  settledAt: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const resolveCaseConfig: ActionConfig<ResolveCaseInput, ResolveCaseResult> = {
  name: 'RESOLVE_CASE',
  permissions: ['case.resolve'],
  implemented: true,

  validate: (input) => {
    if (!input.caseId || input.caseId.trim() === '') {
      throw new Error('Case ID is required.')
    }
    if (input.status && input.status !== 'Resolved' && input.status !== 'Closed') {
      throw new Error('Resolution status must be either Resolved or Closed.')
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.caseId.trim()
    const now = new Date().toISOString()
    const targetStatus = input.status ?? 'Resolved'
    const disposition = input.resolution?.trim() || 'Resolved'

    let realCaseId = rawId
    let caseNo: string | undefined

    if (UUID_RE.test(rawId)) {
      const { data, error } = await supabase
        .from('cases_v')
        .select('id, case_no, status')
        .eq('id', rawId)
        .maybeSingle()

      if (error || !data) {
        throw new Error(`Case ${rawId} was not found: ${error?.message ?? 'no matching row'}`)
      }
      realCaseId = data.id
      caseNo = data.case_no
    } else {
      const { data, error } = await supabase
        .from('cases_v')
        .select('id, case_no, status')
        .eq('case_no', rawId)
        .maybeSingle()

      if (error || !data) {
        throw new Error(`Case ${rawId} was not found: ${error?.message ?? 'no matching row'}`)
      }
      realCaseId = data.id
      caseNo = data.case_no
    }

    const patch: Record<string, unknown> = {
      status: targetStatus,
      disposition,
      settled_at: now,
      updated_at: now,
    }

    if (input.chargedToClientAmount !== undefined) patch.charged_to_client_amount = input.chargedToClientAmount
    if (input.absorbedAmount !== undefined) patch.absorbed_amount = input.absorbedAmount
    if (input.depositAppliedAmount !== undefined) patch.deposit_applied_amount = input.depositAppliedAmount
    if (input.insuranceClaimedAmount !== undefined) patch.insurance_claimed_amount = input.insuranceClaimedAmount
    if (input.warrantyCoveredAmount !== undefined) patch.warranty_covered_amount = input.warrantyCoveredAmount
    if (input.recoveredFromPartnerAmount !== undefined) patch.recovered_from_partner_amount = input.recoveredFromPartnerAmount

    /* `as never` — the sanctioned cast: the hand-written Database type has no cases entry. */
    await safeUpdate('cases' as never, realCaseId, patch as never, input.clientUuid, { returnRow: false })

    return {
      result: {
        success: true,
        caseId: realCaseId,
        caseNo,
        status: targetStatus,
        disposition,
        settledAt: now,
      },
      events: [
        {
          type: EVENT_TYPES.CASE_RESOLVED,
          payload: {
            caseId: realCaseId,
            caseNo,
            resolution: disposition,
            status: targetStatus,
            timestamp: now,
            userId: ctx.userId,
          },
        },
      ],
    }
  },
}

export const resolveCase = createAction<ResolveCaseInput, ResolveCaseResult>(resolveCaseConfig)
