import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventBus, EVENT_TYPES } from '../eventBus'

describe('EventBus cross-tab synchronization and local delivery', () => {
  let bus1: EventBus
  let bus2: EventBus

  beforeEach(() => {
    bus1 = new EventBus()
    bus2 = new EventBus()
  })

  afterEach(() => {
    bus1.destroy()
    bus2.destroy()
  })

  it('delivers events to local listeners', async () => {
    const handler = vi.fn()
    const unsubscribe = bus1.subscribe(EVENT_TYPES.RENTAL_RETURNED, handler)

    await bus1.emit(EVENT_TYPES.RENTAL_RETURNED, { bookingNo: 'BK-2026-0001' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(
      { bookingNo: 'BK-2026-0001' },
      EVENT_TYPES.RENTAL_RETURNED
    )

    unsubscribe()
    await bus1.emit(EVENT_TYPES.RENTAL_RETURNED, { bookingNo: 'BK-2026-0002' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('broadcasts events across independent bus instances simulating multiple browser tabs', async () => {
    const tab2Listener = vi.fn()
    bus2.subscribe(EVENT_TYPES.RENTAL_RETURNED, tab2Listener)

    // Tab 1 emits Return event
    await bus1.emit(EVENT_TYPES.RENTAL_RETURNED, { bookingNo: 'BK-2026-0099' })

    // Give microtask / broadcast channel a moment to dispatch
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(tab2Listener).toHaveBeenCalledTimes(1)
    expect(tab2Listener).toHaveBeenCalledWith(
      { bookingNo: 'BK-2026-0099' },
      EVENT_TYPES.RENTAL_RETURNED
    )
  })

  it('does not double-deliver to the emitting tab via broadcast echo', async () => {
    const tab1Listener = vi.fn()
    bus1.subscribe(EVENT_TYPES.RENTAL_CLOSED, tab1Listener)

    await bus1.emit(EVENT_TYPES.RENTAL_CLOSED, { bookingNo: 'BK-2026-0042' })
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Must be called exactly once from the local emit, not echoed back
    expect(tab1Listener).toHaveBeenCalledTimes(1)
  })
})
