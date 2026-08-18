# Page documentation — what is built today

**Started 16 August 2026.** One document per page, recording **what the code does**, not what
any spec intended. Every statement in these files carries a `file:line`. Where a spec and the
code disagree, the code is written down and the disagreement is noted.

Nothing in this pack is taken from `PLAN.md`, the wireframe MDs, or any spec file.

## How to read a status

| Status | Meaning |
|---|---|
| **Live** | Renders from the database or the local store, and its writes reach an action with `implemented: true` that `checkCapability` maps. |
| **Partial** | Some areas real, some invented — the dangerous kind, because nothing on screen distinguishes them. |
| **Seed-only** | Every figure comes from a `src/data/*.ts` constant. Nothing is read from or written to a store. |
| **Stub** | Renders, but its primary action is `implemented: false` — `actions/core.ts` fails it closed before `validate` or `execute`. |

## Route table

68 route entries in `src/App.tsx` resolve to **55 distinct page components**. Redirects and
alias routes are listed here and point at the document for the page they land on, rather than
getting a near-empty document of their own.

| # | Route | `App.tsx` | Component file | Doc | Status |
|---|---|---|---|---|---|
| 01 | `/login` | :97 | `modules/auth/Login.tsx` (228) | [01_login.md](01_login.md) | **Partial** |
| 02 | `/forgot-password` | :109 | `modules/auth/ForgotPassword.tsx` (168) | [02_forgot_password.md](02_forgot_password.md) | **Live** |
| 03 | `/reset-password` | :110 | `modules/auth/ResetPassword.tsx` (211) | [03_reset_password.md](03_reset_password.md) | **Live** |
| 04 | `/clients` | :138 | `modules/clients/Clients.tsx` (591) | [04_clients.md](04_clients.md) | **Partial** |
| 05 | `/clients/new` | :149 | `modules/clients/AddClient.tsx` (1118) | [05_add_client.md](05_add_client.md) | **Partial** |
| 06 | `/today` | :158 | `modules/today/Today.tsx` (871) | [06_today.md](06_today.md) | **Partial** |
| 07 | `/rentals` | :167 | `modules/rentals/RentalsList.tsx` (2111) | [07_rentals_list.md](07_rentals_list.md) | **Partial** |
| 08 | `/rentals/new` | :177 | `modules/rentals/NewRental.tsx` (3177) | [08_new_rental.md](08_new_rental.md) | **Seed-only** |
| 09 | `/rentals/:bookingNo/packing` | :187 | `modules/rentals/PackingWorkspace.tsx` (1052) | [09_packing.md](09_packing.md) | **Seed-only** |
| 10 | `/rentals/:bookingNo/handover` | :198 | `modules/rentals/HandoverWorkspace.tsx` (1238) | [10_handover.md](10_handover.md) | **Seed-only** |
| 11 | `/rentals/:bookingNo/return` | :209 | `modules/rentals/ReturnWorkspace.tsx` (1323) | [11_return.md](11_return.md) | **Seed-only** |
| 12 | `/rentals/:bookingNo/reset` | :220 | `modules/rentals/ResetWorkspace.tsx` (1268) | [12_reset.md](12_reset.md) | **Seed-only** |
| 13 | `/rentals/:bookingNo/evidence` | :231 | `modules/rentals/EvidenceWorkspace.tsx` (726) | [13_evidence.md](13_evidence.md) | **Seed-only** |
| 14 | `/rentals/:bookingNo` | :247 | `modules/rentals/BookingDetail.tsx` (2197) | [14_booking_detail.md](14_booking_detail.md) | **Seed-only** |
| 15 | `/crew` | :258 | `modules/crew/CrewBooking.tsx` (1180) | [15_crew.md](15_crew.md) | **Seed-only** |
| 16 | `/inventory` | :267 | `modules/inventory/Inventory.tsx` (2088) | [16_inventory.md](16_inventory.md) | **Partial** |
| 17 | `/inventory/new` | :280 | `modules/inventory/AddEquipment.tsx` (308) | [17_add_equipment.md](17_add_equipment.md) | **Stub** |
| 18 | `/inventory/warehouses` | :289 | `modules/inventory/Warehouses.tsx` (2210) | [18_warehouses.md](18_warehouses.md) | **Seed-only** |
| 19 | `/inventory/stock-check` | :298 | `modules/inventory/StockCheck.tsx` (795) | [19_stock_check.md](19_stock_check.md) | **Seed-only** |
| 20 | `/inventory/purchase-requests` | :307 | `modules/inventory/PurchaseRequests.tsx` (556) | [20_purchase_requests.md](20_purchase_requests.md) | **Seed-only** |
| 21 | `/inventory/:assetId` | :323 | `modules/inventory/AssetDetail.tsx` (898) | [21_asset_detail.md](21_asset_detail.md) | **Seed-only** |
| 22 | `/inventory/bundles/new` | :332 | `modules/inventory/AddBundle.tsx` (2629) | [22_add_bundle.md](22_add_bundle.md) | **Partial** |
| 23 | `/calendar` | :341 | `modules/calendar/Calendar.tsx` (2399) | [23_calendar.md](23_calendar.md) | **Seed-only** |
| 24 | `/documents` | :350 | `modules/documents/Documents.tsx` (1466) | [24_documents.md](24_documents.md) | **Seed-only** |
| 25 | `/operations` | :359 | `modules/operations/OperationsQueues.tsx` (725) | [25_operations.md](25_operations.md) | **Partial** |
| 26 | `/operations/cases` | :368 | `modules/operations/CasesWorkspace.tsx` (353) | [26_cases.md](26_cases.md) | **Seed-only** |
| 26 | `/operations/cases/:id` | :379 | *alias* → CasesWorkspace | [26_cases.md](26_cases.md) | **Seed-only** |
| 27 | `/operations/sub-rental` | :392 | `modules/operations/SubRental.tsx` (783) | [27_sub_rental.md](27_sub_rental.md) | **Seed-only** |
| 28 | `/finance` | :401 | `modules/finance/Finance.tsx` (1676) | [28_finance.md](28_finance.md) | **Partial** |
| 29 | `/finance/payments` | :415 | `modules/finance/Payments.tsx` (1089) | [29_payments.md](29_payments.md) | **Partial** |
| 30 | `/finance/expenses` | :427 | `modules/finance/Expenses.tsx` (1086) | [30_expenses.md](30_expenses.md) | **Partial** |
| 24 | `/finance/documents` | :436 | *alias* → Documents | [24_documents.md](24_documents.md) | **Seed-only** |
| 31 | `/reports/pulse` | :445 | `modules/reports/Pulse.tsx` (1309) | [31_pulse.md](31_pulse.md) | **Seed-only** |
| 32 | `/reports/expenses` | :454 | `modules/reports/ExpenseReports.tsx` (854) | [32_expense_reports.md](32_expense_reports.md) | **Seed-only** |
| 33 | `/reports/clients` | :466 | `modules/reports/ClientReports.tsx` (512) | [33_client_reports.md](33_client_reports.md) | **Seed-only** |
| 34 | `/reports/promotions` | :475 | `modules/reports/PromotionsReports.tsx` (240) | [34_promotions.md](34_promotions.md) | **Seed-only** |
| 35 | `/reports/staff` | :484 | `modules/reports/StaffReports.tsx` (179) | [35_staff_reports.md](35_staff_reports.md) | **Seed-only** |
| 36 | `/reports/inventory` | :493 | `modules/reports/InventoryReports.tsx` (153) | [36_inventory_reports.md](36_inventory_reports.md) | **Seed-only** |
| 37 | `/reports/equipment-performance` | :502 | `modules/reports/EquipmentPerformance.tsx` (194) | [37_equipment_performance.md](37_equipment_performance.md) | **Seed-only** |
| 38 | `/reports/forecasting` | :511 | `modules/reports/ForecastingReports.tsx` (197) | [38_forecasting.md](38_forecasting.md) | **Seed-only** |
| 39 | `/reports/cash-flow` | :520 | `modules/reports/CashFlowReport.tsx` (323) | [39_cash_flow.md](39_cash_flow.md) | **Seed-only** |
| 40 | `/reports/working-capital` | :529 | `modules/reports/WorkingCapitalReport.tsx` (477) | [40_working_capital.md](40_working_capital.md) | **Seed-only** |
| 41 | `/clients/memberships` | :538 | `modules/clients/Membership.tsx` (915) | [41_memberships.md](41_memberships.md) | **Seed-only** |
| 42 | `/clients/import` | :547 | `modules/clients/ImportCenter.tsx` (476) | [42_import_center.md](42_import_center.md) | **Partial** |
| 43 | `/clients/duplicates` | :556 | `modules/clients/DuplicateCenter.tsx` (420) | [43_duplicates.md](43_duplicates.md) | **Seed-only** |
| 44 | `/clients/referral/new` | :565 | `modules/clients/GenerateReferralCode.tsx` (328) | [44_referral_code.md](44_referral_code.md) | **Stub** |
| 45 | `/clients/:id` | :577 | `modules/clients/ClientDetail.tsx` (1177) | [45_client_detail.md](45_client_detail.md) | **Partial** |
| 46 | `/settings` | :592 | `modules/settings/Settings.tsx` (630) | [46_settings.md](46_settings.md) | **Partial** |
| 47 | `/admin/audit` | :603 | `modules/admin/AuditSettings.tsx` (612) | [47_audit_settings.md](47_audit_settings.md) | **Seed-only** |
| 47 | `/admin/audit-settings` | :612 | *alias* → AuditSettings | [47_audit_settings.md](47_audit_settings.md) | **Seed-only** |
| 48 | `/tools` | :625 | `modules/tools/ToolsLanding.tsx` (255) | [48_tools_landing.md](48_tools_landing.md) | **Live** |
| 49 | `/tools/depreciation` | :634 | `modules/tools/DepreciationCalculator.tsx` (520) | [49_depreciation.md](49_depreciation.md) | **Partial** |
| 50 | `/tools/pricing` | :643 | `modules/tools/PricingCalculator.tsx` (502) | [50_pricing.md](50_pricing.md) | **Live** |
| 51 | `/admin/audit-log` | :652 | `modules/admin/AuditLog.tsx` (440) | [51_audit_log.md](51_audit_log.md) | **Seed-only** |
| 52 | `/admin/activity-log` | :661 | `modules/admin/ActivityLog.tsx` (306) | [52_activity_log.md](52_activity_log.md) | **Seed-only** |
| 53 | `/admin/numbering` | :670 | `modules/admin/NumberingSequences.tsx` (1671) | [53_numbering.md](53_numbering.md) | **Seed-only** |
| 54 | `/admin/backup` | :679 | `modules/admin/BackupRestore.tsx` (835) | [54_backup_restore.md](54_backup_restore.md) | **Seed-only** |
| 55 | `/tools/cinematography` | :694 | `modules/settings/Tools.tsx` (1616) | [55_cine_tools.md](55_cine_tools.md) | **Partial** |

### Routes that render no page of their own

| Route | `App.tsx` | Behaviour |
|---|---|---|
| `/` | :111 | `Navigate` → `/today` when `user` is set, `/login` otherwise |
| `/reports` | :118 | `Navigate` → `/reports/pulse` |
| `/admin` | :131 | `Navigate` → `/settings?tab=system` |
| `/tools/audit-log` | :132 | `Navigate` → `/admin/audit-log` |
| `/tools/activity-log` | :133 | `Navigate` → `/admin/activity-log` |
| `/tools/numbering` | :134 | `Navigate` → `/admin/numbering` |
| `/tools/backup` | :135 | `Navigate` → `/admin/backup` |
| `/operations/crew` | :389 | `Navigate` → `/crew` |
| `/settings/tools` | :701 | `Navigate` → `/tools/cinematography` |
| `*` | :716 | catch-all |

## Status counts

55 pages documented, 17 August 2026.

| Status | Count | Share |
|---|---|---|
| **Live** | **4** | 7% |
| **Partial** | 16 | 29% |
| **Seed-only** | **33** | 60% |
| **Stub** | 2 | 4% |

**The four Live pages are 02 Forgot Password, 03 Reset Password, 48 Tools, 50 Pricing
Calculator.** Two are password screens; two are calculators that compute from operator input and
persist nothing. **No page that reads or writes business data is fully Live.**

**Thirty-three of fifty-five pages render nothing but invented figures.** Every report page
(31–40) reports "every figure invented" — revenue, utilization, forecasts, cash flow and
working capital are all constants in `src/data/*.ts`.

The 16 Partial pages are the dangerous ones: on those, some figures are real rows and some are
constants, and nothing on screen distinguishes them.

## Top 10 gaps, ranked

Ranked by what an operator could act on wrongly, not by effort to fix.

**1. The floor loop cannot write. All four workspaces dispatch empty arrays.**
`packRental`, `handoverRental`, `completeReturn` and `completeReset` are all `implemented: true`
with `operations.perform` correctly mapped — but the screens call them with `lines: []` /
`unitIds: []`, which `validateFloorVerb` rejects before any Supabase call
(`floorVerb.ts:380-394`). The screens are seed-only, so they hold no true ids to send.
`ResetWorkspace.tsx:1140-1146` states this is deliberate; `PackingWorkspace.tsx:778-782` says the
write is "today, always failing". **The action layer works and the UI cannot reach it.**
Docs 09, 10, 11, 12.

**2. Success fabrication is not closed — two live sites.**
`CasesWorkspace.tsx:211` toasts "Generating cases report…" and generates nothing; `:217` toasts
"Opening case logging workspace" and opens nothing. `src/data/cases.ts:983` already holds the
honest sentence the page ignores. The 12 Aug register was marked closed on 16 Aug; it has been
reopened. Doc 26.

**3. Thirty-three pages are entirely invented, and the money pages are among them.**
Booking Detail's Rental Total, Paid, Outstanding, VAT and deposits (doc 14); Pulse's entire
ledger, generated in the browser at module load (doc 31); Cash Flow and Working Capital
(docs 39, 40). These are figures an owner would read as the state of the business.

**4. Four pages are anchored to a frozen clock.**
`TODAY = 31 Jul 2026` (`src/lib/bs.ts:153`) drives Today, Rentals List, Calendar and Operations.
Worst on Operations: the day scope uses the frozen constant while past-due is computed from the
real clock (`OperationsQueues.tsx:381`), so the screen opens on a fixed past day with **every row
flagged red**. Docs 06, 07, 23, 25.

**5. Booking Detail's one implemented write is unreachable, and its comment says otherwise.**
Record Payment always fails; the file asserts the opposite. Doc 14.

**6. Three inventory writes are stubs by omission, not by design.**
`createEquipment`, `createStockTransfer` and `approvePurchaseRequest` never set `implemented`,
so `core.ts:223` fails them closed — even though all three capabilities *are* mapped. A one-word
flag is the whole gap. Docs 17, 18, 20.

**7. `purchase.approve` admits Driver and Technician to a spend-authorising verb.**
It maps to `canWriteSharedTriage` = `isStaff(role)` (`rbac.ts:255-257`), mirroring
`purchase_requests_all`. `rbac.ts:243-253` flags this itself and says to change the RLS policy
first rather than tightening only the TypeScript. Doc 20.

**8. Asset Detail's route key can never match.** `asset.code` is never seeded, so
`/inventory/:assetId` cannot resolve its own primary key. Doc 21.

**9. A second, richer Cases screen exists that no route mounts**, and `/operations/cases/:id`
renders the list rather than a case. Doc 26.

**10. Restricted states that are unreachable or name the wrong roles.**
Cash Flow's restricted chip names four roles where five can see money, and the branch is
unreachable at its own route; Equipment Performance and Working Capital repeat the pattern.
A Law 6 control nobody can reach is not a control. Docs 37, 39, 40.

### Runners-up

`Inventory` prints `[object Object]` in an empty state (doc 16) and its two money gates disagree
for Coordinator on one screen. Every row link on Client Reports resolves to "Client not found"
(doc 33). Import Center's duplicate check runs against a 26-record seed array rather than the
client table (doc 42). `AuthCard` was extracted so the three auth screens could not drift, and
Login still carries the inline copy it was extracted from (doc 01).

## Method

- Route list read from `src/App.tsx` (68 entries → 55 components).
- One agent per page; every file over 1,000 lines read in full.
- Nothing taken from `PLAN.md`, `PROGRESS.md`, wireframes or specs.
- `node node_modules/typescript/bin/tsc --noEmit` run at each checkpoint: **0 errors
  throughout**, unchanged from baseline.
- No file under `src/` or `supabase/` was modified: every dirty file there has an mtime at or
  before 21:30, and this pack's first artifact was created at 22:39.
