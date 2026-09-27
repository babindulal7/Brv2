# TEST_INFRA — Babin Rentals OS Test Architecture & Infrastructure

## 1. Overview & Testing Philosophy

Babin Rentals OS is an offline-first single-page operational application for cinema equipment rental management in Kathmandu, Nepal. The system operates under strict domain invariants codified in the 17 OS Laws, Foundation Specification v2.0, Integer Paisa financial math, and 06:00→06:00 operational days.

### 1.1 Opaque-Box Principle
E2E tests in this suite are designed from the **opaque-box perspective** of the user (operators, dispatch staff, warehouse technicians, managers, owners):
- **User-Observable Assertions:** Tests interact with DOM nodes via accessible roles (`button`, `navigation`, `tab`, `dialog`, `table`), accessible labels (`aria-label`, placeholder), visible semantic text, and user event simulations.
- **Implementation Agnosticism:** Tests do not inspect internal component state variables, unexported closures, or private helper functions. If the component internals are refactored, the test remains valid as long as the user interface contract is satisfied.
- **Contract Fidelity:** Verification directly matches the requirements and acceptance criteria specified in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

### 1.2 Non-Negotiable Domain Laws Under Test
1. **Law 1 & 2:** Pages never implement business logic; Single Query Rule.
2. **Law 3 & 4:** Nothing is deleted (only cancelled, voided, reversed); payments are immutable.
3. **Law 5 (Deposits are Liabilities):** Security deposits are never included in Rental Total, never reduce Outstanding balance, and are never counted as rental payments.
4. **Law 6 (Warehouse Blindness):** Money-blind roles (`MONEY_BLIND`, floor warehouse) see zero financial amounts.
5. **Law 7:** AD stored in UTC; BS rendered for presentation. 06:00→06:00 operational day window.
6. **Law 10 (Discount Gates):** Discounts $>10\%$ require reason $\ge 10$ characters and named approver. 25% hard cap with zero bypass.
7. **Law 11 & 12:** Status uses icon + label + colour (never colour alone). Errors inline and persistent.
8. **Law 15 (Touch Targets):** Minimum 44×44px hit areas on all interactive controls across mobile, tablet, and desktop.
9. **Law 17 (Client Terminology):** The word "customer" is strictly forbidden across UI, text, and schema.

---

## 2. The 4-Tier Testing Methodology

The E2E test suite is structured according to a comprehensive 4-Tier test architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│  TIER 4: REAL-WORLD APPLICATION SCENARIOS                              │
│  End-to-End Booking Lifecycle (Quote -> Booked -> Packed -> On Rent ->  │
│  Returned -> Closed), Deposit Settlement & Damage, Advance Gates       │
├────────────────────────────────────────────────────────────────────────┤
│  TIER 3: CROSS-FEATURE COMBINATIONS                                    │
│  Master Dispatch Date Sync, Segmented Filter + Drawer Integration,     │
│  Multi-Stage Transitions, Money-Blind Role Views                       │
├────────────────────────────────────────────────────────────────────────┤
│  TIER 2: BOUNDARY & CORNER CASES                                       │
│  Empty States, Contention Banners, Overdue Return Alerts, Discount     │
│  Enforcement Gates, Touch Target Compliance (44x44px)                  │
├────────────────────────────────────────────────────────────────────────┤
│  TIER 1: FEATURE COVERAGE (HAPPY PATH & ISOLATIONS)                    │
│  R1: Shell & Navigation · R2: Today Dispatch · R3: Rentals List ·       │
│  R4: New Rental 4-Step Wizard · R5: Booking Detail · R6: Core Dirs     │
└────────────────────────────────────────────────────────────────────────┘
```

### Tier 1: Feature Coverage (Happy Path & Isolations)
- **R1 Shell & Navigation:** Header displays location breadcrumb, command search trigger (`⌘K`), quick create, and user profile avatar. Removes Kathmandu clock, AD/BS persistent dates, language toggle, and healthy "Synced" badges. Sidebar renders 3 core navigation groups (`Daily Dispatch`, `Assets & Relationships`, `Business & Back Office`) without static branch address and VAT footers. PageHeader enforces 1 primary CTA, at most 2 secondary visible actions, and overflow (`•••`).
- **R2 Today / Dispatch:** Removal of 4-tile bento strip (`dashboard-bento-strip`); Master date control (`‹ Today · Sep 27 / Ashwin 11 › 📅`) synchronizes Pickups and Returns columns; Quick dispatch lookup (`Search or scan…`); Pickups and Returns columns side-by-side with clear next-action buttons (`Pack`, `Handover`, `Check In`).
- **R3 Rentals List:** Single primary button (`+ New Rental`), secondary actions in overflow (`•••`), removed disabled Export button; 5-view operational segmented bar (`All`, `Upcoming`, `Out`, `Returns`, `Closed`); 6-7 core table columns (`Rental`, `Client`, `Schedule`, `Equipment`, `Status`, `Total`, `Next Action / •••`).
- **R4 New Rental Wizard:** 4 guided steps (`1. Client & Dates`, `2. Equipment & Bundles`, `3. Price & Payment`, `4. Review & Confirm`); Progressive disclosure for Crew, Delivery, Project Info, and Notes in Step 1; Removed "Show all sections" toggle and collapse/expand controls; Desktop right rail summary with expandable price breakdown; Sticky bottom action bar (`Cancel`, `Save Draft`, `Back`, `Continue` / `Confirm Rental`).
- **R5 Booking Detail:** Single prominent lifecycle action button + overflow (`•••`); Single `LifecycleProgress` bar; Streamlined 4 core facts (`Client`, `Pickup`, `Return`, `Duration`); 6 desktop tabs (`Overview`, `Equipment`, `Payments`, `Logistics`, `Documents`, `Activity`); Removal of duplicated Quick Actions rail card.
- **R6 Core Directories:**
  - Operations Queues (`OperationsQueues.tsx`): Streamlined control bar (Queue, Date, Search, Filters), 5-6 core columns with explicit primary row actions.
  - Inventory (`Inventory.tsx`): 6-KPI block removed/collapsed, quick filters (`All`, `Available`, `On Rent`), no explanatory technical copy.
  - Clients (`ClientsDirectory.tsx`): Direct directory table, top tabs (`Clients`, `Membership`), status chips (`All`, `Active`, `Payment Due`, `Blocked`).
  - Finance (`Finance.tsx`): 3 core KPIs (`Outstanding`, `Overdue`, `Received`), collections chart, invoices table.
  - Documents (`Documents.tsx`): Unified category filter bar, removed duplicate rail card.
  - Crew (`CrewBooking.tsx`): Removed disabled `Unavailable` primary CTA until operational.

### Tier 2: Boundary & Corner Cases
- **Empty States:** Concise notices (`No rentals found`, `No equipment found`, `No clients found`) without verbose technical apologies or broken action buttons.
- **Equipment Contention Banners:** Compressed expanders (`⚠ N equipment conflicts [Review]`) on double-booked inventory items without breaking the layout.
- **Condensed Overdue Alert:** High-urgency alert rendered as a single concise actionable banner (`⚠ N overdue returns`).
- **Law 10 Discount Gates:** Strict validation preventing discounts $>10\%$ without a reason of $\ge 10$ characters and named approver; absolute rejection of any discount $>25\%$.
- **Law 5 Deposit Boundary:** Verification that zero deposits or high deposits remain strictly recorded as liabilities outside Rental Total and Outstanding balances.
- **Law 15 Touch Target Audit:** Programmatic audit ensuring all interactive elements (`button`, `a`, `input`, `select`) meet the $\ge 44\times 44\text{px}$ minimum hit target.

### Tier 3: Cross-Feature Combinations
- **Master Date Dispatch Synchronization:** Updating the dispatch master date simultaneously updates both Pickups and Returns queries and panels.
- **Filter Drawer Integration:** Changing the 5-stage segmented bar synchronizes with `BooqableRentalFilterDrawer` stage selections without state desynchronization.
- **Search-to-Action Navigation:** Entering a search query filters the table in real-time and preserves row-level action execution.
- **Role-Based Access Control (RBAC):** Verification that users in `MONEY_BLIND` roles (e.g. warehouse staff) see zero monetary figures across lists, details, and summaries.

### Tier 4: Real-World Application Scenarios
- **End-to-End Booking Lifecycle:** Simulating a rental from intake to closing:
  1. Creation in `NewRental` (Client selection, gear selection, price breakdown).
  2. Transition to `Booked` (Advance payment verification: $\ge \text{NPR } 5,000$ or $\ge 50\%$).
  3. Transition to `Packed` (Pack operational job execution).
  4. Transition to `On Rent` (Handover operational job execution).
  5. Transition to `Returned` (Return operational job execution).
  6. Transition to `Reset` (Inspection and cleaning before gear becomes available again).
  7. Final Settlement to `Closed` (Deposit refund or damage deduction settlement).
- **Financial Integrity Validation:** Verifying integer Paisa math, half-up rounding, 13% VAT, and advance calculations across the full lifecycle.

---

## 3. Feature Inventory & Mapping

| Feature ID | Scope / Requirement | Specification Ref | E2E Test Suite File |
|---|---|---|---|
| **E2E-R1** | Shell & Global Navigation Simplification | ORIGINAL_REQUEST §R1, PROJECT.md M1 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-R2** | Today / Dispatch Dashboard Refactor | ORIGINAL_REQUEST §R2, PROJECT.md M2 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-R3** | Rentals List Refactor | ORIGINAL_REQUEST §R3, PROJECT.md M3 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-R4** | New Rental 4-Step Guided Wizard | ORIGINAL_REQUEST §R4, PROJECT.md M4 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-R5** | Booking Detail Simplification | ORIGINAL_REQUEST §R5, PROJECT.md M5 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-R6** | Core Directories Refactor | ORIGINAL_REQUEST §R6, PROJECT.md M6 | `src/__tests__/e2e/tier1-features.test.tsx` |
| **E2E-BOUND**| Boundaries, Contentions, Overdues & Targets | ORIGINAL_REQUEST §R7, PROJECT.md M7 | `src/__tests__/e2e/tier2-boundaries.test.tsx` |
| **E2E-CROSS**| Cross-Feature Sync, RBAC & Drawers | ORIGINAL_REQUEST §R2, §R3, §R7 | `src/__tests__/e2e/tier3-cross-feature.test.tsx` |
| **E2E-SCEN** | End-to-End Booking Lifecycle & Financials | Foundation Spec v2.0, Laws 1-17 | `src/__tests__/e2e/tier4-scenarios.test.tsx` |

---

## 4. Test Runners & Infrastructure Configuration

- **Framework:** Vitest 3.x
- **Environment:** Node default with explicit JSDOM opt-in per UI test file (`// @vitest-environment jsdom`)
- **Rendering & Mount Utility:** React 18 `createRoot` + `act` + `MemoryRouter` wrapper
- **Test Execution Commands:**
  ```powershell
  # Run entire E2E test suite
  npx vitest run src/__tests__/e2e/

  # Run specific tier test suite
  npx vitest run src/__tests__/e2e/tier1-features.test.tsx
  npx vitest run src/__tests__/e2e/tier2-boundaries.test.tsx
  npx vitest run src/__tests__/e2e/tier3-cross-feature.test.tsx
  npx vitest run src/__tests__/e2e/tier4-scenarios.test.tsx

  # Run full repository test suite
  npm test

  # Run strict TypeScript typechecking
  npm run typecheck
  ```

---

## 5. Coverage Thresholds & Quality Gates

1. **Requirements Coverage:** 100% of Acceptance Criteria defined in `ORIGINAL_REQUEST.md` (Shell, Dispatch, Rentals, New Rental, Booking Detail, Core Directories, Guardrails).
2. **Deterministic Stability:** 0 flaky tests. Tests are isolated, clean up DOM nodes and mocked contexts after each test case.
3. **Law 15 Touch Target Verification:** 100% compliance with $\ge 44\times 44\text{px}$ interactive bounds.
4. **Law 17 Copy Verification:** 0 occurrences of the banned word "customer" in the UI.
5. **Zero Implementation Breakage:** Pure opaque-box testing without modifying production source code.
