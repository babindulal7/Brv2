import { createAction, type ActionContext, type ActionConfig } from '../core';
import { EVENT_TYPES } from '../../events/eventBus';
import { idempotentInsert, generateClientUuid } from '../../lib/dataAccess';
import { supabase } from '../../lib/supabase';
import { toRupees, type Paisa } from '../../lib/money';

export type CreateSubRentalInput = {
  /** Target booking ID (UUID) or booking_no */
  bookingId?: string;
  /** Supplier / Vendor ID or code */
  vendorId?: string;
  /** Supplier / Vendor Name */
  vendorName?: string;
  /** Item description */
  itemDescription: string;
  /** Vendor's independent return deadline (YYYY-MM-DD). */
  returnByDate: string;
  /** Supplier cost in Paisa */
  costPaisa?: number;
  /** Client charge rate in Paisa */
  chargePaisa?: number;
  /** Duration in days */
  days?: number;
  /** Quantity */
  qty?: number;
  /** Additional notes */
  notes?: string;
  /** Client-side idempotency UUID (Law 8) */
  clientUuid?: string;
};

export type CreateSubRentalResult = {
  success: boolean;
  subRentalId: string;
  lineId?: string;
};

export const createSubRentalConfig: ActionConfig<CreateSubRentalInput, CreateSubRentalResult> = {
  name: 'CREATE_SUBRENTAL',
  permissions: ['subrental.create'],
  implemented: true,

  validate: (input) => {
    if (!input.itemDescription || input.itemDescription.trim().length === 0) {
      throw new Error('Item description is required.');
    }
    const date = input.returnByDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
      throw new Error('Vendor return-by date is required in YYYY-MM-DD format.');
    }
    const parsed = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('Vendor return-by date must be a real calendar date.');
    }
    const todayNpt = new Date(Date.now() + 345 * 60_000).toISOString().slice(0, 10);
    if (date < todayNpt) throw new Error('Vendor return-by date cannot be in the past.');
    if (input.costPaisa !== undefined && (typeof input.costPaisa !== 'number' || input.costPaisa < 0)) {
      throw new Error('Cost amount must be a non-negative number.');
    }
    if (input.chargePaisa !== undefined && (typeof input.chargePaisa !== 'number' || input.chargePaisa < 0)) {
      throw new Error('Client charge amount must be a non-negative number.');
    }
    if (input.days !== undefined && (typeof input.days !== 'number' || input.days < 1)) {
      throw new Error('Days must be greater than or equal to 1.');
    }
    if (input.qty !== undefined && (typeof input.qty !== 'number' || input.qty < 1)) {
      throw new Error('Quantity must be greater than or equal to 1.');
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawBooking = (input.bookingId || '').trim();
    let resolvedBooking: {
      id: string;
      booking_no: string;
      duration_days?: number;
    } | null = null;

    if (rawBooking) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawBooking);
      const query = supabase
        .from('bookings')
        .select('id, booking_no, duration_days');

      const { data } = isUuid
        ? await query.or(`id.eq.${rawBooking},booking_no.eq.${rawBooking}`).maybeSingle()
        : await query.eq('booking_no', rawBooking).maybeSingle();

      if (data) {
        resolvedBooking = data;
      } else if (isUuid) {
        resolvedBooking = {
          id: rawBooking,
          booking_no: rawBooking,
        };
      }
    }

    // Resolve supplier if vendorId or vendorName provided
    let resolvedSupplierId: string | null = null;
    const rawVendor = (input.vendorId || '').trim();
    if (rawVendor) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawVendor);
      const query = supabase.from('suppliers').select('id, supplier_code, name');
      const { data } = isUuid
        ? await query.or(`id.eq.${rawVendor},supplier_code.eq.${rawVendor}`).maybeSingle()
        : await query.eq('supplier_code', rawVendor).maybeSingle();
      if (data) {
        resolvedSupplierId = data.id;
      } else if (isUuid) {
        resolvedSupplierId = rawVendor;
      }
    }

    const now = new Date().toISOString();
    const actionUuid = input.clientUuid || generateClientUuid();
    const year = new Date().getFullYear();

    // Allocate sequential reference number for sub-rental
    const { count } = await supabase
      .from('booking_lines')
      .select('*', { count: 'exact', head: true })
      .eq('line_type', 'Sub-rental');
    const nextSeq = (count ?? 0) + 1;
    const subRentalId = `SR-${year}-${String(nextSeq).padStart(4, '0')}`;

    let lineId: string | undefined = undefined;

    // If a booking is present, persist as a booking_lines row of type 'Sub-rental'
    if (resolvedBooking) {
      const days = input.days ? Math.max(1, Math.floor(input.days)) : Math.max(1, resolvedBooking.duration_days || 1);
      const qty = input.qty ? Math.max(1, Math.floor(input.qty)) : 1;
      const supplierCostRupees = input.costPaisa !== undefined ? toRupees(input.costPaisa as Paisa) : 0;
      const chargeRateRupees = input.chargePaisa !== undefined
        ? toRupees(input.chargePaisa as Paisa)
        : supplierCostRupees;
      const markupRupees = Math.max(0, (chargeRateRupees * days) - supplierCostRupees);

      const bookingLineRow = {
        client_uuid: actionUuid,
        booking_id: resolvedBooking.id,
        line_type: 'Sub-rental',
        // RULING 2026-09-29: this deadline does not follow booking extensions.
        subrental_return_by: input.returnByDate,
        description: input.itemDescription.trim(),
        qty,
        days,
        rate: chargeRateRupees,
        discount_amount: 0,
        supplier_id: resolvedSupplierId,
        supplier_cost: supplierCostRupees,
        markup_amount: markupRupees,
        line_note: input.notes?.trim() || (input.vendorName ? `Vendor: ${input.vendorName.trim()}` : `Sub-rental ref: ${subRentalId}`),
        created_by: ctx.userId,
      };

      // Law 6: rate, discount_amount, supplier_cost, markup_amount revoked from authenticated select.
      // Must use returnRow: false to prevent 42501 permission error.
      const inserted = await idempotentInsert('booking_lines' as never, bookingLineRow as never, {
        returnRow: false,
      });

      lineId = (inserted as { id?: string })?.id || actionUuid;
    }

    const events = [
      {
        type: EVENT_TYPES.SUBRENTAL_CREATED,
        payload: {
          subRentalId,
          lineId,
          bookingId: resolvedBooking?.id,
          bookingNo: resolvedBooking?.booking_no,
          vendorId: input.vendorId,
          vendorName: input.vendorName,
          itemDescription: input.itemDescription.trim(),
          returnByDate: input.returnByDate,
          costPaisa: input.costPaisa,
          chargePaisa: input.chargePaisa,
          timestamp: now,
          userId: ctx.userId,
        },
      },
    ];

    return {
      result: {
        success: true,
        subRentalId,
        ...(lineId ? { lineId } : {}),
      },
      events,
    };
  },
};

export const createSubRental = createAction<CreateSubRentalInput, CreateSubRentalResult>(createSubRentalConfig);
