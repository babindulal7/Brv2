import { captureError } from '../lib/monitoring';

type EventHandler<T = unknown> = (payload: T, eventName?: string) => void | Promise<void>;

interface BroadcastEnvelope {
  sourceId: string;
  eventName: string;
  payload: unknown;
}

export class EventBus {
  /* `never` so a handler declared for any payload type can be stored; the
     erasure is paid once, at the call in `emit`, not at every subscribe. */
  private listeners: Map<string, EventHandler<never>[]> = new Map();
  private channel: BroadcastChannel | null = null;
  private instanceId: string = Math.random().toString(36).substring(2) + Date.now().toString(36);

  constructor() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('babin-rentals-domain-events');
        this.channel.onmessage = (event: MessageEvent<BroadcastEnvelope>) => {
          if (
            event.data &&
            typeof event.data === 'object' &&
            event.data.sourceId !== this.instanceId &&
            typeof event.data.eventName === 'string'
          ) {
            void this.emitLocal(event.data.eventName, event.data.payload);
          }
        };
      } catch {
        this.channel = null;
      }
    }
  }

  /**
   * Close any open broadcast channel (useful in test teardown).
   */
  destroy(): void {
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        // ignore
      }
      this.channel = null;
    }
    this.listeners.clear();
  }

  /**
   * Subscribe to a specific domain event.
   */
  subscribe<T>(eventName: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    
    const handlers = this.listeners.get(eventName)!;
    handlers.push(handler);
    
    // Return unsubscribe function
    return () => {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  private async emitLocal<T>(eventName: string, payload: T): Promise<void> {
    const specificHandlers = this.listeners.get(eventName) || [];
    const wildcardHandlers = this.listeners.get('*') || [];
    const handlers = [...specificHandlers, ...wildcardHandlers];
    
    if (handlers.length === 0) return;

    const promises = handlers.map(handler => {
      try {
        return (handler as EventHandler<unknown>)(payload, eventName);
      } catch (err) {
        captureError(err, { where: 'eventBus.handler', eventName });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Emit an event to all subscribed listeners and broadcast across tabs.
   */
  async emit<T>(eventName: string, payload: T): Promise<void> {
    if (this.channel) {
      try {
        this.channel.postMessage({
          sourceId: this.instanceId,
          eventName,
          payload,
        });
      } catch {
        // Structured clone error or closed channel; fail safe
      }
    }

    await this.emitLocal(eventName, payload);
  }
}

export const DomainEvents = new EventBus();

// Core Event Types
export const EVENT_TYPES = {
  RENTAL_CREATED: 'rental.created',
  DRAFT_SAVED: 'rental.draft_saved',
  RENTAL_CONFIRMED: 'rental.confirmed',
  RENTAL_CANCELLED: 'rental.cancelled',
  RENTAL_PACKED: 'rental.packed',
  RENTAL_PICKED_UP: 'rental.picked_up',
  RENTAL_RETURN_STARTED: 'rental.return_started',
  RENTAL_RETURNED: 'rental.returned',
  /** §1.7 — the sixth stage, and the only terminal one. Emitted by CLOSE_RENTAL. */
  RENTAL_CLOSED: 'rental.closed',
  RENTAL_EXTENDED: 'rental.extended',
  /** Project Type edit (0144) — emitted by UPDATE_BOOKING_PROJECT. */
  RENTAL_PROJECT_UPDATED: 'rental.project_updated',
  NOTE_ADDED: 'booking.note_added',
  UNIT_RELEASED: 'booking.unit_released',
  /** WHATSAPP_LINKS_SPEC v1.0 §5.4 — one branch-day signed off (0078). */
  DAILY_CLOSING_APPROVED: 'finance.daily_closing_approved',
  RENTAL_RESET_COMPLETED: 'rental.reset_completed',
  RENTAL_HANDED_OVER: 'rental.handed_over',
  EVIDENCE_REVIEWED: 'rental.evidence_reviewed',
  CREW_ASSIGNED: 'crew.assigned',
  SUBRENTAL_CREATED: 'subrental.created',
  
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_PACKED: 'inventory.packed',
  INVENTORY_CHECKED_OUT: 'inventory.checked_out',
  INVENTORY_RETURNED: 'inventory.returned',
  INVENTORY_AVAILABLE: 'inventory.available',
  INSPECTION_REQUIRED: 'inventory.inspection_required',
  MAINTENANCE_REQUIRED: 'inventory.maintenance_required',
  EQUIPMENT_CREATED: 'inventory.equipment_created',
  BUNDLE_CREATED: 'inventory.bundle_created',
  BUNDLE_UPDATED: 'inventory.bundle_updated',
  /* RULING 2026-09-08 (R-28): a model's preventive-service intervals changed.
     Carries no unit — due-ness is derived per unit at read time and there is
     no is_due column to invalidate, so a listener re-reads the view. */
  PRODUCT_SERVICE_PLAN_UPDATED: 'inventory.product_service_plan_updated',
  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_STATUS_UPDATED: 'client.status_updated',
  CLIENT_CREDIT_ADJUSTED: 'client.credit_adjusted',
  MEMBERSHIP_TIER_CHANGED: 'membership.tier_changed',
  KYC_STATUS_UPDATED: 'client.kyc_status_updated',
  CLIENT_MERGED: 'client.merged',
  CASE_CREATED: 'case.created',
  CASE_RESOLVED: 'case.resolved',
  DISCREPANCY_FLAGGED: 'operations.discrepancy_flagged',
  STOCK_RECONCILED: 'inventory.stock_reconciled',
  STOCK_ADJUSTED: 'inventory.stock_adjusted',
  PURCHASE_REQUEST_UPDATED: 'inventory.purchase_request_updated',
  TRANSFER_UPDATED: 'inventory.transfer_updated',
  
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_REFUNDED: 'payment.refunded',
  DEPOSIT_SETTLED: 'deposit.settled',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_VOIDED: 'invoice.voided',
  DOCUMENT_CREATED: 'document.created',
  
  INSPECTION_STARTED: 'inspection.started',
  INSPECTION_PASSED: 'inspection.passed',
  INSPECTION_FAILED: 'inspection.failed',
  
  MAINTENANCE_STARTED: 'maintenance.started',
  MAINTENANCE_COMPLETED: 'maintenance.completed',
} as const;
