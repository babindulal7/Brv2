import { useEffect } from 'react';
import { DomainEvents } from './eventBus';

/**
 * A React hook that subscribes to a specific domain event.
 * Automatically unsubscribes when the component unmounts.
 * 
 * @param eventName The name of the event to listen to (e.g., EVENT_TYPES.RENTAL_CONFIRMED)
 * @param handler The function to execute when the event occurs
 */
export function useDomainEvent<T = unknown>(eventName: string, handler: (payload: T) => void | Promise<void>) {
  useEffect(() => {
    const unsubscribe = DomainEvents.subscribe(eventName, handler);
    return () => {
      unsubscribe();
    };
  }, [eventName, handler]);
}
