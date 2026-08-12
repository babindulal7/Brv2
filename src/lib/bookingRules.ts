/**
 * redesign v1 §3 — the "Allow overbooking" valve (Settings ▸ Financial ▸
 * Booking rules). Off by default; when on, a booked/maintenance chip in Add
 * Item becomes tappable and opens the override dialog instead of staying
 * dead.
 *
 * Every other Settings.tsx toggle is local component state today — no
 * settings-persistence layer exists in this build (confirmed: `Switch` there
 * holds its own `useState` and never propagates outward). Standing up a real
 * backend connection as a side effect of shipping this one toggle would be
 * new infrastructure this redesign did not ask for, so this mirrors
 * `lib/collapse.ts`'s existing localStorage pattern instead — real enough
 * that the setting actually gates the chip (Settings and New Rental are
 * different routes, never mounted together, so no cross-tab sync is needed),
 * without inventing a database column no migration has approved.
 *
 * TODO(decision) — PLAN.md §4: should this toggle be global, or restricted to
 * Owner/Admin? A global switch means a Coordinator can overbook once an
 * Owner turns it on; per-role is the safer default but is a new capability
 * string. Not assumed either way — this ships the global, simpler reading of
 * the spec's literal text.
 */

const KEY = 'br.bookingRules.allowOverbooking'

function readAllowOverbooking(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(KEY) === 'true'
}

export function getAllowOverbooking(): boolean {
  return readAllowOverbooking()
}

export function setAllowOverbooking(value: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, value ? 'true' : 'false')
}
