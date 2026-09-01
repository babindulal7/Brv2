# Layer D verification — Bundles, Cross-sell, Online store, Packing slip, Quote
v2.5 section: §18 (lines 1175-1247)   ·   Our route(s): /inventory/bundles/new
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

§18's Layers A/B/C — what Booqable renders — are trusted and not re-examined here. Everything
below is §18's Layer D: the sentences that say what **our** side does, or will do, or which
table/column/engine serves it. Those sentences are the unverified input.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | §18.1 ¶1: "ours models both [structured bundles and kit-prose products] as `bundle_items` rows" | **MISLEADING** | `bundle_items` exists and holds structure, but it models only *half*. Live columns are `id, client_uuid, bundle_id, product_id, quantity, days, is_mandatory, sort_order, created_at, created_by` — **ten, and not one of them carries prose, a rate, or a discount.** The kit-prose half has no column and no table. | `SELECT column_name FROM information_schema.columns WHERE table_name='bundle_items'` → the 10 above |
| 2 | §18.1 consequence 2: "Keep `bundle_items.component_price` a separate concept from `booking_discounts`" | **GAP** | **`bundle_items.component_price` does not exist**, and neither does any other price or discount column on `bundle_items` (see #1). The whole per-component pricing layer §18.1 documents — Pricing, Discount %, Discounted price, Total — has **no storage**. `booking_discounts` is real (24 columns, 1 RLS policy, hard-cap CHECK `percent <= 25`), so the "separate concept" half is trivially satisfied by the other half not existing. This is a *new invented name* in the same family as §2.4's wrong contract list — do not propagate it. | same SQL as #1; `booking_discounts` per the live schema brief + `booking_discounts_hard_cap` CHECK |
| 3 | §18.1 consequence 1: "generates any prose views from structure" | **GAP — not built** | Nothing anywhere in `src/` generates prose from `bundle_items`. `src/lib/queries/bundles.ts` is the only module that reads `bundle_items` for display and it returns typed rows, not prose. | `grep -rn "bundle_items" src/` → only `queries/bundles.ts`, `actions/inventory/createBundle.ts`, `lib/booqable/map/products.ts` and tests |
| 4 | §18.1 consequence 3: "Ours enforces it structurally — bundle components are not independently bookable while their bundle line exists" | **GAP — not built** | No such enforcement exists in the DB or the repo. `booking_lines` has `parent_line_id` and the CHECK `booking_lines_bundle_child_is_free` (a child line's `rate` and `discount_amount` must be 0) — that forces a child to be *free*, not to be *exclusive*. Nothing stops the same `product_id` being added as a standalone Equipment line beside its bundle. `createRental.ts:379,381` writes `parent_line_id` / `bundle_id` with no such check. | `booking_lines_bundle_child_is_free` CHECK (live schema brief); `src/actions/rentals/createRental.ts:379,381`; `grep -rni "independently bookable" src/` → 0 hits (only the spec prose itself) |
| 5 | §18.1: "**The bundle's price IS the sum of its discounted component lines**" — carried forward as our model | **MISLEADING** | Booqable-side that is Layer A and trusted. Our side is the **opposite model**: `bundles.daily_rate` and `bundles.weekly_rate` are stored `numeric(14,2)` columns, written once at creation from the screen's computed figure. There is no composition to re-derive from, because #2 means the components carry no rates. | `bundles.daily_rate / weekly_rate` columns (SQL as #1); write at `src/actions/inventory/createBundle.ts:315-316` |
| 6 | §18.2: Cross-sell — "Defer — a storefront concern for the post-bridge era; nothing operational" | **CONFIRMED (as absent)** | Correct, and worth stating plainly: **there is no cross-sell counterpart on our side, by design.** No column, no table, no query, no route, no component. | `grep -rni "cross-sell\|cross_sell\|crosssell" src/` → 0 substantive hits |
| 7 | §18.2: Online store — the `Show in online store` toggle, marketing description, `Excerpt`, SEO `Page title` | **CONFIRMED (as absent)** | **Online store has no counterpart on our side, at any layer.** `products` has no visibility flag, no excerpt, no page-title, no SEO column; `bundles` has no such column either. No `storefront` / `online store` / `seo` symbol exists in `src/`. This is a deliberate scope boundary, not an unbuilt feature. | `products` 44 columns and `bundles` 13 columns, neither carrying one (SQL as #1); `grep -rni "online store\|storefront\|seo" src/` → 0 hits (one unrelated comment in `settings/sections/BranchesWarehouses.tsx:549`) |
| 8 | §18.2: "So a product carries TWO descriptions … **Ours keeps that split**" | **MISLEADING** | Ours does not keep *that* split. `products` carries **four** text fields — `description`, `notes_internal`, `notes_warehouse`, `notes_rental` — and none of them is a marketing/storefront description, because there is no storefront (#7). The real split is internal-audience, not client-vs-storefront. Nothing in `src/` reads `notes_rental` for a document. | 44-column `products` list (SQL as #1); `grep -rni "notes_rental" src/` → only `types/supabase.ts` and `lib/mock/corpus.ts:183` |
| 9 | §18.3: "Ours generates the same checklist from `bundle_items` + `booking_line_units`, so the slip gains per-component checkboxes" | **GAP — not built** | Both tables exist. `booking_line_units` carries exactly the columns this would need (`packed`, `packed_at`, `packed_by`, `packing_session_id`, `unit_state`, `condition`). **But no packing slip exists.** There is no packing-slip route, component, query, action or template anywhere. `grep -rni "packing.slip"` in `src/` returns only Booqable *wire-format* type strings. | `grep -rni "packing.slip\|packing_slip" src/` → `lib/booqable/types.ts:748` (`BooqableDocumentType`) and `lib/booqable/map/documents.ts:2,17` only |
| 10 | §18.3: "Money-free stays law on this document" | **UNVERIFIABLE** | The document does not exist, so its money behaviour cannot be checked. The *mechanism* that would enforce it does exist and is verified elsewhere (`auth_can_view_money()` + the `*_money_blind` RLS policies + `useCanViewMoney`). Settled by building the slip and asserting no money field is in the DOM for any role. | as #9; `auth_can_view_money()` per the live schema brief |
| 11 | §18.3 (implied): the "What's Included" prose has a structural home | **WRONG-NAME** | The nearest real thing is not `bundle_items` — it is the **`accessories`** table (`product_id, name, quantity, is_mandatory, replacement_cost, sort_order`), which is precisely a per-product included-items list with a replacement value. It has **0 rows**, no query module, and no importer in `src/`. §18 never names it. | `accessories` columns (SQL as #1); `grep -rn "'accessories'" src/` → only `types/supabase.ts` |
| 12 | §18.4: the Quote *document* — `/documents/{uuid}`, Quote #766 | **GAP — not built** | `document_registry` exists (`document_no, document_type, booking_id, client_id, lifecycle_status, file_url, signed_at, signed_by_name, signature_url, voided_at, …`, 0 rows) and `booking_documents` links it to a booking. **No screen reads either.** `/documents` and `/finance/documents` both mount `src/modules/documents/Documents.tsx`, which imports every row from the seed `src/data/documents.ts` — no `document_registry` query exists in the repo. | `src/modules/documents/Documents.tsx:22-48` imports from `../../data/documents`; `src/modules/rentals/BookingDetail.tsx:1675-1678` states in-page that "`document_registry` / `booking_documents` have no query module yet" |
| 13 | §18.4: "Quote" as our document type name | **WRONG-NAME** | Our enums do not agree with each other. `document_type` (used by `document_registry`) has **`Quotation`**, not `Quote`; `booking_document_type` (used by `booking_documents`) has **`Quote`**. Both also carry **`Packing List`** — neither carries "Packing slip". A builder must pick per table. | `SELECT typname, array_agg(enumlabel) … WHERE typname IN ('document_type','booking_document_type')` → `document_type` = {Quotation, Rental Agreement, Packing List, Delivery Note, Return Report, Inspection Report, Damage Report, Tax Invoice, Receipt, Credit Note, Debit Note, Job Card, Service Report, Incident Report, Insurance Claim, Call Sheet}; `booking_document_type` = {Quote, Rental Agreement, Packing List, Delivery Note, Invoice, Receipt, Inspection Report, Damage Report, Client Documents, Insurance} |
| 14 | §18.4: "the signature machinery lives on quotes too, not just contracts" — carried as a requirement for ours | **MISLEADING** | Our `signatures` table cannot hold a quote signature: it is keyed to `session_id` (an `operation_sessions` row) and its `signature_role` enum is **{Receiver, Warehouse staff, Driver, Witness, Returning person}** — every label is a floor role, none is a document signatory. The place a document signature actually lives is `document_registry.signed_at / signed_by_name / signature_url`, plus `document_lifecycle_status = 'Pending Signature' \| 'Signed'`. Nothing writes any of it. | `signatures` columns and `signature_role` enum (SQL as #13 + live schema brief); `document_lifecycle_status` = {Draft, Pending Approval, Pending Signature, Signed, Issued, Void, Expired} |
| 15 | §18.4: the per-document **send timeline** ("Document sent 30-08-2026 15:57") | **CONFIRMED (table only)** | `document_deliveries` is exactly this table — `document_id, recipient_type, recipient_destination, channel, delivery_event, recorded_at`, with a `document_delivery_event` enum. It has 0 rows, no query module and no caller. The *shape* v2.5 describes is served; the *feature* is not. | `document_deliveries` per the live schema brief; `grep -rn "document_deliveries" src/` → 0 hits outside `types/supabase.ts` |
| 16 | §18.4: "`Replacement Cost Rs.0.00` … renders zero because replacement/purchase values are unset" | **CONFIRMED (the columns and the emptiness), GAP (the line)** | `products.replacement_value` and `product_units.replacement_value` both exist. `products` = 204 rows, `product_units` = **0 rows**. `replacement_value` is one of the 9 columns `0062` revokes from `authenticated` on `products`, so it is reachable only through `products_v` under `auth_can_view_money()`. There is **no quote template**, so nothing prints Rs.0.00 today — the D1 backfill argument stands on the Booqable side only. | column grants: `products` grants `authenticated` **35 of 44** columns; the 9 withheld are `daily_rate, weekly_rate, monthly_rate, hourly_rate, weekend_rate, deposit_percent, deposit_fixed, purchase_price, replacement_value` (`SELECT … FROM information_schema.column_privileges WHERE table_name='products' AND grantee='authenticated'`) |
| 17 | §18.4 (implied): quote numbering | **CONFIRMED** | `number_sequences` holds a `quote` row: prefix `Q-`, `current_value` 0, no year. `next_document_number('quote')` would mint `Q-1`. A `bundle` row (`BND-`, 0) exists too. There is **no** `packing_slip` or `document` sequence key — a packing slip cannot be numbered by the allocator today. | `number_sequences` 10 rows per the live schema brief; `next_document_number(p_sequence_key text)` signature |
| 18 | §18.6 decision 1: "Booqable derives bundle price from component lines at *definition* time … Ours must pick" | **CONFIRMED (still open) — but the code has already picked** | The decision is genuinely undecided in the docs, and the code has silently answered it: `createBundle` writes `daily_rate` / `weekly_rate` as stored scalars, i.e. **frozen at definition**, with no recomputation path and no component rates to recompute from (#2, #5). The open decision is now a *reconciliation*, not a choice. | `src/actions/inventory/createBundle.ts:315-316` (`moneyCol('daily_rate', input.dailyRatePaisa)`) |
| 19 | Route claim: `/inventory/bundles/new` is served by our bundles data layer | **MISLEADING** | `src/lib/queries/bundles.ts` — the only DB read of `bundles` + `bundle_items` — **has zero callers in `src/`.** `listBundlesWithItems` is referenced only inside its own file. `AddBundle.tsx` imports no `lib/queries/*` module at all (its 22 imports are UI, money, bs, rbac and `src/data/addBundle`); `Bundles.tsx` reads the seed `src/data/bundles.ts`. **No screen shows a database bundle today.** This is the same failure mode as `facetCounts.ts`. | `grep -rn "listBundlesWithItems\|queries/bundles" src/` → 4 hits, all inside `src/lib/queries/bundles.ts`; `AddBundle.tsx:1-22` imports; `Bundles.tsx:1-39` imports |
| 20 | Page-doc claim (not v2.5): `createBundle` mints its code from the clock and drops the rate | **MISLEADING — the page doc is stale, the code wins** | `docs/pages/22_add_bundle.md` gaps 2, 3, 4, 9 and 10 describe a version of `createBundle.ts` that no longer exists. The current file resolves the category by `SELECT` on `inventory_categories`, resolves each line by `SELECT` on `products` (and *refuses to save* when a seed model has no product row), allocates the code via `supabase.rpc('next_document_number', { p_sequence_key: 'bundle' })`, writes real rates, and passes `{ returnRow: false }`. The doc also says the file is 2629 lines and `AddBundle.tsx` 2629 — they are now 413 and 2696. | `src/actions/inventory/createBundle.ts:243-259` (category), `:264-289` (products), `:295-297` (**`p_sequence_key`, the corrected arg name**), `:315-316` (rates), `:328` (`returnRow: false`); `wc -l` = 413 / 2696 |
| 21 | Page-doc claim: `createBundle` bypasses the Booqable source switch | **CONFIRMED (still live)** | `bundles` and `bundle_items` are both in `BOOQABLE_READ_ONLY_TABLES`, and `createBundle` still calls the raw `idempotentInsert` rather than `insertViaSourceSwitch`, so the guard never runs. | `src/actions/inventory/createBundle.ts:328,375`; guard `src/lib/dataAccess.ts:256-261` |
| 22 | Page-doc claim: `bundle_items.is_mandatory` is never written | **CONFIRMED (still live)** | `is_mandatory` exists on `bundle_items` and is SELECT-granted to `authenticated`, but `BundleItemInsertPayload` writes only `client_uuid, bundle_id, product_id, quantity, days, sort_order, created_by`. Every saved component is therefore mandatory-by-default with no record of the operator's choice — and §18.1's optional-component model has nowhere to land. | `src/actions/inventory/createBundle.ts:365-373` |
| 23 | `queries/bundles.ts` header: "`bundles.daily_rate` is NOT masked … `products_v` is the only route to a component rate" | **CONFIRMED live, both halves** | Live column grants: `bundles` grants `authenticated` **all 13** columns including `daily_rate` and `weekly_rate`; `products` grants only 35 of 44, withholding `daily_rate`. So the asymmetry the header describes is real *today* — and it means the bundle's own rate is readable by **every** authenticated role, `Warehouse` and `Client` included, straight off the base table. `bundles_v` masks it; `queries/bundles.ts:133` does not use `bundles_v`. See "Money and Law 6". | `information_schema.column_privileges` for `bundles` (13/13 to `authenticated`) and `products` (35/44); `src/lib/queries/bundles.ts:108-111,133,203` |

---

## Corrected Layer D

### D18.1 — Bundle definition (`/inventory/bundles/new`, and the Bundles tab inside `/inventory`)

```
source   bundles  (base table, 13 cols, 0 rows live, RLS on / 2 policies)
         bundle_items (base table, 10 cols, 0 rows live, RLS on / 2 policies)
         products_v  — for each component's name, brand, category, tracking_mode, daily_rate
         product_units_v — for each component's unit counts (0 rows live: no unit layer exists yet)
filter   bundles.is_active = true            (Law 3: retired means is_active = false, never deleted)
order    bundles.name ASC ; components by bundle_items.sort_order, id as tiebreak
window   none — a bundle definition is not window-scoped. Availability is derived
         separately and is present-tense only (units currently 'In Stock'), NOT window-aware.
money    bundles.daily_rate / weekly_rate  — SELECT-granted to `authenticated` on the BASE
         table, i.e. UNMASKED. bundles_v masks them; the query does not use bundles_v.
         products_v.daily_rate — masked; NULL unless auth_can_view_money().
         `dailyRate: Paisa | null` — null means "not asked for" or "not permitted". Never 0.
engine   src/lib/money.ts (rupees / formatMoney / DISCOUNT_CAP 25 / discountGate)
         src/lib/discount.ts (validateDiscount)
         src/lib/rbac.ts (canCreateBundle = Owner|Admin|Manager ; canApproveDiscount)
action   Writes: src/actions/inventory/createBundle.ts → bundles, bundle_items
                (code from RPC next_document_number(p_sequence_key := 'bundle'))
         Reads:  src/lib/queries/bundles.ts → bundles + bundle_items + products_v + product_units_v
                 ⚠ UNWIRED — zero callers. The screen reads src/data/addBundle.ts (seed) instead.

Per-component pricing (rate · discount % · discounted price · line total)
         GAP — not built. `bundle_items` has NO price, rate or discount column.
         Everything AddBundle.tsx computes on screen is discarded except one scalar
         `daily_rate` on the parent bundle row.
Component optionality
         GAP — the `is_mandatory` column exists and is never written (verdict #22).
Component exclusivity ("don't book bundle components")
         GAP — not built. Only `booking_lines_bundle_child_is_free` exists, and it
         constrains price, not exclusivity.
```

### D18.2 — Cross-sell and Online store

```
GAP BY DESIGN — there is no counterpart and none is planned pre-bridge.
No column on products or bundles, no table, no view, no query, no route, no component.
This is a scope boundary, not an unbuilt feature: record it as "out of scope", not "missing".
The two-descriptions split v2.5 attributes to us does not exist either — our four text
fields (description, notes_internal, notes_warehouse, notes_rental) are all internal-audience.
```

### D18.3 — Packing slip

```
source   GAP — not built. Nothing renders, generates, numbers or stores a packing slip.
         The pieces that WOULD serve it, all present and all unread:
           booking_documents      (doc_type booking_document_type = 'Packing List', origin, session)
           document_registry      (document_no, file_url, lifecycle_status)
           booking_line_units     (packed, packed_at, packed_by, packing_session_id, unit_state)
           bundle_items           (the component list)
           accessories            (product_id, name, quantity, is_mandatory, replacement_cost)
                                  ← the real home of "What's Included", never named by v2.5
filter   —
order    —
window   —
money    NOT BUILT. Money-free is a rule with nothing yet to apply to.
engine   GAP
action   Writes: GAP — not built  |  Reads: GAP — not built
numbering GAP — number_sequences has no 'packing_slip' key, so next_document_number
          cannot mint one. Ten keys exist: booking, bundle, client, deposit, equipment,
          expense, invoice, membership, payment, quote.
```

### D18.4 — Quote document

```
source   GAP — not built as a document. /documents and /finance/documents both mount
         src/modules/documents/Documents.tsx, which reads src/data/documents.ts (seed).
         The DB side that WOULD serve it, all present and all unread:
           document_registry     lifecycle_status ∈ {Draft, Pending Approval, Pending
                                 Signature, Signed, Issued, Void, Expired}
                                 signed_at / signed_by_name / signature_url  ← the signature
           document_deliveries   document_id, channel, delivery_event, recorded_at ← the timeline
           booking_documents     doc_type = 'Quote'  (booking_document_type)
           bookings.quote_expires_at
naming   document_registry.document_type says **'Quotation'**; booking_documents.doc_type
         says **'Quote'**. Pick per table; do not assume one label works for both.
signature `signatures` is NOT the table — it is session-keyed with floor roles only
         (Receiver, Warehouse staff, Driver, Witness, Returning person).
money    Subtotal / Total incl. taxes would be money; Replacement Cost reads
         products_v.replacement_value, which is NULL unless auth_can_view_money().
         product_units = 0 rows, so a per-unit replacement value has no source at all.
engine   GAP
action   Writes: GAP — not built  |  Reads: GAP — not built
numbering CONFIRMED — number_sequences 'quote' = prefix Q-, current_value 0, no year.
```

---

## Money and Law 6

**What is money on this screen.** Every Original Rate, Bundle Rate, Discount, Line Total, Sum of
Parts, Bundle Discounts, Bundle Daily Rate and the `You Save` strip. On the unbuilt documents:
Subtotal, Total incl. taxes, and `Replacement Cost`.

**Who is money-blind.** `Warehouse`, `Technician`, `Driver`, `Client` — the set
`auth_can_view_money()` excludes, mirrored by `rbac.MONEY_BLIND`.

**How it is gated here — three different mechanisms, and one hole.**

1. **`/inventory/bundles/new` — the whole page, not a field.** `AddBundle.tsx:521-523` returns
   early with `RestrictedState` for a money-blind role. Nothing is masked field-by-field; the
   form is never drawn. "Hidden" here genuinely means *not in the DOM*. ✅
2. **`products_v` — a masked view.** Component rates come only from `products_v.daily_rate`,
   which is `NULL` unless `auth_can_view_money()`. `products` revokes the 9 money columns from
   `authenticated` at the column level, so the base table is not a way around it. Verified live,
   not from a migration header. ✅
3. **`bundles.daily_rate` / `weekly_rate` — NOT gated.** Live column grants give `authenticated`
   **all 13** `bundles` columns. `bundles_v` carries the `auth_can_view_money()` mask, but
   `src/lib/queries/bundles.ts:133` selects from the **base table**, so any authenticated
   session — Warehouse, Driver, Client included — can read a bundle's advertised rate. The
   module's own header asserts this asymmetry is deliberate and "left visible rather than
   flattened". **It is a Law 6 hole, whether or not it was intended**, and it is currently
   harmless only because nothing calls the module (verdict #19). Decide before wiring it.

**`RestrictedState` still names the wrong roles.** `requiredRole="Owner, Admin, Coordinator or
Accounts"` (`AddBundle.tsx:523`) against a write capability of Owner/Admin/**Manager**
(`rbac.canCreateBundle`). Manager is told to ask someone else; Coordinator and Accounts are told
they may create bundles, reach the full form, and are refused at dispatch. Page-doc gap 12,
re-confirmed live today.

---

## What this changes for the build

1. **Do not build a per-component pricing UI against `bundle_items` — it has nowhere to store
   the numbers.** A migration adding component rate + discount columns (or a decision to derive
   nothing and keep the scalar `bundles.daily_rate`) must land *before* any Contents-tab work.
   `bundle_items.component_price` is a name v2.5 invented; do not put it in a migration on
   v2.5's authority.
2. **Wire `listBundlesWithItems` or delete it.** It is a complete, correct, tested-shaped query
   with zero callers, while two screens render seed constants. This is the second module found
   in this pattern (`facetCounts.ts` is the first). Wiring it is a smaller job than either screen
   thinks it is.
3. **Close the `bundles` money hole first.** Point `queries/bundles.ts` at `bundles_v` for the
   bundle's own rate, or accept in writing that a bundle's advertised rate is not Law 6 material.
   Do not wire the module until that is answered, because wiring it ships the hole.
4. **Fix `RestrictedState`'s `requiredRole` to "Owner, Admin or Manager"** to match
   `canCreateBundle`. One string; it currently misdirects three roles.
5. **Write `is_mandatory` in `createBundle`.** The column exists, the form collects the choice,
   the payload drops it. Optional components are unrepresentable until this lands.
6. **Rewrite `docs/pages/22_add_bundle.md` §7 gaps 2, 3, 4, 9, 10.** They describe a
   `createBundle.ts` that was replaced. The current file resolves FKs by name, allocates via
   `next_document_number(p_sequence_key)`, and writes real rates. Leaving stale gaps in the page
   doc is how a fixed defect gets "fixed" a second time.
7. **Treat Online store and Cross-sell as an explicit scope boundary in PLAN.md**, not as an
   unbuilt backlog item. Nothing on our side references them and nothing should.
8. **Before any document work, pick the enum label per table** — `document_registry` wants
   `'Quotation'`, `booking_documents` wants `'Quote'`, and both want `'Packing List'` (never
   "Packing slip"). And add a `packing_slip` key to `number_sequences` if the slip is to be
   numbered at all.
9. **Do not plan a quote signature on the `signatures` table.** It is session-keyed with floor
   roles. Document signatures belong on `document_registry.signed_at / signed_by_name /
   signature_url` with `lifecycle_status`.
10. **`accessories` is the "What's Included" table.** v2.5 never names it, so nothing points at
    it. Whoever builds the packing checklist should start there, not from prose.

---

## Open questions

1. **Does a bundle carry per-component pricing at all, or only a scalar rate?**
   *Settles it:* a product ruling in PLAN.md §4, then a migration. Today the code has answered
   "scalar only" by omission (#5, #18) while the screen renders a full component pricing table
   that is discarded at save. Those two cannot both be right.
2. **Live-at-definition or frozen-at-definition bundle price?** (§18.6 decision 1, still open.)
   *Settles it:* the same ruling as #1 — with no component rates stored, "live" is not
   implementable, so answering #1 answers this.
3. **Is `bundles.daily_rate` Law 6 material?**
   *Settles it:* an explicit ruling. The evidence is unambiguous — `authenticated` holds SELECT
   on all 13 `bundles` columns live — so this is a decision, not an investigation.
4. **Should `queries/bundles.ts` be wired, or is `src/data/bundles.ts` the intended source until
   the bridge lands?** *Settles it:* checking whether `bundles` is expected to be populated by
   the Booqable pull (`lib/booqable/map/products.ts` targets it) before the OS reads it. Live
   `bundles` = 0 rows and `external_refs` holds only `booqable/clients` (100) and
   `booqable/products` (71) — **no `booqable/bundles` rows have ever been pulled**.
5. **Does Booqable recompute a bundle's price when a component's base rate changes?**
   *Settles it:* not answerable read-only. It needs a write to a Booqable component rate on a
   throwaway bundle, then a re-read. Out of scope for a read-only pass; mark it UNVERIFIABLE
   rather than guessing.
6. **Is the packing slip meant to be a `document_registry` row, or a render-on-demand view?**
   *Settles it:* a ruling. The absence of a `packing_slip` sequence key hints at
   render-on-demand, but a hint from a missing row is not a decision.
