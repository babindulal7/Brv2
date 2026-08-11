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

  validate: (input) => {
    if (!input.crewIds || input.crewIds.length === 0) throw new Error('At least one crew ID must be selected.');
  },

  execute: async (input, ctx: ActionContext) => {
    console.log(`[DB TX] Booking crew: ${input.crewIds.join(', ')}`);

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
