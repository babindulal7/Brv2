import { createAction, ActionContext } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';

export type BookCrewInput = {
  bookingId?: string;
  crewIds: string[];
  role?: string;
};

export const bookCrew = createAction<BookCrewInput, { success: boolean; count: number }>({
  name: 'BOOK_CREW',
  permissions: ['crew.assign'],
  /*
   * NOT BUILT. `execute` below logs and emits a domain event; it writes no
   * row. `createAction` already fails closed on a missing flag (core.ts §1),
   * so this changes nothing at dispatch — it states the fact in the file, so
   * a call site cannot mistake this for a live action. Flip to `true` only
   * when `execute` genuinely persists. TODO_SWEEP_2026-09-02.md A3.
   */
  implemented: false,

  validate: (input) => {
    if (!input.crewIds || input.crewIds.length === 0) throw new Error('At least one crew ID must be selected.');
  },

  execute: async (input, ctx: ActionContext) => {
    const events = [
      {
        type: EVENT_TYPES.CREW_ASSIGNED,
        payload: {
          bookingId: input.bookingId,
          crewIds: input.crewIds,
          role: input.role,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: { success: true, count: input.crewIds.length },
      events,
    };
  },
});
