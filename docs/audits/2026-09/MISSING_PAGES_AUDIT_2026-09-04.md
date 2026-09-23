> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY
>
> This document is a point-in-time measurement from September 2026. Its findings, blockers, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../../CLAUDE.md)

---

# Babin Rentals OS — Missing Pages Inventory

**Audit date:** 4 Sep 2026 · 8 dimensions, finder + refuter verified · REFUTED claims dropped, CORRECTED statuses applied, duplicates merged
**App root:** `C:/Users/babin/Desktop/Rental workspasce/babin-rentals-os`
**Route source of truth:** `src/App.tsx` (76 `<Route path=>` entries)

---

## Part 1 — The three you asked about

### 1. "Client page is missing individual" → **The page EXISTS. Two separate defects make it look missing.**

`src/modules/clients/ClientDetail.tsx` is 1,297 lines, routed at `src/App.tsx:624`, and resolves its param correctly. What you are actually hitting:

| # | Defect | Status | Evidence | P |
|---|---|---|---|---|
| 1a | **Every link from outside Clients passes a UUID, not a client_code** — so the page renders "Client not found" | routed-but-broken | `src/lib/queries/bookings.ts:341` and `finance.ts:404,765` map `clientId: r.client_id` (a uuid). Fed into the route at `RentalsList.tsx:1834`, `Payments.tsx:854,926`, `OperationsQueues.tsx:791,867`, `rentals.ts:1148`. Consumer queries `.eq('client_code', …)` — `clients.ts:542-547`. Schema proves it can never match: `0055_ruled_identifier_formats.sql:136` `check (client_code ~ '^C-[0-9]+$')`. Live: 366 rows, C-0001…C-0366 | **P0** |
| 1b | Two **more** broken entry points, different mechanism (seed codes `C-1`, `C-34`) | routed-but-broken | `CasesWorkspace.tsx:409-411` via `src/data/clients.ts:1036-1039`; `ClientReports.tsx:343,348,405` via `clientReports.ts:112`. Those four codes match 0 live rows | **P0** |
| 1c | Inside Clients, three controls **labelled** as opening the profile open a drawer instead | affordance mismatch | `ClientsDirectory.tsx` imports no `Link` (`:2`, 0 matches). Row `:1548-1552` (`aria-label="Open …'s profile"`), card button `:1497`, menu item `:1783-1786` all call `setSelectedClientId`. Only `:2184` "View Full Profile" reaches the page. One working one-click link exists on the Credit tab: `Clients.tsx:552` | P2 |

**Operator impact:** clicking a client's name from Rentals, Finance or Operations lands on "Client not found." The same client opens fine from /clients. This is the single largest cause of your report.

---

### 2. "Equipment bundles page missing" → **The list EXISTS as a tab. Its data is fake, and there is no bundle detail page.**

`Bundles.tsx` is **not** an orphan — imported at `Inventory.tsx:18`, rendered at `:1531-1532`, addressable at **`/inventory?tab=bundles`**.

| # | Page | Route | Status | Evidence | P |
|---|---|---|---|---|---|
| 2a | **Bundles list — live data** | `/inventory?tab=bundles` | routed-but-broken | `Bundles.tsx:26-33` reads `ACTIVE_BUNDLES`/`ARCHIVED_BUNDLES` — a 9-row literal at `src/data/bundles.ts:498-499`. No `useList` in the file. Meanwhile `createBundle.ts:192 implemented:true` inserts for real at `:313`, and the bridging query `lib/queries/bundles.ts:130 listBundlesWithItems` has **zero callers**. *(Marked UNVERIFIED by the refuter — the finder's file:line citations are precise and self-consistent, but this specific claim was not independently re-checked.)* | **P0** |
| 2b | **Bundle detail** | `/inventory/bundles/:id` | missing-entirely | No route, no component. Stated in code 3×: `Bundles.tsx:1108-1111` (`reason: 'Bundle detail has no screen yet'`), `:1373-1377` (`<Unavailable>` on "View full breakdown"), `bundleIntel.ts:91-93`. `bundleDetailGroups()` is fully written with no screen | **P1** |
| 2c | **Bundle edit** | `/inventory/bundles/:id/edit` | missing-entirely | No route. Row menu `Bundles.tsx:1093-1111` has 4 items, none is Edit. `grep updateBundle src/actions/` = 0 | **P1** |
| 2d | `/inventory/bundles` (the URL you'd guess) | — | swallowed | Matches `/inventory/:assetId` (`App.tsx:337`) → AssetDetail renders `No asset matches "bundles"…`. Worse than a 404. *(UNVERIFIED — not independently re-checked)* | P1 |
| 2e | **Return trip after creating a bundle** | — | partial | `AddBundle.tsx:682 navigate('/inventory')` with no `?tab=`; `tabFromSlug(null)` → Equipment (`data/inventory.ts:303-305`). You land on Equipment, and the bundle wouldn't be in Bundles anyway | P2 |
| 2f | Bundle archive / import / templates | — | missing-entirely | Archived chip filters to a shelf nothing can write (`Bundles.tsx:431,498,509`, no archive action). Import `:603`, templates `:627` + `AddBundle.tsx:906` | P2–P3 |

**Operator impact:** you create a bundle, get a success toast with a real bundle code, open Bundles, and it is not there — ever. Nine fabricated demo bundles show instead. Every count, KPI and money figure on that tab is invented.

---

### 3. "Invoice and other related pages are missing" → **Correct. There is no invoice route anywhere. A list exists inside Finance with no URL.**

`grep -in invoice src/App.tsx` returns 5 hits, all search placeholders (`:183, 263, 366, 424, 472`). **Zero routes.**

| # | Page | Route | Status | Evidence | P |
|---|---|---|---|---|---|
| 3a | **Invoice line items** | any invoice surface | missing-entirely | No query for `invoice_lines` anywhere in `src/lib/queries/`. One comment only: `Finance.tsx:377`. Even if a detail route were added tomorrow, **no screen in this app can say what an invoice charges for** | **P0** |
| 3b | **Invoice create** | Finance → modal | routed-but-broken | Button `Finance.tsx:1071`; modal `CreateInvoiceModal.tsx:339-343` hard-refuses. But `src/actions/finance/createInvoice.ts:255-265` is **`implemented: true`**, 558 lines, with the permission wired at `core.ts:231`. The modal simply never imports it — its refusal comment (`:317-319`) is stale | **P0** |
| 3c | **Invoice detail** | `/finance/invoices/:invoiceNo` | missing-entirely (page); a drawer exists | The number is an `IntelCard` hover popover styled as a link (`Finance.tsx:1571-1578`, `:1643-1648`) fed by `invoiceDetailGroups` (`invoiceIntel.ts:94-134`). Its only exit is `/rentals/:no` (`invoiceIntel.ts:90`). On `ClientDetail.tsx:1129` the number is a plain `<span>` — inert | **P1** |
| 3d | **Finance ▸ Invoices tab has no URL** | `/finance/invoices` | routed-but-unreachable | `Finance.tsx:494 useState<FinanceTab>('Dashboard')`; zero `useSearchParams` in the file. `nav.ts:456-457` records Dashboard and Invoices as the same string. Every other Finance tab has a real route | P2 |
| 3e | **Invoice void** | row action | routed-but-broken | `VoidInvoiceModal.tsx:89-94` refuses. `grep voidInvoice src/actions/` = 0. Blocked by CHECK `invoices_void_requires_reason` (0006:124-127) needing a credit-note number | **P1** |
| 3f | **Invoice PDF / print / send** | — | missing-entirely | `grep -riE '\bpdf\b\|window.print\|sendInvoice' src/modules/finance/ src/modules/documents/ BookingDetail.tsx` = **1 comment**. `invoiceIntel.ts:157-159`: "Export (PDF) — Not available". Row actions are Pay / Refund / Void only (`Finance.tsx:1955-1970`) | **P1** |
| 3g | **Raise invoice from a booking** | `/rentals/:bookingNo` | missing-entirely | `CreateInvoiceModal`'s only importer is `Finance.tsx:40`. BookingDetail has **zero** links or navigates to /finance, yet prints "Raise one from Finance" (`:937-938`, `:2085-2086`) | **P1** |
| 3h | Movement row "Invoice" action | — | wrong destination | `MovementList.tsx:318 Invoice: () => navigate('/documents')` — the booking is in scope at `:311` and ignored | P2 |
| 3i | Create-invoice permission gate mismatched | — | routed-but-broken | `Finance.tsx:492` borrows `canVoidInvoice` (Owner+Accounts) for the Create button. Real predicate `rbac.ts:350-353` = Owner/Admin/Manager/Accounts. **Admin and Manager never see the button.** Moot only while the modal writes nothing | P2 |

**Note:** `/finance/documents` (crumb "Tax & Invoices") is a **byte-identical duplicate mount** of `/documents` (`App.tsx:363-371` vs `:469-476`), and both render a 27-row hardcoded fixture (`src/data/documents.ts:204-246`) with every control dead. That is the register you go to looking for invoices, and it cannot agree with the Postgres-backed tab.

---

## Part 2 — Complete inventory, by module

### P0 — Blocks work today

| Page | Route | Status | Evidence | Operator cannot |
|---|---|---|---|---|
| Client detail from other modules | `/clients/:id` | routed-but-broken | see 1a/1b above | Open a client from Rentals, Finance, Ops, Cases or Client Reports |
| Bundles list data | `/inventory?tab=bundles` | routed-but-broken | `bundles.ts:498-499` seed vs `createBundle.ts:192` live | Ever see a bundle they created |
| Invoice line items | — | missing-entirely | no `invoice_lines` query | Know what any invoice charges for |
| Invoice creation | Finance modal | routed-but-broken | `CreateInvoiceModal.tsx:339` vs `createInvoice.ts:265` | Bill anyone; therefore take no payment (recordPayment settles against `invoices.invoice_no`) |
| **Booking edit** | `/rentals/:bookingNo/edit` | missing-entirely | No route, no update action (`grep updateBooking src/` = 0). Inline edit deliberately deleted — `BookingDetail.tsx:1716-1721`. Every write disabled: `:939-943`, `:1596-1602`. `saveDraft.ts:18 implemented:false` | Change a client, date, location, line, crew or transport after creation. A wrong date is uncorrectable |
| **Client edit / save** | `/clients/:id` | routed-but-broken | `ClientDetail.tsx:367-375` `onSave` only calls `setDraft` — dies on reload (`:299-302`). `updateClient.ts:24-53` never sets `implemented:true`, zero real importers | Change a name, phone, PAN, address or note and have it persist |

### P1 — Whole capabilities absent

**Rentals**

| Page | Route | Status | Evidence | Cannot |
|---|---|---|---|---|
| Evidence workspace | `/rentals/:bookingNo/evidence` | routed-but-broken | Hard-gated to seed B-715: `EvidenceWorkspace.tsx:186-187`, `booking.ts:114-115`. **Now the only workspace still gated** — Packing/Handover/Return/Reset all dropped theirs (`HandoverWorkspace.tsx:60`) | View photos for any live booking (B-900+) |
| Rental Agreement / Delivery Note / Packing List / Quote | `/rentals/:bookingNo/documents/:doc` | missing-entirely | `NewRental.tsx:1987-1993` names five tiles, `:2429-2456` renders static divs, `:2442-2443` "none fire on click". Only Quote gets the ✉ (`:2445`), and email cannot send (`DraftEmailModal.tsx:23-24`) | Give a client an agreement, a driver a delivery note, the warehouse a packing list |
| Booking documents (Block 5) | in-page | partial | `BookingDetail.tsx:2214-2237` — left half is a NotWiredNote; `document_registry` has no query module. Add Document disabled (`:944`) | Attach or read any document on a booking |
| **Cancel booking** | — | action exists, no UI | `cancelRental.ts` exists; sole caller `NewRental.tsx:1876` is a **rollback**, not a user action. Neither row menu nor header offers it — yet `isCancelled` drives Tags at `RentalsList.tsx:1681,1820` | Cancel a booking anywhere in the app |

**Inventory**

| Page | Route | Status | Evidence | Cannot |
|---|---|---|---|---|
| Bundle detail / edit | `/inventory/bundles/:id[/edit]` | missing-entirely | see 2b/2c | Open or correct a bundle; a wrong bundle is permanent |
| Maintenance list data | `/inventory?tab=maintenance` | routed-but-broken | `Maintenance.tsx:16-24` seed imports; `useList` count 0; no supabase/queries import | Trust any maintenance row |
| Maintenance job detail | `/inventory/maintenance/:jobId` | missing-entirely | `<Unavailable reason="The maintenance job detail screen is not built yet.">` at `Maintenance.tsx:434-437` and `:1013-1016` | Open a job, read its parts/cost, work it to completion |
| Log Maintenance (create) | modal | built-but-unrouted | `LogMaintenanceModal.tsx` fully built, imported `Maintenance.tsx:30`, rendered `:1050` — trigger permanently disabled at `:823-827` | Create a maintenance job |
| Warehouses list data | `/inventory/warehouses` | routed-but-broken | Seed imports `Warehouses.tsx:24-45`; `:905` "this screen reads a seeded module"; yet `createStockTransfer` writes live at `:762-764` | See a transfer they created |
| Purchase Requests list data | `/inventory/purchase-requests` | routed-but-broken | Seed at `PurchaseRequests.tsx:11-17`; approve writes live at `:257-258` | See their own approval reflected |

**Finance / Reports**

| Page | Route | Status | Evidence | Cannot |
|---|---|---|---|---|
| Deposits ledger | `/finance/deposits` | partial | `Payments.tsx:452-456` — three labels, every `<dd>` an em-dash. `security_deposits`/`deposit_movements` have no query | Say what deposit money is held, applied or owed back |
| Payment reversals | `/finance/payments` | partial | `Payments.tsx:435-437` `NO_REVERSAL_ROWS_NOTE` — `payment_reversals` has no reader. Payments are immutable, so **every correction is invisible** | See any correction to a payment |
| VAT / Tax report | `/reports/vat-tax` | missing-entirely | `catalog.ts:421-429` `route:null, projection:null` | Produce a VAT return for a VAT-registered business |
| Receivables / aging | `/reports/receivables` | missing-entirely | `catalog.ts:387-398`. **Note:** aging buckets DO render — `ClientReports.tsx:269-272` off hardcoded `clientReports.ts:53-60`. Worse than absent: bucketed receivables no database can defend | See what is owed by age |
| Payables | `/reports/payables` | missing-entirely | `catalog.ts:399-407` — "no supplier-invoice table anywhere in migrations" | Know what Babin owes |
| Sales | `/reports/sales` | missing-entirely | `catalog.ts:364-372` | — |
| Documents register | `/documents` + `/finance/documents` | routed-but-broken | 27-row fixture `documents.ts:204-246`; `NOT_BUILT` at `:421` on View/Download/Send (`Documents.tsx:1246-1248`) and quick actions (`:1454`) | Open, download, send or print any document |
| **Report Catalog + ReportTemplate** | `/reports` (redirects to Pulse) | built-but-unrouted | Zero `Catalog`/`Template` refs in `App.tsx`. Only importer `Finance.tsx:46`, rendered `:1299` behind a useState tab. **32 of 43 reports have `route:null` and this is their only viewer** | Bookmark or share the report index; money-blind roles reach it at all |

**Clients**

| Page | Route | Status | Evidence | Cannot |
|---|---|---|---|---|
| Client statement / ledger | `/clients/:id/ledger` | missing-entirely | 4 controls labelled Ledger / Receive Payment / Open payments all `navigate('/finance')` (`ClientsDirectory.tsx:2174,1806,864`); Finance has no `useSearchParams` | Answer "what does this client owe overall" |
| Client documents / KYC | `/clients/:id/documents` | missing-entirely | Tab body is an EmptyState `ClientDetail.tsx:1166-1183`. `client_documents` has one comment reference. Yet Activity prints "KYC {status} · {n} documents on file" (`:1210`) | Open a contract, PAN card or citizenship scan |
| Membership (data) | `/clients?tab=membership` | routed-but-broken | `Membership.tsx:19` sole source is hardcoded `MEMBERS` (`membership.ts:76`). `client_memberships` = 0 rows live, no query. Bulk disabled `:311`. A working `useMembershipPlans` sits unused next to it (`useClients.ts:123`) | See a real membership; change anyone's tier |

**Operations / Crew / Docs**

| Page | Route | Status | Evidence | Cannot |
|---|---|---|---|---|
| Sub-Rental workspace | `/operations/sub-rental` | routed-but-unreachable | 863-line built screen. `grep "operations/sub-rental" src/` = the route + **one comment**. No nav, no link, no chip. `nav.ts:392-395` admits it "needs somewhere to go" | Find the partner-gear ledger without typing the URL |
| Sub-Rental detail | `/operations/sub-rental/:srId` | missing-entirely | No route, no `useParams` in SubRental.tsx. **`CasesWorkspace.tsx:420` links every SR case to `/rentals/SR-2026-0015`** → BookingDetail "No booking numbered…" (5 seeded cases: `cases.ts:460,514,684,766,820`) | Reach the sub-rental a case concerns |
| Purchase Requests (reachability) | `/inventory/purchase-requests` | routed-but-unreachable | 634-line screen; only refs are the route + 2 comments. Tabs are Equipment/Bundles/Stock Check/Maintenance. Not in ⌘K (`CommandPalette.tsx:104-109` indexes nav only). *Removal was a deliberate spec ruling (`inventory.ts:270`)* | Reach requisitions without typing the URL |
| Crew member detail | `/crew/:crewId` | missing-entirely | Only `/crew` exists. Name cell is plain text `CrewBooking.tsx:529`. `NewRental.tsx:3021` links `to="/crew"` with `title="Open {name} in Crew Assist"` | See one person's skills, rate, assignments, documents |
| Document viewer | `/documents/:docId` | missing-entirely | `ActionIcon` eye/download/send all `why={NOT_BUILT}` (`Documents.tsx:1246-1248`) | Open any listed document |
| Document upload / create | `/documents/new` | missing-entirely | `Documents.tsx:664-681` — 3 disabled header buttons. `createDocument.ts` has **zero call sites** | Get a document into the system at all |
| Payment detail / receipt | `/finance/payments/:paymentNo` | missing-entirely | Payment number is a bare `<span className="identifier">` (`Payments.tsx:837-839`, `:914`). One register row exercises the null route (`documents.ts:224`) | Open a payment or produce a receipt |
| **Late-fee apply/waive panel** | in-page on BookingDetail | built-but-unmounted | `LateFeePanel.tsx` 277 lines, **zero importers** (only prose at `rbac.ts:473`). `settleLateFee`/`validateWaiver` have no UI caller. ReturnWorkspace hands off (`:917-928`) to a panel never rendered. Migration 0058 enforces the approver at the row | Charge or forgive a late return |
| Crew booking write | modal on BookingDetail | routed-but-broken | `AssignCrewModal.tsx` is a **real, complete form** (picker `:57-59`, dispatch `:109-112`), opened from `BookingDetail.tsx:1475-1479`. But `bookCrew.ts:19 implemented:false` → fails closed. Input carries no rate/day count (`:105-107`) | Book crew onto a job (the 4 disabled /crew buttons are a red herring — the flow exists and its action is a stub) |
| **System Monitor / Diagnostics** | `/system` | dead link → 404 | `tools.ts:660-667` `kind:'link', to:'/system'`, rendered as a **whole-card anchor** at `Tools.tsx:1057-1062`. No route → catch-all `App.tsx:763`. Sits beside working cards. The neighbouring integrations tile correctly uses `kind:'blocked'` | Reach any system-health surface; the click 404s |
| **Notification centre** | `/notifications` | dead link → 404 | `AlertsPanel.tsx:128-131` bare `<Link>`, rendered on **/operations** (`OperationsQueues.tsx:25,491`) — every role. The Header bell beside it was already correctly disabled (`Header.tsx:364-369`) | Click "View all" on alerts without 404-ing |
| **Automation / recurring expenses** | `/automation` | 2 dead links → 404 | `ExpenseReports.tsx:637` (Upcoming Payments "View All") **and** `:696` (Recurring Expenses quick action), both on `/reports/expenses`. `settingsSections.test.ts:134` proves the door was closed in Settings and left open in Reports | See recurring/scheduled expense payments |
| Integrations / Apps & API | `/admin/integrations` | missing-entirely | Tab deleted (`settings.ts:117`, `:153` silently redirects to System). Tile blocked at `tools.ts:685-693`. **Live Booqable sync exists** (`src/lib/booqable/`) with zero operator surface. *(UNVERIFIED — not independently re-checked)* | See connection state, rotate a token, inspect a sync |
| User management (create/assign/deactivate) | `/settings?tab=people` | partial | `StaffDirectory.tsx:57` "Read, reset, revoke. **No user creation and no role assignment**". `UsersRoles.tsx:159-162` repeats it. Only one user/role file exists in the tree | Onboard, re-role or deactivate an employee — all require DB access |

### P2 — Degrades work

| Module | Page | Route | Status | Evidence |
|---|---|---|---|---|
| Rentals | Booking Activity Timeline | in-page | partial | `BookingDetail.tsx:1507-1514` — body is a NotWiredNote; `booking_stage_transitions` has no query |
| Rentals | Booking Crew & Transport (Block 3) | in-page | partial | `:1956-1974` both halves empty; `booking_crew_lines` no query; Add Member + Edit disabled |
| Rentals | Packing/Return print buttons | in-page | dead controls | `PackingWorkspace.tsx:719` and `ReturnWorkspace.tsx:876` — `<Button>` with **no onClick**. A print engine exists (`lib/printSlip.ts:33`) with only a test importing it |
| Rentals | Close rental | — | built-but-unrouted | `closeRental.ts` has zero import sites; the "Closed" stage `BookingDetail.tsx:1552` branches on is unreachable |
| Inventory | Asset detail from Equipment tab | `/inventory/:assetId` | affordance gap | `Inventory.tsx:3` imports no `Link`; both navigates go to `/inventory/new`; name cell is an IntelCard with no `primaryAction`. **The page itself is fine and reachable** from Stock Check (`StockCheck.tsx:693-696`) + 8 booking screens |
| Inventory | Equipment row/bulk actions | `/inventory` | missing-entirely | Three identical `<Unavailable>` at `:526, :674, :800`; bulk `:1747`; saved views `:1087`; import `:1442` |
| Inventory | Warehouse add / edit | — | missing-entirely | `Warehouses.tsx:889`, `:1365` |
| Inventory | Stock transfer advance/receive | — | missing-entirely | `Warehouses.tsx:511-512`, disabled at `:1895`, `:1902`. No state-change action exists |
| Inventory | Categories admin | — | missing-entirely | `inventory_categories` has 3 comment references, no screen. `createBundle` resolves category **by name** |
| Inventory | Bundle & warehouse label printing | — | missing-entirely | `Bundles.tsx:1511`, `Warehouses.tsx:897`, `AddEquipmentContext.tsx:934-938`. Per-unit labels DO work at `AssetDetail.tsx:431-436` |
| Clients | Duplicate merge commit | `/clients/duplicates` | routed-but-broken | `mergeClients.ts:19 implemented:false`; loop always fails (`DuplicateCenter.tsx:294-322`). "Not a Duplicate" also dead (`:126-130`) |
| Clients | Import commit | `/clients/import` | routed-but-broken | 603-line screen; commit wrapped `<Unavailable>` at `:559-563` |
| Clients | Credit limit / KYC verify / tier change / block | modals | routed-but-broken | `AdjustCreditLimitModal.tsx:58-62`, `VerifyKycModal.tsx:51-55`, `UpgradeTierModal.tsx:76-80` all `SAVE_BLOCKED`. **Block is different** — `blockClient.ts:195 implemented:true` and the rail exposes it; only `ClientDetail.tsx:587` is stale (unruled capability string) |
| Clients | Referral programme | `/clients/referral/new` | routed-but-broken | Nothing in schema stores a referral (`Clients.tsx:316-323`); issue disabled `GenerateReferralCode.tsx:166-170` |
| Clients | Credit notes register | `/finance/credit-notes` | missing-entirely | `creditNoteNo` is selected, mapped and **searchable** (`finance.ts:280,347,422,439`) and rendered by no screen |
| Clients | Quotations | `/finance/quotations` | missing-entirely | No route/component/query. Settings promises it (`System.tsx:48`); the register's "quote" is a fixture row (`documents.ts:234`) |
| Ops | Case workspace | `/inventory/cases/:id` | partial | Route mounts the **queue narrowed to one row** with a banner (`CasesWorkspace.tsx:129,167,209-227`); `cases.ts:998-999` keeps the §12 item open |
| Ops | Cases queue links | — | 3 stale links | `Pulse.tsx:638`, `Pulse.tsx:1242`, `ExpenseReports.tsx:844` → `/operations?queue=cases`, which `OperationsQueues.tsx:374-376` **deliberately discards**. Silent wrong content, no 404. Cases live at `/inventory/cases` |
| Ops | `operations/shell/` orphan island | — | dead code | 6 files, **1,514 lines**, zero external importers. `tsconfig.json` excludes only `src/archive`, so it compiles and bundles. The live shell is the sibling `operations/OperationsShell.tsx` (277 lines) |
| Calendar | Availability / utilisation | — | missing-entirely | No component; `Calendar.tsx:2316-2321` NotTracked: "no engine computes utilised days against available days" |
| Calendar | Block Equipment dialog | — | missing-entirely | `calendar.ts:508` `unavailable`. Blocked bars render in the seed (`:321,403,417`) with no way to create one |
| Crew | Payouts | `/crew/payouts` | missing-entirely | `CrewBooking.tsx:170-172`, disabled at `:371-375`. **No component at all** — worse than Timesheet |
| Crew | Call sheet builder | — | missing-entirely | `CrewBooking.tsx:135`, disabled `:361-365`. "Call Sheet" is a live document type in schema (`database.ts:189`) |
| Settings | Roles & permissions editor | `?tab=people` | partial | `UsersRoles.tsx:27-42` source constants, `c.test(r)` at `:74`, **zero write path**. The "3 staff roles have excessive permissions" alert (`settings.ts:531`) lands here |
| Settings | Notification + 2FA + screen-lock toggles | `?tab=system` | partial | `System.tsx:80-83, 165, 167` have `on:` and no `settingKey`; `shared.tsx:508-509` `Switch` is bare `useState`. Page admits it (`Settings.tsx:395`). **6 switches incl. 2FA silently revert** |
| Settings | Business hours / holidays / shutdowns | — | built-but-unrouted | `src/archive/BusinessHours.tsx` + `businessHours.ts` (802 lines, `maintenanceDays` `:564`, `nextMaintenance` `:623`) — **zero live readers** |
| Settings | Price list / rate card | — | missing-entirely | 4 prose comments, no implementation. Only rate surface is `/tools/pricing`, "a quote sandbox that books nothing" |
| Settings | Import / Export center | — | missing-entirely | `tools.ts:696-704` blocked (reason now stale — `/clients/import` exists). No inventory/booking/supplier import |
| Settings | Deposit-by-category + cancellation tiers | `?tab=business` | partial | `Financial.tsx:160, :217` NotTrackedYet. Both money rules have no configured value |
| Settings | Automation Center | — | built-but-unrouted | `src/archive/automation/EventTriggers.tsx`, 0 importers; `settings.ts:156` silently redirects `?tab=automation` to System |
| Settings | Notification inbox / broadcast / SMS | — | built-but-unrouted | `src/archive/notifications/` × 3, 0 importers |
| Ops | Suppliers directory | `/operations/suppliers` | missing-entirely | `supplierIntel.ts:3-6`: "There is no supplier directory or profile screen anywhere in this app." The only surface is the rail inside the **unreachable** SubRental screen |

### P3 — Cosmetic, duplicate, or honestly deferred

| Page | Route | Status | Note |
|---|---|---|---|
| 4 report screens with only an icon door | `/reports/{staff,promotions,forecasting,equipment-performance}` | routed, near-unreachable | Each path appears **once** in src outside App.tsx — its `catalog.ts` entry. Only door is a 44×44 unlabelled `<Link>` at `ReportCatalog.tsx:590-604`, three levels deep. `Pulse.tsx:173` even declares Staff `to: null` while `App.tsx:518` routes it |
| 26 of 43 catalog reports | — | partial | `route:null` + `projection:null` → render their `needs` sentence. Deliberate and disclosed (`catalog.ts:576-580`). *(UNVERIFIED count)* |
| Presence Log & Timesheet | — | built-but-unrouted | `settings/Timesheet.tsx` 55 lines, zero importers. Renders an honest EmptyState — routing it would expose the gap, not close it |
| Deep-link to a client-detail tab | `/clients/:id?tab=…` | missing | `ClientDetail.tsx:306` tab is `useState`. Every inbound link lands on Overview |
| Client contacts / communication log / equipment history / activity trail | — | missing / partial | `client_contacts` = 0 rows, no query. Notes tab is one textarea that cannot persist. Activity tab is 4 derived one-liners (`ClientDetail.tsx:1228-1231`) |
| Client statement of account | — | missing-entirely | No entry in the 43-report register; group 05 has 3 reports, 2 with `route:null` |
| Refunds register | `/finance/refunds` | missing-entirely | Refund is a per-row modal only; no chip, no list |
| Memberships standalone | `/clients/memberships` | routed-but-unreachable | Duplicate URL; the tab works (`Clients.tsx:228`) |
| Finance ▸ Documents | `/finance/documents` | routed-but-unreachable | Third URL for one component; only refs are tests + archive |
| Audit Settings | `/admin/audit-settings` | routed-but-unreachable | Same component as `/admin/audit` (`App.tsx:649` vs `:658`), which is linked 5×. Survived the 15 Aug consolidation |
| Per-asset depreciation | — | missing-entirely | `grep -c 'epreciat' AssetDetail.tsx` = **0**. Only `/tools/depreciation`, unlinked from Inventory |
| Rentals Timeline view | `/rentals` | partial | Honestly disabled with reason (`RentalsList.tsx:1423,1442`) |
| Evidence from list/detail | — | affordance gap | `booking.ts:317-322` has 4 verbs, no Evidence. `grep -ci evidence BookingDetail.tsx` = **0** |
| Calendar day URL write-back | `/calendar?d=` | partial | **The day IS addressable** (`Calendar.tsx:1449,1494-1496`). Only `pickDay` (`:1724-1727`) fails to write back |
| Tools "Equipment Health" card | → `/inventory` | wrong tab | `tools.ts:675-683` promises "Inventory ▸ Maintenance", lands on Equipment |
| Membership plan admin | — | missing-entirely | Plans are read-only; no create, no assign → feature is read-only end to end |
| AI Assistant settings / AI Warehouse Assistant / PR filter | — | missing | `archive/ai/AiAssistant.tsx` 0 importers; `Warehouses.tsx:1774`; `PurchaseRequests.tsx:288-289` |
| SystemRestoreModal | — | unrouted **by design** | `BackupRestore.tsx:866`: "deliberately NOT mounted here any more." Not a gap |

---

## Cross-cutting patterns worth naming

1. **Read-frozen / write-live split** — 5 screens read a hardcoded seed while their create/approve action writes to Postgres: Bundles, Maintenance, Warehouses, Purchase Requests, Membership. **This is what "the page is missing" feels like from the operator's chair.** It is the highest-value cluster on this list.
2. **UUID vs code mismatch** — 8 call sites pass `clients.id` into a route that queries `client_code`. One-line class of bug, P0 blast radius.
3. **Finance tabs are local state** — no Finance tab except the four with sibling routes is linkable. This is why Invoices *and* the 43-report Catalog *and* 32 reports all have no address.
4. **Four live links that 404**: `/automation` ×2 (`ExpenseReports.tsx:637, :696`), `/notifications` (`AlertsPanel.tsx:129`), `/system` (`tools.ts:666` → whole-card anchor). All four render as normal, working links.
5. **Three action files finished and never imported**: `createInvoice.ts` (implemented:true, 558 lines), `LateFeePanel.tsx` (277 lines), `closeRental.ts`.

## Uncertainty flags

- **2a and 2d were re-checked directly by the main session and are now CONFIRMED**, not UNVERIFIED:
  - *2a* — `Bundles.tsx` imports `ACTIVE_BUNDLES`/`ARCHIVED_BUNDLES` (`:26-27`) and consumes them at `:414, :431, :491, :496, :498, :501, :506, :509, :694-695`. `grep useList Bundles.tsx` = 0. `grep -rn listBundlesWithItems src/` outside its own definition file = **0 callers**. A created bundle can never reach this screen.
  - *2d* — `src/App.tsx` declares no static `/inventory/bundles`; its `/inventory/*` paths are `:281, :294, :303, :312, :321, :337 (:assetId), :346 (bundles/new), :385, :396`. With no static match, `/inventory/bundles` resolves to `:assetId` and renders AssetDetail's not-found state.
- **Still UNVERIFIED (finder-only):** Integrations screen absence, and the 26-of-43 report count.
- Also note `src/data/nav.test.ts:90` asserts `isMoneySurface('/finance/invoices')` — the test suite already encodes an invoices route that `App.tsx` does not declare.
- **Line drift ±2** was observed on several citations during verification (e.g. `ClientDetail.tsx:1128` → `:1129`; `createInvoice.ts:309` → `:255`). Treat line numbers as near-anchors, file paths as exact.
- **Dropped as REFUTED:** "crew booking is missing entirely" (the modal exists; the action is a stub), "asset detail is unreachable" (reachable from Stock Check + 8 screens), "client detail unreachable from rentals area" (NewRental links it twice), "no aging buckets anywhere" (they render, hardcoded, on `/reports/clients`), "the calendar day is not addressable" (it is).