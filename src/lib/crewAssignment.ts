import type { SystemRole } from '../types/database'

/** Priced crew assignments currently require crew-pay access. The server's
 * broader staff policy is not a reason to show payout rates to the desk/floor. */
export function canAssignPricedCrew(role: SystemRole): boolean {
  return role === 'Owner' || role === 'Admin' || role === 'Manager'
}

/** datetime-local controls use Kathmandu civil time regardless of device zone. */
export function crewTimeInput(iso: string): string {
  const timestamp = Date.parse(iso)
  return Number.isFinite(timestamp) ? new Date(timestamp + 345 * 60_000).toISOString().slice(0, 16) : ''
}
export function crewTimeIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid call and wrap time.')
  const timestamp = Date.parse(`${value}:00+05:45`)
  if (!Number.isFinite(timestamp) || crewTimeInput(new Date(timestamp).toISOString()) !== value) throw new Error('Enter a valid call and wrap time.')
  return new Date(timestamp).toISOString()
}

