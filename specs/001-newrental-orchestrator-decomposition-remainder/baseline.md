# Baseline: NewRental Orchestrator Decomposition Remainder

**Feature**: `001-newrental-orchestrator-decomposition-remainder`
**Recorded**: 2026-10-06 (T001)
**HEAD**: `dc85295eed1a50ce7b03b2f90d7550c2793413b9`
**Subject**: `style(ui): use tokenized font-id and tabular-nums over raw monospace in scanner and gates`

## Orchestrator size

- `src/modules/rentals/NewRental.tsx`: **4411 lines**, 228,228 bytes
- Target from decomposition plan: <1,200 lines (directional; pass/fail is
"no section markup/arithmetic in orchestrator", not the number)

## Correction to spec assumption (evidence-backed)

`spec.md` Assumptions states "`booking/` already holds `RentalLineItemsTree.tsx`,
`RentalPricingSection.tsx`, `CrewSection.tsx`". **False in this checkout**:
neither HEAD (`git ls-tree HEAD src/modules/rentals/booking/`) nor the working
tree contains those files, and `src/` has zero references to
`RentalLineItemsTree`. PROGRESS.md 2026-10-05 (h)/(i) claims extractions that
are not present at this HEAD (work may live on another branch/stash; stashes
present: `step1-foundation`, `main`). Scope is therefore **creation**, not
wiring of existing modules: Phase A creates `RentalFinancialRail.tsx`; Phase B
creates `CrewAndTransportSection.tsx`; line-tree/pricing-section extraction is
deferred and tracked in T019.

## US1 validation results (T006/T008/T009/T010, 2026-10-06)

- `RentalFinancialRail.test.tsx`: 5/5 pass (breakdown, Law 5 isolation, Law 6
null-render, crew-row omission, VAT/promo forwarding)
- `floor-loop` + `tier1-features`: 15/15 pass
- `newRentalSimplification` + `newRentalDraftPersistence`: 6/6 pass
- `npm run typecheck`: clean, 0 errors
- Full suite + `check:pglite` + `check:lifecycle` + `contrast` + `build`
deferred to T018 polish.

## Gate reference values (from PROGRESS 2026-10-06 (b); re-verified in T018)

- typecheck: 0 errors (strict) · test: 293 files / 3,949 passed
- check:pglite: 150/150 · check:lifecycle: 24/24 · check:contrast: 54/54
- build: clean (tsc + Vite + PWA)

## R-39 tap baseline

- Canonical flow tap budget per `RULINGS-2026-09-19.md`; count re-confirmed
during T020 quickstart validation (no increase permitted).
