import { DomainEvents } from './eventBus';

export function startAuditLogging() {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUDIT_LOG === 'true') {
    console.log('[AuditLogger] Starting centralized activity logging...');
  }

  DomainEvents.subscribe('*', (payload, eventName) => {
    // In a real application, this would POST to a backend /api/audit endpoint
    // For now, we mock the centralized DB insertion by logging heavily to the console
    const timestamp = new Date().toISOString();
    
    // Attempt to extract useful common fields
    const p = (payload ?? {}) as Record<string, unknown>;
    const actor = p.actor ? `[User: ${p.actor}]` : '';
    const target = p.id || p.rentalId ? `[Target: ${p.id || p.rentalId}]` : '';

    if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUDIT_LOG === 'true') {
      console.log(
        `%c[AUDIT LOG] %c${timestamp} %c[${eventName}] ${actor} ${target}`,
        'color: white; background: #c0392b; padding: 2px 4px; border-radius: 3px; font-weight: bold;',
        'color: #7f8c8d;',
        'color: #2980b9; font-weight: bold;',
        '\nPayload:', payload
      );
    }
  });
}
