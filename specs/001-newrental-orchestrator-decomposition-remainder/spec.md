# Feature Specification: NewRental Orchestrator Decomposition Remainder

**Feature Branch**: `001-newrental-orchestrator-decomposition-remainder`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Continue NewRental decomposition: orchestrator top-level form state and action dispatch reduction, completing Item 13 remainder behind E2E safety harnesses. Cover all remaining work: RentalFinancialRail extraction, CrewAndTransport consolidation, orchestrator slim-down."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create booking with identical flow after refactor (Priority: P1)

A coordinator creates a rental (client + dates + equipment + crew/transport +
pricing + confirm) exactly as today. No field moves, no step added or removed,
no price change.

**Why this priority**: Item 13 is a pure maintainability refactor. Any behavior
drift is a defect. Floor booking creation is the highest-traffic flow.

**Independent Test**: Can be fully tested by running the existing opaque E2E
harnesses (`floor-loop`, `floor-lifecycle`, `tier1-features`, newRental
simplification suite) plus a manual create-quote-to-confirm pass in dev. Delivers
zero user-visible change with a smaller orchestrator.

**Acceptance Scenarios**:

1. **Given** a clean dev DB, **When** a coordinator creates a quote with 2
equipment lines + 1 crew + transport and confirms it, **Then** the booking is
created with identical totals, VAT, deposit handling, and stage transitions as
before the refactor.
2. **Given** an in-progress draft, **When** the user reloads and resumes,
**Then** draft restores client, dates, lines, crew, transport, promo, and VAT
state without loss.

---

### User Story 2 - Extend one booking section without touching orchestrator (Priority: P2)

A maintainer adds a field to pricing or crew (e.g. new allowance input) by
editing only the section component and its contract, without editing
`NewRental.tsx`.

**Why this priority**: This is the maintainability payoff that justifies the
refactor. It prevents the 4,398-line file from regrowing.

**Independent Test**: Can be fully tested by inspection: `NewRental.tsx` imports
section components via `src/modules/rentals/booking/index.ts` and passes only
declared props; section unit tests cover the new field.

**Acceptance Scenarios**:

1. **Given** the refactored tree, **When** a reviewer checks imports of
`NewRental.tsx`, **Then** pricing, crew/transport, line-tree, dates, and
financial rail come from `booking/` modules, and no duplicated arithmetic
exists in the orchestrator.

---

### User Story 3 - Responsive form on low-end hardware (Priority: P3)

Floor staff on a low-end tablet completes the same flow without added jank or
extra taps.

**Why this priority**: Fewest-clicks is the #1 product priority (R-39). The
refactor must not cost taps or responsiveness.

**Independent Test**: Can be fully tested by tap-count on the canonical flow
(intent to committed success stays at or below baseline) and no new loading
spinner on section interaction.

**Acceptance Scenarios**:

1. **Given** the baseline tap budget from R-39, **When** the flow is repeated
after refactor, **Then** tap count does not increase and no section rerenders
the whole form on a single keystroke.

---

### Edge Cases

- What happens when a promo with min-spend/date-range is applied mid-refactor?
Promo validation stays in the pricing engine; UI shows the same notice.
- How does system handle quantity-tracked vs serialized lines during tree
extraction? Availability pills (`Available`, `Conflicted`, `Sub-rental needed`)
and sub-rent override modal behavior are unchanged.
- What happens when offline draft persistence races a confirm? Draft save stays
debounced; confirm path stays fail-closed online RPC, never queued.
- How are money-blind roles affected? Law 6 gating (`canViewMoney`) stays at
section roots and columns; no financial figure reaches the DOM for restricted
roles.
- What happens when `NewRental.tsx` is still over budget after extraction?
Report actual line count; do not silently move logic into utils to hit a number.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST preserve the complete New Rental flow (client select,
dates, catalogue add, line tree, crew/transport, pricing/deposit, confirm/save
draft) with zero behavior change.
- **FR-002**: System MUST keep all pricing math in `src/lib/pricingPipeline.ts`
and all money formatting in `src/lib/money.ts`; sections MUST NOT recompute
totals.
- **FR-003**: System MUST keep security-deposit handling isolated as a liability
(Law 5) in the pricing/financial section with mandatory audit fields.
- **FR-004**: System MUST enforce Law 6 money blindness at section roots and
money columns (rate, discount, amount, subtotals omitted from DOM when denied).
- **FR-005**: System MUST preserve draft persistence (`persistRentalDraft`,
resume, dirty tracking) and atomic confirm (`createRental`/`confirmRental` RPC)
paths.
- **FR-006**: System MUST extract the financial rail (totals breakdown, VAT
toggle, promo, deposit card, CTA) into `booking/RentalFinancialRail.tsx` with a
declared props contract exported from `booking/index.ts`.
- **FR-007**: System MUST consolidate crew + transport UI into section
component(s) in `booking/` (extend `CrewSection.tsx`/`DeliverySection.tsx` or
add `CrewAndTransportSection.tsx`) so the orchestrator holds no crew/transport
markup.
- **FR-008**: System MUST reduce `NewRental.tsx` to orchestrator duties only
(top-level form state, action dispatch, guards) with no duplicated section
markup or arithmetic.
- **FR-009**: System MUST keep all existing opaque E2E harnesses green
(`floor-loop`, `floor-lifecycle`, `tier1-features`, newRental simplification)
plus section unit tests for each extracted component.
- **FR-010**: System MUST preserve 44px minimum touch targets, keyboard
accessibility (labelled controls, native buttons), and WCAG AA contrast on all
moved markup.

### Key Entities

- **RentalLineItem**: Priced booking line (product, qty, days, rate, discount);
days explicitly `1` minimum; groups bundles and standalone lines.
- **CrewAssignment**: Crew member + role + per-diem extras (overtime, meals,
accommodation in paisa); money-gated per Law 6.
- **TransportDetails**: Delivery/return logistics, vehicle/driver summary,
charges in paisa.
- **PricingPipelineResult**: Computed totals from `pricingPipeline` (equipment,
crew, transport, discount, taxable, VAT 13%, rental total, deposit excluded).
- **RentalDraft**: Persisted in-progress form (client, dates, lines, crew,
transport, promo, VAT, dirty flag).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Coordinators complete the canonical quote-to-confirm flow with the
same steps and same totals as before (zero price drift on reference cases).
- **SC-002**: All protected gates stay green: typecheck (0 errors), full test
suite passes, `check:pglite` 150/150, `check:lifecycle` 24/24, contrast 54/54,
production build succeeds.
- **SC-003**: `NewRental.tsx` shrinks toward the <1,200-line orchestrator target
from the decomposition plan and holds no section markup or pricing arithmetic
(verified by inspection + import graph).
- **SC-004**: Tap count from intent to committed booking does not increase
versus the R-39 baseline; no new blocking spinner on section interaction.

## Assumptions

- Existing E2E harnesses (`floor-loop`, `floor-lifecycle`, `tier1-features`,
newRental simplification) are the regression authority; no new product behavior
is introduced.
- Current file state at spec time: `NewRental.tsx` ~4,398 lines; `booking/`
already holds `RentalLineItemsTree.tsx`, `RentalPricingSection.tsx`,
`CrewSection.tsx`, and catalogue/dates/widgets helpers.
- No schema or RPC change is required; `createRental`/`confirmRental` contracts
and `booking_transport` columns are unchanged (open decision §4.58 return-pickup
fields stay out of scope unless separately ruled).
- Nepali catalogue localization (Item 7) and live seed reconciliation (Item 10)
are out of scope for this feature.
- Refactor follows Law 1 (engines own logic), Law 6 (RLS + UI mirror), and the
constitution; any product question found becomes `TODO(decision)` and does not
block the refactor.
