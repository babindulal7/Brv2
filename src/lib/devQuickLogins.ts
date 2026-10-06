/**
 * The three quick sign-ins the login screen offers in `dev:mock` only.
 *
 * RULING 2026-10-06: split out of `__mocks__/client.ts`. `Login.tsx` imported `MOCK_LOGINS` from that
 * file with a STATIC import, which defeated the dead-code elimination `supabase.ts` relies on: the whole
 * mock client and the 2,175-line seed corpus (`lib/seed.ts`) shipped inside the production main bundle.
 * This file imports nothing, so when `IS_MOCK` is false the list is dropped like any unused constant.
 * Revert = move the constant back into `__mocks__/client.ts` and re-point `Login.tsx` (and accept the leak).
 */
export const MOCK_LOGINS = [
  { email: 'owner@babinrentals.com', role: 'Owner' },
  { email: 'warehouse@babinrentals.com', role: 'Warehouse' },
  { email: 'billing@babinrentals.com', role: 'Accounts' },
] as const
