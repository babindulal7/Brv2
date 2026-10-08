# Implementation Plan: NewRental Orchestrator Decomposition Remainder

**Branch**: `001-newrental-orchestrator-decomposition-remainder` | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-newrental-orchestrator-decomposition-remainder/spec.md`

## Summary

Complete Item 13 by extracting the remaining New Rental sections out of the
~4,398-line `NewRental.tsx` orchestrator into `src/modules/rentals/booking/`
contracts (`RentalFinancialRail`, crew/transport consolidation), leaving the
orchestrator as top-level form state + action dispatch only. Zero behavior
change; regression authority is the existing opaque E2E harnesses plus section
unit tests. All pricing stays in `pricingPipeline`/`money.ts`; Law 5/Law 6
gating is preserved at section roots.

## Technical Context

**Language/Version**: TypeScript 5.7 strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, no `any` in `src/`)

**Primary Dependencies**: React 18, Vite 5, Tailwind v4, Supabase Postgres + RLS,
Dexie outbox, PGlite gates, `pricingPipeline`, `money.ts`, `rbac.ts`

**Storage**: Supabase Postgres (bookings, lines, crew, transport via
`createBooking`/`createRental` RPCs + `rental_drafts`); local draft cache only

**Testing**: Vitest 3 (`vitest run`), jsdom per-file for UI suites,
opaque-box E2E tiers (`floor-loop`, `floor-lifecycle`, `tier1-features`,
newRental simplification), `check:pglite` (150/150), `check:lifecycle` (24/24),
`check:contrast` (54/54), `tsc --noEmit`, `eslint src --max-warnings 0`

**Target Platform**: Web (PWA ops app `index.html` + marketing `marketing.html`);
widths 390/768/1280/1920, breakpoints 768/1280

**Project Type**: Web application (existing monolith, frontend refactor only)

**Performance Goals**: No new blocking spinner on section interaction; tap count
intent-to-confirm at or below R-39 baseline; full suite within existing 20s
hook headroom

**Constraints**: Law 1 (engines own logic), Law 5 (deposit liability isolation),
Law 6 (money-blind DOM omission via RLS + `canViewMoney`), Laws 11/12/15
(icon+label+colour, inline errors, >=44px targets), zero `any`, no schema/RPC
change, no product-behavior change (`TODO(decision)` for anything found)

**Scale/Scope**: 1 orchestrator file (~4,398 lines) + ~6 section modules + index
barrel; 3 extraction phases; E2E + unit coverage per phase

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- I. Engines Own Logic: PASS — plan moves markup only; no engine logic enters
components; `pricingPipeline`/`money`/`rbac` remain sole authority.
- II. Financial Integrity: PASS — paisa-only, Law 5 isolation, 0-100% discount
arithmetic unchanged; reference-case figures asserted at module load.
- III. Preservation/Idempotency: PASS — no DELETE added; `client_uuid` on
writes; confirm stays fail-closed online RPC, never queued.
- IV. Money-Blind Access: PASS — Law 6 gating preserved at section roots and
money columns; RLS untouched.
- V. Localization/Accessibility: PASS — BS via `bs.ts`, lakh grouping, 44px
targets, keyboard labels, contrast gates all in scope as invariants.
- Workflow/Gates: PASS — verification order
typecheck > test > pglite+lifecycle > build; R-35 both-green = Verified.

Post-design re-check: PASS — no new violations introduced (see research.md,
data-model.md, contracts/).

## Project Structure

### Documentation (this feature)

```text
specs/001-newrental-orchestrator-decomposition-remainder/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── lib/                        # engines: pricingPipeline.ts, money.ts, rbac.ts, bs.ts
├── actions/rentals/            # createRental, confirmRental, persistRentalDraft
├── modules/rentals/
│   ├── NewRental.tsx           # orchestrator to slim (top-level state + dispatch)
│   └── booking/                # extraction target
│       ├── index.ts            # barrel exports (contracts authority)
│       ├── RentalLineItemsTree.tsx  # done
│       ├── RentalPricingSection.tsx # done
│       ├── CrewSection.tsx          # done, to consolidate with transport
│       ├── RentalFinancialRail.tsx  # TO CREATE (Phase A)
│       ├── CrewAndTransportSection.tsx # TO CREATE or fold into CrewSection (Phase B)
│       ├── BookingDatesSection.tsx  # exists, wire fully
│       ├── AddItemPanel.tsx         # exists, keep modal boundary
│       └── __tests__/              # section unit tests (jsdom)
└── __tests__/e2e/              # floor-loop, floor-lifecycle, tier1-features

specs/001-newrental-orchestrator-decomposition-remainder/
├── contracts/
│   ├── rental-financial-rail.md
│   └── crew-transport.md
```

**Structure Decision**: Single-project frontend refactor. No new top-level
packages, no schema migration, no RPC change. All new UI code lives under the
existing `src/modules/rentals/booking/` boundary with `index.ts` as the contract
authority; engines and actions are untouched except for import updates.

## Complexity Tracking

> No constitution violations to justify. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
