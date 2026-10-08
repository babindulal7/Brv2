# Layer D verification — Customer Accounts tab, Documents register, Reports index
v2.5 section: §14 (lines 846-950)   ·   Our route(s): /documents, /finance/documents, /reports
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Trusted as given: Layers A/B/C (what Booqable renders). Everything below re-checks §14.5's
"Backend data link" block and the Layer-D-shaped assertions embedded in §14.1–§14.4.

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `accounts` → `portal_users` (+ invite token flow) | MISLEADING | The table exists but nothing in `src/` reads or writes it, and there is no invite token column, no token table, and no invite action. `portal_users.invited_by_staff_id` / `invited_by_portal_user_id` exist; a *token* does not. The only appearance of `portal_users` in the app is the generated type. | Live brief: `portal_users` cols; `grep -rn "portal_user" src/ --include=*.ts*` → only `src/types/supabase.ts:2235-2288` and FK names. No `src/actions/portal/*`. |
| 2 | Migration 0054 documents these three tables' deny-all; the invite model "unblocks" it | CONFIRMED (file exists, state matches) | `supabase/migrations/0054_rls_backstops_and_directory_block_flag.sql` exists. Live DB: `portal_users`, `portal_sessions`, `portal_auth_challenges` are RLS-enabled with **zero policies** = deny-all to every non-bypassrls role. | `ls supabase/migrations/` → `0054_rls_backstops_and_directory_block_flag.sql`; live schema brief, four zero-policy tables. |
| 3 | "zero portal accounts exist" (their account) — our analogue | CONFIRMED | `select count(*) from portal_users` = **0** live. | SQL run 31 Aug: `select (select count(*) from public.portal_users) …` → `portal_users_rows: 0`. |
| 4 | `register` → `invoices ⨝ bookings ⨝ clients` | CONFIRMED — but **not on /documents** | The join is real and already built, in `listInvoices()`: `.from('invoices')` selecting `… clients ( name ), bookings ( booking_no )`. It powers the **Finance → Invoices tab**, not the Documents module. | `src/lib/queries/finance.ts:343-348` (`INVOICE_COLUMNS`), `:452-478` (`listInvoices`); mounted `src/modules/finance/Finance.tsx:23,172-175,253-256`. |
| 5 | `payments` for the "Paid amount" tile | MISLEADING | `payments` queries exist (`listPayments`, `receivedPayments`, `paymentsInPeriod` — `finance.ts`), and Finance sums them, but the tile is titled **Collections**, not "Paid amount", and the file says so deliberately. There is no "Revenue" tile at all — Finance renders `Revenue: 'Not tracked yet'`. | `src/modules/finance/Finance.tsx:1110-1113` (Collections, not Revenue), `:886` (`{ label: 'Revenue', value: 'Not tracked yet' }`). |
| 6 | `facets: payment_status counts (booking_facets() pattern, §9.2)` | GAP (and repeats a KNOWN-BAD fact) | Three separate failures. (a) `booking_facets()` **does not exist** in the DB — nothing named `*facet*` exists in schema `public`. (b) `facetCounts.ts` exists and is tested but is **completely unwired** — `countFacet` is imported only by its own test, `useFacetCounts` has no caller in `src/`, `FilterOptionList` is mounted only in its own test. **No screen in this app shows an option count today.** (c) There is no `payment_status` column on `invoices` — see #7. | Live schema brief, FUNCTIONS section: `booking_facets(filters jsonb)` — DOES NOT EXIST, confirmed absent from `pg_proc`. Export map: `src/lib/queries/facetCounts.ts` ⚠ UNWIRED. |
| 7 | Rail facet vocabulary: `Payment due · Partially paid · Paid · Overpaid · Process deposit` | WRONG-NAME | Our column is `invoices.status`, enum `invoice_status` = `Draft \| Sent \| Partially Paid \| Paid \| Overdue \| Void`. Only **Partially Paid** and **Paid** survive the translation. `Overpaid` and `Process deposit` have no representation anywhere in the schema; `Payment due` is our `Sent`+`Partially Paid` (`UNSETTLED_INVOICE_STATUSES`). `Overdue` is a member that is **never stored** — it is derived at read time. | Live brief ENUMS: `invoice_status`; `src/lib/queries/finance.ts:235-248`, `:526-532`. |
| 8 | `TWO date dimensions: issued_at AND due_at` | WRONG-NAME | The columns are **`issue_date`** and **`due_date`**, and both are `date`, not `timestamptz` — so no timezone arithmetic applies to either. There is no `issued_at` or `due_at` anywhere on `invoices`. | Live brief, `invoices` columns: `issue_date:date, due_date:date`; `src/lib/queries/finance.ts:247-249`, `:356-359`. |
| 9 | "`listQuery` already supports a date range; **it needs to support naming WHICH column**" | MISLEADING | `listQuery` has named the column since it was written: `dateRange?: { column: string; fromAd?; toAd? }`, applied as `q.gte(column,…)/q.lte(column,…)`. `overdueInvoices()` already passes `column: 'due_date'` and `listInvoices` defaults to sorting on `issue_date`. The real gap is different and narrower: `ListFilters` holds **one** `dateRange`, so it cannot express *two simultaneous* date bounds (invoice date AND due date) in one query. | `src/lib/queries/listQuery.ts:48` (the `column` field), `:156-160` (applied); `finance.ts:563`. |
| 10 | `overdue` = `due_at < today AND not Paid` | WRONG-NAME on the columns; the rule itself is CONFIRMED and stricter | `overdueInvoices(todayAd)` = `due_date <= previousDay(nepalDay(today))` **AND** `status IN (unsettled)` **AND** `voided_at IS NULL`, sorted `due_date` ascending. It adds the void exclusion v2.5 omits, and it flags a live `TODO(decision)`: an invoice due *today* is deliberately not yet overdue. | `src/lib/queries/finance.ts:561-568`, rationale `:534-559`. |
| 11 | "→ amber pill treatment in the date cell" | GAP — not built | Overdue is surfaced as a **chip** and a **KPI total**, never as a pill inside the Due-date cell. Finance's invoice rows render the due date as plain text: `Due {formatDayAd(i.dueDateAd)}`. Documents' Created-On cell renders a BS/AD pair with no alert state. | `src/modules/finance/Finance.tsx:248` (chip row), `:571-582` (`overdue` list + `overdueTotal`), `:1410` (plain due text). |
| 12 | `numbering` — `next_document_number()` fires at FINALISATION, not creation | GAP — no invoice number is ever minted, at any moment | The `invoice` sequence row exists live (`INV-`, current_value 120) but **nothing in `src/` ever asks for it**. The four call sites are `client`, `payment`, `bundle`, `equipment`. There is no invoice-issuing action, no finalisation path, and no pro-forma state in the schema (`invoice_status` starts at `Draft`, and `invoice_no` is `not null`). | `grep -rn "next_document_number" src/` → `actions/clients/createClient.ts:338`, `actions/finance/recordPayment.ts:330`, `actions/inventory/createBundle.ts:295`, `actions/inventory/createEquipment.ts:395`. No `invoice` key. Live brief `number_sequences`: invoice `INV-` 120. |
| 13 | `next_document_number()` — the RPC's argument | CONFIRMED (and the KNOWN-BAD spelling is **not** repeated here) | The arg is `p_sequence_key text`. Our four call sites all pass `{ p_sequence_key: … }` correctly, and a test asserts it. §14.5 names the function without naming an argument, so it does not carry the `kind` error — but any builder writing the finalisation path must use `p_sequence_key`. | Live brief FUNCTIONS: `next_document_number(p_sequence_key text)`; `src/actions/clients/__tests__/createClient.test.ts:159`. |
| 14 | Per-prefix sequences "(F5) unchanged" | CONFIRMED | Ten live sequence rows: booking `B-`, bundle `BND-`, client `C-`, deposit `DEP-`, equipment `EQ`, expense `EXP-`, invoice `INV-`, membership `M-`, payment `PAY-`, quote `Q-`. Only `payment` sets `include_year`. | Live brief `number_sequences` row dump. |
| 15 | Revisions keep the number and append `-R1` (`#29-R1` live) — "our schema already agrees" | CONFIRMED as *representable*, GAP as *built* | `invoices.invoice_no` carries **no format CHECK** (unlike `bookings.booking_no ~ '^B-[0-9]+$'` and `charges.charge_no`), so `INV-0029-R1` would insert. But nothing mints it and nothing renders a revision relationship — there is no `revises_invoice_id`, no revision column of any kind. What the schema *does* agree with is the other half: invoices are frozen after issue (`reject_invoice_edit_after_issue`) and corrected by Void + `credit_note_no`. | SQL: `select … from pg_constraint … contype='c' and relname in ('invoices',…) and def ~ 'invoice_no'` → **0 rows**. Live brief `invoices` CHECK list (four constraints, none a format); trigger `reject_invoice_edit_after_issue` BEFORE UPDATE on `invoices`. |
| 16 | The register must carry "both populations" — unnumbered pro formas *and* finalised numbered docs | GAP | `invoices.invoice_no` is `text not null`; there is no nullable-number state, no `lifecycle_status` on `invoices`, and `document_registry.lifecycle_status` (which does have one) has **no query module and no write path** in `src/`. | Live brief `invoices` columns; `src/modules/rentals/BookingDetail.tsx:653`, `:1675-1678` — "document_registry … has no query module yet — nothing". |
| 17 | `reports` → "audience-grouped index; each card = {question, route, roles}" | GAP on all three fields, and there is **no /reports index page at all** | `/reports` is a `<Navigate to="/reports/pulse" replace />`. The register that exists is `catalog.ts`'s 43 reports in **ten subject groups** — Overview, Rentals, Equipment, Inventory, Clients, Finance, Operations, Damage & Maintenance, Staff (+10th) — not audiences. `CatalogReport` is `{key, name, group, route, projection, needs?, financeTab?, unresolved?}`: **no `question`/promise field and no `roles` field.** It is rendered as a *tab inside Finance*, not as an index. | `src/App.tsx:118`; `src/modules/reports/catalog.ts:88-97` (GROUPS), `:177-213` (`CatalogReport`); `src/modules/reports/ReportCatalog.tsx:132`, mounted `src/modules/finance/Finance.tsx:1070`. |
| 18 | "Money-blind roles: money-question cards are NOT BUILT (Law 6), so the index a Warehouse operator sees is genuinely shorter" | MISLEADING | It is not shorter — it is **absent**. `/reports` is in `MONEY_ROUTES`, so `Shell` refuses the whole surface for Warehouse/Technician/Driver/Client and renders `RestrictedState`. `ReportCatalog` itself also wraps the entire catalog in `PageBody {...restriction}` with the comment "the whole catalog is money". There is no per-card omission anywhere. | `src/data/nav.ts:155-161` (`MONEY_ROUTES` includes `/reports`); `src/modules/reports/ReportCatalog.tsx:251-254`. |
| 19 | §14.3: the two revenue totals differ by Rs.18,450 because the bookings strip excludes Cancelled while cancelled bookings' finalised invoices still count | UNVERIFIABLE from this repo or this DB | The arithmetic is exact (10,124,768.39 − 10,106,318.39 = 18,450.00) but both populations are **empty here**: `invoices` = 0 rows, `booking_lines` = 0 rows, `external_invoices` = 0 rows. 200 bookings exist, 60 of them cancelled, and every one of them totals Rs.0 because no line items exist. Our own Finance screen renders no revenue figure at all (`Revenue: 'Not tracked yet'`), so there is no local pair to compare. **Settled only by a Booqable-side query** — their orders index total (excl. tax) filtered to `status = canceled`, compared against their invoices register with the same filter; if it returns 18,450.00 the hypothesis holds. `external_refs` has pulled only `clients` and `products`, so no order or invoice data is available locally to stand in. | SQL run 31 Aug: `invoices_rows 0, booking_lines_rows 0, bookings_rows 200, bookings_cancelled 60, external_invoices_rows 0, all_line_revenue 0`. Live brief `external_refs`: booqable/clients=100, booqable/products=71 only. `src/modules/finance/Finance.tsx:886`. |
| 20 | §14.2 tabs `Invoices · Contracts · Quotes` — three registers, one screen | GAP against our Documents module | Our `/documents` has **nine** category tabs driven by a seed constant, not three lifecycle registers. Quotes have no table at all (the `quote` sequence row exists, unused); Contracts live in `document_registry`, which nothing queries. | `src/data/documents.ts:45-64` (CATEGORIES + Archived); `src/modules/documents/Documents.tsx` tab strip. |
| 21 | The Documents register is DB-backed | GAP — `/documents` is **seed-only** | `Documents.tsx` (1528 lines) imports nothing from `src/actions/`, nothing from `src/lib/queries/`, nothing from `src/lib/dataAccess`, and never touches `supabase`. Every row, count, tab, donut and panel is a constant from `src/data/documents.ts`, filtered in-memory. Nothing on the screen writes. `document_registry` and `document_deliveries` are both 0 rows live and both unqueried. | `grep -n "supabase\|lib/queries\|actions/\|dataAccess\|useList" src/modules/documents/Documents.tsx` → **no matches** (only a prose mention at `:391`); imports `:1-48`. |
| 22 | Which of `/documents` and `/finance/documents` is canonical | Settled: **`/documents` is canonical** | Both routes mount the *same* `<Documents />` with **no props** — identical component, identical unfiltered seed, all nine categories. `/documents` carries the honest crumb "Documents & Registry" and is reachable by every authenticated role. `/finance/documents` is crumbed "Finance / Tax & Invoices" but renders the full register titled "Documents", and is money-gated only by the `/finance` prefix. A third mount, `<Documents embedded />`, is Finance's Documents tab — that one is the only variant that differs. | `src/App.tsx:355-360` (`/documents`), `:448-453` (`/finance/documents`, no `embedded` prop), `src/modules/finance/Finance.tsx:1041`; `src/data/nav.ts:155-161`. |

## Corrected Layer D

```
accounts   GAP — not built. portal_users / portal_sessions / portal_auth_challenges
           exist with RLS on and ZERO policies (deny-all to every non-bypassrls
           role). There is no invite token column, no token table, no invite
           action, and no code in src/ that reads or writes any of the three.
           Adopting §14.1's invite-only model is a NEW build, not a wiring job.
           Reads: nothing   |   Writes: nothing

register   THE INVOICE REGISTER IS NOT /documents. It is the Finance → Invoices
           tab.
           source   invoices ⨝ clients(name) ⨝ bookings(booking_no)
                    — src/lib/queries/finance.ts:343-348, :452-478
           filter   status chips over STORED_INVOICE_STATUSES + presence
                    voided_at, via applyListFilters
           order    issue_date desc, tiebreak id  (finance.ts:463-466)
           window   dateRange { column: 'issue_date' | 'due_date', fromAd, toAd }
                    — ONE range per query; two simultaneous date dimensions are
                    NOT expressible today
           money    RLS only. There is NO invoices_v / payments_v / expenses_v.
                    A money-blind session gets HTTP 200 and [] — gate the screen
                    with financeRestriction() or it reads as "no invoices".
           engine   listQuery.ts (applyListFilters) + useList
           action   GAP — no invoice create/issue/finalise action exists
           facets   GAP — booking_facets() does not exist in the DB; facetCounts.ts
                    is unwired; no screen shows an option count today
           Reads: invoices (base table, RLS-gated)  |  Writes: nothing

documents  source   src/data/documents.ts (constants), filtered in memory
           GAP      document_registry + document_deliveries are the real tables;
                    both are 0 rows live and neither has a query module or a
                    write path. src/actions/documents/createDocument.ts has no
                    `implemented: true` and an execute() that only console.logs.
           Reads: nothing   |   Writes: nothing

overdue    due_date <= previousDay(nepalDay(today))
             AND status IN (unsettled)
             AND voided_at IS NULL
           — src/lib/queries/finance.ts:561-568. Columns are issue_date /
           due_date (both `date`), NOT issued_at / due_at.
           'Overdue' is a live invoice_status label that is NEVER stored; a
           chip filtering status='Overdue' returns zero rows silently.
           Render: chip + KPI total only. The amber-pill-in-the-date-cell
           treatment is GAP — not built.

numbering  next_document_number(p_sequence_key text) → text.
           ⚠ supabase-js RPC args are NAMED. rpc('next_document_number',{kind:…})
           fails at RUNTIME, not compile time.
           The `invoice` sequence row exists (INV-, current_value 120) and NOTHING
           CALLS IT. Only client / payment / bundle / equipment have call sites.
           Finalisation-time minting is GAP — there is no finalisation path, and
           invoice_no is `not null` so there is no unnumbered pro-forma state.
           invoices.invoice_no carries NO format CHECK, so a `-R1` revision suffix
           is representable — but no revision link column exists.
           Writes: GAP  |  Reads: number_sequences (via the RPC)

reports    GAP as an index — /reports is Navigate → /reports/pulse.
           What exists: catalog.ts, a register of 43 reports in TEN SUBJECT
           groups (Overview / Rentals / Equipment / Inventory / Clients /
           Finance / Operations / Damage & Maintenance / Staff / +1) — not
           audiences. CatalogReport = {key, name, group, route, projection,
           needs?, financeTab?, unresolved?}. There is NO `question` field and
           NO `roles` field.
           It renders as a TAB inside Finance (Finance.tsx:1070), not an index.
           money   whole-surface, not per-card: /reports is in MONEY_ROUTES, so
                   Shell refuses it and draws RestrictedState; ReportCatalog
                   additionally wraps everything in PageBody {...restriction}.
           Reads: src/data/pulse.ts figuresFor() (seed)  |  Writes: nothing
```

## Money and Law 6

**What is money on these screens.** On the Finance → Invoices register: `subtotal`,
`discount_amount`, `taxable_amount`, `vat_amount`, `total_amount`, `paid_amount`,
`outstanding_amount`, and the derived `overdueTotal`. On `/documents`: **nothing** — no money
amount exists anywhere on `DocRow`, so there is no figure for a field gate to strip. On
`/reports`: the entire catalog is treated as money.

**Which roles are blind.** `auth_can_view_money()` = role NOT IN (Warehouse, Technician, Driver,
Client) — identical in the DB and in `src/lib/rbac.ts`. Same four roles both sides.

**How each surface gates, precisely:**

- **Finance → Invoices — RLS, not a view.** There is no `invoices_v`, no `payments_v`, no
  `expenses_v`. The gate is the `*_money_blind` RLS policies on `invoices` / `payments` /
  `security_deposits` / `expenses` / `deposit_movements` / `charges`, all `USING
  auth_can_view_money()`. **The failure mode is silence:** a money-blind session gets HTTP 200
  and `[]`, not an error. `financeRestriction()` exists precisely so the screen says "ask an
  Accounts user" instead of "no invoices" (`finance.ts:34-51`).
- **`/finance` and `/finance/documents` — route gate.** `Shell` renders `RestrictedState` for a
  money-blind role on any `/finance` path (`App.tsx`, `nav.ts:155-161`).
- **`/documents` — role-filtered seed arrays.** Not masked: **removed before render.** The page
  calls `useCanViewMoney()` (`Documents.tsx:454`) and every `finance: true` row, the Finance
  category, the Finance tab, the Finance donut slice, the Tax Invoice in Missing, the Quotation
  in Expiring and three of four Quick Actions never enter the arrays. This satisfies "hidden
  means not in the DOM". ⚠ **But four KPI tiles ignore the gate** — "This Month Created 132",
  "Pending Signatures 18", "Expiring 24", "Missing 16" are the same literal strings for every
  role, so a Warehouse session reads a footnote of 16 above three rows.
- **`/reports` — whole surface.** In `MONEY_ROUTES`; blind roles never reach the catalog. v2.5's
  "the index a Warehouse operator sees is genuinely shorter" is wrong for us: it is empty.

**Doc–code contradiction recorded.** `docs/pages/24_documents.md:2` says 1466 lines and §5 says
the page "does **not** use `useCanViewMoney()`" and calls `canViewMoney(role)` directly. The file
is now **1528 lines** and line 454 is `const money = useCanViewMoney()`. **The code wins**; the
page doc is stale on both points. The gate's *answer* is unchanged — the hook wraps the same rule.

## What this changes for the build

1. **Stop treating `/documents` as the invoice register.** The register v2.5 §14.2 describes is
   already built, DB-backed, and lives at Finance → Invoices (`listInvoices`). `/documents` is a
   seed-only catalogue of nine document categories with zero DB reads and zero writes. Do not
   wire the metric strip, the payment-status facets or the two date filters into
   `Documents.tsx` — wire them into `Finance.tsx`, or you will build the register twice.
2. **Delete or re-purpose `/finance/documents`.** It mounts the identical unfiltered component
   under a crumb ("Finance / Tax & Invoices") that promises a filtered view it does not deliver.
   `/documents` is canonical. If the Finance crumb is wanted, it must pass a filter prop.
3. **Do not write `booking_facets()` or a `payment_status` facet.** Neither exists. Nothing named
   `*facet*` exists in the database, `facetCounts.ts` has no caller in `src/`, and `invoices` has
   no `payment_status` column — it has `status`, whose enum lacks `Overpaid` and `Process
   deposit` entirely. Wiring option counts is its own task: `useFacetCounts` → `FilterOptionList`,
   currently mounted only in a test.
4. **Use `issue_date` and `due_date`.** `issued_at` / `due_at` do not exist. Both are `date`, not
   `timestamptz`, so no Kathmandu-offset arithmetic applies — only "which calendar day is today",
   which `nepalDay()` already answers.
5. **`listQuery` does not need "naming WHICH column" — it already does.** The real change is
   allowing **two** date bounds in one `ListFilters` (invoice date AND due date). Today
   `dateRange` is a single object; a second dimension needs either `dateRanges: […]` or a second
   named field. Do not "fix" the column naming — it is not broken.
6. **Invoice numbering is not a timing question yet, it is a missing path.** No code anywhere
   asks for the `invoice` sequence. Before arguing creation-vs-finalisation, note there is no
   pro-forma state to finalise *from*: `invoice_no` is `not null` and `invoice_status` starts at
   `Draft`. Supporting §14.2's two populations needs a schema decision, not a call-site move.
   When it is written, the argument is **`p_sequence_key`**, and it is a named RPC arg —
   getting it wrong fails at runtime, not at compile time.
7. **`-R1` revisions are representable but unmodelled.** No format CHECK blocks the suffix, but
   no column links a revision to what it revises. Our shipped answer to corrections is Void +
   `credit_note_no`, enforced by `reject_invoice_edit_after_issue`. Adopting `-R1` means adding a
   revision link, not just a string convention.
8. **The reports index is unbuilt, and regrouping it is a two-field schema change to
   `catalog.ts`.** Adding `question` (the one-line promise) and `roles` to `CatalogReport`, plus
   an audience→subject mapping, is cheap. But note our groups are *subject*-based by ruling, and
   `/reports` currently redirects away — building an index means adding a route, not editing one.
9. **Portal accounts are a greenfield build.** Three deny-all tables, zero rows, zero code. The
   invite-token flow §14.1 describes has no column to store a token in today.
10. **Fix the four ungated Documents KPI literals** (`src/data/documents.ts:325-335`) — they
    contradict the panels beneath them for every money-blind role.

## Open questions

1. **Does the Rs.18,450 gap come from cancelled bookings?** UNVERIFIABLE here — `invoices`,
   `booking_lines` and `external_invoices` are all 0 rows, so both populations compute to Rs.0.
   *Settled by:* one Booqable-side pair of queries — orders index total (excl. tax) with
   `status = canceled`, and the invoices register total with the same order filter. If the second
   minus the first is 18,450.00 the hypothesis holds. Nothing in our DB can answer it; `external_refs`
   has pulled only `clients` (100) and `products` (71).
2. **Does `/documents` become the pro-forma+finalised invoice register, or stay a document
   catalogue while Finance owns invoices?** *Settled by:* a PLAN.md ruling. v2.5 §14.6.2 asks
   the same question and leaves it open; our two screens currently answer it both ways at once.
3. **Is there an unnumbered pro-forma state at all?** *Settled by:* a schema decision on whether
   `invoices.invoice_no` becomes nullable-until-issued, or whether pro formas live in
   `document_registry` (which has `lifecycle_status` and `document_no`, and is entirely
   unqueried). The choice determines where `next_document_number('invoice')` gets called.
4. **Overdue boundary — is an invoice due *today* overdue?** Flagged as a live `TODO(decision)`
   at `finance.ts:553-559`; the code currently says no. *Settled by:* a ruling; it is a one-line
   change in one place.
5. **Do report cards get `roles`, given the whole surface is already blocked?** Per-card role
   filtering is only meaningful if `/reports` leaves `MONEY_ROUTES`. *Settled by:* deciding
   whether a Warehouse role should see a non-money subset of reports at all.
