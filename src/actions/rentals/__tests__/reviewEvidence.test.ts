import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ActionContext } from '../../core';
import { reviewEvidenceConfig, type ReviewEvidenceInput } from '../reviewEvidence';
import { EVENT_TYPES } from '../../../events/eventBus';

const db = vi.hoisted(() => {
  const state = {
    evidenceFiles: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        client_uuid: 'ev-client-uuid-1',
        original_filename: 'camera_return_front.jpg',
        match_state: 'Need Review',
        removed_at: null as string | null,
      },
    ],
    updateCalls: [] as Array<{ table: string; id: string; patch: Record<string, unknown>; clientUuid?: string | undefined; options?: unknown }>,
  };

  const queryMock = () => {
    let currentTable = '';
    let orFilter = '';
    let eqField = '';
    let eqValue: unknown = '';

    const chain: Record<string, any> = {
      from: (table: string) => {
        currentTable = table;
        return chain;
      },
      select: () => chain,
      or: (condition: string) => {
        orFilter = condition;
        return chain;
      },
      eq: (field: string, val: unknown) => {
        eqField = field;
        eqValue = val;
        return chain;
      },
      maybeSingle: async () => {
        if (currentTable === 'evidence_files') {
          const match = state.evidenceFiles.find((e) =>
            (orFilter && (orFilter.includes(e.id) || orFilter.includes(e.client_uuid))) ||
            (eqField === 'original_filename' && e.original_filename === eqValue) ||
            (eqField === 'id' && e.id === eqValue)
          );
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return chain;
  };

  return {
    state,
    supabase: {
      from: (table: string) => queryMock().from(table),
    },
  };
});

vi.mock('../../../lib/supabase', () => ({
  supabase: db.supabase,
}));

vi.mock('../../../lib/dataAccess', () => ({
  safeUpdate: async (table: string, id: string, patch: Record<string, unknown>, clientUuid?: string, options?: unknown) => {
    db.state.updateCalls.push({ table, id, patch, clientUuid, options });
    return { data: patch, error: null };
  },
  generateClientUuid: () => 'mocked-evidence-client-uuid',
}));

describe('reviewEvidence', () => {
  const context: ActionContext = {
    userId: 'user-warehouse-1',
    role: 'Warehouse',
  };

  beforeEach(() => {
    db.state.updateCalls = [];
  });

  describe('validation', () => {
    it('throws when evidenceId is missing or empty', () => {
      expect(() =>
        reviewEvidenceConfig.validate!({ evidenceId: '', action: 'review' } as ReviewEvidenceInput)
      ).toThrow(/Evidence ID is required/);

      expect(() =>
        reviewEvidenceConfig.validate!({ action: 'review' } as unknown as ReviewEvidenceInput)
      ).toThrow(/Evidence ID is required/);
    });

    it('throws when action is not review or remove', () => {
      expect(() =>
        reviewEvidenceConfig.validate!({ evidenceId: 'ev-1', action: 'invalid' as never } as ReviewEvidenceInput)
      ).toThrow(/Action must be "review" or "remove"/);
    });

    it('passes on valid input', () => {
      expect(() =>
        reviewEvidenceConfig.validate!({ evidenceId: 'ev-1', action: 'review' })
      ).not.toThrow();
      expect(() =>
        reviewEvidenceConfig.validate!({ evidenceId: 'ev-1', action: 'remove' })
      ).not.toThrow();
    });
  });

  describe('execute', () => {
    it('marks evidence file as removed with reason and audit timestamp', async () => {
      const input: ReviewEvidenceInput = {
        evidenceId: '11111111-1111-4111-8111-111111111111',
        action: 'remove',
        reason: 'Blurry photo replaced by operator',
        clientUuid: 'action-uuid-1',
      };

      const { result, events } = await reviewEvidenceConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.evidenceId).toBe('11111111-1111-4111-8111-111111111111');
      expect(result.action).toBe('remove');
      expect(result.removedAt).toBeDefined();

      expect(db.state.updateCalls).toHaveLength(1);
      const update = db.state.updateCalls[0]!;
      expect(update.table).toBe('evidence_files');
      expect(update.id).toBe('11111111-1111-4111-8111-111111111111');
      expect(update.clientUuid).toBe('action-uuid-1');
      expect(update.options).toEqual({ returnRow: false });
      expect(update.patch).toMatchObject({
        removed_by: 'user-warehouse-1',
        removal_reason: 'Blurry photo replaced by operator',
      });

      expect(events).toHaveLength(1);
      expect(events![0]!.type).toBe(EVENT_TYPES.EVIDENCE_REVIEWED);
      expect(events![0]!.payload).toMatchObject({
        evidenceId: '11111111-1111-4111-8111-111111111111',
        action: 'remove',
        reason: 'Blurry photo replaced by operator',
        userId: 'user-warehouse-1',
      });
    });

    it('approves evidence review and matches item and serial', async () => {
      const input: ReviewEvidenceInput = {
        evidenceId: 'camera_return_front.jpg',
        action: 'review',
        matchedItemId: 'unit-uuid-1',
        matchedSerial: 'SN-FX9-1002',
      };

      const { result, events } = await reviewEvidenceConfig.execute!(input, context);

      expect(result.success).toBe(true);
      expect(result.action).toBe('review');
      expect(result.matchState).toBe('Matched');

      expect(db.state.updateCalls).toHaveLength(1);
      const update = db.state.updateCalls[0]!;
      expect(update.patch).toMatchObject({
        processing_step: 'Human Review',
        match_state: 'Matched',
        matched_item_id: 'unit-uuid-1',
        matched_serial: 'SN-FX9-1002',
        match_source: 'Manual match',
      });

      expect(events![0]!.payload).toMatchObject({
        evidenceId: '11111111-1111-4111-8111-111111111111',
        action: 'review',
        matchState: 'Matched',
      });
    });

    it('throws when target evidence file cannot be found', async () => {
      const input: ReviewEvidenceInput = {
        evidenceId: 'missing_file.jpg',
        action: 'review',
      };

      await expect(reviewEvidenceConfig.execute!(input, context)).rejects.toThrow(
        /Evidence file "missing_file\.jpg" not found/
      );
    });
  });
});
