# Layer D Verification — the consolidated register

**Subject:** every Layer D line in `docs/booqable/REFERENCE_SPEC_v2.5.md` (13 screens + the 17-page
Settings compendium), checked against this repo and the live Supabase project.
**Verified:** 31 Aug 2026 · read-only (SELECT only; no migration applied, no row written).
**Method:** repo read + live DB via the Supabase MCP route. `npm run check:db` was **not** used —
run bare it connects as `anon`, RLS filters all 23 tables to zero, and it reports zeros that are not
real.

**Trust boundary.** v2.5's **Layers A, B and C were observed live and are trusted**. Its **Layer D**
was written from the spec's own §2.4 contract list, which `CORRECTIONS.md` had already shown to be
wrong in at least six places. Every Layer D line was therefore treated as unverified input and
checked individually.

---

## 1. Headline

**93 of 329 Layer D claims survived — 28%.** Just over a quarter of v2.5's backend data link is
correct as written. The other 236 claims are wrong in one of four ways:

| Verdict | Claims | Share | What it means |
|---|---:|---:|---|
| **CONFIRMED** | 93 | 28.3% | The named thing exists and is what v2.5 says it is |
| **GAP** | 110 | 33.4% | Nothing in the repo or DB serves this; it is not built |
| **MISLEADING** | 85 | 25.8% | It exists, but v2.5 describes its behaviour, scope or gating incorrectly |
| **WRONG-NAME** | 34 | 10.3% | Something real serves this, under a different name |
| **UNVERIFIABLE** | 7 | 2.1% | Cannot be settled from the repo or the DB |
| **Total** | **329** | | across 14 sections |

**What this means for anyone about to build from v2.5.**

1. **A third of the Layer D document is a specification, not a description.** 110 GAPs. v2.5's
   present tense ("source `bookings`", "engine `kpiEngine`") reads as a description of a built
   system on lines where nothing is built. Nine of the fourteen sections describe screens with **no
   database access at all**: `/calendar`, `/documents`, all ten `/reports/*`, `/admin/activity-log`,
   Maintenance, Bundles, and `/settings` bar two panels. Reading v2.5 as an as-built document will
   cost you the estimate on every one of them.

2. **The most dangerous verdict is not GAP, it is MISLEADING.** 85 claims name a real thing and
   describe it wrongly — usually its *gating*. A GAP fails loudly at build time. A MISLEADING line
   compiles, ships, and is wrong in production: `next_document_number({kind:…})` typechecks and
   fails at **runtime**; gating the activity feed with `useCanViewMoney` produces a panel the entire
   warehouse floor cannot see, because the real gate is `AUDIT_READ_ROLES`.

3. **§2.4 is the root error and it propagated to every screen.** Its 19-module engine list (the real
   `src/lib` has 37 modules plus four subdirectories) is what let §15 build its whole
   company-performance block on `kpiEngine`, a module with **zero importers**. Its invented
   contract names — `inventory_units`, `occurred_at`, `booking_facets()`, `bundle_items.component_price`,
   `discount_policies`, `ClickableRow` — were copied forward verbatim into six sections.
   **§5 of this document replaces §2.4. Do not read §2.4 again.**

4. **There is a repeating failure pattern this pass named: the fully-built, fully-tested, entirely
   unwired module.** `facetCounts.ts`, `bookingQuery.ts` (`fetchCanonicalBooking`, 2,568 lines),
   `queries/bundles.ts`, `kpiEngine.ts`, `auditForRecord()`. Each looks authoritative in a grep,
   each has zero callers in `src/`, and each is cited by v2.5 as though it were live. **Before
   citing any module as "already does X", grep for its importers.**

5. **Several screens are empty for corpus reasons, not code reasons, and the difference must be
   stated in every PR.** Live: `bookings` 200 rows but `Booked`/`Packed` = **0** (so the Dashboard's
   Going-out panel is structurally empty on every date); `booking_lines` 0; `product_units` 0;
   `invoices` 0; `payments` 0; `inventory_reservations` 0. A correctly built revenue tile returns
   Rs 0 over 150 August bookings and will be filed as a bug by whoever sees it first.

---

## 2. How to read this register

Verdict vocabulary is exactly the five words in the table above. Every verdict in the per-screen
files carries a `file:line` or the SQL that produced it. **A claim that was not actually executed is
recorded as UNVERIFIABLE, never as CONFIRMED** — §8 lists all seven and what would settle each.

Standing cautions that shaped the method, and that apply to anyone re-running this work:

- **Migration headers in this repo lie.** The `NOT APPLIED` lines in `supabase/migrations` are stale
  and have caused three wrong diagnoses. Facts here come from `pg_proc`, `information_schema`,
  the grant tables and the rows — never from a migration header. (`create_booking` is 0063 and
  **applied**, not 0059 and pending; `0008_automation_comms` **is** applied.)
- **This repo is edited concurrently.** Substance in these files holds; **line anchors drift**. Two
  page docs were already ~24 and ~95 lines out of date within this pass. Re-grep before quoting a
  line number.
- **The MCP session runs as `postgres` with `rolbypassrls`,** so `auth_user_role()` resolves to
  `'Client'` and every `_v` view returns zero rows for gate reasons. **No per-role RLS behaviour was
  confirmed by execution anywhere in this pass.** See §8.

---

## 3. Per-section register

| v2.5 § | Screen / route | Claims | ✅ CONFIRMED | ⚠ WRONG-NAME | ✖ GAP | ◐ MISLEADING | ? UNVERIFIABLE | Detail |
|---|---|---:|---:|---:|---:|---:|---:|---|
| §4 + §5 | Dashboard + order sidebar → `/dashboard` | 42 | 16 | 6 | 12 | 8 | 0 | [layer-d/dashboard.md](layer-d/dashboard.md) |
| §9 | Bookings list → `/rentals` | 38 | 15 | 3 | 14 | 6 | 0 | [layer-d/bookings-list.md](layer-d/bookings-list.md) |
| §10 | Booking detail → `/rentals/:bookingNo` | 27 | 8 | 3 | 8 | 8 | 0 | [layer-d/booking-detail.md](layer-d/booking-detail.md) |
| §11 | Calendar → `/calendar` | 19 | 7 | 2 | 5 | 4 | 1 | [layer-d/calendar.md](layer-d/calendar.md) |
| §12 | Inventory · Downtime · Product detail | 22 | 5 | 4 | 8 | 4 | 1 | [layer-d/inventory.md](layer-d/inventory.md) |
| §13 | Product Settings · Variations · Clients | 16 | 4 | 1 | 3 | 8 | 0 | [layer-d/product-settings-clients.md](layer-d/product-settings-clients.md) |
| §14 | Accounts · Documents register · Reports index | 21 | 5 | 3 | 7 | 5 | 1 | [layer-d/accounts-documents-reports.md](layer-d/accounts-documents-reports.md) |
| §15 | Report pages — Company performance & Availability | 20 | **1** | 5 | 9 | 5 | 0 | [layer-d/report-pages.md](layer-d/report-pages.md) |
| §16 | Coupons and Activity logs | 16 | 3 | 2 | 6 | 5 | 0 | [layer-d/coupons-activity.md](layer-d/coupons-activity.md) |
| §17 | Quotes/Contracts registers · Fulfillment · Background tasks | 21 | 8 | 0 | 7 | 4 | 2 | [layer-d/quotes-contracts.md](layer-d/quotes-contracts.md) |
| §18 | Bundles · Cross-sell · Online store · Packing slip · Quote | 23 | 9 | 2 | 5 | 6 | 1 | [layer-d/bundles-store.md](layer-d/bundles-store.md) |
| §19 | Collections · Settings ▸ Emails · Contract document | 19 | 2 | 1 | 7 | 8 | 1 | [layer-d/collections-emails.md](layer-d/collections-emails.md) |
| §20 | Pro forma · Rental period · Custom fields · Security | 21 | 5 | 1 | 9 | 6 | 0 | [layer-d/proforma-security.md](layer-d/proforma-security.md) |
| §21 | The Settings compendium — all 17 pages | 24 | 5 | 1 | 10 | 8 | 0 | [layer-d/settings-compendium.md](layer-d/settings-compendium.md) |
| | **Total** | **329** | **93** | **34** | **110** | **85** | **7** | |

> ✅ **§15's detail file was recovered, 31 Aug 13:30.** The harness blocked that subagent's file
> write, so the long-form write-up briefly existed only as transcript text. It was extracted from
> the run log verbatim and written to [`layer-d/report-pages.md`](layer-d/report-pages.md), complete
> with its per-claim `file:line` anchors; the only edit was dropping the harness note that sat above
> the title. All fourteen sections now carry their citations in full.

**Worst-scoring sections:** §15 (1 of 20), §19 (2 of 19), §16 (3 of 16), §13 (4 of 16).
**Best-scoring:** §4+§5 (16 of 42) and §9 (15 of 38) — the two screens that are genuinely built and
genuinely DB-backed. The correlation is exact: **v2.5's Layer D is accurate where we have shipped a
screen and fabricated where we have not.**

---

## 4. The consolidated gap list

Everything v2.5 names that is not built, deduplicated across sections. "Screen(s)" names who needs
it, not who mentions it.

### 4.1 Built, tested, and entirely unwired — the highest-value class

Nothing here needs to be *built*. Each is a call-site job that someone will otherwise rebuild from
scratch because a grep made it look done.

| Module | State | Screen(s) that need it |
|---|---|---|
| `lib/queries/facetCounts.ts` (`countFacet`, `useFacetCounts`) + `FilterOptionList` | `countFacet` imported only by its own test; `useFacetCounts` zero callers; `FilterOptionList` mounted only in its own test. **No screen in this app shows an option count today.** | `/rentals`, `/clients`, `/inventory` (categories), `/documents`, Finance → Invoices, `/reports/*` |
| `lib/bookingQuery.ts` — `fetchCanonicalBooking`, `priceCanonicalBooking` | 2,568 lines, fully tested, **zero callers in `src/`** outside its own test. All of §10.6 describes it. | `/rentals/:bookingNo` (which uses four different functions), Dashboard's Law 2 escape hatch |
| `lib/queries/bundles.ts` | Zero callers. The only DB read of `bundles`/`bundle_items` in the codebase. Both bundle screens render seed constants. | `/inventory` Bundles tab, `/inventory/bundles/new` |
| `lib/kpiEngine.ts` | **Dead code.** Zero importers anywhere in `src/`; all six exports uncalled; typed against the `RentalRow` seed; no delta contract. | Named by v2.5 as the engine behind `/reports` company performance **and** the `/rentals` metric strip |
| `lib/queries/audit.ts` → `auditForRecord(table, id)` | Exists at `:294`, **zero callers**. | BookingDetail Activity Timeline (a `NotWiredNote`), AssetDetail History tab, ClientDetail activity tab |
| `lib/availability.ts` + `lib/queries/availability.ts` | Built and rule-complete (`selectUnitsForLine`, `explainShortfall`, `rankLeastUsed`, `planAssignment`, `reserveAssignedUnits`, `releaseReservations`). | `/calendar` Availability tab (an `EmptyState`), booking-detail per-line "N left" |
| `lib/csv.ts` | Three importers (ReportToolbar, ImportCenter, Pulse); `/rentals` is not one. | `/rentals` Export (a `disabled` button) |
| `lib/operationalDay.ts` | Built, ruled (D4) and read by `queries/bookings.ts`. Imported by **no report**. | `/reports/*` period windows, which run on Kathmandu midnight instead |
| `formatOverage` (`lib/lateFee.ts:272`) | The repo's only duration formatter; not in `lib/format`. | Every report that renders a duration |
| `Delta` / `pctDelta` / `countDelta` (`Pulse.tsx:204-232`) | Local to one report; not promoted to an engine. | Any second report with a comparison |

### 4.2 Screens with no data path at all (seed-only)

| Screen / route | What it actually reads | v2.5 § |
|---|---|---|
| `/calendar` | `src/data/calendar.ts` — 10 seed resources. Zero imports from `lib/supabase`, `lib/queries/*` or `src/actions/*`. | §11 |
| `/documents` **and** `/finance/documents` (same component, two crumbs) | `src/data/documents.ts` constant array | §14, §17, §19 |
| All ten `/reports/*` routes | seed modules (`data/pulse.ts`, `data/forecastingReports.ts`, `data/liquidityReports.ts`…) | §15 |
| `/admin/activity-log` | `src/data/activityLog.ts` — 8 hand-written rows | §16 |
| `/admin/audit` (Audit Settings) | `src/data/audit.ts` fixture (`audit_settings` table exists, 0 rows, no reader) | §21 |
| Maintenance / Downtime | `src/data/maintenance.ts`; imports neither supabase nor `lib/queries` | §12 |
| Bundles (both screens) | `src/data/addBundle.ts` / `src/data/bundles.ts` | §18 |
| `/settings` (all 21 keys) | **browser `localStorage`** `br.settings.*`. Exceptions: People ▸ Staff directory (`staff_directory_v`) and System ▸ Device PIN (RPCs). | §19, §20, §21 |
| `/tools/depreciation` | 8 hand-typed seed rows | §12 |

### 4.3 Live tables with zero readers and zero writers in `src/`

All exist. All are wiring jobs, **not migration jobs**. Writing a migration for any of these
duplicates schema that is already there.

| Table(s) | Rows | Screen(s) that need it | v2.5 § |
|---|---:|---|---|
| The eleven `0008_automation_comms` tables — `notification_templates`, `message_logs`, `document_deliveries`, `sms_gateways`, `broadcast_batches`, `automation_rules`, `automation_logs`, `webhooks`, `notifications`, `client_channel_identities`, `client_marketing_consents` | 0 | Settings ▸ Emails (entire surface) | §19 |
| `document_registry`, `booking_documents`, `signatures` | 0 | `/documents`, quote document, contract/Rental Agreement, packing slip | §14, §17, §18, §19 |
| `coupons`, `coupon_redemptions` | 0 | a coupons screen (no route, no module, no query, no action) | §16 |
| `maintenance_records`, `depreciation_logs` | 0 | Downtime module, depreciation/ROI report | §12 |
| `security_deposits`, `deposit_movements` | 0 | Deposit Received / Pending on booking detail | §10, §20 |
| `client_tax_profiles` (effective-dated, evidence-backed, 6 profile types) | 0 | client tax handling — v2.5 files this as a GAP; **it is a fully-modelled table** | §13 |
| `crew_members`, `crew_bookings`, `crew_assignments`, `crew_leaves` | 0 | a crew axis on `/calendar` | §11 |
| `fulfillment_outcomes` | 0 | product fulfillment report | §17 |
| `sync_outbox`, `sync_inbox`, `sync_log`, `sync_conflicts`, `sync_state` | 0 | Background tasks screen | §17 |
| `system_settings` (key/value jsonb, RLS on, 2 policies) | 0 | **every setting on `/settings`**, incl. `operationalDayStart` | §19, §20, §21 |
| `audit_settings` | 0 | `/admin/audit` | §21 |
| `booking_stage_transitions` | — | booking-detail Activity timeline | §10 |
| `purchase_requests` (route `/inventory/purchase-requests` exists) | 0 | "Expected stock (incoming)" | §12 |
| `portal_users`, `portal_sessions`, `portal_auth_challenges` | 0 | client portal accounts. **RLS ON with ZERO policies = deny-all: a screen written against these gets an empty result and NO ERROR.** | §13, §14, §21 |

### 4.4 Money, deposits, pricing

| Gap | Screen(s) | v2.5 § |
|---|---|---|
| No invoice creation path anywhere in `src/actions/` — no `createInvoice`, `issueInvoice` or `finalizeInvoice`. The whole Finalize/Send two-step is unbuilt. | Finance → Invoices, `/documents` | §14, §20 |
| No pro-forma / unnumbered-invoice state: `invoices.invoice_no` is `not null` and status starts at Draft, so §14.2's two populations cannot both be stored | Finance | §14 |
| No revision link column on `invoices` (a `-R1` suffix is *representable* — no format CHECK — but nothing relates a revision to what it revises) | Finance | §14 |
| Deposit resolution chain global → product → client: **none of the three levels built.** No global deposit key in `settingsStore`; `products.deposit_percent`/`deposit_fixed` unread; `bookings.deposit_required` is caller-supplied, default 0 | booking detail, product settings, Settings | §10, §12, §21 |
| Cost fallback `unit.purchase_price` → `product.purchase_price` — not built; the product-level column is never even selected | inventory, asset detail | §12 |
| Depreciation / ROI engine — does not exist | `/tools/depreciation`, asset reports | §12 |
| Per-component bundle pricing — **`bundle_items` has 10 columns and not one carries a rate, discount or price.** The screen computes a full pricing table and discards it | bundles | §18 |
| Per-line charge/rate on booking detail — `FLOOR_COLUMNS` names no money column | `/rentals/:bookingNo` | §10 |
| Rental total / outstanding on list rows — structurally blocked: `CanonicalEngineInput` types `crew`, `transport`, `vatPercent` and `payments` as literal `null` | `/rentals` | §9 |
| `Cash due` KPI — renders the literal `Not tracked yet`; no derivation exists | `/dashboard` | §4 |
| Replacement-cost aggregation onto a document — `invoices` has no such column | quote/contract documents | §20 |
| VAT source for a Quote — no VAT column on `bookings`, no finance-settings table, and `recalculate_invoice_totals()` hardcodes `0.13`, the exact thing `money.ts:94` forbids | booking detail, invoicing | §10 |
| `standing_discount_pct` — no column on `clients`, none proposed. The UI field is seed-only, editable, and saved by a **stub** — the worst of the three possible states | `/clients/:code` | §13 |
| No pricing-template or seasonal-ruleset object anywhere | Settings ▸ Pricing | §21 |
| No payment-provider concept; `bank_accounts` (2 rows) unreachable from Settings | Settings | §21 |
| No AOV series in any figures source; `figuresFor()` has no such bucket | `/reports/*` | §15 |
| Invoice `due_date` never auto-derived from `paymentTermsDays` (whose only consumer is its own display row) | Finance | §21 |

### 4.5 List and filter mechanics

| Gap | Screen(s) | v2.5 § |
|---|---|---|
| Faceted option counts — see §4.1 | everywhere v2.5 shows a count beside a filter option | §9, §13, §14, §15, §19 |
| **No user-facing sort on `/rentals`** — zero hits for `aria-sort`/`onSort`/`setSort`/`sortBy`; every `<th>` is plain text; server sort is a fixed `pickup_at ASC` | `/rentals` | §9 |
| No row selection, no select-all, no bulk Actions menu — the whole §9.4 mutating-control story | `/rentals` | §9 |
| Export pipeline — `/rentals`' button is `disabled`, pending two PLAN.md §4.22 decisions (format; which columns a role may export — a full-column CSV walks around Law 6) | `/rentals` | §9 |
| No `payment_status` column and no `tag` column on `bookings` — two of v2.5's four named chip groups have no source at all | `/rentals` | §9 |
| Two simultaneous date bounds in one `ListFilters` (`dateRange` is a single object). *Not* column naming — `listQuery.ts:48` has had a `column` field since it was written | Finance, `/rentals` | §14 |
| The four-way "Attention required" exception facet group (starting today / ending today / overdue start / overdue end) — zero occurrences in `src/` | inventory, `/rentals` | §12 |
| Column-chooser persistence — `hiddenCols` is `useState`, so a refresh restores every column while every filter survives in the URL | `/rentals` | §9 |
| Date-heading grouping in either Dashboard panel — rows are flat | `/dashboard` | §4 |
| No status facet on any report — `ReportFilters` carries a `chips` member no report passes | `/reports/*` | §15 |

### 4.6 Routes and controls that do not exist

| Gap | Note | v2.5 § |
|---|---|---|
| `/reports` **index** | `/reports` is a `Navigate` redirect to `/reports/pulse`; the catalog renders as a tab inside Finance. `CatalogReport` has no `question` field and no `roles` field, and its ten groups are subject-based, not audience-based | §14 |
| `/reports/pickups` (product fulfillment) | must `import { todaysOutgoing }` from `queries/bookings:529`, never restate the filter | §4, §17 |
| `/reports/availability` | a new screen, not a wiring job | §15 |
| `/reports/documents/*` (Quotes and Contracts registers) | no quotes tab, no contracts tab, no `Confirmed`/`Signed` columns, no amount column | §17 |
| Background tasks screen | no route, no module, no component; `offlineQueue.ts` and the five `sync_*` tables are headless | §17 |
| Coupons screen | no route, no module, no query, no action | §16 |
| Collections / category management | no create/rename/reorder/reparent action for `inventory_categories` | §19 |
| **`View late`** (both Dashboard footers) | the string appears nowhere in `src/`. And `overdue()` **cannot** serve `activity=pickup` — it is hardcoded to `return_at` + stage `On Rent`. A `latePickups(nowAd)` is **new work**, not a parameter | §4 |
| Overdue Receivables report | `data/liquidityReports.ts` is a hand-typed fixture | §14, §19 |
| iCal / Subscribe feed | no route, no edge function (only `booqable-proxy` exists), no token table, no revocation path | §11 |
| Away mode / blackout ranges | the only one of §20.5's six "unused features" with **no table, no column and no code** | §20 |
| Amber-pill overdue treatment in a date cell | overdue exists only as a chip and a KPI total | §14 |
| Per-product ⌄ expansion on the calendar axis | the axis is a flat 10-row seed list | §11 |

### 4.7 Documents, numbering and generated prose

| Gap | Note | v2.5 § |
|---|---|---|
| `next_document_number('quote')` | **zero call sites in `src/`**; the live `quote` sequence has never minted (`current_value` = 0) | §17 |
| `next_document_number('invoice')` | comments only. `CreateInvoiceModal.tsx` contains no supabase, no `.rpc(`, no `.insert(`. The `invoice` row exists (`INV-`, 120) and nothing calls it | §14, §17, §20 |
| Packing slip | entirely unbuilt — no route, component, query, action or template. **And no `packing_slip` key in `number_sequences`**, so it cannot be numbered today | §18 |
| Quote document | unbuilt. Note the enum labels disagree per table: `document_registry` wants `'Quotation'`, `booking_documents` wants `'Quote'` | §18 |
| Contract / "Rental Agreement" template | none anywhere in `src/` — not per-language, not versioned, not bound to anything. Our enum label is **`Rental Agreement`**, not "Contract" | §19 |
| Document signature path | `signatures` cannot serve it (session-keyed, floor roles only); document-scoped signing lives on `document_registry.signed_at`/`signature_url`, unread | §18, §19, §20 |
| `'transfer'` and `'DOC'` sequence keys | neither exists in `number_sequences`; `createStockTransfer.ts:268` and `createDocument.ts:21` both need them | §17, §20 |
| **`sync.ts`'s five wrong sequence keys** | `'EQ'`, `'CL'`, `'BK'`, `'PAY'`, `'DEP'` at `sync.ts:462/799/926/1212/1236/1240/1247` — none exists; all seven raise at runtime. The parameter is typed `sequenceKey: string`, so it typechecks | §17 |
| Prose-from-structure generator (bundle descriptions) | nothing in `src/` | §18 |
| Sentence-template registry (audit) | nothing in `src/`; `/admin/audit-log` renders a table, not sentences. Live data offers only three (module, action) pairs — far too coarse to render "Pick up CFX-A-LEX-002 on Booking #898" | §16 |

### 4.8 Audit and activity

| Gap | Note | v2.5 § |
|---|---|---|
| Dashboard activity feed | no code under `src/modules/today/` reads `audit_events`; "Load 10 more" does not exist | §4, §16 |
| Per-entity audit scoping | `auditForRecord()` has zero callers; `AssetDetail.tsx:942-948` tells the operator "the audit trail is not wired to equipment records" — **false about the trail, true only about the screen** (192 `product_units/Create` rows already exist) | §12, §16 |
| Audit trigger on `coupons` and `booking_discounts` | neither has one. Only six tables do. A coupon action must call `logAuditEvent()` explicitly | §16 |
| `audit_action` has no send/deliver/email label | so an email dispatch cannot be audited. Do not log a dispatch as `Update` | §19 |
| Actor **name** rendering | `users_select_own` is self-scoped, so a `users` embed resolves for the viewer alone. Build the actor filter on `actor_role`; real names need a new view plus an RLS decision | §16 |
| Booking → audit-log link | no `auditForRecord`, no `/admin/audit-log` link in `BookingDetail.tsx` | §5 |

### 4.9 Components, accessibility, presentation

| Gap | Note | v2.5 § |
|---|---|---|
| **`ClickableRow`** | does not exist. `Table.tsx`'s `onRowClick` is not a substitute: no `tabIndex`, no `role`, no Enter/Space, no 44px floor, not exported from the barrel, Tailwind-classed so it compiles to nothing here. `MovementList` and `/rentals` do not use `Table.tsx` anyway | §4, §9 |
| `deliveryTypeLabel()` inverse map | does not exist anywhere in `src/` — **the direct cause of all six confirmed Law 17 breaches.** Fix with one function plus a test that RENDERS a component and asserts DOM text; the three existing Law 17 tests assert over static constants and structurally cannot catch this class | §13 |
| Per-KPI ⓘ definitions | `CardModel` has no `definition` member; `DEFINITIONS` is keyed by `ChartView`, so the chart has a definition and the six tiles do not | §15 |
| Self-explaining zero (§10.3's tooltip pattern) | nothing implements it. Worth stealing deliberately — **into the deposit engine when it is written**, not bolted onto a screen | §10 |
| Section-header counts and a side-by-side Paid\|Due pair on the booking rail | `SummaryRows` stacks label/value; no `Card` title carries a count badge | §5 |
| `LineChart` is single-series | so a compared line chart is impossible; Pulse already falls back to `GroupedBars` | §15 |
| No `previous year` comparison | `ReportCompare` is only `'off' \| 'previous'` | §15 |

### 4.10 Inventory and operations

| Gap | Note | v2.5 § |
|---|---|---|
| **D1 backfill is 100%, not a top-up** | `purchase_price`, `replacement_value`, `purchase_date`, `deposit_percent`, `deposit_fixed` are NULL on **204/204** products — 0% coverage. Backlog I3 sampled 178; it is worse | §12 |
| `product_units` is empty | 0 rows now, **192 rows before a reseed** (192 `Create` audit rows survive). A products-only backfill will not finish the job | §12 |
| Downtime read **and** write path | no query module and no action targets `maintenance_records` | §12 |
| `maintenance_status` / `maintenance_type` enums | both exist and are **bound to zero columns anywhere in the schema**; `maintenance_records.status`/`.maintenance_type` are unconstrained `text`. Bind before writing any downtime code | §12 |
| maintenance → `product_units.status` link | no trigger, no constraint. **Gear "on downtime" remains assignable** | §12 |
| Overlap guard on `maintenance_records` | no range column exists, so the `inventory_reservations_no_double_booking` GiST precedent cannot be applied without a migration | §12 |
| Per-product buffer **reader** | `prep_time_minutes` / `cleaning_time_minutes` are written and surfaced but never read; availability takes turnaround from the global `rentalTurnaround` setting only. §12.5 calls this STILL OPEN — **it is answered and merely unwired** | §12 |
| Purchase-date column on any inventory surface | both `products.purchase_date` and `product_units.purchase_date` exist | §12 |
| Serial removal from a booking line | **must never be a DELETE** — `reject_delete_nothing_is_deleted` is wired BEFORE DELETE on `booking_line_units`. Booqable's × does not port | §10 |
| Crew axis as a view | crew exists only as two seed rows behind a Row Type filter | §11 |
| "Expected stock (incoming)" | `purchase_requests` (0 rows) with a route is closer to a purchasing flow than §12.6 assumes | §12 |
| Structural exclusivity for bundle components | only `booking_lines_bundle_child_is_free` exists, and it constrains **price**, not exclusivity. `bundle_items.is_mandatory` is never written by `createBundle` | §18 |

### 4.11 Settings, security, portal

| Gap | Note | v2.5 § |
|---|---|---|
| `system_settings` unreferenced | exists live (key/value jsonb, RLS on, 2 policies, 0 rows) and **zero readers in `src/`**. Every setting including `operationalDayStart` lives in per-browser localStorage — so **every "today" panel is per-browser**, and a printed contract would say whatever the generating machine had set | §19, §20, §21 |
| Require 2FA for all users · Email confirmation for new devices · IP Restrictions · Single sign-on | all four absent | §20 |
| Two **inert** switches | Two-factor authentication and Shared-device screen lock render as `role=switch` with `aria-checked`, flip under the thumb, and forget on reload — claiming a security posture the build does not have | §20 |
| `passwordPolicy` (Strict/Standard) | nothing in `src/` reads the key | §20 |
| Feature-flag registry | `settingsStore` has 21 keys, none a rollout flag | §20 |
| Rental-period channel scoping, period modes, `Enable time selection` | no channel dimension, no `apply_to_manual_bookings` flag, no per-role override. "Dates and times" is hard-wired by the `tstzrange`/`timestamptz` schema | §20 |
| **Custom fields** | nothing in repo or DB. No table matches `%custom%` or `%field%`; all three named scopes (`clients`, `bookings`, `products`) are fixed-column tables. **A custom field today is a migration** | §13, §20, §21 |
| Near-duplicate field-name warning | no field-creation surface to warn on | §20 |
| Plan / seats / billing / API-quota surface | none | §21 |
| Staff-as-client | `client_flag_type` labels are `{VIP, Blocked, Upgrade Candidate}`; no Staff label | §21 |
| Category tree | `inventory_categories.parent_id` exists and is **NULL on all 6 live rows** — a hierarchy UI built now renders six roots and no children. `name` is constrained to the 17-member `product_category` enum | §19, §21 |
| RLS policies for the three portal tables | must be written **in the same change** as the first portal screen | §13, §21 |
| Client barcode | no column on `clients` or `client_directory_v`, no scanner reference in `src/modules/clients/`. `@zxing` **is** in the stack — only the column and the wiring are missing | §13 |
| Customer-facing translation overrides | our i18n is back-office only | §21 |

### 4.12 Out of scope by design — record as a boundary, not a gap

- **Cross-sell** — no counterpart at any layer, none planned pre-bridge.
- **Online store** — no visibility flag, excerpt, page title or SEO column on `products` or
  `bundles`. Our four text fields (`description`, `notes_internal`, `notes_warehouse`,
  `notes_rental`) are **all internal-audience**; the two-descriptions split v2.5 attributes to us
  does not exist.
- **All nine Booqable Online-bookings pages**, Payment providers, Document templates / Custom CSS,
  Translations, Account & billing.

---

## 5. THE CORRECTED CONTRACT LIST

> ### ⛔ THIS SUPERSEDES `REFERENCE_SPEC_v2.5.md` §2.4 IN FULL.
> §2.4 is the root error of this entire document: it invented names, dropped real ones, and got an
> RPC signature wrong, and every screen section then copied it. **Do not read §2.4 again. Do not
> cite it. Do not build from it.** Everything below was verified to exist this pass, in the repo or
> in the live database, by the file:line or SQL recorded in the per-screen files.

### 5.1 Tables — verified live

Row counts are live as of 31 Aug 2026. **`0 rows` means empty corpus, not missing schema.**

| Table | Rows | Notes that change how you build |
|---|---:|---|
| `bookings` | 200 | stage: Returned 130 · Closed 60 · Quote 7 · On Rent 3 · **Booked 0 · Packed 0**. `actual_return_at` NULL on all 200. Window columns are **`pickup_at` / `return_at`** |
| `booking_lines` | **0** | `voided_at` (Law 3). `days:int`, **no date column**. Money cols: `rate`, `discount_amount`, `supplier_cost`, `markup_amount` |
| `booking_line_units` | 0 | `packed`, `packed_at`, `packed_by`, `packing_session_id`, `unit_state`. `reject_delete_nothing_is_deleted` wired BEFORE DELETE |
| `booking_flags` | — | CHECK admits **only** `Returned Early \| Overdue \| Missing \| Damaged`. **`Partial Pickup` is not storable** |
| `booking_discounts` | 0 | `coupon_id` present. CHECKs `booking_discounts_hard_cap` (0-25) and `_over_ten_needs_reason_and_approver`; trigger `enforce_booking_discount_stacking`. **No audit trigger** |
| `booking_stage_transitions` | — | carries **`occurred_at`** — the only table that does. No query module |
| `booking_documents` | 0 | `doc_type` = `booking_document_type`, labels include **`Quote`**, `Packing List` |
| `clients` | 366 | all `Individual`, 0 `Organisation`, 0 deactivated. Enum is `{Organisation, Individual}` — **"Company" is Booqable's word** |
| `client_flags` | — | `client_flag_type` = `{VIP, Blocked, Upgrade Candidate}` |
| `client_tax_profiles` | 0 | `customer_tax_profile` = `{VAT Registered, Non-VAT Customer, Tax Exempt, Government Organization, NGO, Corporate}`; `effective_from`, `superseded_at`, `exemption_document_id`. **Fully modelled, unwired** |
| `products` | 204 | `purchase_price`, `replacement_value`, `purchase_date`, `deposit_percent`, `deposit_fixed` **all NULL on 204/204**. `prep_time_minutes` / `cleaning_time_minutes` in **minutes** |
| `product_units` | **0** | was 192 before a reseed. `purchase_price` (**not `purchase_cost`**), `serial_no`, `asset_tag`, `barcode`, `qr_code`, `status` |
| `inventory_categories` | 6 | `sort_order` 1..6; `parent_id` **NULL on all 6**; `name` constrained to the 17-member `product_category` enum. **No `inventory_categories_v`** |
| `inventory_reservations` | 0 | `inventory_reservations_no_double_booking` — `EXCLUDE USING gist (asset_id =, period &&) WHERE released_at IS NULL`. **OS-owned** (PLAN.md §4.30(a)) |
| `maintenance_records` | 0 | `status` and `maintenance_type` are plain **text, no CHECK**; the matching enums bind to zero columns. No range column, so no overlap guard is possible yet |
| `depreciation_logs` | 0 | no reader in `src/` |
| `purchase_requests` | 0 | route `/inventory/purchase-requests` exists |
| `accessories` | — | `product_id`, `name`, `quantity`, `is_mandatory`, `replacement_cost` — **the real home of "What's Included"**, never named by v2.5 |
| `audit_events` | **5,378** | timestamp is **`created_at`** — there is **no `occurred_at`**. No amount column: figures live inside `old_values` / `new_values` / `diff` **jsonb**. `reject_update_append_only` wired |
| `audit_settings` | 0 | no reader |
| `invoices` | 0 | `issue_date` / `due_date` are **`date`**, not `issued_at`/`due_at` and not timestamptz. `invoice_no` **not null**, no format CHECK. 7 money columns. `reject_invoice_edit_after_issue` BEFORE UPDATE |
| `invoice_lines` | 0 | `recalculate_invoice_totals` AFTER INSERT/DELETE/UPDATE — **totals are the database's job** |
| `payments` | 0 | append-only; audit trigger is `AFTER INSERT` **only** |
| `security_deposits`, `deposit_movements` | 0 | `sync_deposit_balances` trigger; `deposit` sequence at 89. **Deliberately outside `queries/finance.ts` (Law 5)** |
| `bank_accounts` | 2 | embedded by `listPayments` for `channel_group` |
| `number_sequences` | 10 | see §5.4 |
| `coupons`, `coupon_redemptions` | 0 | `coupons` has code, percent, min spend, max discount, window, usage limit, usage count, active flag. **Lacks `authorised_by`, `reason`, and any product/client scope** |
| `document_registry` | 0 | `document_no`, `file_url`, `lifecycle_status ∈ {Draft, Pending Approval, Pending Signature, Signed, Issued, Void, Expired}`, `signed_at`, `signed_by_name`, `signature_url`. `document_type` label is **`Quotation`** and **`Rental Agreement`** |
| `document_deliveries` | 0 | `document_id`, `channel`, `delivery_event`, `recorded_at` — the delivery timeline |
| `signatures` | 0 | **session-keyed, floor roles only** (Receiver, Warehouse staff, Driver, Witness, Returning person). **Not the table for document signing** |
| `fulfillment_outcomes` | 0 | referenced in `src/` only by the generated types file |
| `crew_members`, `crew_bookings`, `crew_assignments`, `crew_leaves` | 0 | `crew_bookings_no_double_booking` and `crew_leaves_no_overlapping_leave` are `EXCLUDE USING gist`. **Only the booking constraint has an override escape**; `crew_assignments` has **no** exclusion constraint |
| `bundles` | 0 | 13 columns incl. `daily_rate`, `weekly_rate`, `is_active` |
| `bundle_items` | 0 | **10 columns and NOT ONE is a price, rate or discount.** `is_mandatory`, `sort_order` |
| `operation_sessions`, `cleaning_queue_entries` | — | written by the pack/handover/return actions |
| `containers` | — | carries barcodes |
| `users` | 5 | `users_select_own` is **self-scoped** — a `users` embed resolves for the viewer alone |
| `branches`, `warehouses` | 2 each | Settings ▸ Branches renders a **seed array** instead |
| `staff_auth_pins` | — | **RLS ON with ZERO policies** — reachable only through SECURITY DEFINER RPCs |
| `system_settings` | **0** | key/value jsonb, RLS on, 2 policies, **zero readers in `src/`** |
| `external_refs` | 171 | `booqable/clients` 100 + `booqable/products` 71. `last_pulled_at` **NULL on every row**. No `booqable/bundles` rows |
| `sync_outbox`/`_inbox`/`_log`/`_conflicts`/`_state` | 0 | `sync_outbox` carries `status`, `attempts`, `next_attempt_at`, `error` |
| `backup_logs` | 0 | |
| The eleven `0008_automation_comms` tables | 0 | **applied and waiting.** See §4.3 |
| `portal_users`, `portal_sessions`, `portal_auth_challenges` | 0 | **RLS ON, ZERO policies = deny-all. Empty result, no error** |

### 5.2 Views — verified live

| View | What it is | Gate |
|---|---|---|
| `bookings_deposit_v` | id-keyed deposit read, definer-rights | `WHERE auth_is_staff()`; `CASE WHEN auth_can_view_money() THEN deposit_required ELSE NULL END` |
| `booking_lines_v` | line read incl. money columns | used for the sub-rental derivation and (if ever wired) canonical pricing |
| `products_v` | product read | `WHERE auth_is_staff()`; masks all eight price columns |
| `product_units_v` | unit read | same shape |
| `clients_v` | client read | money masking; `client_directory_v` is built **over** it |
| `client_directory_v` | **the** clients read — a view over `clients_v` adding 15 derived columns (counts, contact, membership, kyc, `is_blocked`) | `auth_is_staff()`; `outstanding_amount` / `deposit_held_amount` / `total_paid_amount` masked by `auth_can_view_money()`; `approved_credit_limit` + `payment_terms` masked by inheritance |
| `bundles_v` | masked bundle read | **exists and is NOT used** — `queries/bundles.ts` reads the base table |
| `staff_directory_v` | joins `users` + `branches` + `staff_auth_pins` + `auth.users` | `WHERE auth_user_role() = 'Owner'` |

**Views that DO NOT exist** — do not write `_v` after these: `invoices`, `payments`, `expenses`,
`audit_events`, `coupons`, `inventory_categories`. Those tables are read **direct and RLS-gated**.
Consequence for `invoices`: a money-blind session gets **HTTP 200 and `[]`** — gate the screen with
`financeRestriction()` or it reads as "no invoices".

### 5.3 RPCs — with their real argument names

> supabase-js RPC arguments are **named**. A wrong argument name fails at **RUNTIME**, not compile
> time, and TypeScript will not save you.

| RPC | Real signature | Call it like |
|---|---|---|
| `next_document_number` | `next_document_number(p_sequence_key text) → text` | `supabase.rpc('next_document_number', { p_sequence_key: 'quote' })` — **NOT `{ kind: … }`** |
| `create_booking` | `create_booking(p_payload jsonb)` | **migration 0063, applied and live** (not 0059, not pending). Writes `bookings` + `booking_lines` **only** — no `booking_line_units`, and **no `units` key anywhere in the function body** |
| `set_staff_pin` | `set_staff_pin(p_pin)` | weak-PIN rules live in the function, deliberately not restated in the browser |
| `verify_staff_pin` | `verify_staff_pin(p_pin) → jsonb` | |
| `staff_pin_status` | `staff_pin_status() → jsonb` | |
| `revoke_own_staff_pin` | `revoke_own_staff_pin()` | |
| `revoke_staff_pin_for` | `revoke_staff_pin_for(p_user_id)` | |
| `record_password_reset_request` | `record_password_reset_request(p_user_id)` | |

**Auth predicate functions** (the real Law 6 layer): `auth_can_view_money()`, `auth_is_staff()`,
`auth_user_role()`. `auth_can_view_money()` excludes **Warehouse · Technician · Driver · Client**;
`rbac.ts:45-50` mirrors it. The role universe is **nine**, not eight — `Manager` was appended later.

**Gate functions named but not read this pass:** `validate_booking_gates`,
`enforce_inventory_reservation_capacity`. Their `prosrc` was not inspected — see §8.

**`booking_facets(filters jsonb)` DOES NOT EXIST.** Nothing named `*facet*` exists in `pg_proc`, and
no facet view or table exists. Confirmed absent by direct query.

### 5.4 `number_sequences` — the ten real keys, and only these ten

`booking` · `bundle` · `client` · `deposit` · `equipment` · `expense` · `invoice` · `membership` ·
`payment` · `quote`

Anything else raises `Number sequence % does not exist`.

- Format: `prefix || lpad(n, padding, '0')`, or `prefix || year || '-' || lpad(...)` when
  `include_year`.
- **`payment` is the only row with `include_year = true`** — the only sequence that resets annually.
- Live values: `quote` = `Q-` / pad 1 / 0 → first mint `Q-1`. `invoice` = `INV-` / pad 1 / 120 →
  next mint `INV-121`. `client` = `C-` / pad 1 / 750 → next mint `C-751`.
- ⚠ `createClient.ts:270` documents a driven test yielding `CL-2026-0001`. **That sequence
  configuration no longer exists.**
- **Missing keys that code already asks for:** `transfer` (`createStockTransfer.ts:268`), `DOC`
  (`createDocument.ts:21`, via the clock-based `issue()` helper, not the allocator), `packing_slip`
  (needed by §18.3), and `EQ`/`CL`/`BK`/`PAY`/`DEP` (`sync.ts`, seven sites).

### 5.5 Query modules — `src/lib/queries/`

| Module | Real exports that matter | Reads |
|---|---|---|
| `bookings.ts` | `listBookings`, `BASE_COLUMNS`, `readDeposits`, `todaysOutgoing`, `todaysIncoming`, `overdue`, `operationQueue`, `LIVE_ONLY`, `RENTAL_KPI_FILTERS`, `subRentalBookingIds` | `bookings` (+ `clients(name)` and `booking_lines(id, qty)` embeds), `booking_lines_v`, `bookings_deposit_v` |
| `finance.ts` | `listInvoices`, `listPayments`, `invoicesForBooking`, `paymentsForBooking`, `overdueInvoices`, `financeRestriction` | `invoices`, `payments` (+ `bank_accounts` embed) — base tables, RLS-gated |
| `audit.ts` | `listAuditEvents`, `auditForRecord` *(zero callers)*, `auditRestriction`, `auditPeriodFilters`, `AUDIT_READ_ROLES = ['Owner','Admin','Manager']` | `audit_events` |
| `inventory.ts` | catalogue filters, `CATEGORY_COLUMN`/`CATEGORY_ALIAS`, `COLUMNS_WITH_MONEY` | `products_v`, `product_units_v`, `inventory_categories` (embed only) |
| `availability.ts` | `planAssignment`, `reserveAssignedUnits`, `releaseReservations` | `product_units_v`, `inventory_reservations` |
| `staff.ts` | `fetchStaffDirectory`, `revokeStaffPinFor`, `recordPasswordResetRequest` | `staff_directory_v` |
| `numbering.ts` | `listNumberSequences`, `formatConvention`, `previewNextNumber(s)`, `numberingRestriction` | `number_sequences` (read-only preview; **does not mint**) |
| `backup.ts` | `listBackupLogs`, `backupRestriction` (`['Owner','Admin']`) | `backup_logs` |
| `listQuery.ts` | `applyListFilters`, `ListFilters` — **already has a `column` field at `:48`**, already used at `finance.ts:563` | — |
| `useList`, `useFilters` | fetch/state and URL-as-filter-state | — |
| clients read | `useClients` → `listClientRecords`, `.limit(500)` | `client_directory_v` |
| `facetCounts.ts` | `countFacet`, `useFacetCounts` — **ZERO callers in `src/`** | — |
| `bundles.ts` | **ZERO callers in `src/`** | `bundles`, `bundle_items`, `products_v`, `product_units_v` |

### 5.6 Engines — `src/lib/`

> `src/lib` holds **37 modules plus four subdirectories**. §2.4's list of 19 is the reason
> `kpiEngine` went four sections unexamined. Treat any "the engine list says…" argument as void.

| Engine | Real exports | Note |
|---|---|---|
| `money.ts` | `formatMoney`, `price`, `rupees`, `toRupees`, `grouped`, `discountGate`, `DISCOUNT_CAP` (25) | `price()` rounds each step to a whole rupee (R2); `formatMoney` prints paisa when non-zero. `money.ts:94` **forbids a hardcoded VAT rate** |
| `discount.ts` | `validateDiscount`, `applyPolicy`, `DiscountPolicy` | Owns the **per-row** cap only. The **stacked** per-booking cap is the DB trigger `enforce_booking_discount_stacking` — v2.5 attributes it to this module and is wrong |
| `workflow.ts` | `statusToken`, `STATUS_ORDER`, the flag vocabulary | |
| `bs.ts` | `getBusinessToday`, `nepalDay`, `formatAd`, `formatAdDateTime`, `eachDay` | **Dates and UTC storage are Law 7** |
| `operationalDay.ts` | `OPERATIONAL_DAY_START_DEFAULT ('06:00')`, `parseDayStart`, `dayStartMinutesFrom`, `operationalDayBounds`, `operationalDayOf` | **D4, ruled and applied 30 Aug.** Governs the **floor's** day only — finance, audit and BS rendering are excluded on purpose |
| `availability.ts` | `selectUnitsForLine`, `explainShortfall`, `rankLeastUsed`, `RENTAL_WINDOW_BOUNDS = 'half-open'` | Built and rule-complete; unwired on `/calendar` |
| `rbac.ts` | `canViewMoney`, `canRecordPayment`, `canCreateBundle`, `canApproveDiscount`, `canManageSettings`, `canPerformOperations` | mirrors `auth_can_view_money()` |
| `moneyVisibility.ts` | `useCanViewMoney()` | the single UI money gate. **A UI gate is not enforcement** |
| `fieldGating.ts` | `canViewMoneyField` — Law 6 omission | |
| `audit.ts` | `logAuditEvent` — **the WRITER.** Reads live in `queries/audit.ts` | v2.5's "engine `lib/audit`" points a builder at the wrong file |
| `lateFee.ts` | `formatOverage` at `:272` — **the repo's only duration formatter** | |
| `bookingRules.ts` | `getAllowOverbooking` | |
| `settingsStore.ts` | 21 keys, `validate`/`read`/`write`/`reset` | **writes `localStorage`, never a table** |
| `offlineQueue.ts` | Dexie `OfflineQueueDB`: `enqueueMutation`, `getPendingMutations`, `markMutationSyncing`, `markMutationFailed`, `resolveMutation`, `getDeadLetterMutations`, `drainQueue` | headless — no screen imports it |
| `csv.ts`, `format.ts`, `status.ts`, `menuFlip.ts`, `i18n.ts`, `edit/useEditMode` | | |
| `breakpoints.ts` | `BP = { phone: 768, desktop: 1280 }`, re-exported by `device.ts:61` | **not 1180** |
| `bookingQuery.ts` | `fetchCanonicalBooking`, `priceCanonicalBooking` | **unwired.** `CanonicalEngineInput` types `crew`, `transport`, `vatPercent` and `payments` as literal `null` |
| `kpiEngine.ts` | six exports | **DEAD — zero importers** |
| `data/numbering.ts` `issue()` | clock-derived | **not a numbering implementation.** Never use it |

### 5.7 Actions — `src/actions/`

| Action | Writes | State |
|---|---|---|
| `clients/createClient.ts` | `clients` (base table) | ✅ live. Law 8: `23505` on `client_uuid` is a replay, recovered via `clients_v`. Uses `p_sequence_key` correctly |
| `clients/blockClient.ts` | `client_flags` | ✅ live. Never a DELETE (Law 3); surfaces as `client_directory_v.is_blocked`, an `EXISTS()` — **only a re-read shows it land** |
| `clients/updateClient.ts` | — | ❌ **STUB.** `ClientDetail.onSave` writes component state. **No client field on that screen persists** |
| `rentals/createRental.ts` | RPC `create_booking` | ✅ live. Writes `bookings.deposit_required` from a caller-supplied value, default 0 |
| `rentals/confirmRental.ts` | `inventory_reservations`, `booking_stage_transitions` | ✅ live |
| `rentals/{packRental,handoverRental,returnRental,completeReset}.ts` | `operation_sessions`, `booking_lines`, `bookings`, `cleaning_queue_entries`, `audit_events` | ✅ live |
| `rentals/{cancelRental,extendRental}.ts` | — | ❌ fail closed at `createAction` (`implemented !== true` → `ActionNotImplementedError`) |
| `finance/recordPayment.ts` | `payments` | ✅ live; settles against `invoices.invoice_no`. Uses `p_sequence_key` correctly |
| `inventory/createEquipment.ts` | `products` (incl. both buffer columns) | ✅ live |
| `inventory/createBundle.ts` | `bundles`, `bundle_items` | ✅ live; uses `p_sequence_key: 'bundle'` correctly. **Never writes `is_mandatory`**; still bypasses `insertViaSourceSwitch` on two `BOOQABLE_READ_ONLY_TABLES` |
| `inventory/createStockTransfer.ts` | | `implemented: true`, but passes sequence key `'transfer'` which **does not exist**. The file documents its own failure honestly at `:265-266`/`:271-276` |
| `documents/createDocument.ts` | nothing | ❌ **STUB** — `console.log` only, no importer, and mints from clock digits at `:21`. **Delete or finish it** |

### 5.8 Triggers and constraints that behave as contract

| Object | On | Why a builder must know |
|---|---|---|
| `log_audit_event` | `bookings`, `clients`, `invoices`, `payments` (INSERT only), `security_deposits`, **`product_units`** | **Six tables. The sixth is `product_units`, NOT `inventory_units` — no table by that name exists.** `coupons` and `booking_discounts` have **no** audit trigger |
| `reject_update_append_only` | `audit_events` | no update, no delete, no archive — for any role including Owner |
| `reject_delete_nothing_is_deleted` | `booking_line_units` | a serial removal implemented as DELETE **is refused by Postgres** |
| `reject_invoice_edit_after_issue` | `invoices` BEFORE UPDATE | Finalize is a one-way door in the database, not in the page |
| `recalculate_invoice_totals` | `invoice_lines` AFTER INSERT/DELETE/UPDATE | **do not compute totals in the action.** It hardcodes `0.13` — the open VAT question |
| `enforce_booking_discount_stacking` | `booking_discounts` | the stacked 25% cap. A coupon screen must surface a **DB rejection it did not compute** |
| `booking_discounts_hard_cap` (0-25), `booking_discounts_over_ten_needs_reason_and_approver` | `booking_discounts` | Law 10 in the schema — no role bypass |
| `booking_flags_recorded_subset_only` | `booking_flags` | four labels only |
| `booking_lines_qty_positive` | `booking_lines` | a quantity-0 line **cannot be imported** |
| `booking_lines_bundle_child_is_free` | `booking_lines` | constrains **price**, not exclusivity |
| `inventory_reservations_no_double_booking` | `inventory_reservations` | `EXCLUDE USING gist (asset_id =, period &&) WHERE released_at IS NULL` — **the precedent to copy** for maintenance overlap |
| `crew_bookings_no_double_booking`, `crew_leaves_no_overlapping_leave` | crew tables | only the booking one has an override escape |
| `sync_deposit_balances` | deposit tables | |
| `users_select_own` | `users` | self-scoped — kills any actor-name join |

### 5.9 Enum labels — use ours, not Booqable's

| Enum | Real labels |
|---|---|
| booking stage | Quote · Booked · Packed · On Rent · Returned · Closed |
| `booking_flags` CHECK | Returned Early · Overdue · Missing · Damaged (**no Partial Pickup**) |
| `document_lifecycle_status` | Draft · Pending Approval · Pending Signature · Signed · Issued · Void · Expired (mirrored verbatim and in order by `src/data/documents.ts:71-79` — **do not rebuild `DocStatus`**) |
| `document_type` | includes **`Quotation`** and **`Rental Agreement`** (not "Contract") |
| `booking_document_type` | includes **`Quote`**, `Packing List` — **disagrees with `document_registry` on purpose; pick per table** |
| `maintenance_status` | Scheduled · In Progress · Waiting Parts · At Vendor · Completed · Cancelled — **bound to zero columns.** No "Started", no "Ended"; do not adopt Booqable's vocabulary |
| `maintenance_type` | 8 labels — **bound to zero columns** |
| client type | `{Organisation, Individual}` — **not "Company"** |
| `client_flag_type` | VIP · Blocked · Upgrade Candidate |
| `customer_tax_profile` | VAT Registered · Non-VAT Customer · Tax Exempt · Government Organization · NGO · Corporate |
| `product_category` | 17 members; constrains `inventory_categories.name` |
| `invoice_status` | **no `Overpaid`, no `Process deposit`.** `Overdue` is a **live label that is never stored** — a chip filtering `status='Overdue'` returns zero rows silently |
| `signature_role` | Receiver · Warehouse staff · Driver · Witness · Returning person |
| `BrandKey` | neutral · primary · progress · **warn** · success · danger — **no `purple`** |
| `audit_action` | **has no send/deliver/email label.** An email dispatch cannot be audited today |
| `ReportCompare` | `'off' \| 'previous'` — **no previous-year** |

### 5.10 ⛔ THE BLACKLIST — names in v2.5 that do not exist

Every one of these was searched for and is absent. If any appears in a plan, a migration or a PR,
that artefact was written from §2.4 and needs re-checking.

| Name in v2.5 | Reality |
|---|---|
| `inventory_units` | **no such table.** The audit trigger is on `product_units` |
| `audit_events.occurred_at` | **no such column.** It is `created_at`. (`occurred_at` exists only on `booking_stage_transitions`) |
| `starts_at` / `ends_at` | **no such columns on any table.** The booking window is `bookings.pickup_at` → `bookings.return_at` |
| `bundle_items.component_price` | **no such column** — and no price, rate or discount column of any name on `bundle_items` |
| `booking_facets(filters jsonb)` | **no such function.** Nothing named `*facet*` exists in the DB |
| `discount_policies` | **no such table.** `0073_discount_policies.sql` is a draft filename inside a code comment |
| `ClickableRow` | **no such component**, and no "11 Aug improvement order" that names it |
| `next_document_number(kind)` | the argument is **`p_sequence_key`**. Fails at RUNTIME |
| `standing_discount_pct` | **no such column on `clients`**, and none proposed |
| `purchase_cost` | the column is `purchase_price`, on both `products` and `product_units` |
| any `custom_field*` table | **zero matches** in `information_schema` |
| `kpiEngine` as a live engine | zero importers; seed-typed; no delta contract |
| `/reports/pickups`, `/reports/availability`, `/reports/documents/*`, `/notifications` | **no such routes** |
| `packing_slip`, `transfer`, `DOC`, `EQ`, `CL`, `BK`, `PAY`, `DEP` as sequence keys | **not in `number_sequences`.** Only the ten in §5.4 |
| `invoices_v`, `payments_v`, `expenses_v`, `audit_events_v`, `coupons_v`, `inventory_categories_v` | **no such views** |
| "Away mode" | no table, no column, no code |
| `issued_at` / `due_at` on `invoices` | they are `issue_date` / `due_date`, and both are `date` |

---

## 6. Known-bad facts v2.5 repeats — and exactly where

The eight facts named in the brief, plus three new ones this pass found. **Sections that repeat none
are recorded too** — that is a useful negative and stops the same section being re-audited.

### 6.1 The carry-list

| # | Known-bad fact | Repeated in | Correct answer |
|---|---|---|---|
| 1 | Law number for **dates** | §11.5 (calendar today-marker) says "Law 9"; v2.5 R6 says "Law 9" | **Law 7** — `src/lib/bs.ts:157,251`. Law 9 binds `days >= 1` and the six priced-line tables (`PLAN.md:113`, `:827`). `Organisation.tsx:71` cites Law 7 correctly |
| 2 | Law number for the **768px two-column question** | §4.2 (spec line 122) says "Law 15 — width decides"; §A.5 says "Law 15" | **Law 14** |
| 3 | Law number for the **44×44 touch floor** | §4.4 twice (lines 203, 205), §10.4 (line 495), §11.4's `[ruled]` — all say "Law 16" | **Law 15.** `MovementList.tsx:298` and `Calendar.tsx:105` both already cite Law 15 correctly; `PLAN.md:525` agrees. Law 16 is the AI-panel gate |
| 4 | **BrandKey** invents `purple`, drops `warn` | §2.4, flagged again in §19 | real union is `neutral \| primary \| progress \| warn \| success \| danger` |
| 5 | **Card** described as having no `subtitle` | §2.4 (describes `Page.tsx`'s Card), flagged again in §19 | the **barrel exports `Card.tsx`**, which has `subtitle` (`Card.tsx:19`) plus `footer` and `padding` |
| 6 | **`next_document_number(kind)`** | §2.4; **§10.6 line 541** is the only screen section carrying the wrong arg name. §14.5 names the function without an argument (clean). §17 (v2.5:1137) writes it **positionally** — compatible, but a trap | `p_sequence_key`. **supabase-js RPC args are named, so the spec's version fails at RUNTIME, not compile time.** Every existing call site in this repo already uses the right name |
| 7 | **`ClickableRow`** and the "11 Aug improvement order" | §4.4 line 204 instructs builders to build the preview card on it; §9.5 inherits it by cross-reference | **neither exists.** Zero hits in `src/`; every occurrence is prose under `docs/` |
| 8 | **`facetCounts` described as unbuilt / or as serving a rail** | §9.7 (the `CORRECTIONS.md` §7 inversion restated verbatim), §13.6 (`facets: type` implies a facet mechanism), §14.5 (repeats `booking_facets()` **verbatim**), §15.1 (spec line 959, holds counts up as a mechanic to copy), §19 (category counts) | the engine **exists, is tested, and is completely unwired.** `countFacet` imported only by its own test; `useFacetCounts` zero callers; `FilterOptionList` mounted only in its own test. **No screen shows an option count today.** `booking_facets()` does not exist in the DB |
| 9 | **§2.4's 19-module engine list** | §15.3 built its whole company/compare block on it; §19 flagged it | `src/lib` has **37 modules plus four subdirectories** |
| 10 | **`inventory_units` as the sixth audit-trigger table** | §4.5's activity-feed block; **§12.5's `history` line repeats it verbatim** | **`product_units`.** `inventory_units` does not exist. 192 `product_units/Create` rows already sit in `audit_events`, all carrying `actor_id` |
| 11 | **§9.7's money claim** — "bookings.ts deliberately carries no money on list rows at all" | §9.7 (the `CORRECTIONS.md` §8 error restated) | `BookingListRow.depositRequired` has existed since the `bookings_deposit_v` work. **List rows already carry money** |

### 6.2 New known-bad facts this pass found — add these to the carry-list

| # | Defect | Where | Why it matters |
|---|---|---|---|
| N1 | **`bundle_items.component_price`** named as though it were a column | §18.1 consequence 2 | Same class as §2.4's invented names: an invented Layer D column that must not reach a migration. No price/discount column exists on `bundle_items` at all |
| N2 | **`sync.ts` passes five sequence keys that do not exist** | `src/lib/booqable/sync.ts:462` (`'EQ'`), `:799` (`'CL'`), `:926` (`'BK'`), `:1212`, `:1236` (`'PAY'`), `:1240`, `:1247` (`'DEP'`) | All seven **raise at runtime**. The parameter is typed `sequenceKey: string`, so it typechecks. `sync.ts:325-328` already reasons correctly about raise behaviour — it applied the right logic to the wrong key set |
| N3 | **`createDocument.ts:21` mints from the clock** via `issue('DOC', …)` | `src/actions/documents/createDocument.ts` | `'DOC'` is not a sequence key, so even the correct call would raise. Its own comment at `:20` claims registry-sourced numbering. **Fix before anyone sets `implemented: true`** |
| N4 | **`src/lib/queries/bundles.ts` joins `facetCounts.ts`** as a second fully-built, fully-unwired query module | — | Add to the standing "grep for importers" list |

### 6.3 Sections that repeat **none** of the known-bad facts

**§16** (Coupons and Activity logs) — its "6 tables" figure is correct and verified; its only law
citations, Law 10 and Law 6, are both right. **§17** (lines 1120-1174) — no law number, no BrandKey,
no Card, no `ClickableRow`, no facetCounts, no engine list. **§20** (lines 1292-1329) — cites D4, L8
and Law 10, all consistent with the corrections. **§21** — names no component, no BrandKey, no RPC
signature, no engine count, no facet counter; its single law citation (Law 17, in §21.1 and §21.8.2)
is **correct** against `PLAN.md:34`. **§9** — its single law citation, Law 6 for money-blindness, is
correct and matches `auth_can_view_money()`.

### 6.4 One more vocabulary breach worth naming separately

**§9.1's `Customer` column header and §9.7's "customer name"** must not be copied. The word
*customer* is banned from the UI by `CLAUDE.md`'s hard rule and `PLAN.md §6.1`. Ours are **clients**.
Separately, **Law 17 is confirmed breached at all six cited sites** — none of them on `/clients`,
which is clean. The single fix is a `deliveryTypeLabel()` inverse map, not six edits.

---

## 7. Doc-vs-code contradictions

Recorded so nobody re-derives them. **In every case below, CODE WINS.**

### 7.1 `docs/pages/*` page docs that are stale

| Doc | What it says | Reality |
|---|---|---|
| `06_today.md` | route `/today`, title "Today", an `AlertsPanel` and a `CalendarPanel` on the page, a `minmax(0,1.55fr) minmax(0,1fr)` two-track grid | route is `/dashboard` (`/today` redirects); title is "Dashboard" (`Today.tsx:826`); `CalendarPanel.tsx` **deleted**; `AlertsPanel` moved to Operations; body is `main \| Rail`. **Stale on four counts — cite nothing from it** |
| `07_rentals_list.md` | line 81: a "frozen operating day 2026-07-31 (`bs.ts:153`)" | `RentalsList.tsx:55` is `const TODAY = getBusinessToday()`; `bs.ts:277-279` reads the real Kathmandu clock. **Also: every line anchor is ~24 lines short** (Export `:1119`→`:1143`, `useCanViewMoney` `:631`→`:655`, withDeposit `:844`→`:868`, `show()` `:949`→`:974`, minWidth `:1655`→`:1668`). Its mock-mode finding **is** still correct |
| `14_booking_detail.md` | a SEED-backed screen rendering `data/booking.ts`'s B-715, with line numbers past the file's current 1882 lines; finding #2 "Record Payment always fails" | the screen has read **live data since 21 Aug 2026**; finding #2 is **fixed** — `BookingDetail.tsx:1802-1809` maps `liveInvoices` to real `invoiceNo`s |
| `23_calendar.md` | a live four-card KPI band at `:2252-2292`; "does not use `useCanViewMoney()`"; "2399 lines"; a fixed `TODAY = 31 Jul 2026` | band **removed 30 Aug at owner instruction** (`:2342-2354` is now a comment); the file **imports the shared hook at `:10` and calls it at `:1412`**; the file is **2494 lines**; `TODAY = getBusinessToday()` (`:42-47`). **~95 lines of drift — re-anchor every citation before quoting** |
| `24_documents.md` | "1466 lines"; "does not use `useCanViewMoney()`" | 1528 lines; calls it at `Documents.tsx:454`. Its **§1 and :90 claims are verified correct** — a rare clean case |
| `46_settings.md` | Settings.tsx 630 lines, `useCanViewMoney` at `:127`, `mayEdit` at `:142`; **six** section files; Session timeout under "System preferences"; Organisation = General + Languages only; `createStockTransfer` "implemented not set"; "nothing server-side is involved"; `BREAKPOINT = {phone:768, desktop:1180}`; People tab has "no user query" | 682 lines, `:136`, `canManageSettings` at `:151`; **eight** section files (`DevicePin.tsx` and `StaffDirectory.tsx` are absent from the doc **and are the only live-DB surfaces on the page**); timeout moved into Access as "Idle screen lock" (25 Aug ruling); Organisation also carries the D4 `operationalDayStart` row; `createStockTransfer.ts:163` is `implemented: true`; **six SECURITY DEFINER RPCs and `staff_directory_v` are involved**; `BP = {phone:768, desktop:1280}`; `UsersRoles.tsx:49` mounts `StaffDirectoryCard` → `fetchStaffDirectory()`. **Also silent on email/BCC/templates/collections entirely — a coverage gap, not a contradiction** |
| `04_clients.md` | `ClientsDirectory` anchors `:693-726` KpiStrip, `:733-741` chips, `:749-765` overlays; Clients.tsx 591 lines | chips are now at `:864-869`; `:728-790` is the bulk-block handler; file is 2105 lines and concurrently edited. **Substance holds** (four tabs, `client_directory_v` via `useClients`, chip set, saved views); **anchors do not** |
| `22_add_bundle.md` | gaps 2, 3, 4, 9, 10 — seed `modelId` as `product_id`, category display name as `category_id`, rate written as zero, code minted from a clock fragment, full read-back against a column revoke | **all five are FIXED.** `createBundle.ts:264-289` and `:243-259` resolve by SELECT and refuse when absent; `:315-316` writes real rates; `:295-297` calls `next_document_number` with the **correct** arg name; `:328` passes `{ returnRow: false }`. Line counts also stale (AddBundle 2696, createBundle 413) |
| `16_inventory.md` | — | **silent on buffers, purchase cost, Downtime and the History/audit tab.** Cannot corroborate any §12 Layer D claim |
| `52_activity_log.md` | "Status: Seed-only" | **accurate.** No contradiction. It also correctly records a live in-repo contradiction — see 7.3 |
| `INDEX.md:58-67, :116` | all ten `/reports/*` "Seed-only", "every figure invented" | **agrees with the code.** It is v2.5 §15.3 that contradicts both |

### 7.2 v2.5 contradicted by the code

| v2.5 says | Code says |
|---|---|
| §14.5 files the invoice register against `/documents` | the built, DB-backed register is **Finance → Invoices** (`listInvoices`, `finance.ts:452`). `/documents` has **zero DB reads** |
| §14.5: `listQuery` "needs to support naming WHICH column" for date ranges | `listQuery.ts:48` has had a `column` field since it was written, and `finance.ts:563` already uses it. **The real missing thing is two simultaneous date bounds** |
| §16.3: `lib/discount` owns the combined 25% cap | `src/lib/discount.ts:118-123`'s own header says the **stacked** cap is the DB trigger |
| §12.5: the downtime reason/status enums exist and are usable | they exist and are **bound to zero columns**; the consuming columns are unconstrained text |
| §12.5: the per-product buffer is STILL OPEN / not found | `products.prep_time_minutes` / `cleaning_time_minutes` exist, have a UI (`SectionPricing.tsx:165,168`) and a write path (`createEquipment.ts:433-434`). **Not open — unwired** |
| §12.5's `cost` line implies a unit→product fallback exists | `queries/inventory.ts:292-296` documents that `products.purchase_price` is named by **no** code path, and `COLUMNS_WITH_MONEY:540` selects only `daily_rate` and `replacement_value` |
| §10.2 B4's "same signature" argument for serials at creation | `create_booking` writes **no** `booking_line_units` and has **no `units` key**. The argument has no basis; the cost asymmetry leans the opposite way |
| §17.3: "our equivalent keeps `PageBody`'s guarantee" | `Documents.tsx` **does not import `PageBody`** (0 hits) and hand-rolls the empty branch |
| §11.5: bars span `starts_at` → `ends_at` | neither column exists on any table |
| §13.6: fetch the client detail "by client id" | it is keyed on **`client_code`**; `/clients/:id` carries the CODE and `ClientRecord.id` **is** the code. A literal implementation returns zero rows and the view gets blamed |
| §13.6: the tax profile is a GAP | `client_tax_profiles` is **fully modelled** — effective-dated, evidence-backed, six labels. The decision is adopt-or-retire, not build |

### 7.3 Repo-internal contradictions — settled against the live DB or the live code

| Contradiction | Settlement |
|---|---|
| `bookings.ts:376-379` asserts that after 0062 the base-table read of `deposit_required` "42501s for every role" | **False.** `anon` still holds SELECT on `bookings.deposit_required`; only `authenticated` was revoked. **RLS (`auth_is_staff()`) is what actually blocks anon.** Fix the comment |
| `bookings.ts:973-976` asserts `authenticated` **and** `anon` both hold SELECT on `booking_lines`' four money columns, and explicitly calls `bookingQuery.ts:918-928` wrong | **`bookingQuery.ts` is right and `bookings.ts` is wrong.** `authenticated` has **no** SELECT on `rate`/`discount_amount`/`supplier_cost`/`markup_amount`. The comment is right only about `anon`, which **does** hold SELECT on all four — itself worth investigating |
| `createBundle.ts:325-327` and `queries/bundles.ts:22-26` both justify their design by 0035:67 / 0062 revoking select on `bundles`' money columns | **The live grants say otherwise for `bundles`:** `authenticated` holds SELECT on **all 13** columns including `daily_rate` and `weekly_rate`. The 0062 revoke **is** live for `products` (35 of 44 columns). Migration headers lie; grants were read directly |
| `sync.ts:317`'s doc comment names the keys as `'CL'\|'BK'\|'EQ'\|'PAY'\|'DEP'` citing `0007_admin_security.sql` | **The live table wins.** `number_sequences` uses lower-case word keys; the comment and the code it describes are both wrong |
| `data/nav.ts:137` / `:145` claim `/admin/*` redirects into `/tools/*` | **Backwards.** `App.tsx:132-135` redirects `/tools/*` into `/admin/*`; `App.tsx:131` sends bare `/admin` to `/settings?tab=system` |
| `data/nav.ts:143-145` argues in prose against hiding Audit/Activity/Numbering/Backup from the floor, while `:149` lists `/admin` in `MONEY_ROUTES` and causes exactly that | live, unresolved. Recorded correctly by `52_activity_log.md:105-107` |
| `Settings.tsx:107-112` describes "the Financial tab is removed from the strip" for money-blind sessions | the 15 Aug cut removed that tab. All four `TABS` carry `money:false`, so the filter at `:186` is a **no-op**; the real gate is the `FinancialPane` render at `:381` |
| `data/settings.ts:76-78` comments that an unknown `?tab=` "falls back to Overview" | there is no Overview tab; `DEFAULT_TAB` is `'business'` (`:160`) and `LEGACY_TAB` maps overview→business (`:147`) |
| `AssetDetail.tsx:942-948` tells the operator "the audit trail is not wired to equipment records" | **false about the trail, true only about the screen.** The trigger, 192 rows and `auditForRecord()` all exist. Fix the copy when the tab is wired |
| `Calendar.tsx:1099-1100` comments that "nothing computes availability" | **stale.** `lib/availability.ts` and `lib/queries/availability.ts` are built and rule-complete |
| `createClient.ts:270` documents a driven test yielding `CL-2026-0001` | the live `client` row is `C-` / pad 1 / 750 → `C-751`. The comment describes a sequence configuration that no longer exists |
| `createDocument.ts:20` comment claims "Prefix from Settings > Numbering, never a literal - ruling 2.2" | `:21` derives the counter from `Date.now().toString().slice(-4)`. **The comment describes registry numbering; the code uses the clock** |
| `VERIFICATION_2026-08-31.md:199`: `SPEC_TABS['/clients']` is dead config with three declarations, two dead | **confirmed live.** `Clients.tsx:37-42` `TAB_DEFS` is the one that renders, and the rendered label is the singular **`Membership`** |
| `src/archive/CommunicationSettings.tsx` looks like a head start on Settings ▸ Emails | unrouted, imported by nothing, reads static seed with `TO('/notifications')` destinations that resolve to **no route**. Not a head start |

### 7.4 Contradictions the prior Layer A/B/C pass carried that the code has since moved past

From `docs/booqable/dashboard.md`: (1) the frozen clock is **fixed** — `data/today.ts:24` is
`getBusinessToday()`; (2) the day-boundary `TODO(decision)` is **ruled and applied** (D4,
`bookings.ts:712-742` → `lib/operationalDay.ts`); (3) the two-column body is now `main | Rail` —
i.e. its own open decision 6 was **built**, and built with `Rail` (which **is** `CollapsibleAside`,
default-collapsed at tablet) rather than `ReflowRail`, the exact pattern `Page.tsx:333-349` names as
a rulings-§7 violation; (4) the `AlertsPanel` → `/notifications` 404 **moved to Operations**
(`OperationsQueues.tsx:25`, `:490`) — **the defect moved, it did not close.**

---

## 8. Honest limits — what remains UNVERIFIABLE

Seven claims could not be settled. **The dominant reason is one environmental fact:** the MCP
session runs as `postgres` with `rolbypassrls`, so `auth_user_role()` resolves to `'Client'` and
every `_v` view returns zero rows for gate reasons. **No per-role RLS behaviour was confirmed by
execution anywhere in this pass.** Structural verification (view definitions, policy text, grant
tables, `CASE WHEN auth_can_view_money()` expressions) was done; runtime confirmation was not.

| # | Unverifiable claim | Why | Exactly what settles it |
|---|---|---|---|
| **U1** | **Do the money-blind RLS policies actually behave per role?** Does a Warehouse / Technician / Driver / Client session receive `NULL` for money columns from `products_v`, `client_directory_v`, `product_units_v`, `bookings_deposit_v` — and zero rows where `auth_is_staff()` gates? | MCP bypasses RLS; `auth_user_role()` = `'Client'` for the session, so every `_v` view returns nothing for the wrong reason | An **authenticated session per role** (real `users` rows with `primary_role` set), or `set_config('app.current_user_id', …)` to a real `users` row, then: `select daily_rate from products_v limit 1` and `select outstanding_amount, approved_credit_limit from client_directory_v limit 1`. Assert NULL for the four money-blind roles and zero rows for Client. **This is the single highest-value unresolved verification in the register — it recurs in §10, §12, §13, §20 and §21.** |
| **U2** | **Does the Deposit figure ever actually render on `/rentals`?** Every path was verified structurally, never with a money-visible session | same as U1 | Sign in as **Owner** and read one Deposit cell; then as **Warehouse** and confirm the `<th>` is **absent from the DOM**, not empty |
| **U3** | **Does `useCanViewMoney()` resolve to exactly `auth_can_view_money()`'s four roles?** The SQL predicate was verified; the hook's role list was **not** | not read this pass | Read `src/lib/moneyVisibility.ts` and `rbac.canViewMoney`, then a per-role authenticated session test. Until then this is unverified, **not** confirmed |
| **U4** | **Is our B-898 the same booking as the reference's #898?** Matches on number, client name (`'Meera Gurung '`, trailing space) and the 06:00–06:00 window; **mismatches** on the other sample (#824 is Sunil Maharjan here; no "Ronin" client exists) and `external_refs` holds **zero** Booqable order rows | requires a Booqable-side read | One `GET /orders/{id}` through `booqable-proxy` for order 898, comparing customer id and dates — **or** locating the seed script that generated our 200 bookings |
| **U5** | **Does Booqable's `0x` mean "no line items" or "a line item with quantity 0"?** Unanswerable from our side: `booking_lines_qty_positive` **forbids** the second | requires a Booqable-side read | One Booqable API read of order 898's line items. An empty array = line count; an item with quantity 0 = **the bridge needs an explicit rejection rule**, because our CHECK will refuse it on import |
| **U6** | **Does the Rs. 18,450 gap come from cancelled bookings?** | `invoices`, `booking_lines` and `external_invoices` are all 0 rows locally | One Booqable-side pair of queries: orders-index total excl. tax with `status=canceled`, vs the invoices-register total with the same order filter. If the difference is exactly `18,450.00` the hypothesis holds |
| **U7** | **Does Booqable recompute a bundle's price when a component's base rate changes?** (decides §18.6's live-vs-frozen question from the reference side) | requires a **write** to a Booqable component rate on a throwaway bundle, then a re-read — impossible on a read-only pass | A supervised write-and-reread against a throwaway Booqable bundle. **Not guessable** |

### 8.1 Adjacent facts that were *not* checked and must not be assumed

Recorded honestly rather than silently omitted:

- **`enforce_inventory_reservation_capacity`'s body was never read.** Whether availability can go
  negative — which "With shortage" presumes — is therefore open. Settle with
  `SELECT prosrc FROM pg_proc WHERE proname='enforce_inventory_reservation_capacity'` plus
  `lib/bookingRules.ts`'s `getAllowOverbooking`.
- **`clients.type_parent`'s NOT NULL flag was not captured.** The enum has two members and the
  screen shows an "Unassigned" chip, so "Unassigned" must mean **null in the column** — but whether
  null is an intended third state or an import defect is unresolved.
- **Whether `sync.ts` has ever executed against the live project.** `external_refs` holds 171 rows
  with `last_pulled_at` NULL on **every** row and `sync_log` is empty — consistent with the pull
  never reaching the minting step. If so, N2's wrong keys have **never fired**, and this is
  pre-release, not a live outage. Settle with `select count(*) from sync_log` plus one supervised
  dry run against a **branch** DB.
- **Whether the `product_units` wipe was intentional.** 192 `Create` audit rows exist for a table
  now holding 0. Until the reseed script's history is read, **empty unit panels are corpus, not
  defect**.
- **`passwordPolicy` enforcement.** Nothing in `src/` reads the key; whether GoTrue enforces
  anything is unknown because **MCP exposes Postgres, not the Supabase Auth configuration**.
- **§20.3's `show_on_documents`.** The capture shows only the single value "All documents", which
  cannot distinguish a fixed label from a one-option picker. One more read-only look at that control
  settles it — before the table is designed, not after.
- **Booqable's `#903` carrying `#763/#764/#765`** was read from the reference, not from our data; our
  side has no quote document at all, only `bookings.stage='Quote'` (7 rows).

### 8.2 The one limit that is not a gap in evidence but a gap in authority

Roughly forty of this register's findings end in "settled by a **ruling**", not by a query — the
deposit resolution order, quote-numbering policy, what "Confirmed" means, whether `/admin` stays in
`MONEY_ROUTES`, whether the operational day moves to `system_settings`, whether
`fetchCanonicalBooking` is adopted or deleted, whether `client_tax_profiles` is adopted or retired,
and the 4-vs-6 KPI contradiction that `Today.tsx:624-637` already records verbatim against itself.
**Those are not verification failures and no further investigation will close them.** They belong in
`PLAN.md §4` and in `DECISION-SHEET.md`, and this register deliberately stops at naming each one and
what a single sentence from Babin would settle.
