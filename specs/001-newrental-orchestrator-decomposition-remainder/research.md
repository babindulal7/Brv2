# Research: NewRental Orchestrator Decomposition Remainder

**Feature**: `001-newrental-orchestrator-decomposition-remainder`
**Date**: 2026-10-06
**Source**: `docs/audit/16_NEW_RENTAL_DECOMPOSITION_PLAN.md`, live tree inspection
(`NewRental.tsx` 4,398 lines / 222,967 bytes; `booking/` holds LineItemsTree,
PricingSection, CrewSection, catalogue, dates, widgets)

## Decision: Three-phase extraction order (rail, then crew/transport, then orchestrator slim-down)

- **Rationale**: Financial rail is the largest self-contained markup block with a
clean input (`PricingPipelineResult` + flags) and three outputs (VAT toggle,
promo apply, confirm/save). Extracting it first removes the most lines with the
least state coupling. Crew/transport second because it shares per-diem paisa
inputs and Law 6 gating with the rail. Orchestrator reduction last, deleting
only dead code after both consumers are wired.
- **Alternatives considered**: Crew-first (rejected: crew shares transport summary
with delivery section, boundary fuzzier); single big-bang extraction (rejected:
violates E2E-after-each-phase safety rule from the decomposition plan).

## Decision: `RentalFinancialRail.tsx` contract is read-only totals plus three callbacks

- **Rationale**: Rail displays non-editable breakdown from `pricingPipeline`
(equipment/crew/transport, discount, taxable, 13% VAT, rental total, deposit
liability card) and emits `onToggleVat`, `onApplyPromo`, `onConfirm`,
`onSaveDraft` with `isSubmitting`/`canConfirm` flags. No arithmetic inside;
paisa formatting via `money.ts` only. Matches Boundary 3 in the audit plan.
- **Alternatives considered**: Rail owning promo validation (rejected: Law 1,
validation lives in engine); rail owning confirm RPC (rejected: custody
transition stays in orchestrator-dispatched action).

## Decision: Consolidate crew + transport into one section boundary

- **Rationale**: Audit Boundary 2 (`CrewAndTransportSection`, ~350 lines) maps to
existing `CrewSection.tsx` + `DeliverySection.tsx` overlap (per-diem paisa,
vehicle/driver summary, `CrewSearchModal`). Single section with
`crew`/`transport` props and `onUpdateCrew`/`onRemoveCrew`/`onUpdateTransport`
keeps Law 6 gating in one place (`canCrewMoney` root + column omission).
- **Alternatives considered**: Keep two separate sections wired independently
(rejected: orchestrator keeps two dispatch paths for one logistics slice,
against the action-dispatch-reduction goal).

## Decision: Orchestrator keeps six state slices, no section markup

- **Rationale**: Per audit §2, orchestrator retains client, timing, line-items,
crew/logistics, financial/pipeline, persistence/draft slices plus guards
(`newRentalGuards.ts`) and dispatches to actions. Everything renderable moves
to `booking/`; `NewRental.tsx` target <1,200 lines is aspirational — report
actuals, do not game by moving logic to utils.
- **Alternatives considered**: Moving `pricingPipeline` memo into rail
(rejected: pipeline feeds both tree footer and rail; single memo in
orchestrator avoids double compute and drift).

## Decision: Regression authority is existing harnesses, no new infra

- **Rationale**: `floor-loop`, `floor-lifecycle`, `tier1-features`, and
newRental simplification suites already cover the flow opaque-box. Each phase
runs `typecheck`, targeted vitest, then full `test` + `check:pglite` +
`check:lifecycle` + `contrast` + `build` before proceeding. Section unit tests
are jsdom per-file (`// @vitest-environment jsdom`).
- **Alternatives considered**: New dedicated E2E suite for refactor (rejected:
duplicates coverage; harness rule is reuse, not proliferation).

## Decision: No schema, RPC, or token change

- **Rationale**: `createRental`/`confirmRental` payloads, `booking_transport`
columns, breakpoints (768/1280), and theme tokens are untouched. Open decision
§4.58 return-pickup fields stay out of scope. Styling reuses `theme.css`
variables; no Tailwind/dark-only hardcode in moved markup.
- **Alternatives considered**: Bundling §4.58 columns into this refactor
(rejected: needs a product ruling + migration; explicitly out of scope in spec).
