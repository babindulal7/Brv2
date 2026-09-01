# Layer D verification — Booking detail
v2.5 section: §10 (lines 432-551)   ·   Our route(s): /rentals/:bookingNo
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Layers A/B/C of §10 (the observed Booqable render) are trusted and not re-litigated here.
Everything below concerns §10.6's `Backend data link` block plus the four Layer D assertions
that leak into §10.2, §10.3 and §10.5.

**The headline.** §10.6 names `fetchCanonicalBooking` as the read for this screen.
`fetchCanonicalBooking` has **no caller in `src/` outside its own test file**. The screen at
`/rentals/:bookingNo` reads through four entirely different functions. Every table list,
"ONE query" claim and money rule in §10.6 is describing a module the route does not touch.

---

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | `read  fetchCanonicalBooking (lib/bookingQuery.ts)` serves the detail screen | **GAP** | The module exists and is heavily tested, but is **unwired**. `BookingDetail.tsx` never imports it. The route reads: `listBookings` (head + deposit), `fetchFloorBooking` (lines + units), `listInvoices`, `listPayments`. | `grep -rn fetchCanonicalBooking src/` → only `src/lib/__tests__/bookingQuery.test.ts`; `src/modules/rentals/BookingDetail.tsx:33-37` imports `useList`/`listBookings`/`fetchFloorBooking`/`listInvoices`/`listPayments` |
| 2 | `priceCanonicalBooking` is the pricing path | **GAP** | Same: imported only by `bookingQuery.test.ts`. No screen prices a booking through it. | `grep -rn priceCanonicalBooking src/` → test file only |
| 3 | "Law 2, **ONE query**" | **MISLEADING** | Even inside `fetchCanonicalBooking` it is up to **two** round-trips: the base select, then `readDeposit()` when `withDeposit` is set. The actual screen issues **four** independent reads. | `src/lib/bookingQuery.ts:2004-2006` (second query); `src/lib/bookingQuery.ts:956-969` (`readDeposit`); `BookingDetail.tsx:715, 730, 757, 763` |
| 4 | It reads `bookings · booking_lines · booking_line_units · clients · invoices · payments · security_deposits · audit_events` | **MISLEADING** | `COLUMNS` names exactly four relations: `bookings`, `clients`, `booking_lines_v`, `booking_line_units`. **`invoices`, `payments`, `security_deposits` and `audit_events` are not read at all** — the module's own header says payments are deliberately not fetched. | `src/lib/bookingQuery.ts:935-944`; `:903-907` ("Payments are not fetched … so Outstanding cannot be computed either") |
| 5 | lines come from `booking_lines` | **WRONG-NAME** | Money on lines is read through **`booking_lines_v`**, never the base table. Confirmed live: `authenticated` holds **no SELECT** on `rate`, `discount_amount`, `supplier_cost`, `markup_amount` (only INSERT/UPDATE/REFERENCES). | `src/lib/bookingQuery.ts:925-933, 940`; SQL: `select ... from information_schema.column_privileges where table_name='booking_lines' and grantee='authenticated'` → no SELECT row for the four money columns |
| 5b | *(repo self-contradiction found in passing)* | **MISLEADING (repo)** | `src/lib/queries/bookings.ts:973-976` asserts "`authenticated` and `anon` both hold SELECT on all four, verified against the live project on 16 Aug 2026 — which contradicts `bookingQuery.ts:918-928`". The live grants say `bookingQuery.ts` is right and this comment is wrong for `authenticated`. It is right for **`anon`**, which does hold SELECT on all four. | same SQL as #5 |
| 6 | `lines  booking_lines (qty, charge period, price) + booking_line_units (asset_id)` | **MISLEADING** | Two errors. (a) In `bookingQuery.ts` the `booking_line_units` embed selects `id, qty, unit_state, is_required, packed, damaged` — **`asset_id` is not selected**. (b) The read the screen actually uses, `FLOOR_COLUMNS`, names **no money column at all**, so the rendered equipment table has no per-line charge or price. | `src/lib/bookingQuery.ts:943`; `src/lib/queries/bookings.ts:978-984` |
| 7 | `serials  the chips ARE booking_line_units rows` | **CONFIRMED** | The rendered serial does come from `booking_line_units → product_units.serial_no` (falling back to `asset_tag`). | `src/lib/queries/bookings.ts:983-984`, `:1048-1059`; `BookingDetail.tsx:1327-1340` |
| 8 | "removing one is a **delete** of that row, not an edit of the line" | **GAP + contradicts Law 3** | No delete path exists anywhere in `src/`, and the database **refuses** it: `reject_delete_nothing_is_deleted` is wired BEFORE DELETE on `booking_line_units`. The screen renders serials as read-only `<Link>`s to `/inventory/:serial` — there is no `×`. Copying this instruction would produce code the DB rejects. | live-schema brief, `reject_delete_nothing_is_deleted` trigger list; `BookingDetail.tsx:1327-1340`; `ITEM_EDIT_UNAVAILABLE` at `BookingDetail.tsx:648-649` |
| 9 | `avail "0 left" … dataAccess.ts:201 says inventory_reservations is Booqable-mastered … GAP` | **MISLEADING** | The citation is wrong and the premise is stale. `dataAccess.ts:201` is an unrelated offline-queue warning inside `safeUpdate`. `inventory_reservations` **was removed** from `BOOQABLE_READ_ONLY_TABLES` on 16 Aug 2026 by explicit ruling (PLAN.md §4.30(a)) — it is OS-native and OS-writable today. | `src/lib/dataAccess.ts:199-201` (the real line 201); `src/lib/dataAccess.ts:286-324` (the removal + ruling) |
| 9b | "this number has no local source yet" | **MISLEADING** | A local availability engine exists and computes exactly this quantity: `selectUnitsForLine` / `explainShortfall` over `product_units_v` and `inventory_reservations`. What is true is narrower: **nothing computes or renders a per-line "N left" on booking detail** — there is no product-over-window count function and `BookingDetail.tsx` has no availability column. | `src/lib/availability.ts:493-505`; `src/lib/queries/availability.ts:220` (`product_units_v`), `:262` (`inventory_reservations`); no availability import in `BookingDetail.tsx` |
| 10 | `money  lib/money — whole rupees, ONE rounding (R2)` | **MISLEADING as applied** | `price()` genuinely rounds each step to a whole rupee — that part is CONFIRMED. But **this screen never calls `price()`**. Its Subtotal/Discount/VAT/Total/Paid/Outstanding are a plain sum of `invoices` columns, and `formatMoney` prints paisa whenever paisa are non-zero. So "whole rupees, one rounding" is not what this route does. | `src/lib/money.ts:108-138` (`toWholeRupee` + `price`); `src/lib/money.ts:62-69` (`formatMoney` prints `.NN`); `BookingDetail.tsx:778-796` |
| 11 | `deposit  security_deposits table` | **WRONG-NAME** | The screen's deposit is `bookings.deposit_required`, read through the masked view **`bookings_deposit_v`**. `security_deposits` has **no read path in `src/`** and its exclusion is deliberate and documented (Law 5). "Deposit Received / Pending" are therefore absent, not zero. | `BookingDetail.tsx:50-54`, `:711-715`, `:942-944`, `:955-956`; `src/lib/bookingQuery.ts:946-969`; `src/lib/queries/bookings.ts:403` |
| 12 | `…with the payments_no_security_deposit check` | **CONFIRMED** | `payments.payments_no_security_deposit: CHECK (payment_type <> 'Security Deposit')` exists live. | live-schema brief, CHECK CONSTRAINTS list |
| 13 | deposit "resolution chain global → product → client is the 29 Aug F2 spec addition" | **GAP** | No resolver exists. `products.deposit_percent` / `deposit_fixed` are columns only; `queries/inventory.ts:293` records that they are not even selected by the inventory read. No global default and no client override are read anywhere. | `grep -rn 'deposit_percent\|deposit_fixed' src/lib src/actions` → only Booqable mapper, mock corpus, `createEquipment` write, and the `inventory.ts:293` note |
| 14 | §10.3's zero-deposit **exclusion rule** "belongs in that engine" | **GAP** | There is no engine to put it in, and no self-explaining-zero tooltip anywhere on this screen. The pattern is worth stealing; nothing implements it today. | as #13; no tooltip in `BookingDetail.tsx` |
| 15 | `discount  lib/discount — Law 10: >10% needs reason ≥10 chars + named approver, 25% cap, DB constraint, no role bypass including Owner` | **CONFIRMED** | All four hold. `DISCOUNT_CAP = 25`, `DISCOUNT_APPROVAL_THRESHOLD = 10`, `discountGate()` enforces both plus the negative-percent refusal; the DB enforces the same as `booking_discounts_hard_cap` and `booking_discounts_over_ten_needs_reason_and_approver`, which no role can bypass. | `src/lib/money.ts:143-176`; `src/lib/discount.ts:validateDiscount`; live-schema brief, CHECK CONSTRAINTS |
| 15b | …as a fact about **this screen** | **MISLEADING** | Booking detail neither reads `booking_discounts` nor offers any discount control, so Law 10 is not exercised here. The `withDiscounts` flag that would fetch them is a caller-asserted boolean the module explicitly warns proves nothing about the session. | `BookingDetail.tsx` has no `booking_discounts` read; `src/lib/bookingQuery.ts:1909-1944` |
| 16 | `writes  createRental → create_booking(jsonb) RPC` | **CONFIRMED (wrong route)** | The RPC call is exactly right — `supabase.rpc('create_booking', { p_payload: payload })`. But `createRental` belongs to `/rentals/new`, not `/rentals/:bookingNo`; booking detail dispatches it never. | `src/actions/rentals/createRental.ts:414` |
| 17 | `create_booking … (0059, NOT YET APPLIED)` | **MISLEADING** | Both halves are wrong. The migration is **0063**`_create_booking_function.sql`, and the function **is applied and live**. | `src/actions/rentals/createRental.ts:35`; SQL: `select proname, pg_get_function_identity_arguments(oid) from pg_proc … ` → `create_booking(p_payload jsonb)` |
| 18 | §10.2: "`create_booking(jsonb)` already accepts `units` as an optional array per line, so **both options remain open against the same signature**" | **GAP — the B4 argument does not hold** | The deployed `create_booking` body **never mentions `units`**. It inserts `booking_lines` only, from the keys `line_type, parent_line_id, product_id, bundle_id, description, qty, days, rate, discount_amount, is_included, service_basis, supplier_id, supplier_cost, markup_amount, line_note, sort_order`. It writes **no `booking_line_units` row**. Allocation-at-creation would need a function change or a second write — it is not free against the current signature. | SQL: `select prosrc ~* 'units' from pg_proc where proname='create_booking'` → **false**; SQL on the `insert into booking_lines (…)` block |
| 19 | `the four floor verbs: packRental · handoverRental · returnRental · completeReset (all implemented)` | **CONFIRMED** | All four exist and write real rows through `floorVerb.ts` (`bookings`, `booking_lines`, `operation_sessions`, `cleaning_queue_entries`) with `logAuditEvent`. | `src/actions/rentals/{packRental,handoverRental,returnRental,completeReset}.ts`; `src/actions/rentals/floorVerb.ts:369, 382, 433, 752, 1058, 1134, 1208` |
| 19b | …as a fact about **this screen** | **MISLEADING** | Booking detail dispatches none of them. It opens `OperationsShell`; the verbs fire from `/rentals/:bookingNo/{packing,handover,return,reset}`. | `BookingDetail.tsx:1093-1097` (`OperationsLauncher` → `setShellOpen`) |
| 20 | `cancelRental · extendRental — NOT implemented, fail closed` | **CONFIRMED** | Both files exist with placeholder bodies that would return `{ success: true }`, **but the body is unreachable**: `createAction` throws `ActionNotImplementedError` when `implemented !== true`, and neither config sets it. Fail-closed is real, at the dispatcher, before anything observable. | `src/actions/core.ts:227-230`; `src/actions/rentals/cancelRental.ts:8-34` and `extendRental.ts:8-34` (no `implemented`); `src/modules/rentals/modals/ExtendRentalModal.tsx:127-128, 143` |
| 21 | `docs  next_document_number(kind) mints refs` | **WRONG-NAME — known-bad fact repeated** | The argument is **`p_sequence_key`**. supabase-js RPC args are named, so `rpc('next_document_number', { kind: … })` fails at **runtime**, not compile time. Every call site in this repo already uses `p_sequence_key`. | SQL: `next_document_number(p_sequence_key text)`; `src/actions/clients/createClient.ts:338`, `src/actions/finance/recordPayment.ts:330`, `src/actions/inventory/createBundle.ts:295` |
| 22 | `per-prefix sequences (F5, law)` | **CONFIRMED** | `number_sequences` holds 10 rows keyed by `sequence_key`, each with its own `prefix`, `padding` and `include_year`. | live-schema brief, `number_sequences` (booking B-, client C-, invoice INV-, payment PAY- with `include_year=true`, …) |
| 23 | §10.5: for money-blind roles the Invoices and Payments sections are **not built** (Law 6) | **CONFIRMED** | Genuinely not built into the DOM: the invoice and payment fetchers short-circuit to `[]` for a money-blind session, the `Money` phone segment is dropped from the segment array, and `withDeposit` is not even requested. Gating is `canViewMoneyField` in the UI **and** money-blind RLS + masked views in the DB. | `BookingDetail.tsx:688`, `:712`, `:758`, `:764`, `:874`; `src/lib/fieldGating.ts:52-62` |
| 24 | §10.5: a `Documents` section listing contract · quote · packing slip · pro forma | **GAP** | `document_registry` and `booking_documents` have no query module. The Documents block renders a stated not-wired note rather than a list. | `BookingDetail.tsx:1665-1680`, `:653` (`ADD_DOCUMENT_UNAVAILABLE`) |
| 25 | §10.5: `Activity logs` section | **GAP** | `booking_stage_transitions` has no query module; the Activity Timeline card says so instead of rendering. | `BookingDetail.tsx:1044-1050` |
| 26 | R8 booking-as-hub: this screen is the hub the other surfaces agree with | **MISLEADING** | It is a hub, but not through the module built to be one. Because the screen uses `listBookings`/`fetchFloorBooking` rather than `fetchCanonicalBooking`, the "one canonical shape every surface agrees on" that Law 2 asks for is asserted by convention, not by a shared call. | as #1 |

---

## Corrected Layer D

```
read      NOT fetchCanonicalBooking. That module is unwired (test-only).
          The route /rentals/:bookingNo issues FOUR reads:

          head      listBookings({ chips: { booking_no: [id] }, withDeposit })
                    source  bookings  (+ bookings_deposit_v when withDeposit)
                    filter  booking_no = :bookingNo
                    money   withDeposit only when canViewMoneyField(ctx,'booking')
                    Reads: bookings · bookings_deposit_v

          lines     fetchFloorBooking(:bookingNo)
                    source  bookings → booking_lines → booking_line_units
                            → product_units, and booking_lines → products
                    filter  booking_lines.voided_at IS NULL   (Law 3)
                    order   sort_order asc, in JS after the fetch
                    money   NONE. FLOOR_COLUMNS names no money column, by design.
                    Reads: booking_lines · booking_line_units · product_units · products

          invoices  listInvoices(invoicesForBooking(bookingId))
                    gated: not called at all for a money-blind session
                    Reads: invoices

          payments  listPayments(paymentsForBooking(bookingId))
                    gated: not called at all for a money-blind session
                    Reads: payments (+ bank_accounts embed for channel_group)

lines     booking_lines: qty, line_type, description, product_id, parent_line_id,
          sort_order. NO rate, NO days, NO discount_amount on this route.
          Per-line charge is GAP — not built on booking detail.
          (fetchCanonicalBooking, if ever wired, reads those through
          booking_lines_v, never the base table: `authenticated` holds no SELECT
          on booking_lines.rate / discount_amount / supplier_cost / markup_amount.)

serials   booking_line_units → product_units.serial_no, falling back to asset_tag.
          Rendered as read-only links to /inventory/:serial.
          Removal: GAP — not built, and must not be built as a DELETE.
          reject_delete_nothing_is_deleted is wired BEFORE DELETE on
          booking_line_units; Law 3 says the terminal action is a named
          state change, not a row deletion. Booqable's × does not port.

avail     "N left" on the line: GAP on this screen.
          The engine EXISTS and is OS-native (inventory_reservations was ruled
          out of Booqable ownership on 16 Aug 2026, PLAN.md §4.30(a)):
          lib/availability.ts selectUnitsForLine / explainShortfall over
          product_units_v + inventory_reservations. What is missing is a
          product-over-window count query and a column to render it in.
          v2.5's "no local source" and its dataAccess.ts:201 citation are both wrong.

money     Subtotal · Discount · VAT · Total · Paid · Outstanding are a SUM of the
          live (non-void) `invoices` rows' own columns — subtotal, discount_amount,
          taxable_amount, vat_amount, total_amount, paid_amount, outstanding_amount.
          Nothing on this screen re-prices anything; lib/money is used for
          FORMATTING only (formatMoney/grouped/toRupees), and formatMoney prints
          paisa when paisa are non-zero.
          lib/money's price() does round each step to a whole rupee (R2) — but it
          is not on this route's path.
          With zero invoices the block renders empty, not Rs 0.

deposit   bookings.deposit_required, through bookings_deposit_v (masked view).
          Labelled "Deposit Required"; "Not recorded" when null.
          Deposit Received / Pending: GAP — security_deposits has no read path in
          src/ and is deliberately outside queries/finance.ts (Law 5).
          Resolution chain global → product → client: GAP — not built.
          Self-explaining zero (§10.3): GAP — not built.

discount  lib/money.discountGate + lib/discount.validateDiscount implement Law 10
          (25% cap, >10% needs reason ≥10 chars + named approver, negative refused),
          mirrored in the DB by booking_discounts_hard_cap and
          booking_discounts_over_ten_needs_reason_and_approver — no role bypass.
          On THIS screen: GAP. booking_discounts is not read and no discount
          control exists.

engine    workflow.ts (stage tokens, Stepper), fieldGating.ts (Law 6 omission),
          rbac.ts (canRecordPayment / canPerformOperations), bs.ts (BS/AD pair),
          money.ts (formatting only).

writes    From this route:
            Confirm Booking → confirmRental
              Writes: inventory_reservations (via reserveAssignedUnits)
                    → booking_stage_transitions (via applyBookingTransition)
              Reads:  bookings · booking_lines
            Record Payment → recordPayment (settles against invoices.invoice_no;
              the screen now passes a real invoiceNo, not the booking number)
              Writes: payments
          NOT from this route:
            createRental → create_booking(p_payload jsonb)   [/rentals/new]
              APPLIED AND LIVE. Migration 0063, not 0059.
              It writes bookings + booking_lines ONLY — no booking_line_units,
              no `units` key anywhere in the function body.
            packRental · handoverRental · returnRental · completeReset
              [/rentals/:bookingNo/{packing,handover,return,reset}]
              Writes: operation_sessions · booking_lines · bookings ·
                      cleaning_queue_entries · audit_events
            cancelRental · extendRental — NOT implemented, fail closed at
              createAction (implemented !== true → ActionNotImplementedError).
          Booking-line add/edit/remove, crew, transport, documents, draft save:
            GAP — no write path from this screen.

docs      next_document_number(p_sequence_key text) — NOT `kind`.
          supabase-js RPC arguments are named, so the wrong key fails at RUNTIME.
          Valid keys are the 10 number_sequences rows: booking, bundle, client,
          deposit, equipment, expense, invoice, membership, payment, quote.
          Format: prefix || lpad(n, padding, '0'), with the year interposed only
          for `payment` (the only row with include_year = true).
          On THIS screen: GAP — no document is minted from booking detail.
```

---

## Money and Law 6

**Which figures are money here.** Subtotal · Discount · VAT · Rental Total · Paid ·
Outstanding (all summed from `invoices`); Deposit Required (`bookings.deposit_required`);
every row of Payment History (`payments.amount`); and the crew/sub-rental overflow entries.
Per-line rates are **not** money on this screen because they are not fetched.

**Who is money-blind here.** `moneyScope` (`fieldGating.ts:52-62`) gives `none` to
Warehouse, Technician, Driver and Client, and to *every* role on a `surface: 'floor'`
context. Coordinator gets `booking-and-client-balance`, which **includes** everything on
this screen except crew pay — hence the separate `canCrewMoney` gate on the Assign-crew and
Create-sub-rental overflow items.

**How the gating is achieved — and it is genuinely "not built", not "hidden".** Four
independent layers, and the UI layer is the one that matters for the DOM claim:

1. **Omission at the fetch.** `listInvoices` / `listPayments` are replaced by
   `Promise.resolve({ rows: [] })` for a money-blind session (`BookingDetail.tsx:758, 764`),
   and `withDeposit` is never set (`:712`). The bytes never arrive.
2. **Omission at the layout.** The phone segment array is built as
   `canBookingMoney ? ['Items','Money','Docs'] : ['Items','Docs']` (`:874`) — the Money
   pane has no tab and no node.
3. **RLS.** `invoices`, `payments`, `security_deposits`, `booking_discounts` and friends
   carry `*_money_blind` policies `USING auth_can_view_money()`, so even a hand-rolled
   query returns nothing.
4. **Masked views.** `bookings_deposit_v` NULLs `deposit_required`, and `booking_lines_v`
   NULLs `rate`/`discount_amount`, for the same four roles.

No `display:none`, no CSS masking, no greyed-out figure anywhere on this route. Law 6 is
satisfied in the strong sense.

**One residual hazard, inherited not introduced.** `withDiscounts` on
`fetchCanonicalBooking` is a bare caller-asserted boolean that proves nothing about the
session (`bookingQuery.ts:1909-1944`). It is currently harmless only because line-level
money masking makes the total unpriceable anyway. If that masking is ever relaxed without
gating the flag, a money-blind session starts getting a full-price total on a discounted
booking. Since this route does not call the module at all, the hazard is dormant here — but
it is the first thing to fix if anyone wires the canonical read in.

**Live-corpus caveat.** `invoices`, `payments`, `security_deposits`, `booking_lines` and
`booking_line_units` all hold **zero rows** today against 200 bookings. Every money block
and the whole equipment table render empty on live data regardless of code. That is corpus,
not defect — do not read an empty screen as a wiring failure.

---

## What this changes for the build

1. **Do not build §10.6's read.** `fetchCanonicalBooking` is not what this screen uses, and
   wiring it is a separate, larger decision (it would change the line shape, add
   `booking_lines_v` money, and activate the `withDiscounts` hazard). Build against
   `listBookings` + `fetchFloorBooking` + `listInvoices` + `listPayments`, which is what
   ships today. Decide deliberately whether the canonical module is adopted or deleted —
   leaving a tested, unwired, authoritative-looking module beside the real one is exactly
   how §10.6 came to be wrong.
2. **Do not implement serial removal as a DELETE.** The database refuses it
   (`reject_delete_nothing_is_deleted` on `booking_line_units`). If unassigning a serial is
   wanted, it is a state change on the row or a release of the matching
   `inventory_reservations` row — and it needs a ruling before code.
3. **Reopen B4 on corrected facts.** The §10.2 argument that "both options remain open
   against the same signature" is false: live `create_booking` has no `units` handling and
   writes no `booking_line_units`. Allocation-at-creation costs a function change.
   Allocation-at-Confirm is already built (`confirmRental` → `reserveAssignedUnits` →
   `inventory_reservations`). That asymmetry is now the actual decision, and it leans the
   opposite way from how §10.2 framed it.
4. **Availability is closer than §10.6 says.** The engine, the tables and the shortfall
   explanation all exist and are OS-owned. What is missing is one query
   (product × window → free count) and one column. Rewrite open decision 3 accordingly —
   "the Booqable bridge feeds it or the line shows nothing" is a false dichotomy.
5. **Never write `next_document_number({ kind })`.** It is `p_sequence_key`, the args are
   named, and the failure is at runtime in front of an operator. Every existing call site is
   already correct; §10.6 is the only place carrying the wrong name.
6. **Correct two migration facts before anyone acts on them.** `create_booking` is
   migration **0063** and is **applied and live** — not 0059, not pending. Re-verify against
   `pg_proc`, never against a migration header (headers in this repo are known-stale).
7. **Fix the money-grant comment in `queries/bookings.ts:973-976`.** It asserts the opposite
   of the live grants for `authenticated` and would justify adding money columns to a
   warehouse read. Note while there that **`anon` does hold SELECT** on all four money
   columns of `booking_lines` — worth a separate look, since only RLS stands behind it.
8. **Deposit: build the resolver or keep saying "Not recorded".** There is no global →
   product → client chain and no self-explaining zero. Rendering a computed deposit today
   would be fabrication; the current "Not recorded" is correct.
9. **Steal §10.3's self-explaining-zero pattern deliberately.** It is the single most
   valuable thing in this section and nothing in the repo implements it. It belongs in the
   deposit engine when that engine is written, not bolted onto the screen.
10. **The page doc is stale where it contradicts the code.** `docs/pages/14_booking_detail.md`
    describes a SEED-backed screen with `data/booking.ts`'s B-715, cites line numbers past
    the file's current 1882, and its finding #2 (Record Payment always fails because the
    modal is handed a booking number) is **fixed** — `BookingDetail.tsx:1802-1809` now passes
    real `invoiceNo`s. Code wins; the page doc needs a pass.

---

## Open questions

1. **Is `fetchCanonicalBooking` adopted or retired?** It is 2,568 lines of carefully
   reasoned, well-tested, entirely unwired code that every downstream doc treats as live.
   *Settled by:* a ruling in PLAN.md §4, then either wiring it into `/rentals/:bookingNo`
   (and gating `withDiscounts` in the same change) or deleting it with its test.
2. **B4 — serials at creation or at Pack?** Now decidable on real costs: creation requires
   editing a live SECURITY-INVOKER function; Confirm-time reservation is already built.
   *Settled by:* Babin's call, recorded in PLAN.md.
3. **Should `anon` hold SELECT on `booking_lines`' four money columns?** Verified live; only
   RLS stands behind it. *Settled by:* reading the two `booking_lines` RLS policies as `anon`
   and deciding whether the grant should be revoked outright.
4. **Where does VAT come from for a Quote?** `bookingQuery.ts:879-891` records this as an open
   TODO(decision): no VAT column on `bookings`, no finance-settings table, and
   `recalculate_invoice_totals()` hardcodes 0.13 — the exact thing `money.ts:94` forbids.
   This screen dodges it by summing invoice columns, so it only bites when a Quote must show
   a total. *Settled by:* a product ruling on whether the rate lives in Settings, on the
   booking, or on the invoice.
5. **Does the per-line "N left" chip belong on booking detail at all, or only at the bench?**
   The engine can answer it either way. *Settled by:* deciding the surface, then adding the
   product-over-window count query.
6. **Are the money-blind RLS policies actually correct per role?** Not verifiable from this
   pass — the MCP session runs as `postgres` with `rolbypassrls`, so `auth_user_role()`
   resolves to `'Client'` and every `_v` view returns zero rows for gate reasons, not data
   reasons. *Settled by:* an authenticated session per role (or `set app.current_user_id`)
   confirming the money columns come back NULL for Warehouse/Technician/Driver/Client.
