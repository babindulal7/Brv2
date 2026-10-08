# Project: Babin Rentals OS UI Simplification & Information Architecture Refactor

## Architecture
Babin Rentals OS is an offline-capable single-page application built on React, TypeScript, Vite, Tailwind CSS, and custom design tokens (`theme.css`).
The application operates around strict domain invariants:
- **06:00→06:00 Operational Day**: Driven by `rentalDaysBetween` and `KATHMANDU_SHIFT_OFFSET_MS = 900_000` (15m offset aligning 06:00 NPT to 00:00 UTC).
- **Financial Architecture**: Strict Integer Paisa math, 13% VAT, Law 5 (deposit is liability, not in rental total), Law 10 (25% stacking discount cap), and tiered advance requirements.
- **Universal Stage Progression**: 6 canonical stages (`draft`, `quote`, `booked`, `packed`, `on_rent`, `returned`, `closed`) and universal primary action resolution (`getRentalPrimaryAction`).
- **RBAC & Field Gating**: Money-blind role isolation (`MONEY_BLIND`, floor surface zero-money rule) and PII protection (`PII_ALWAYS`).
- **Touch Target Standard**: Law 15 minimum 44×44px hit areas on all interactive controls.
- **Canonical Responsive Breakpoints**: `BP = { phone: 768, desktop: 1280 }`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Header Streamlining | Remove Kathmandu clock, AD/BS persistent dates, language toggle, and permanent Synced badge. Show sync badge only in abnormal states (`Offline`, `Syncing`, `Queued`, `Sync Error`). Compact user profile trigger. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Sidebar Focus | Remove static branch street address and VAT lines from footer, preserving branding, 3 navigation groups, and theme toggle. | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Page Header & Actions Standard | Enforce 1 primary CTA, at most 2 visible secondary actions, collapse remainder into overflow (`•••`). Remove unbuilt placeholder actions (`<Unavailable>`). | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Today Bento Strip Removal | Remove 4-tile `dashboard-bento-strip` (`.dashboard-command-deck`) to recover ~200px of primary viewport space. | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Master Dispatch Date Sync | Unify date selection into a single master dispatch date control (`syncBothPanels`) synchronizing pickups and returns. | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Quick Dispatch Lookup | Unify and simplify search to a quick dispatch lookup (`Search or scan…`). | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Condensed Overdue Alert | Condense overdue banner to a concise actionable alert (`⚠ N overdue returns`). | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Today Two-Column Dominance | Center viewport on dispatch operation with Pickups and Returns columns side-by-side with visible next actions. | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Rentals List Header | Single primary CTA (`+ New Rental`), secondary actions (`Fast Return`, `Record Payment`, `Refresh`) moved to overflow (`•••`), remove disabled Export. | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Rentals 5-Stage Filter Bar | Replace 9+ chip strip with 5-view operational segmented bar (`All`, `Upcoming`, `Out`, `Returns`, `Closed`), delegating fine facets to `BooqableRentalFilterDrawer`. | M3 | ORIGINAL_REQUEST §R3 |
| 11 | Rentals Core Columns & Glance | Limit default visible table columns to 6-7 core operational columns (`Rental`, `Client`, `Schedule`, `Equipment`, `Status`, `Total`, `Next Action / •••`). Move secondary metadata to `IntelCard` / drawer. Clean empty states. | M3 | ORIGINAL_REQUEST §R3 |
| 12 | New Rental 4-Step Guided Wizard | Consolidate 5 steps to 4: 1. Client & Dates, 2. Equipment & Bundles, 3. Price & Payment, 4. Review & Confirm. Progressive disclosure for Crew, Delivery, Project Info, Notes in Step 1. | M4 | ORIGINAL_REQUEST §R4 |
| 13 | New Rental Controls Declutter | Remove "Show all sections" toggle and collapse/expand controls; remove visible keyboard badges. | M4 | ORIGINAL_REQUEST §R4 |
| 14 | Compact Contention & Clean Rails | Compress inventory contention banners to compact expanders (`⚠ N equipment conflicts [Review]`). Keep summary in desktop rail with expandable price breakdown; sticky bottom bar with actions only. | M4 | ORIGINAL_REQUEST §R4 |
| 15 | Booking Detail Header & Lifecycle | 1 prominent primary action + overflow (`•••`). Single `LifecycleProgress` bar (remove duplicate custom stepper). | M5 | ORIGINAL_REQUEST §R5 |
| 16 | Booking Detail Facts & Tabs | Streamline facts strip to 4 core facts (`Client`, `Pickup`, `Return`, `Duration`). Introduce 6 desktop tabs (`Overview`, `Equipment`, `Payments`, `Logistics`, `Documents`, `Activity`). | M5 | ORIGINAL_REQUEST §R5 |
| 17 | Booking Detail Cleanup | Remove duplicate Quick Actions rail card. Clean up un-wired query notes with standard clean empty states. | M5 | ORIGINAL_REQUEST §R5 |
| 18 | Operations Queues Refactor | Streamline control bar to Queue, Date, Search, and Filter button. 5-6 core columns with explicit primary row actions. | M6 | ORIGINAL_REQUEST §R6 |
| 19 | Inventory Equipment View | Remove/collapse persistent 6-KPI block, streamline filters to `All`, `Available`, `On Rent`, remove technical prose, lead directly with catalogue. | M6 | ORIGINAL_REQUEST §R6 |
| 20 | Clients Directory Streamlining | Lead directly with search and directory table, streamline top tabs to `Clients` and `Membership`, chips to `All`, `Active`, `Payment Due`, `Blocked`. | M6 | ORIGINAL_REQUEST §R6 |
| 21 | Finance Dashboard Cleanup | Preserve 3 core KPIs (`Outstanding`, `Overdue`, `Received`), collections chart, and invoices table; eliminate redundant error/empty copy and TODO disclaimers. | M6 | ORIGINAL_REQUEST §R6 |
| 22 | Documents Module Cleanup | Unify category navigation into single filter bar, remove duplicate rail card and disabled buttons. | M6 | ORIGINAL_REQUEST §R6 |
| 23 | Crew Booking Cleanup | Remove disabled `Unavailable` primary CTA until operational; streamline KPI prominence. | M6 | ORIGINAL_REQUEST §R6 |
| 24 | Typecheck & Test Suite Zero-Failure | Resolve existing 7 typecheck errors (`tsc --noEmit`), fix 3 existing test failures (`Payments.test.tsx`, `uiPhase1.contract.test.tsx`), ensure 100% green test suite. | M7 | ORIGINAL_REQUEST §R7 |
| 25 | Quality Guardrails & RBAC Assurance | Verify touch targets >= 44x44px, money-blind role gating (`MONEY_BLIND`), PII gating, and responsive behavior across phone (<768px), tablet (768-1024px), desktop (>1024px). | M7 | ORIGINAL_REQUEST §R7 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Global Shell & Navigation Simplification | `Header.tsx`, `Sidebar.tsx`, `PageHeader.tsx`, `PageActions.tsx`, `shell.css` | none | COMPLETE |
| M2 | Today / Dispatch Dashboard Refactor | `Today.tsx`, `dashboard.css`, today tests | M1 | COMPLETE |
| M3 | Rentals List Refactor | `RentalsList.tsx`, `BooqableRentalFilterDrawer.tsx`, rentals list tests | M1 | COMPLETE |
| M4 | New Rental 4-Step Guided Flow | `NewRental.tsx`, new rental tests | M1 | COMPLETE |
| M5 | Booking Detail Simplification | `BookingDetail.tsx`, booking detail tests | M1 | COMPLETE |
| M6 | Core Directories Refactor | `OperationsQueues.tsx`, `Inventory.tsx`, `ClientsDirectory.tsx`, `Clients.tsx`, `Finance.tsx`, `Documents.tsx`, `CrewBooking.tsx`, supporting tests | M1 | COMPLETE |
| M7 | Baseline Fixes, E2E Verification & Hardening | `tsc --noEmit`, full `npm test`, touch target audit, RBAC money-blind gating verification | M1-M6 | COMPLETE |

## Interface Contracts

### Shell ↔ Pages (`PageActions.tsx` / `PageHeader`)
- `PageHeader` accepts `actions?: ReactNode`.
- `PageActions`:
  - `primary?: ReactNode` (single filled CTA)
  - `secondary?: ReactNode[] | ReactNode` (at most 2 rendered as secondary outline buttons)
  - `overflow?: OverflowMenuItem[] | ReactNode` (rendered inside `•••` overflow menu)
  - Clamping: When secondary contains >2 items, `PageActions` must either warn or automatically route index >= 2 into `OverflowMenu`.
  - Unbuilt actions: No `<Unavailable>` wrappers permitted in page headers or tables.

### Dispatch ↔ Panels (`Today.tsx` ↔ `DashboardMovementPanel`)
- Master date state `dispatchDate: string` managed at `Today.tsx` level via `syncBothPanels`.
- Both Pickups panel (`DashboardMovementPanel noun="pickup"`) and Returns panel (`DashboardMovementPanel noun="return"`) receive synchronized `date={dispatchDate}`. Individual panel date pickers removed.

### Filter Drawer ↔ Lists (`RentalsList.tsx` ↔ `BooqableRentalFilterDrawer.tsx`)
- 5 operational stage views (`all`, `upcoming`, `out`, `returns`, `closed`) map cleanly to backend rental stages:
  - `upcoming`: `['booked', 'packed']`
  - `out`: `['on_rent']`
  - `returns`: `['returned']`
  - `closed`: `['closed']`
- Detailed facet filters (payment status, client, project, tags) remain in `BooqableRentalFilterDrawer`.

### Wizard State ↔ Steps (`NewRental.tsx`)
- Stepper values: strictly 4 steps:
  - `Step 1: Client & Dates` (includes collapsible disclosure panels for `Crew & Logistics`, `Project & Delivery`, and `Notes`)
  - `Step 2: Equipment & Bundles`
  - `Step 3: Price & Payment`
  - `Step 4: Review & Confirm`
- Booking summary rail `#rail-booking-summary` maintains live totals via `calculatePricingPipeline`.
- Sticky footer bar renders navigation buttons only (`Cancel`, `Save Draft`, `Back`, `Continue` / `Confirm Rental`).

## Code Layout
- `src/components/shell/`
  - `Header.tsx`: Global navigation header
  - `Sidebar.tsx`: App navigation sidebar
  - `shell.css`: Shell styling and touch targets
- `src/components/ui/`
  - `Page.tsx`: `Page`, `PageHeader`, `PageSection`
  - `PageActions.tsx`: Action button container (1 primary, max 2 secondary, overflow)
  - `BooqableRentalFilterDrawer.tsx`: Advanced filter drawer for rentals
- `src/modules/today/`
  - `Today.tsx`: Daily dispatch command center
  - `dashboard.css`: Dispatch styling
- `src/modules/rentals/`
  - `RentalsList.tsx`: Operational rentals list table
  - `NewRental.tsx`: 4-step guided rental booking wizard
  - `BookingDetail.tsx`: 6-tab booking detail inspector
- `src/modules/operations/`
  - `OperationsQueues.tsx`: Fulfillment queues
- `src/modules/inventory/`
  - `Inventory.tsx`: Equipment inventory directory
- `src/modules/clients/`
  - `ClientsDirectory.tsx`: Clients table
  - `Clients.tsx`: Client section tabs
- `src/modules/finance/`
  - `Finance.tsx`: Financial dashboard and billing
- `src/modules/documents/`
  - `Documents.tsx`: Documents manager
- `src/modules/crew/`
  - `CrewBooking.tsx`: Crew assignment roster
