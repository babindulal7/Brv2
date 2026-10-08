# Tasks: NewRental Orchestrator Decomposition Remainder

**Input**: Design documents from `/specs/001-newrental-orchestrator-decomposition-remainder/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included per FR-009 (existing opaque E2E harnesses + section unit tests are regression authority).

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline lock-in before refactor

- [x] T001 Record pre-refactor baseline (NewRental.tsx line count, typecheck/test/pglite/lifecycle/contrast/build hashes) in specs/001-newrental-orchestrator-decomposition-remainder/baseline.md
- [ ] T002 [P] Verify E2E safety harnesses green before extraction in src/__tests__/e2e/floor-loop.test.tsx, src/__tests__/e2e/floor-lifecycle.test.tsx, src/__tests__/e2e/tier1-features.test.tsx

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contract authority that all stories build on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Extend section barrel exports in src/modules/rentals/booking/index.ts (RentalFinancialRail + consolidated crew/transport, no engine logic)
- [ ] T004 [P] Add Law 6 money-blind render-root guard pattern verification in src/modules/rentals/booking/CrewSection.tsx and src/modules/rentals/booking/RentalPricingSection.tsx (absent-not-masked audit, no behavior change)
- [ ] T005 Verify pricing/deposit engine boundaries untouched in src/lib/pricingPipeline.ts and src/lib/money.ts (paisa-only, Law 5 isolation, lakh formatting; read-only check)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Create booking with identical flow after refactor (Priority: P1) 🎯 MVP

**Goal**: Extract financial rail with zero behavior/price drift

**Independent Test**: Existing opaque E2E harnesses green + manual quote-to-confirm totals identical to baseline

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T006 [P] [US1] Create RentalFinancialRail unit tests in src/modules/rentals/booking/__tests__/RentalFinancialRail.test.tsx (totals render from pipeline, VAT toggle callback, promo callback, Law 5 deposit isolation, Law 6 null-render, 44px targets)
- [ ] T007 [P] [US1] Extend E2E coverage for promo/VAT/deposit in src/__tests__/e2e/newRentalSimplification.test.tsx (min-spend, date-range, VAT on/off, deposit liability card)

### Implementation for User Story 1

- [x] T008 [US1] Implement RentalFinancialRail component in src/modules/rentals/booking/RentalFinancialRail.tsx per specs/001-newrental-orchestrator-decomposition-remainder/contracts/rental-financial-rail.md (read-only pipeline totals, no arithmetic, money.ts formatting only)
- [x] T009 [US1] Wire RentalFinancialRail into orchestrator in src/modules/rentals/NewRental.tsx (replace rail markup with <RentalFinancialRail .../>; delete duplicated totals/VAT/promo/deposit markup, keep pipeline memo + dispatch)
- [x] T010 [US1] Run US1 validation in src/__tests__/e2e/floor-loop.test.tsx, src/__tests__/e2e/floor-lifecycle.test.tsx, src/__tests__/e2e/tier1-features.test.tsx (all green; no price/stage drift)

**Checkpoint**: User Story 1 fully functional and testable independently (rail extracted, flow identical)

---

## Phase 4: User Story 2 - Extend one booking section without touching orchestrator (Priority: P2)

**Goal**: Consolidate crew + transport into one section boundary

**Independent Test**: Orchestrator holds no crew/transport markup; section editable via contract only

### Tests for User Story 2

- [ ] T011 [P] [US2] Create CrewAndTransportSection unit tests in src/modules/rentals/booking/__tests__/CrewAndTransportSection.test.tsx (crew table, per-diem paisa inputs, transport summary, Law 6 DOM omission, keyboard labels, 44px targets)

### Implementation for User Story 2

- [ ] T012 [P] [US2] Implement CrewAndTransportSection in src/modules/rentals/booking/CrewAndTransportSection.tsx per specs/001-newrental-orchestrator-decomposition-remainder/contracts/crew-transport.md (or fold into CrewSection.tsx with identical contract; reuses CrewSearch.tsx, DeliverySection.tsx concepts)
- [ ] T013 [US2] Wire consolidated section into orchestrator in src/modules/rentals/NewRental.tsx (replace crew/transport markup with single section tag; keep crew/transport state slices + onUpdateCrew/onRemoveCrew/onUpdateTransport dispatch)
- [ ] T014 [US2] Verify barrel + no-orphan check in src/modules/rentals/booking/index.ts and src/modules/rentals/NewRental.tsx (all sections imported from booking/, no duplicated crew/transport arithmetic)

**Checkpoint**: User Stories 1 AND 2 both work independently (rail + crew/transport extracted)

---

## Phase 5: User Story 3 - Responsive form on low-end hardware (Priority: P3)

**Goal**: Slim orchestrator to state + dispatch; protect tap budget and responsiveness

**Independent Test**: Tap count ≤ R-39 baseline; no new blocking spinner; orchestrator line count reported

### Implementation for User Story 3

- [ ] T015 [US3] Slim orchestrator to six state slices + guards/dispatch in src/modules/rentals/NewRental.tsx (client, timing, lines, crew/logistics, financial/pipeline, draft; uses newRentalGuards.ts, newRentalUtils.ts; deletes dead code after T009/T013; report final line count vs <1,200 target without gaming)
- [ ] T016 [P] [US3] Audit rerender/tap cost in src/modules/rentals/NewRental.tsx and src/modules/rentals/booking/RentalFinancialRail.tsx (section callbacks memoized, no whole-form rerender on keystroke, no new spinner)
- [ ] T017 [US3] Accessibility + shell conformance pass in src/modules/rentals/booking/RentalFinancialRail.tsx and src/modules/rentals/booking/CrewAndTransportSection.tsx (theme.css vars, icon+label+colour, inline errors, native buttons, tabular-nums for figures)

**Checkpoint**: All user stories independently functional (orchestrator slim, budgets held)

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Full-gate certification and docs

- [ ] T018 Run full verification suite: npm run typecheck, npm test, npm run check:pglite, npm run check:lifecycle, npm run check:contrast, npm run build (record results in specs/001-newrental-orchestrator-decomposition-remainder/baseline.md)
- [ ] T019 [P] Update decomposition audit in docs/audit/16_NEW_RENTAL_DECOMPOSITION_PLAN.md (actual line counts, contracts landed, remaining work or closure)
- [ ] T020 Run quickstart validation per specs/001-newrental-orchestrator-decomposition-remainder/quickstart.md (manual quote-to-confirm + draft resume + tap-count check)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Sequential strongly preferred (same orchestrator file; parallel edits conflict)
  - Order: US1 → US2 → US3
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: After Foundational - no dependencies on other stories (MVP)
- **User Story 2 (P2)**: After US1 (same file `NewRental.tsx`; rebase on rail wiring)
- **User Story 3 (P3)**: After US1+US2 (slim-down deletes only dead code)

### Within Each User Story

- Tests FIRST, FAIL before implementation (T006/T007, T011)
- Component before wiring; wiring before E2E validation
- Story complete (checkpoint green) before next story

### Parallel Opportunities

- T002 with T001; T004 with T003; T006 with T007; T011 standalone; T016 with T015 (different files); T019 with T018
- All other implementation tasks touch `NewRental.tsx` — run sequentially

---

## Parallel Example: User Story 1

```bash
# Launch US1 tests together (different files, no dependencies):
Task: "Create RentalFinancialRail unit tests in src/modules/rentals/booking/__tests__/RentalFinancialRail.test.tsx"
Task: "Extend E2E coverage for promo/VAT/deposit in src/__tests__/e2e/newRentalSimplification.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline + harness green)
2. Complete Phase 2: Foundational (barrel + Law 6 audit + engine boundary check)
3. Complete Phase 3: US1 (rail tests → rail component → wire → E2E green)
4. **STOP and VALIDATE**: E2E + manual totals identical; record line count
5. Demo: same flow, smaller file

### Incremental Delivery

1. Setup + Foundational → contracts ready
2. Add US1 → rail extracted → validate independently (MVP)
3. Add US2 → crew/transport consolidated → validate (US1 still green)
4. Add US3 → orchestrator slimmed → tap-count + full gates green
5. Polish → docs + quickstart → done

---

## Notes

- [P] tasks = different files, no dependencies
- [US1]/[US2]/[US3] map to spec P1/P2/P3
- FR coverage: FR-001→T010/T018/T020; FR-002→T005/T008; FR-003→T006/T008; FR-004→T004/T006/T011/T012; FR-005→T010; FR-006→T008/T009; FR-007→T012/T013; FR-008→T015; FR-009→T002/T006/T007/T010/T011/T018; FR-010→T006/T011/T017
- SC coverage: SC-001→T010/T020; SC-002→T018; SC-003→T015/T019; SC-004→T016/T020
- Commit after each task; stop at any checkpoint to validate independently
