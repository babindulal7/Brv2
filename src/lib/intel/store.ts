/**
 * Smart Intel Cards v1 — global session store (spec §34).
 *
 * One card open at a time; once one card has opened, adjacent scans switch
 * with ~0ms delay until every card closes (spec §21). A module-level store
 * (not React context) so any trigger can join the session without a
 * provider, and timers are not duplicated per page.
 */

import { useSyncExternalStore } from 'react'

interface IntelSession {
  /** A card is currently open somewhere — adjacent triggers skip the delay. */
  active: boolean
  /** Id of the currently open card, if any. */
  openId: string | null
}

let state: IntelSession = { active: false, openId: null }
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
export function intelOpened(id: string): void {
  state = { active: true, openId: id }
  emit()
}

/** Called when a card closes — ends the session only if it was the open one. */
export function intelClosed(id: string): void {
  if (state.openId === id) {
    state = { active: false, openId: null }
    emit()
  }
}

/** Another explicitly opened entity replaces the current one (no stacking). */
export function intelReplaced(nextId: string): void {
  state = { active: true, openId: nextId }
  emit()
}

export function isIntelSessionActive(): boolean {
  return state.active
}
