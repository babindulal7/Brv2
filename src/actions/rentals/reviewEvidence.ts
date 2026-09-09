import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { safeUpdate, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';

export type ReviewEvidenceInput = {
  /** Target evidence_files.id (UUID), client_uuid, or original_filename */
  evidenceId: string;
  /** Action: approve/review or mark removed */
  action: 'review' | 'remove';
  /** Reason for removal or review note */
  reason?: string;
  /** Optional matched product unit ID */
  matchedItemId?: string;
  /** Optional matched serial number */
  matchedSerial?: string;
  /** Optional match state override */
  matchState?: 'Matched' | 'Need Review' | 'Unmatched';
  /** Law 8 client-side idempotency UUID */
  clientUuid?: string;
};

export type ReviewEvidenceResult = {
  success: boolean;
  evidenceId: string;
  action: 'review' | 'remove';
  matchState?: string;
  removedAt?: string | null;
};

export const reviewEvidenceConfig: ActionConfig<ReviewEvidenceInput, ReviewEvidenceResult> = {
  name: 'REVIEW_EVIDENCE',
  permissions: ['evidence.review'],
  implemented: true,

  validate: (input) => {
    if (!input.evidenceId || input.evidenceId.trim().length === 0) {
      throw new Error('Evidence ID is required.');
    }
    if (!input.action || (input.action !== 'review' && input.action !== 'remove')) {
      throw new Error('Action must be "review" or "remove".');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawTarget = input.evidenceId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTarget);

    const query = supabase
      .from('evidence_files')
      .select('id, match_state, original_filename, removed_at');

    const { data: evidence } = isUuid
      ? await query.or(`id.eq.${rawTarget},client_uuid.eq.${rawTarget}`).maybeSingle()
      : await query.eq('original_filename', rawTarget).maybeSingle();

    const evidenceId = evidence?.id || (isUuid ? rawTarget : null);
    if (!evidenceId) {
      throw new Error(`Evidence file "${rawTarget}" not found.`);
    }

    const now = new Date().toISOString();
    const actionUuid = input.clientUuid || generateClientUuid();
    const patch: Record<string, unknown> = {
      updated_at: now,
    };

    if (input.action === 'remove') {
      patch.removed_at = now;
      patch.removed_by = ctx.userId;
      patch.removal_reason = (input.reason && input.reason.trim()) || 'Removed during evidence review';
    } else {
      patch.processing_step = 'Human Review';
      if (input.matchState) {
        patch.match_state = input.matchState;
      } else if (input.matchedItemId || input.matchedSerial) {
        patch.match_state = 'Matched';
      }
      if (input.matchedItemId) {
        patch.matched_item_id = input.matchedItemId;
        patch.match_source = 'Manual match';
      }
      if (input.matchedSerial) {
        patch.matched_serial = input.matchedSerial;
        patch.match_source = 'Manual match';
      }
    }

    await safeUpdate('evidence_files' as never, evidenceId, patch as never, actionUuid, {
      returnRow: false,
    });

    const events = [
      {
        type: EVENT_TYPES.EVIDENCE_REVIEWED,
        payload: {
          evidenceId,
          action: input.action,
          reason: input.reason,
          matchState: patch.match_state,
          removedAt: patch.removed_at,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        evidenceId,
        action: input.action,
        ...(patch.match_state ? { matchState: patch.match_state as string } : {}),
        ...(patch.removed_at ? { removedAt: patch.removed_at as string } : {}),
      },
      events,
    };
  },
};

export const reviewEvidence = createAction<ReviewEvidenceInput, ReviewEvidenceResult>(reviewEvidenceConfig);
