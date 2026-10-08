# Layer D verification — Inventory, Downtime, Product detail
v2.5 section: §12 (lines 633-760)   ·   Our route(s): /inventory, /inventory/:assetId
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Layers A/B/C of §12 (what Booqable renders) are trusted and not re-litigated here. Everything
below concerns §12.5's `Backend data link` block plus the four backend assertions §12.3/§12.4
smuggle into prose (purchase cost fallback, deposit value, History = audit trail, buffers).

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `list  products_v` | **CONFIRMED** | The list query reads `products_v`, never `products`. | `src/lib/queries/inventory.ts:793` `supabase.from('products_v')`; rationale at `:53-66` |
| 2 | `units: product_units_v` | **CONFIRMED** | Both the embedded breakdown and the per-serial expansion read the view. | `inventory.ts:537` (`units:product_units_v(status,condition)`), `:543`/`:546` (`!inner` semi-join aliases), `:860` (`listUnits`), `:953` (`getAssetDetail` unit lookup) |
| 3 | `cost  unit purchase_cost` | **WRONG-NAME** | The column is `product_units.purchase_price` (`numeric(14,2)`). Nothing named `purchase_cost` exists on any table. | live schema brief, `product_units`; `inventory.ts:625,438`; `AssetDetail.tsx:755` renders it as "Purchase price" |
| 4 | `…falling back to the product-level default` | **GAP** | The fallback is not modelled anywhere. `InventoryListRow` carries **no** product-level purchase price at all — `COLUMNS_WITH_MONEY` selects only `daily_rate` and `replacement_value`, and the module states outright that `purchase_price` "is not named by any code path in this module". | `inventory.ts:540`, `:292-296`, `:391-394` (the two money fields on the row type) |
| 5 | `This IS the depreciation engine's input` | **GAP** | There is no depreciation engine. `src/lib` has 37 modules and none computes depreciation. `depreciation_logs` exists in the DB with 0 rows and **no reader in `src/`**. The only depreciation surface, `/tools/depreciation`, runs off eight hand-typed seed rows. | `src/modules/tools/DepreciationCalculator.tsx:73` `PRICED_ASSETS = PARENTS.filter(p => p.purchasePricePaisa !== undefined)`, `:154`; repo export map (`src/lib` module list) |
| 6 | `deposit  product-level deposit value` | **GAP (columns exist, unwired)** | `products.deposit_percent` and `products.deposit_fixed` exist, but no query selects them and no engine reads them. `inventory.ts:292-296` names both as deliberately unselected. | live schema brief, `products`; `inventory.ts:292-296`; `grep deposit_percent\|deposit_fixed src/` hits only `booqable/map/products.ts:378-379` (the Booqable **pull** mapper) and `mock/corpus.ts:177` |
| 7 | `resolution chain global → product → client` | **GAP** | No chain exists at any of the three levels. There is **no global deposit setting** (`settingsStore.ts` has no deposit key), no product read (#6), and no client-level rule. `bookings.deposit_required` is whatever the caller passes, defaulting to `0`. | `src/actions/rentals/createRental.ts:373` `deposit_required: input.depositRequired ?? 0`, type at `:171-172`; `grep -n deposit src/lib/settingsStore.ts` → no hits |
| 8 | `downtime  maintenance / cases` | **WRONG-NAME** | The table is `maintenance_records` (0 rows); `cases` also exists (0 rows, plus `cases_v`). Nothing named `downtime` exists as a table, view, enum or column. | live schema brief; `select … from information_schema.columns where table_name='maintenance_records'` |
| 9 | `reason ENUM Maintenance · Repair · Missing` | **MISLEADING** | The enum is `maintenance_type` and its labels are `Repair \| Inspection \| Calibration \| Firmware Update \| Sensor Cleaning \| Internal Cleaning \| Fungus Removal \| Preventive Service` — no `Maintenance`, no `Missing`. Worse: **the enum is bound to zero columns.** `maintenance_records.maintenance_type` is plain `text NOT NULL` with **no CHECK**, so any string is storable. | `select typname, string_agg(enumlabel…) from pg_type join pg_enum …`; `select … from pg_attribute a join pg_type t … where t.typname in ('maintenance_status','maintenance_type')` → **0 rows**; `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.maintenance_records'::regclass and contype='c'` → only `maintenance_cost_non_negative` |
| 10 | `status Scheduled → Started → Ended (+ Cancelled)` | **MISLEADING** | The enum `maintenance_status` is `Scheduled \| In Progress \| Waiting Parts \| At Vendor \| Completed \| Cancelled`. `Started` and `Ended` do not exist. It too is bound to zero columns: `maintenance_records.status` is `text NOT NULL DEFAULT 'Scheduled'` with no CHECK. | same two queries as #9 |
| 11 | `A unit on downtime must be unavailable` | **GAP** | The availability engine excludes units whose **`product_units.status`** is `Maintenance`/`Missing`/`Retired`, but **nothing connects a `maintenance_records` row to that status** — no trigger, no FK-driven rule, no CHECK. Opening a maintenance record does not make the unit unavailable. | `src/lib/availability.ts:165-179` (`UNIT_AVAILABILITY_PRESETS`), `:190-192`; `pg_constraint` on `maintenance_records` shows one CHECK and no trigger tying it to `product_units` |
| 12 | `…the same overlap problem the crew GiST constraints already solve; use the same mechanism` | **CONFIRMED (mechanism) / GAP (application)** | Three `EXCLUDE USING gist` constraints exist and are the right precedent — `crew_bookings_no_double_booking`, `crew_leaves_no_overlapping_leave`, `inventory_reservations_no_double_booking (asset_id WITH =, period WITH &&) WHERE released_at IS NULL`. But `maintenance_records` has **no range column at all** (`scheduled_date date`, `started_at`, `completed_at`) so the constraint cannot be written against it as shaped. | `select conrelid::regclass, conname, pg_get_constraintdef(oid) from pg_constraint where contype='x'` |
| 13 | `history  audit_events` | **CONFIRMED (source exists)** | `audit_events` is real, 5378 rows, and the read layer is written: `listAuditEvents` and `auditForRecord(tableName, recordId)`. | `src/lib/queries/audit.ts:260,264,294` |
| 14 | `…+ the existing audit trigger on inventory_units` | **WRONG-NAME — KNOWN-BAD FACT** | **`inventory_units` does not exist.** The trigger `log_audit_event` is wired `AFTER INSERT/UPDATE` on `product_units` (one of six tables). It has fired: `audit_events` holds **192 `product_units` / `Create` rows**, all 192 carrying `actor_id`. | live schema brief (trigger wiring); `select table_name, action, count(*), count(actor_id) from audit_events group by 1,2` → `product_units\|Create\|192\|192` |
| 15 | `actor rendered as the Employee column` | **GAP (in our app)** | The data supports it — `audit_events.actor_id` + `actor_role`, populated 192/192 — but our Asset Detail does not render it. The Activity tab prints a literal: "No activity feed for this asset yet — the audit trail is not wired to equipment records." `auditForRecord` has no caller in `src/modules/inventory/`. | `src/modules/inventory/AssetDetail.tsx:942-948`; `grep -rn "auditForRecord" src/modules/inventory/` → no hits |
| 16 | `facets  "Attention required" is four date predicates over one range — feed them from periodRange, same engine as everywhere else` | **GAP, and `periodRange` is MISLEADING as "the engine"** | None of the four predicates exists: a repo-wide search for `starting today` / `ending today` / `overdue start` / `overdue end` returns **zero** hits in `src/`. `periodRange` is real but is `src/data/today.ts:835` — a **data module, not an engine in `src/lib`** — and it maps named `LivePeriod` labels to a `DayRange`; it exposes no exception predicates. | `grep -rni "starting today\|ending today\|overdue start\|overdue end" src/` → 1 unrelated comment (`src/lib/kpiEngine.ts:23`); `src/data/today.ts:835`, callers at `src/data/rentals.ts:672`, `src/modules/operations/OperationsQueues.tsx:218` |
| 17 | `GAP  buffer before/after in hours per product … STILL OPEN` | **MISLEADING for our build** | Booqable-side it may be open, but **ours is half-built and the spec should not carry it as unknown.** `products.prep_time_minutes` and `products.cleaning_time_minutes` exist (**minutes**, not hours), have a UI, and are written. They are then **never read**: the availability engine takes its turnaround from a *global* setting, not per product. Write-only field. | columns: live schema brief `products`; UI `src/modules/inventory/components/SectionPricing.tsx:165,168`; write `src/actions/inventory/createEquipment.ts:433-434`; the global-only reader `src/lib/queries/availability.ts:128` `boundsForTurnaround(String(getSetting('rentalTurnaround')))` and `src/lib/availability.ts:204-208` |
| 18 | §12.1/§12.4 `178 products` | **WRONG-NAME (count)** | The live table holds **204** products, all `status='Active'` and all `is_active`. 178 is a Booqable-side figure and must not be reused as our denominator. | `select count(*) from products` → 204 |
| 19 | §12.4 "both money inputs unset … worth one query across all 178" (Backlog **I3**) | **CONFIRMED, and it is total, not partial** | See the sizing section below. Coverage is **0%** on every cost/deposit field across all 204 products. | `select count(purchase_price), count(deposit_percent), … from products` (full query below) |
| 20 | §12.3 Inventory-tab columns `Purchase cost` · `Purchase date` | **PARTIAL — MISLEADING as a spec for ours** | Our unit panel renders **Purchase price** per unit, money-gated, falling back to the string "Not on record". There is **no purchase-date column** on any inventory surface, though `product_units.purchase_date` and `products.purchase_date` both exist. | `src/modules/inventory/AssetDetail.tsx:755`; `inventory.ts` `UNIT_COLUMNS` (`:629-633`) omits `purchase_date` |

### Backlog I3 — the sizing query and its answer

```sql
select count(*)                                                   as products_total,      -- 204
       count(purchase_price)                                      as has_purchase_price,  --   0
       count(replacement_value)                                   as has_replacement,     --   0
       count(purchase_date)                                       as has_purchase_date,   --   0
       count(deposit_percent)                                     as has_deposit_percent, --   0
       count(deposit_fixed)                                       as has_deposit_fixed,   --   0
       count(*) filter (where daily_rate is not null and daily_rate > 0) as daily_rate_gt0,--204
       count(*) filter (where prep_time_minutes > 0)              as prep_time_gt0,       --   0
       count(*) filter (where cleaning_time_minutes > 0)          as cleaning_time_gt0    --   0
from products;
```

**Answer: the backfill is 100% of the fleet, not a sample.** Every one of the 204 products has
`purchase_price`, `replacement_value`, `purchase_date`, `deposit_percent` and `deposit_fixed`
**NULL**. Every one has a working `daily_rate`. `prep_time_minutes`/`cleaning_time_minutes` are
NOT NULL on all 204 but sit at their `0` default — nobody has entered a buffer either.

The unit layer cannot be sized at all: `product_units` has **0 rows** today, so unit-level
`purchase_price` coverage is 0 of 0 — but `audit_events` proves 192 unit rows existed and were
wiped by a reseed. **A backfill plan must cover the unit layer as a future job, not as an empty
one.** This unblocks D1 with one correction: D1 is scoped as 178 products, and it is 204.

## Corrected Layer D

```
list      products_v                                    (Law 6 mask lives in the view)
          filter  status in ('Draft','Active')          catalogue() — Archived excluded, Draft kept
          order   name asc, tiebreak id
          chips   product_units_v!inner semi-join aliases, added ONLY when the group is non-empty
units     product_units_v, .eq('product_id', …), order asset_tag asc
          NOTE 0 rows live today; every unit panel renders empty against real data

cost      unit  product_units.purchase_price   (NOT `purchase_cost`)
          prod  products.purchase_price        — exists, selected by NOTHING today
          fallback unit → product: GAP — not built. Build it in the engine, not the screen.
          depreciation engine: GAP — not built. `depreciation_logs` (0 rows) has no reader.
          DATA: purchase_price is NULL on 204/204 products and there are 0 unit rows.

deposit   products.deposit_percent / products.deposit_fixed exist; NULL on 204/204; unread.
          global level:  GAP — no deposit key in settingsStore.ts
          client level:  GAP — not built
          today: bookings.deposit_required = caller-supplied, default 0
          Writes: src/actions/rentals/createRental.ts:373 → bookings.deposit_required

downtime  maintenance_records  (NOT "downtime"; `cases` is a separate, adjacent table)
          reason  maintenance_records.maintenance_type — plain TEXT, no CHECK.
                  enum maintenance_type EXISTS (8 labels, none of them "Maintenance" or
                  "Missing") but is bound to ZERO columns. Bind it before trusting it.
          status  maintenance_records.status — plain TEXT default 'Scheduled', no CHECK.
                  enum maintenance_status EXISTS (Scheduled|In Progress|Waiting Parts|
                  At Vendor|Completed|Cancelled) and is likewise bound to ZERO columns.
                  There is no "Started" and no "Ended".
          unavailability: GAP — nothing links a maintenance record to product_units.status.
          overlap guard:  GAP — maintenance_records has no range column. The precedent to copy
                  is inventory_reservations_no_double_booking
                  EXCLUDE USING gist (asset_id WITH =, period WITH &&) WHERE released_at IS NULL.
          screen: src/modules/inventory/Maintenance.tsx reads src/data/maintenance.ts (hand-typed)
                  and imports neither supabase nor lib/queries. Not DB-backed.
          Writes: GAP — no action file targets maintenance_records.
          Reads:  GAP — no query module targets maintenance_records.

history   audit_events, via auditForRecord('product_units', unitId)  [src/lib/queries/audit.ts:294]
          trigger log_audit_event AFTER INSERT/UPDATE on **product_units** (NOT "inventory_units",
          which does not exist). 192 product_units/Create rows are already in the table.
          Employee column = audit_events.actor_id (+ actor_role); populated 192/192.
          Read gate: audit_events_select admits Owner | Admin | Manager only
                     (AUDIT_READ_ROLES, src/lib/queries/audit.ts).
          Screen:  GAP — AssetDetail.tsx:942-948 renders a "not wired" sentence instead.
          Reads:   audit_events (view: none)

facets    "Attention required" (starting today / ending today / overdue start / overdue end):
          GAP — not built. Zero occurrences in src/.
          periodRange is real but is src/data/today.ts:835, a data module, and answers named
          LivePeriod labels only. It is a starting point, not the four predicates.

buffers   products.prep_time_minutes / products.cleaning_time_minutes — MINUTES, not hours.
          Writes: src/actions/inventory/createEquipment.ts:433-434 → products
          UI:     src/modules/inventory/components/SectionPricing.tsx:165,168
          Reads:  NONE. src/lib/queries/availability.ts:128 takes turnaround from the GLOBAL
                  setting `rentalTurnaround`, so the per-product buffer is write-only today.
          DATA:   0 of 204 products has a non-zero buffer.
```

## Money and Law 6

Money on these two screens: product `daily_rate`, `replacement_value`, and per-unit
`purchase_price` / `replacement_value`. Not money: `running_hours`, all state/condition counts,
`prep_time_minutes`, `total_quantity`.

Gating is **three layers deep here and all three are real**:

1. **The view.** `products_v` and `product_units_v` return `CASE WHEN auth_can_view_money() THEN
   col ELSE NULL END` for their price columns. `auth_can_view_money()` = role not in
   (`Warehouse`, `Technician`, `Driver`, `Client`) — exactly the money-blind floor roles.
2. **The select string.** The query refuses to *ask*: money columns are only added when
   `withMoney` is passed (`inventory.ts:540`, `:635`), and the module documents that the flag must
   be `useCanViewMoney()` verbatim, never a literal or component state (`:264-297`).
3. **The DOM.** `AssetDetail.tsx:394-401` builds the tab list as
   `...(money ? ['Money'] : [])` — the **Money tab is not in the tab array at all** for a
   money-blind session, so its figures are not merely hidden by CSS, they are never rendered.
   That satisfies the "hidden means not built into the DOM" bar.

One caveat carried forward from `inventory.ts:283-288`: the column-level REVOKE on the **base**
tables is currently inert (a column REVOKE cannot subtract from Supabase's table-level GRANT to
`authenticated`), so `products.purchase_price` is still readable straight off the base table by any
authenticated session. The app reading `_v` everywhere is the precondition for that repair, and
Inventory already satisfies it. Also unverified everywhere: **policy correctness per role has never
been executed as Warehouse/Technician/Driver** — only read.

The Law 6 exposure here is currently theoretical for one reason worth stating: every money column
on `products` except `daily_rate` is NULL on all 204 rows, so a leak would leak nulls. That changes
the day D1 backfills them.

## What this changes for the build

1. **Rescope D1 from 178 to 204 products, and treat it as a full backfill, not a top-up.**
   Coverage is 0% on `purchase_price`, `replacement_value`, `purchase_date`, `deposit_percent` and
   `deposit_fixed`. There is no partial-credit path.
2. **Add the unit layer to D1's scope as a deferred job.** `product_units` is empty now but held
   192 rows before the reseed; a backfill designed only for `products` will need a second pass.
3. **Do not build a depreciation or ROI report before D1 lands.** There is no engine, the only
   calculator runs off hand-typed seed rows, and `depreciation_logs` has no reader. Every figure
   would correctly be zero.
4. **Write the cost fallback in an engine, not in `queries/inventory.ts`.** Today the product-level
   `purchase_price` is not even selected. The fallback is `unit.purchase_price ?? product.purchase_price`
   and it belongs beside `lib/money.ts`, per Law 1.
5. **Bind the two orphan enums before writing any downtime code.** `maintenance_status` and
   `maintenance_type` exist and are attached to **nothing**; `maintenance_records.status` and
   `.maintenance_type` are free text. Any code that switches on those labels today is switching on
   strings the database will happily contradict. This is a migration, and migrations need approval.
6. **Do not implement Booqable's `Started`/`Ended` vocabulary.** Our enum says `In Progress` and
   `Completed`, and it carries two states Booqable lacks (`Waiting Parts`, `At Vendor`). Ours is the
   better model; map Booqable's four onto ours at the sync boundary, not in our UI.
7. **A maintenance record must set `product_units.status`, and that link does not exist.** Until it
   does, gear "on downtime" stays bookable. Copy `inventory_reservations_no_double_booking`'s
   shape — but note `maintenance_records` has no range column, so the migration adds one.
8. **Wire Asset Detail's Activity tab to `auditForRecord('product_units', unitId)`.** The trigger,
   192 rows and the query function all already exist; only the call site is missing, and the tab
   currently tells the operator a false thing ("not wired to equipment records" — the *trail* is
   wired, the *screen* is not).
9. **The four-way exception facet group is unbuilt and `periodRange` is not sufficient.** §12.2's
   `[ruled]` "every dated workflow gets the same four" is a real, unstarted piece of work. Build it
   in `src/lib`, not in `src/data/today.ts`, if it is to be "the same engine as everywhere else".
10. **Close the buffer question in our favour and stop carrying it as STILL OPEN.** We have
    per-product buffers in **minutes**. The remaining work is a reader: `boundsForTurnaround` must
    take the product's `prep_time_minutes`/`cleaning_time_minutes` into account instead of only the
    global `rentalTurnaround` setting.
11. **`Maintenance.tsx` is not DB-backed and should not be cited as the downtime screen.** It reads
    `src/data/maintenance.ts` and imports neither `supabase` nor `lib/queries`.

## Open questions

1. **Are the two orphan enums intended, or was the migration that bound them lost?**
   *Settles it:* `select column_default, data_type from information_schema.columns where
   table_name='maintenance_records'` already shows `text`; the remaining question is intent, which
   only PLAN.md §4 or the migration author can answer. Record it as a `TODO(decision)`.
2. **Does the deposit chain resolve global → product → client, or product → client → global?**
   §12.5 asserts an order with no implementation behind it, and §10.3's exclusion rule is named but
   not located. *Settles it:* a ruling in PLAN.md §4 plus the §10.3 exclusion text; nothing in the
   repo or DB can answer it.
3. **Is the per-product buffer additive to the global turnaround, or an override of it?**
   *Settles it:* a ruling. Both readings are defensible and the data (all zeros) distinguishes
   neither.
4. **Do we model `Expected stock` (incoming) at all?** `purchase_requests` exists (0 rows) with a
   route at `/inventory/purchase-requests` — which is closer to a purchasing flow than §12.6
   assumes. *Settles it:* read `src/modules/inventory/PurchaseRequests.tsx` against the
   `purchase_requests` schema and decide whether it is the same concept.
5. **Was the `product_units` wipe intentional?** 192 `Create` audit rows exist for a table now
   holding 0 rows, and every unit-level screen renders empty because of it. *Settles it:* the
   reseed script's history, or asking whoever ran it. Until answered, "the units panel is empty" is
   not evidence of a code defect.
6. **Per-role money masking has never been executed.** Reading the policy text is not running as
   Warehouse. *Settles it:* an authenticated session per role (or `set app.current_user_id` to a
   real `users` row) selecting `products_v.daily_rate` and confirming NULL.
