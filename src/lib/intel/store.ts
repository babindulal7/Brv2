/**
 * Smart Intel Cards v1 — global session store (spec §34).
 *
 * One card open at a time; once one card has opened, adjacent scans switch
 * with ~0ms delay until every card closes (spec §21). A module-level store
 * (not React context) so any trigger can join the session without a
 * provider, and timers are not duplicated per page.
 */

import { useSyncExternalStore } from 'react'
import type { IntelContext, IntelEntityType } from './context'

export type IntelSessionMode = 'closed' | 'hover' | 'pinned' | 'side-peek' | 'bottom-sheet'

export interface IntelNavigationEntry {
  entityType: IntelEntityType
  entityId: string
  context: IntelContext
}

interface IntelSession {
  /** A card is currently open somewhere — adjacent triggers skip the delay. */
  active: boolean
  /** Id of the currently open card, if any. */
  openId: string | null
  entityType: IntelEntityType | null
  entityId: string | null
  context: IntelContext | null
  mode: IntelSessionMode
  originElement: HTMLElement | null
  anchorRect: DOMRect | null
  history: IntelNavigationEntry[]
}

let state: IntelSession = { active: false, openId: null, entityType: null, entityId: null, context: null, mode: 'closed', originElement: null, anchorRect: null, history: [] }
const listeners = new Set<() => void>()

function emit(): void {
  for (const l of listeners) l()
}

export function intelSessionSnapshot(): IntelSession {
  return state
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useIntelSession(): IntelSession {
  return useSyncExternalStore(subscribe, intelSessionSnapshot, intelSessionSnapshot)
}

/** Called when any card opens — starts/continues the rapid-scan session. */
export function intelOpened(id: string, entry?: IntelNavigationEntry, mode: IntelSessionMode = 'hover', originElement?: HTMLElement | null): void {
  state = {
    ...state,
    active: true,
    openId: id,
    entityType: entry?.entityType ?? null,
    entityId: entry?.entityId ?? null,
    context: entry?.context ?? null,
    mode,
    originElement: originElement ?? null,
    anchorRect: originElement?.getBoundingClientRect() ?? null,
    history: entry && state.entityId && state.entityType && state.context && state.entityId !== entry.entityId
      ? [...state.history, { entityType: state.entityType, entityId: state.entityId, context: state.context }]
      : state.history,
  }
  emit()
}

/** Called when a card closes — ends the session only if it was the open one. */
export function intelClosed(id: string): void {
  if (state.openId === id) {
    state = { ...state, active: false, openId: null, entityType: null, entityId: null, context: null, mode: 'closed', originElement: null, anchorRect: null, history: [] }
    emit()
  }
}

/** Another explicitly opened entity replaces the current one (no stacking). */
export function intelReplaced(nextId: string, entry?: IntelNavigationEntry, mode: IntelSessionMode = 'pinned', originElement?: HTMLElement | null): void {
  intelOpened(nextId, entry, mode, originElement)
}

/** Return to the prior entity inside the active Intel card or sheet. */
export function intelNavigateBack(id: string): void {
  if (state.openId !== id || state.history.length === 0) return
  const previous = state.history[state.history.length - 1]
  if (!previous) return
  state = {
    ...state,
    entityType: previous.entityType,
    entityId: previous.entityId,
    context: previous.context,
    history: state.history.slice(0, -1),
  }
  emit()
}

export function isIntelSessionActive(): boolean {
  return state.active
}
