type EventHandler<T = any> = (payload: T, eventName?: string) => void | Promise<void>;

class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

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

  /**
   * Emit an event to all subscribed listeners.
   */
  async emit<T>(eventName: string, payload: T): Promise<void> {
    const specificHandlers = this.listeners.get(eventName) || [];
    const wildcardHandlers = this.listeners.get('*') || [];
    const handlers = [...specificHandlers, ...wildcardHandlers];
    
    if (handlers.length === 0) return;

    // We no longer log every emit here, the auditLogger will handle logging.
    
    const promises = handlers.map(handler => {
      try {
        // If it's a wildcard listener, we might want to pass the event name too,
        // but for now we'll pass it in an envelope if it's the wildcard, or just
        // let the logger handle it if we standardise the envelope. 
        // Actually, let's wrap it for wildcards. Or just pass an envelope for all.
        // Let's just pass `payload` and let the handler know what it is (actions can embed type).
        // A better approach is to pass eventName as second arg to handler?
        // Let's just pass it. Our EventHandler type is `(payload: T) => void`. 
        // We will just pass `payload`. The payload from actions includes { type: EVENT_TYPES.XYZ } 
        // because we can add that in the event bus or it's implicitly known.
        // For audit logging, we really need the event name. Let's pass eventName as second param.
        return handler(payload, eventName);
      } catch (err) {
        console.error(`[EventBus] Error in handler for ${eventName}:`, err);
      }
    });

    await Promise.all(promises);
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
  RENTAL_EXTENDED: 'rental.extended',
  NOTE_ADDED: 'booking.note_added',
  UNIT_RELEASED: 'booking.unit_released',
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
  PURCHASE_REQUEST_UPDATED: 'inventory.purchase_request_updated',
  TRANSFER_UPDATED: 'inventory.transfer_updated',
  
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_REFUNDED: 'payment.refunded',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_VOIDED: 'invoice.voided',
  DOCUMENT_CREATED: 'document.created',
  
  INSPECTION_STARTED: 'inspection.started',
  INSPECTION_PASSED: 'inspection.passed',
  INSPECTION_FAILED: 'inspection.failed',
  
  MAINTENANCE_STARTED: 'maintenance.started',
  MAINTENANCE_COMPLETED: 'maintenance.completed',
} as const;
