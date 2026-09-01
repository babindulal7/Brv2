# Layer D verification — Quotes & Contracts registers, Product fulfillment, Background tasks
v2.5 section: §17 (lines 1120-1174)   ·   Our route(s): /documents
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

§17 is unusual: Layers A/B/C are dense (they describe Booqable's screens) but its **Layer D
surface is small and almost entirely PROPOSAL** — one ruling about `next_document_number`, one
about `PageBody`, one about `todaysOutgoing`, one about `data/liquidityReports`. Those four are
verified below, together with every fact §17 asserts about our side of the line.

The headline: the numbering ruling at line 1137 is written as if it merely names existing call
sites. It does not. **`next_document_number('quote')` has ZERO call sites in `src/`, and the
`quote` sequence has never been minted from (`current_value = 0`).** The `invoice` half is worse
— its only "call site" is a comment. And three code paths that DO call the RPC pass sequence keys
that **do not exist in `number_sequences` and therefore raise at runtime**.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `next_document_number(...)` is the numbering allocator (§17 line 1137) | **CONFIRMED** | It exists, `LANGUAGE plpgsql`, `select … for update` on `number_sequences`, raises `'Number sequence % does not exist'` on an unknown key | `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='next_document_number'` — full body returned |
| 2 | Its argument, implied by `next_document_number('quote')` as a positional literal | **CONFIRMED (and it is the known-bad fact's opposite)** | Signature is `next_document_number(p_sequence_key text) RETURNS text`. There is **no** `kind` argument. §17 writes the call positionally so it does not itself repeat §2.4's `kind` error — but any builder translating `next_document_number('quote')` into supabase-js MUST write `rpc('next_document_number', { p_sequence_key: 'quote' })`; `{ kind: … }` fails at RUNTIME, not compile time | `SELECT pg_get_function_identity_arguments(oid) …` → `p_sequence_key text` |
| 3 | A `quote` sequence exists to fire at creation | **CONFIRMED (row) / GAP (usage)** | The row exists: `sequence_key='quote', prefix='Q-', padding=1, include_year=false` — but `current_value = 0`. **It has never issued a number.** | `select * from number_sequences order by sequence_key` → 10 rows; quote row `current_value:0` |
| 4 | `next_document_number('quote')` fires at creation (the proposed ruling, stated as adoptable) | **GAP — not built** | Repo-wide grep for `next_document_number` across `src/` returns 12 runtime call sites. **None passes `'quote'`.** No code anywhere mints a quote number | `grep -rn next_document_number src/` — call sites at `createStockTransfer.ts:267`, `createEquipment.ts:395`, `createBundle.ts:295`, `recordPayment.ts:330`, `createClient.ts:338`, `finance.ts:1331`, `sync.ts:319` (×5 keys). No `'quote'` |
| 5 | `next_document_number('invoice')` fires at finalisation | **GAP — not built** | The `invoice` row is live (`prefix='INV-'`, `current_value=120`), but the only mentions of `next_document_number('invoice')` in `src/` are **prose in comments**: `CreateInvoiceModal.tsx:21,326,615`, `Finance.tsx:746`, `VoidInvoiceModal.tsx:37`, and a test name at `CreateInvoiceModal.numbering.test.tsx:32`. `CreateInvoiceModal.tsx` contains **no `supabase`, no `.rpc(`, no `.insert(`** at all | `grep -n "supabase\|rpc(\|insert(" src/modules/finance/modals/CreateInvoiceModal.tsx` → zero hits (only `onSubmit`/`disabled` matched) |
| 6 | Implicit: the RPC's live call sites pass valid sequence keys | **MISLEADING — three paths raise at runtime** | `src/lib/booqable/sync.ts` mints with **`'EQ'`, `'CL'`, `'BK'`, `'PAY'`, `'DEP'`** — none of which is a `sequence_key`. The live keys are lower-case words (`equipment`, `client`, `booking`, `payment`, `deposit`). Every one of these five calls raises `Number sequence EQ does not exist`. Separately `createStockTransfer.ts:268` passes `'transfer'`, which also has no row — that file at least *documents* the failure (`:265-266`, `:271-276`) | `sync.ts:318-320` (fn), call sites `:462 'EQ'`, `:799 'CL'`, `:926 'BK'`, `:1212/:1236 'PAY'`, `:1240/:1247 'DEP'`; `createStockTransfer.ts:267-268`; SQL row list has no `EQ`/`CL`/`BK`/`PAY`/`DEP`/`transfer` |
| 7 | Two numbering policies coexist by document type (creation vs finalisation) | **UNVERIFIABLE for our repo** | True of Booqable (Layer A/B, trusted). Ours has **neither** policy implemented, so there is nothing to confirm or contradict. `number_sequences` is a flat 10-row registry with no `mint_at` column — the split is not expressible in today's schema | `select * from number_sequences` → columns are `sequence_key, prefix, current_year, current_value, padding, updated_at, include_year` only |
| 8 | Quotes and Contracts are tab-routed registers over the same screen as Invoices | **GAP — not built** | We have no `/reports/documents/*` route and no quotes or contracts register. `/documents` (and its alias `/finance/documents`, plus `<Documents embedded />` inside Finance) is a single flat register with a `CategoryKey` union of 8 — `Rental · Finance · Operations · Maintenance · Cases · Inventory · Templates · Archived`. Neither "Quotes" nor "Contracts" is a tab | `src/data/documents.ts:21-29` (`CategoryKey`), `:44-53` (`CATEGORIES`); routes per App.tsx: `/documents`, `/finance/documents` |
| 9 | Shared columns `#· Booking · Customer · **Confirmed · Signed** · Document date · Excl. taxes · Incl. taxes` | **GAP — not built** | Our table's columns are select-all · Document Name · Type · Related To · Client / Vendor · Status · Created On · Actions (`Documents.tsx:1055-1199`). There is **no `Confirmed` column, no `Signed` column, and no tax columns at all.** Note also the naming law: the spec's `Customer` is `Client / Vendor` here (PLAN.md §6.1) | `docs/pages/24_documents.md` §2 row 4b-iv, citing `Documents.tsx:1055-1199` |
| 10 | `Confirmed` and `Signed` are lifecycle *columns* on contracts | **MISLEADING as a schema shape** | `document_registry` carries **`signed_at`, `signed_by_name`, `signature_url`** and a single `lifecycle_status` enum. There is **no `confirmed_at` and no `confirmed` column anywhere on it**. "Confirmed" is not a stored fact in our schema; the nearest equivalent is `lifecycle_status = 'Issued'` or the booking's own `stage` | live schema brief, `document_registry` columns; `select enumlabel …` → `document_lifecycle_status = {Draft, Pending Approval, Pending Signature, Signed, Issued, Void, Expired}` |
| 11 | The signature workflow "exists and is largely unused" | **CONFIRMED for Booqable (Layer A) / GAP for us** | Ours does not exist to be unused. `document_registry` has **0 rows** live; `signatures` has 0 rows; `document_deliveries` has 0 rows. `Documents.tsx` reads **none of them** — it imports nothing from `src/actions/`, nothing from `src/lib/queries/`, nothing from `src/lib/dataAccess` | `Documents.tsx:1-48` (import block: only `data/documents`, `data/documentIntel`, UI); `docs/pages/24_documents.md:90` says the same and adds that `document_registry` is UNSERVED by the mock corpus too |
| 12 | Backlog I4 — is Contracts' Confirmed/Signed usage load-bearing? "If unused, our contract flow starts from zero" | **CONFIRMED: it starts from zero** | Three independent proofs. (a) No column exists (row 9). (b) No table row exists — `document_registry` = 0. (c) No write path exists: `BookingDetail.tsx:653` ships the literal string *"Document uploads are not wired — document_registry has no write path from this screen."* and `:1678` repeats it. There is nothing to migrate and nothing to preserve | `src/modules/rentals/BookingDetail.tsx:653`, `:1675-1678`; live `document_registry` rowcount 0 |
| 13 | Our document statuses can carry the lifecycle | **CONFIRMED — the one clean alignment in this section** | `DocStatus` in the fixture is `Draft \| Pending Approval \| Pending Signature \| Signed \| Issued \| Void \| Expired` — **exactly the seven `document_lifecycle_status` labels, in the same order.** The fixture was written to the enum. `Signed` therefore has a home the day a query module is written | `src/data/documents.ts:71-79` vs `select enumlabel from pg_enum … 'document_lifecycle_status'` |
| 14 | §17.2: Product fulfillment report (`/reports/pickups`) | **GAP — not built** | We have no such route. Our 11 report routes are pulse/expenses/clients/promotions/staff/inventory/equipment-performance/forecasting/cash-flow/working-capital. `fulfillment_outcomes` exists as a live table (0 rows) but appears in `src/` **only inside the generated `types/supabase.ts`** — no query, no action, no screen | `grep -rn fulfillment_outcomes src/` → every hit is `src/types/supabase.ts:5351-5507`; route list per App.tsx |
| 15 | §17.2: "the report and the panel must share the `todaysOutgoing` filter set" | **CONFIRMED as to the engine; the report half is a GAP** | `todaysOutgoing(dayAd)` is real and is genuinely the single shared source: `bookings.ts:529`. It is consumed by Today (`data/today.ts:925-927`), Rentals List (`data/rentals.ts:681-682, 723-724, 885`), and asserted identical by two tests. So the discipline the spec asks for is already the repo's practice — there is simply no report to share it *with* yet | `src/lib/queries/bookings.ts:529`; `src/modules/today/__tests__/todayQuery.test.ts:338` asserts `pickupsQuery('Today',[]).filters` equals `todaysOutgoing(TODAY_DAY_AD)`; `rentalsList.test.ts:413` asserts the same for `RENTAL_KPI_FILTERS.pickups` |
| 16 | §17.2: `todaysOutgoing` bounds an operational day | **CONFIRMED (bonus detail the spec omits)** | It is a Kathmandu **operational** day, 06:00→06:00 by default, +05:45, and it selects **Booked and Packed only** — not a midnight calendar day. A report that shares "the filter set" inherits that, which is exactly why sharing it matters | `bookings.ts:529`; `src/lib/queries/__tests__/bookings.test.ts:384-385` ("bounds a Kathmandu OPERATIONAL day — 06:00 → 06:00 by default (D4)"); `MovementList.tsx:55` |
| 17 | §17.3: Background tasks screen | **GAP — not built** | No route, no module, no component. Nothing named `background`/`backgroundTask` exists in `src/`. The nearest machinery is `src/lib/offlineQueue.ts` (Dexie queue: `enqueueMutation`, `getPendingMutations`, `getDeadLetterMutations`, `drainQueue`) and the live `sync_outbox`/`sync_inbox`/`sync_log` tables (all 0 rows) — **but no screen in `src/modules/` imports any of them** | `grep -rn -i "background.task\|backgroundTask" src/` → 0 hits; `grep -rn "sync_outbox\|sync_inbox\|drainQueue\|offlineQueue" src/modules/ src/data/` → 0 hits |
| 18 | §17.3: "Our equivalent keeps `PageBody`'s guarantee: an empty queue *says* it is empty" | **MISLEADING** | `PageBody` is real and does exactly what the spec credits it with — a fixed, non-configurable ladder `restricted → error → loading → empty → children`, with `hasRows` choosing the *shape* of the error/loading state, never its rank. **But `/documents` does not use it.** `Documents.tsx` imports `EmptyState` from `StateViews` directly (`:12`) and hand-rolls the branch at `:1004`/`:1068`. So the guarantee is not currently inherited by this section's own screen | `src/components/ui/PageBody.tsx:1-60` (ladder + `hasRows` doc); `grep -n PageBody src/modules/documents/Documents.tsx` → **0 hits**; `EmptyState` import at `Documents.tsx:12`, used `:1068` |
| 19 | §17.4: reuse `data/liquidityReports` for Overdue Receivables | **CONFIRMED (module exists, and the spec's caution is warranted)** | `src/data/liquidityReports.ts` exists and is consumed by `CashFlowReport.tsx:28` and `WorkingCapitalReport.tsx:30`. It is however a **hand-typed fixture**, not a query — `WorkingCapitalReport.tsx:56` and `payables.test.ts:22` both record that it hand-typed `Trade payables: rupees(42_200)`. Reusing it inherits fixture data, not live receivables | `src/data/liquidityReports.ts`; `CashFlowReport.tsx:28,40,213`; `WorkingCapitalReport.tsx:30,56`; `src/modules/reports/__tests__/payables.test.ts:14,22` |
| 20 | §17.4: `Balance due` per client + `Total balance due` — skeleton of Overdue Receivables | **UNVERIFIABLE as stated / partial GAP** | `client_directory_v` **does** expose `outstanding_amount`, `deposit_held_amount`, `total_paid_amount`, gated `NULL` unless `auth_can_view_money()`. So a per-client balance-due column is servable today. But `invoices` and `payments` are **0 rows** live, so every such figure computes to zero or null — and no Overdue Receivables report exists to hold them | live schema brief, `client_directory_v`; `invoices`/`payments` rowcounts 0 |
| 21 | Bonus: the one document write path that exists | **MISLEADING if cited as built** | `src/actions/documents/createDocument.ts` (43 lines) is a **stub**: it `console.log`s `[DB TX] Created document …`, never touches Supabase, and mints its id from **clock digits** — `issue('DOC', Number(Date.now().toString().slice(-4)))` (`:21`) — the exact anti-pattern `next_document_number` exists to replace. It has **no runtime importer**; the only mention in `src/` is prose at `Documents.tsx:387` | `src/actions/documents/createDocument.ts:19-22`; `grep -rn createDocument src/` → one comment hit |

### Known-bad facts: does §17 repeat any?

- **`kind` vs `p_sequence_key`** — §17 does **not** repeat it. Line 1137 writes the call
  positionally (`next_document_number('quote')`), which is compatible with the real signature.
  It is nonetheless a **trap**: supabase-js RPC arguments are named, so the translation is
  `rpc('next_document_number', { p_sequence_key: 'quote' })`. Flagged, not charged.
- **Law numbers, BrandKey, Card, ClickableRow, `facetCounts`, the 19-module engine list** — none
  appear in lines 1120-1174. §17 carries none of the other six.
- New defect this pass adds to the list: **`sync.ts`'s five sequence keys are all invalid**
  (row 6). This is the same class of error as the `kind` bug — a wrong string that typechecks and
  fails at runtime — and it has five call sites, not one.

---

## Corrected Layer D

### 17.1 Quotes and Contracts registers → our `/documents`

    source   document_registry (live, 0 rows) — NOT READ BY THIS SCREEN.
             What renders is src/data/documents.ts, a hand-written constant array
             (DOCS, CATEGORIES, KPIs, rail panels), filtered and sorted in memory
             at Documents.tsx:488-519.
    filter   category (CategoryKey, 8 values) + type + status + date range +
             relatedTo + branch + search. All client-side over the fixture.
             No quotes tab, no contracts tab.
    order    SORTS <Select> in the toolbar (Documents.tsx:857-938), in memory.
    window   none — no date window is sent anywhere, because nothing is fetched.
    money    useCanViewMoney() (Documents.tsx:454) → categoriesFor / documentsFor /
             kpisFor / missingFor / expiringFor / quickActionsFor (:461-474).
             Money-blindness removes finance rows from the ARRAY before render.
    engine   none. No src/lib/ engine participates.
    action   none wired. src/actions/documents/createDocument.ts exists but is a
             console.log stub with no importer.

    Writes: GAP — not built. (Nearest: actions/documents/createDocument.ts → nothing;
            BookingDetail.tsx:653 states document_registry has no write path.)
    Reads:  src/data/documents.ts (fixture).   Should read: document_registry.

### 17.1 numbering — the ruling, corrected to what a builder must actually write

    RPC      next_document_number(p_sequence_key text) RETURNS text
    call     supabase.rpc('next_document_number', { p_sequence_key: 'quote' })
             ^ NAMED argument. Positional/`kind` fails at runtime.
    keys     Only these 10 exist: booking, bundle, client, deposit, equipment,
             expense, invoice, membership, payment, quote.
             Anything else raises 'Number sequence % does not exist'.
    format   include_year=false → prefix || lpad(n, padding, '0')      e.g. Q-1
             include_year=true  → prefix || year || '-' || lpad(...)   e.g. PAY-2026-0094
             Only 'payment' has include_year=true.
    quote    prefix 'Q-', padding 1, current_value 0 → first mint is 'Q-1'.
    invoice  prefix 'INV-', padding 1, current_value 120 → next mint is 'INV-121'.

    Writes: GAP — not built for quote OR invoice.
            'quote'   → zero call sites in src/.
            'invoice' → comments only (CreateInvoiceModal.tsx:21,326,615).
    Broken: sync.ts:462/799/926/1212/1236/1240/1247 pass 'EQ'/'CL'/'BK'/'PAY'/'DEP'
            → all raise. createStockTransfer.ts:268 passes 'transfer' → raises.

### 17.2 Product fulfillment (`/reports/pickups`)

    GAP — not built. No route, no module.
    Available if built: fulfillment_outcomes (live table, 0 rows, RLS on/2 policies,
    referenced in src/ only by the generated types file).
    Filter set to share, and it already exists:
      todaysOutgoing(dayAd)  — src/lib/queries/bookings.ts:529
      Kathmandu OPERATIONAL day, 06:00→06:00, +05:45, stages Booked + Packed only.
      Already shared by data/today.ts:925-927 and data/rentals.ts:885, with two
      tests pinning the equality. A new report MUST import it, not restate it.

    Writes: n/a (read-only report).
    Reads:  GAP — would read fulfillment_outcomes and/or listBookings(todaysOutgoing(day)).

### 17.3 Background tasks

    GAP — not built. No route, no module, no component; no screen imports the queue.
    The machinery that would back it, all currently headless:
      src/lib/offlineQueue.ts — Dexie 'OfflineQueueDB': enqueueMutation,
        getPendingMutations, markMutationSyncing, markMutationFailed,
        resolveMutation, getDeadLetterMutations, drainQueue.
      live tables sync_outbox / sync_inbox / sync_log / sync_conflicts / sync_state
        (all 0 rows; sync_outbox carries status, attempts, next_attempt_at, error —
         i.e. the Failed state the 18 Aug archive documents).
    The spec's PageBody promise is NOT currently kept anywhere in this section:
      PageBody (src/components/ui/PageBody.tsx) is real and does guarantee
      restricted → error → loading → empty → children, but Documents.tsx does not
      use it. A Background Tasks screen MUST use PageBody to make the claim true.

    Writes: n/a.   Reads: GAP — would read sync_outbox (dead-letter view of offlineQueue).

### 17.4 Customer report (`/reports/customers`) → our `/reports/clients`

    Not this section's route, but §17.4 makes two Layer D assertions that land here:
    source   client_directory_v (view). WHERE auth_is_staff().
    money    outstanding_amount, deposit_held_amount, total_paid_amount are
             CASE WHEN auth_can_view_money() THEN col ELSE NULL — masked IN THE VIEW.
             Balance due is therefore servable today without new SQL.
    caveat   invoices = 0 rows and payments = 0 rows live, so every money figure
             renders zero/null regardless of code. Corpus, not defect.

    Writes: n/a.
    Reads:  client_directory_v.
    'AOV deviation' / 'Show revenue by' selector: GAP — not built.
    Overdue Receivables report: GAP — not built. data/liquidityReports.ts exists but
    is a hand-typed fixture (WorkingCapitalReport.tsx:56 records this), not a query.

---

## Money and Law 6

**What is money on `/documents`:** nothing on the row itself. The register shows Document Name,
Type, Related To, Client / Vendor, Status, Created On. No amount column exists — so v2.5's
`Excl. taxes` / `Incl. taxes` columns have no counterpart to gate.

**What is gated instead is document VISIBILITY, at a coarser grain than money:** the whole
`Finance` category — invoices, receipts, credit and debit notes — is removed for money-blind
roles. `useCanViewMoney()` (`Documents.tsx:454`) feeds six selector functions (`categoriesFor`,
`documentsFor`, `kpisFor`, `missingFor`, `expiringFor`, `quickActionsFor`, `:461-474`), each of
which returns a **shorter array**. The tab, the rail entry, the rows, the donut slice, the KPI
tile and the finance quick actions are all absent from the arrays before React sees them.

**"Hidden" here does mean not built into the DOM** — the filtering happens on the data, not with
CSS or `aria-hidden`. `Documents.tsx:482` additionally hardens the URL surface: a money-blind
session pasting `?cat=finance` lands on `All`, not on an empty forbidden tab.

**Which roles are money-blind:** `auth_can_view_money()` is `auth_user_role() NOT IN
('Warehouse','Technician','Driver','Client')` — so Warehouse, Technician, Driver and Client.
`useCanViewMoney()` must mirror exactly that set.

**Which layer enforces it — and the honest answer for this screen: NONE of the three.**
`/documents` reads no table, so no RLS policy and no masked view is in the path. Today the only
gate is the client-side `useCanViewMoney()` selector, which is a **UI convention, not an
enforcement**. CLAUDE.md's law says "Warehouse sees no money — enforced by RLS, not the UI".
The moment `document_registry` is actually queried, the RLS policies on it (`on/2`) become the
real gate and the selectors become a second, cosmetic layer. Until then this screen satisfies the
law only because there is no data behind it to leak.

---

## What this changes for the build

1. **Stop citing §17 line 1137 as a description. It is a proposal, and nothing implements it.**
   `next_document_number('quote')` has zero call sites; the `quote` sequence sits at
   `current_value = 0`. Adopting the split is net-new work on both halves.
2. **Fix `sync.ts` before anything else in this area — it is five latent runtime failures.**
   `sync.ts:462, 799, 926, 1212, 1236, 1240, 1247` pass `'EQ'`, `'CL'`, `'BK'`, `'PAY'`, `'DEP'`.
   The live keys are `equipment`, `client`, `booking`, `payment`, `deposit`. Every Booqable pull
   that creates a new record raises `Number sequence EQ does not exist`. This typechecks
   (`mintDocumentNumber(sequenceKey: string)`) and fails only when run. Fix the literals **and**
   narrow the parameter type to a union of the 10 real keys so the next one cannot compile.
3. **`createStockTransfer.ts` is blocked on a migration, not a bug.** It passes `'transfer'`,
   which has no row, and it says so honestly at `:265-266` and `:271-276`. Seeding the row (and
   ruling `TR-` vs `TRF-`) is a migration decision for PLAN.md §4 — do not paper it over.
4. **Backlog I4 is answered: the contract flow starts from zero.** No `confirmed` column exists
   anywhere in `document_registry`; `signed_at`/`signed_by_name`/`signature_url` exist but the
   table has 0 rows and no write path (`BookingDetail.tsx:653`). There is nothing to migrate,
   nothing to preserve, and no usage data to learn from. Design it freely.
5. **One thing is already right and should not be rebuilt: `DocStatus`.** The fixture's seven
   statuses are `document_lifecycle_status` verbatim, in order (`data/documents.ts:71-79`).
   Wire the query straight onto the enum; do not introduce a mapping layer.
6. **"Confirmed" is not a column — decide what it means before building it.** Either add
   `confirmed_at` to `document_registry` (a migration), or derive it from
   `lifecycle_status = 'Issued'`, or from the booking's own `stage`. Picking silently would
   invent a product decision.
7. **When the Product fulfillment report is built, it must `import { todaysOutgoing }`, never
   restate the filter.** `bookings.ts:529` is a Kathmandu operational day (06:00→06:00, +05:45)
   over stages Booked and Packed only. Two existing tests pin Today and Rentals to it
   (`todayQuery.test.ts:338`, `rentalsList.test.ts:413`); a third should pin the report.
8. **Route the Background Tasks screen through `PageBody`.** §17.3's promise is not currently
   kept by this section's own screen — `Documents.tsx` hand-rolls its empty branch and imports
   `EmptyState` directly (`:12`, `:1068`). Back the screen with `sync_outbox` (which already
   carries `status`, `attempts`, `next_attempt_at`, `error`) plus `offlineQueue.getDeadLetterMutations`.
9. **Delete or finish `src/actions/documents/createDocument.ts`.** It mints from
   `Date.now().toString().slice(-4)` (`:21`) — the clock-digit anti-pattern every other action
   in the repo was rewritten to avoid — writes nothing, and has no importer. Leaving it invites
   someone to wire it.
10. **Expect empty screens and do not diagnose them as bugs.** `document_registry`,
    `signatures`, `document_deliveries`, `fulfillment_outcomes`, `sync_outbox`, `invoices` and
    `payments` are all **0 rows** live. That is corpus, not defect.

---

## Open questions

1. **Should `quote` numbers be minted at booking creation, or at first quote-document creation?**
   Booqable mints per *document* (768 quotes over 654 bookings; #903 carries #763/#764/#765) —
   but we have no quote document at all; we have `bookings.stage = 'Quote'` (7 rows live).
   Minting at stage-entry would produce one number per booking, not per revision, which is a
   different policy from the one §17 says we are adopting.
   *Settles it:* a ruling in PLAN.md §4 stating whether a re-quote is a new numbered document.

2. **What is `Confirmed` in our model?** No column carries it.
   *Settles it:* a ruling choosing `confirmed_at` (migration), `lifecycle_status='Issued'`, or
   `bookings.stage` — recorded in PLAN.md §4 rather than chosen in a component.

3. **Was `sync.ts` ever executed against the live project?** `external_refs` holds 171 rows
   (`booqable/clients` 100, `booqable/products` 71) with `last_pulled_at` NULL on every row, and
   `sync_log` is empty — consistent with the pull never having reached the minting step.
   *Settles it:* `select count(*) from sync_log` (0 today) plus one supervised dry run against a
   branch DB; if it has never run, the wrong keys have never fired and this is pre-release, not
   a live outage.

4. **Does `next_document_number` need a `'transfer'` row, or should stock transfers borrow an
   existing key?** *Settles it:* a PLAN.md §4 ruling on the prefix, then a migration.

5. **Is the `payment` sequence's `include_year=true` intentional as the sole exception?**
   Nine sequences reset never; `payment` resets annually. §17's numbering discussion does not
   cover reset policy at all.
   *Settles it:* the F5 numbering law stating reset behaviour per key.

6. **Does `useCanViewMoney()` resolve to exactly `auth_can_view_money()`'s four roles?**
   Not checked this pass — I verified the SQL predicate, not the hook's role list.
   *Settles it:* read `src/lib/moneyVisibility.ts` and `rbac.canViewMoney`, and a per-role
   authenticated session test (the schema brief flags per-role policy correctness as
   unverified repo-wide).
