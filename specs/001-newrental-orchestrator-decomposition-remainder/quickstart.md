# Quickstart: NewRental Orchestrator Decomposition Remainder

**Feature**: `001-newrental-orchestrator-decomposition-remainder`
**Date**: 2026-10-06

## Prerequisites

- Deps installed; `.env.local` with `VITE_SUPABASE_URL` + anon key; Vite
restart after env change.
- Baseline gates green before starting (record hashes for comparison).

## Validate (per phase AND at end)

1. `npm run typecheck` — PASS, 0 errors (strict, `exactOptionalPropertyTypes`).
2. Targeted unit tests:
   - `npx vitest run src/modules/rentals/booking/__tests__/RentalFinancialRail.test.tsx`
   - `npx vitest run src/modules/rentals/booking/__tests__/CrewAndTransportSection.test.tsx`
3. Opaque E2E harnesses (must stay green, no internals):
   - `npx vitest run src/__tests__/e2e/floor-loop.test.tsx src/__tests__/e2e/tier1-features.test.tsx`
   - `npx vitest run src/__tests__/e2e/floor-lifecycle.test.tsx`
4. Full gates: `npm test` → `npm run check:pglite` (150/150) →
`npm run check:lifecycle` (24/24) → `npm run check:contrast` (54/54) →
`npm run build`.
5. Manual pass: dev server (`npm run dev`), create quote with 2 equipment lines
+ 1 crew + transport, apply promo, toggle VAT, save draft, reload, resume,
confirm — totals and stages identical to pre-refactor.
6. Tap-count check: canonical flow tap count ≤ R-39 baseline; no new blocking
spinner.

## Expected outcomes

- `NewRental.tsx` shrinks toward <1,200 lines, holds only top-level form state
+ action dispatch + guards; sections render via `booking/` contracts.
- Zero price drift, zero stage drift, zero Law 5/Law 6 regression.
- `booking/index.ts` exports `RentalFinancialRail` and the consolidated
crew/transport section; no duplicated arithmetic in orchestrator.

## If red

- Stop the phase; do not proceed to the next extraction. Fix behind the same
harness that caught it. Record known-red steps, never skip (R-35).
