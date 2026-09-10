# STAGE 1 — Make the database the law
**Babin Rentals OS · build spec · 24 Bhadra 2083 BS · 9 Sep 2026**
Location: `docs/STAGE_1.md`. Depends on `docs/STAGE_0.md` complete (exit checklist ticked, `npm run completion` printed DB enforcement 6 / 9). Source: `docs/AUDIT_2026-09-08.md` §6.4–6.7, §9, §11; `RULINGS-2026-09-04.md` R-05; `RULINGS-2026-09-08.md` R-26 · R-27 · R-29; `docs/PERMISSIONS.md` §4, §6, §9, §15.

> After Stage 0 the database refuses a double booking and a money-blind price edit. It still lets a booking walk Booked → On Rent → Closed with no packing, no handover, no return and no invoice — the audit did exactly that in seven inserts. Stage 1 moves every gate that decides money or custody out of `runFloorVerb` and into `apply_booking_stage_transition`, so the rule holds for PostgREST, for the Booqable sync, and for the app bug nobody has found yet. **No screen and no action is built in Stage 1.** Actions arrive in Stage 2 and call rules that already exist.

---

## 0. Scope, exit, budget

| | |
|---|---|
| **In scope** | S1-1 stage gates (Pack · Handover · Return · Cancel · Reopen) · S1-2 close gate · S1-3 invoice void discipline · S1-4 payment ceiling · S1-5 `product_units.status` engine-owned · S1-6 `users` visibility and role ceiling · S1-7 server-side prices for money-blind callers · S1-8 Law 17 in the `delivery_type` enum · S1-9 lifecycle L6–L11 green, `check-db.mjs` write probes, completion 9 / 9 |
| **Out of scope** | the 22 actions (Stage 2) · any screen or modal · seed removal, reports, settings, user-management UI (Stage 3) · FK indexes, bundle size (Stage 10) · Client Portal binding (Stage 6) |
| **Exit** | `npm run completion` → **DB enforcement 9 / 9 · Lifecycle 13 / 13** in PGlite **and** the same nine refusals reproduced on the live project by `check-db.mjs --write-probes` as Coordinator, Warehouse and Accounts seats · working tree clean · PROGRESS.md entry ends with the R-29 blocks |
| **Budget** | 8 build sessions + 1 Babin apply session. Two weeks at one session a day. |
| **Numbering** | first free number after Stage 0 = **0102**. One migration per task, S1-1 → S1-8 = `0102 → 0109`. Read `docs/live/schema_migrations_*.txt` first; never reuse a number that exists in either the repo or the live manifest. (Note: Under R-38, migrations are 0113–0120 due to existing committed/applied migrations). |
| **Authority** | PERMISSIONS.md §15. Claude resolves every conflict without asking, logs it three places, **never applies to live (N-5)**, never renames an enum value except where this file says so (S1-8 is a ruled exception to N-6 — see there). |

### Sequence and why

```
S1-8 enum rename     ─ first: cheapest, and every later message/test uses the new value
S1-5 unit status     ─ before S1-1: the gates read unit status, so the engine must own it first
S1-1 stage gates     ─ the spine; L6, L7
S1-2 close gate      ─ reads S1-1's session rows; L11
S1-3 void discipline ─ independent; completes gate 6
S1-4 payment ceiling ─ independent; L9
S1-7 server prices   ─ independent; closes the Stage 0 note on Warehouse line inserts
S1-6 users           ─ independent; unblocks Stage 3 user management
S1-9 gate + probes   ─ last; prints the exit numbers
```

### Read before writing a single column name

`0002` (bookings, booking_lines, booking_stage_transitions, payments) · `0003` (product_units, inventory_reservations) · `0045` (capacity) · `0071` (`create_booking`) · `0090` (`apply_booking_stage_transition`, the payment WARN) · `0092`–`0096` (guards, grants, stage write lock, views, `create_invoice`) · `0101` (R-26) · `src/actions/rentals/floorVerb.ts` (how a session is recorded: the `kind` values, the `status` values, what `session_line_movements` rows look like) · `src/lib/workflow.ts` (the canonical six and the flags `Due Soon · Partial Pickup · Picked Up`). The build session greps; it does not remember.

---

## 1. Preconditions (Babin, before session 1)

1. Stage 0 exit checklist fully ticked; `0098–0101` applied live; `reservation_backfill_conflicts` empty.
2. Fresh live backup; timestamp in PROGRESS.md.
3. Re-export `supabase_migrations.schema_migrations` → `docs/live/schema_migrations_2026-09-<dd>.txt`, commit.
4. Answer or accept the defaults in §7 — S1-a (Coordinator and invoices) changes a policy in S1-3 and a row in PERMISSIONS.md, so it is better ruled before the session than after.

---

## 2. The gate contract (shared by every task)

Every refusal raised by the database in Stage 1 follows one shape so the app can render it inline without parsing prose:

```
raise exception 'GATE:<gate.id>|<human message>' using errcode = 'P0001';
```

| `gate.id` | Raised when | Who may override | Where |
|---|---|---|---|
| `gate.pack.session_missing` | Booked → Packed with no completed pack session for the booking | nobody | S1-1 |
| `gate.pack.units_unassigned` | a serialised line still has fewer `booking_line_units` than `qty` | nobody — Pack assigns units (B4 ruling) | S1-1 |
| `gate.pack.units_unpacked` | a unit has no `packed` movement in the session | nobody | S1-1 |
| `gate.handover.session_missing` | Packed → On Rent with no completed handover session | nobody | S1-1 |
| `gate.handover.units_unhanded` | a packed unit has no handover line | nobody (partial pickup is a **flag**, and it is set by the handover session, not by skipping the gate) | S1-1 |
| `gate.handover.agreement_unsigned` | no signature row for the booking's rental agreement | nobody | S1-1 |
| `gate.handover.payment_outstanding` | **WARN only** — already 0090; never raises; logged per session | any staff (7 Sep ruling) | unchanged |
| `gate.return.session_missing` | On Rent → Returned with no completed return session | nobody | S1-1 |
| `gate.return.units_unaccounted` | an on-rent unit has no `return_lines` row (returned · missing · damaged) | nobody | S1-1 |
| `gate.cancel.stage_too_late` | `cancelled_at` set while stage ≥ Packed by a role below Manager | M+ with reason | S1-1 |
| `gate.cancel.reason_missing` | `cancelled_at` set with `cancellation_reason` shorter than 10 chars | nobody | S1-1 |
| `gate.reopen.role` | Closed → Returned by a role below Manager | M+ | S1-1 |
| `gate.close.no_invoice` | Returned → Closed with zero non-void invoices | nobody | S1-2 |
| `gate.close.invoice_unsettled` | any non-void invoice with `outstanding_amount > 0` | nobody | S1-2 |
| `gate.close.deposit_unresolved` | a `security_deposits` row for the booking with no refund / forfeit recorded | nobody | S1-2 |
| `gate.close.open_case` | a `cases` row for the booking not in a terminal status | nobody | S1-2 |
| `gate.close.reservation_live` | a reservation for the booking with `released_at is null` | nobody (R-26 releases on Returned; this is a consistency check) | S1-2 |
| `gate.invoice.void_reason` | `status → Void` with `void_reason` < 10 chars or `voided_by` null | nobody | S1-3 |
| `gate.invoice.void_role` | `status → Void` by a role outside the void set | nobody | S1-3 |
| `gate.invoice.void_paid` | `status → Void` while `paid_amount > 0` and no credit note row | nobody — reverse or credit first | S1-3 |
| `gate.payment.over_invoice` | payment linked to an invoice exceeds its `outstanding_amount` | nobody — an overpayment is a refund, not a payment | S1-4 |
| `gate.payment.over_booking` | unlinked (advance) payment takes the booking's received total above its current estimate | nobody | S1-4 |
| `gate.unit_status.direct_write` | `product_units.status` written by anything but the recompute engine | nobody | S1-5 |
| `gate.users.role_ceiling` | Admin sets `primary_role` to Owner or Admin; Manager sets any role | Owner | S1-6 |
| `gate.price.money_blind_override` | money-blind caller passes an explicit `rate` that differs from the model's rate | nobody — the server price is used | S1-7 |

App side (Stage 2, not here): `src/lib/gates.ts` maps `gate.id` → English and Nepali message; `PageBody` renders it inline; **no toast**. Every gate row above appears in `docs/PERMISSIONS.md` §6.1 with the same id — that table gains an `id` column in this stage's docs commit.

---

## 3. Tasks

### S1-8 · Law 17 in the database — `delivery_type` `'Customer Pickup'` → `'Client Pickup'`

**Evidence.** Audit §8: the enum still carries `'Customer Pickup'`; the app's `CLIENT_PICKUP` constant in `createRental.ts` is the only place the boundary is written down. Law 17: the word appears nowhere.

**Ruled exception to N-6 (log as R-33).** This is a value rename, not a `system_role` change and not a released capability string; `alter type … rename value` rewrites the catalog, not the rows.

**Migration `0113_law17_delivery_type_client_pickup.sql`**
```sql
alter type delivery_type rename value 'Customer Pickup' to 'Client Pickup';
```
Then grep the repo: every `'Customer Pickup'` literal in `src/**`, `supabase/migrations/*.sql` **bodies of functions that are re-created later in this stage** (0071's `create_booking` is re-created in S1-7 — fix it there), seed data, tests. Applied migrations are not edited; a comment `-- superseded by 0113: value renamed` goes above the old literal in any file that is otherwise touched.

**Acceptance.** `select enum_range(null::delivery_type)` has no `Customer`; `grep -rn "Customer Pickup" src supabase/migrations | grep -v "superseded by 0113"` prints 0; `check:pglite` green; vitest green (update the `CLIENT_PICKUP` test if it asserted the old value).
**Revert.** `rename value` back. One line.

---

### S1-5 · `product_units.status` is owned by the engine

**Evidence.** Audit §6.4: a unit stayed `In Stock` while its booking was On Rent; no writer in `src/actions`, no trigger. Inventory v3.0: ten exclusive statuses, status never editable, Σ child statuses = parent stock.

**Design — a stored cache, recomputed by one function, writable by nothing else.**

Migration `0114_unit_status_engine.sql`:

1. `recompute_unit_status(p_asset_id uuid)` — `security definer` (it must write the column that everything else is forbidden to write), `search_path` pinned, sets `set_config('app.unit_status_recompute','on',true)` for the transaction, computes and writes exactly one value by this precedence (first match wins):

| Order | Status | Source of truth |
|---|---|---|
| 1 | `Retired` | `product_units.retired_at is not null` (or the Retired disposition table if one exists — read 0003) |
| 2 | `Missing` | an open `cases` row of type Missing for this unit, or a `return_lines` row `missing` with no later `returned` |
| 3 | `Maintenance` | an open `maintenance_records` row for this unit (`completed_at is null`) |
| 4 | `On Rent` | a `handover_lines` row for this unit whose booking is `On Rent` |
| 5 | `Returning` | booking `On Rent` with `return_at <= now()` and no return line yet (Due-Soon/overdue read side; keep only if Inventory v3.0 lists it — it does) |
| 6 | `Inspection` | a `return_lines` row for this unit whose session is completed and no `cleaning_queue_entries` row yet |
| 7 | `Cleaning` | a `cleaning_queue_entries` row for this unit not completed |
| 8 | `Packed` | a `packed` movement in a completed pack session whose booking is `Packed` |
| 9 | `Reserved` | a live `inventory_reservations` row for this unit whose period **contains now()** or starts within the reserve-ahead window (Settings; default 0 — i.e. only current) — ⭐ S1-c |
| 10 | `In Stock` | none of the above |

2. **Source triggers** — `after insert or update` on `booking_stage_transitions`, `session_line_movements`, `handover_lines`, `return_lines`, `cleaning_queue_entries`, `maintenance_records`, `cases`, `inventory_reservations`, `product_units` (`retired_at`) → each calls `recompute_unit_status` for the units it touched. Batch-safe: `for each row`, but the function is idempotent, so double calls are harmless.
3. **Write guard** — `before update of status on product_units`: if `current_setting('app.unit_status_recompute', true) is distinct from 'on'` → `raise 'GATE:gate.unit_status.direct_write|…'`. INSERT may set `In Stock` only (new units are always In Stock — Add Equipment v3.0).
4. **Backfill** — `select recompute_unit_status(id) from product_units;` in the migration, with a `raise notice` of the status histogram before and after.
5. Views (`products_v`, `product_units_v`) keep reading the column; the parent status summary already sums children.

**Acceptance.** PGlite: a unit walks `In Stock → Reserved (when period contains now) → Packed → On Rent → Inspection → Cleaning → In Stock` through the lifecycle script; `update product_units set status='On Rent'` as Owner → `gate.unit_status.direct_write`; a Missing return line → `Missing` until a `returned` line supersedes it; backfill histogram in the notice. Inventory row invariant test (Σ children = stock) still green.
**Revert.** Drop the guard trigger and source triggers; the column keeps its last values. One migration.

---

### S1-1 · Stage gates live in `apply_booking_stage_transition`

**Evidence.** Audit §6.4 / §9: Booked → Packed → On Rent → Returned accepted with zero `operation_sessions`, `packing_lines`, `handover_lines`, `return_lines`. Eight handover gates exist in the app only.

**Migration `0115_stage_gates.sql`** — `create or replace function apply_booking_stage_transition()` copying the 0090 body (the WARN on payment stays exactly as it is) and adding, per `new.to_stage`:

| Transition | Checks (raise the first that fails, in this order) |
|---|---|
| `Quote → Booked` | client not blocked (`client_flags`); ≥ 1 line; R-26 reservation insert already fires after this |
| `Booked → Packed` | a completed `operation_sessions` row of the pack kind for this booking (read the kind/status literals from `floorVerb.ts`) → else `gate.pack.session_missing` · every serialised line has `count(booking_line_units) = qty` → else `gate.pack.units_unassigned` · every unit has a `packed` movement in that session → else `gate.pack.units_unpacked` |
| `Packed → On Rent` | completed handover session → `gate.handover.session_missing` · every packed unit has a `handover_lines` row → `gate.handover.units_unhanded` (a unit deliberately left behind is recorded as a handover line with the not-taken outcome and sets the **Partial Pickup** flag — the gate counts rows, not outcomes) · a signature row for the rental agreement → `gate.handover.agreement_unsigned` · payment outstanding → **WARN row only, never raise** (0090) |
| `On Rent → Returned` | completed return session → `gate.return.session_missing` · every handed-over unit has a `return_lines` row → `gate.return.units_unaccounted` (outcomes `returned · missing · damaged` all count; a `missing` row must have a matching open `cases` row — create it in the same function if absent, it is the return session's job and the DB backstops it) |
| `Returned → Closed` | S1-2 |
| `Closed → Returned` (reopen, stage-only, R-05) | caller `auth_is_manager_or_above()` → else `gate.reopen.role`; `new.reason` ≥ 10 chars; invoices untouched |
| any → any other | already refused by 0090's transition table; keep |

**Cancel** (there is no cancel action yet; the DB rule comes first): `before update of cancelled_at on bookings` → if the caller is below Manager and `stage >= Packed` → `gate.cancel.stage_too_late`; if `cancellation_reason` < 10 chars → `gate.cancel.reason_missing`; else allowed. R-26's release trigger fires after.

Also in this migration: `auth_is_manager_or_above()` and `auth_is_owner()` (PERMISSIONS.md §9 said "add"; Stage 0 did not need them, Stage 1 does).

**Session completeness is the app's job, the count is the database's.** `runFloorVerb` still writes sessions, movements, lines and signatures exactly as today; nothing in `src/actions` changes in this task except that its own pre-checks may now be deleted **only after** the lifecycle proves the DB refuses the same case (delete in Stage 2 with the action work, not here).

**Acceptance.** Lifecycle L6: the seven-insert walk from the audit is refused at Booked → Packed with `gate.pack.session_missing`; with a completed pack session but one unit lacking a movement → `gate.pack.units_unpacked`; full rows → accepted. L7 (partial return): two-unit line, one `missing` return line → Returned accepted, a Missing case exists, the missing unit's reservation is **not** released (R-26 release excludes units with an open Missing case — extend 0101's release in this migration). Cancel by Warehouse at Packed → `gate.cancel.stage_too_late`; by Manager with reason → accepted and reservations released. Reopen by Coordinator → `gate.reopen.role`.
**Revert.** `create or replace` back to the 0090 body; drop the cancel trigger. One migration.

---

### S1-2 · Close needs a settled booking, not a settled invoice

**Evidence.** Audit §6.5: Returned → Closed accepted with **zero** invoices, a Rs 5,000 `deposit_required` with no deposit row, and Rs 30,000 paid against Rs 7,000 of gear. The existing text reads "unsettled invoices" — zero invoices is not unsettled.

**Migration `0116_close_gate.sql`** — extend the same function for `Returned → Closed`, in this order:
1. `count(invoices where booking_id = b and status <> 'Void') = 0` → `gate.close.no_invoice`.
2. `exists(invoices where booking_id = b and status <> 'Void' and outstanding_amount > 0)` → `gate.close.invoice_unsettled`.
3. `exists(security_deposits where booking_id = b and refunded_at is null and forfeited_at is null)` — read the deposit table's real resolution columns in 0002/0005 and use those — → `gate.close.deposit_unresolved`. **If `deposit_required > 0` and there is no deposit row at all**, that is also unresolved: the deposit was never collected or never recorded.
4. `exists(cases where booking_id = b and status not in (<terminal statuses from the enum>))` → `gate.close.open_case`.
5. `exists(inventory_reservations where booking_id = b and released_at is null)` → `gate.close.reservation_live`.

Overpayment is **not** a close gate — S1-4 makes it impossible to record in the first place; existing overpaid invoices (if any live) are surfaced by `check-db.sql` and refunded through the Stage 2 action.

**"Auto-suggest close, manual confirm" (4 Sep) stays the app's UX.** The DB never closes anything by itself.

**Acceptance.** Lifecycle L11: close before payment → `gate.close.invoice_unsettled`; close with no invoice → `gate.close.no_invoice`; after full payment and deposit refund → accepted, `closed_at` set. Backfill check in the migration: `raise notice` the count of **already-Closed** live bookings that would fail these gates today (they stay Closed — Law 3 — but the count goes to PROGRESS.md and the list to `docs/live/closed_without_invoice_<date>.txt` for the accountant).
**Revert.** `create or replace` back. One migration.

---

### S1-3 · Voiding an invoice is a documented act

**Evidence.** Audit §6.6: Owner `update invoices set status = 'Void'` on an issued invoice → allowed with `void_reason`, `voided_by`, `credit_note_no` all NULL. No `voidInvoice` action; `VoidInvoiceModal` dispatches nothing.

**Migration `0117_invoice_void_discipline.sql`** — `before update of status on invoices` when `new.status = 'Void' and old.status <> 'Void'`:
1. `auth_is_finance_or_admin()` → else `gate.invoice.void_role`. **Membership per ⭐ S1-a default:** Owner · Admin · Manager · Accounts (R-05). If Babin rules Coordinator in, this helper — not the trigger — changes, and PERMISSIONS.md §4.6 follows.
2. `length(coalesce(new.void_reason,'')) >= 10 and new.voided_by is not null and new.voided_at is not null` → else `gate.invoice.void_reason`. The trigger **sets** `voided_by = coalesce(current_setting('app.current_user_id', true)::uuid, auth.uid())` and `voided_at = now()` itself when null, so the reason is the only thing the caller must supply.
3. `old.paid_amount > 0` → a credit note row must exist for this invoice (`credit_notes` table — if absent, this migration creates it: `id, credit_note_no (CN- via next_document_number('credit_note')), invoice_id, amount, reason, created_by, created_at`, RLS same as invoices) → else `gate.invoice.void_paid`. The void of a paid invoice therefore is: credit note first, then void; the Stage 2 action does both in one RPC.
4. Once `Void`, every column is immutable — extend the existing figures-immutable trigger to cover `status <> Draft → anything`, so `Void` cannot be un-voided.
5. `invoices` UPDATE policy stays as is; the trigger is the discipline, RLS the fence.

**Acceptance.** PGlite: Owner void with no reason → `gate.invoice.void_reason`; Coordinator void with reason → `gate.invoice.void_role` (under the default); Accounts void of an unpaid invoice with reason → accepted, `voided_by` filled; void of a paid invoice without credit note → `gate.invoice.void_paid`; with credit note → accepted; `update invoices set status='Sent' where status='Void'` → refused.
**Revert.** Drop the trigger; leave `credit_notes` (Law 3). One migration.

---

### S1-4 · A payment cannot exceed what is owed

**Evidence.** Audit §9: PAY-0094 Rs 30,000 accepted against Rs 7,000 of gear with no invoice; only `payments_amount_positive` fired on the second attempt.

**Migration `0118_payment_ceiling.sql`** — `before insert on payments`:
1. `new.invoice_id is not null` → `new.amount <= invoice.outstanding_amount + 0.01` → else `gate.payment.over_invoice` (one paisa tolerance for rounding; ⭐ S1-d).
2. `new.invoice_id is null` (advance / deposit-type payments) → `sum(payments for booking where payment_type <> security deposit) + new.amount <= booking current estimate` where the estimate is the engine figure `create_invoice` would produce today (`sum(rate × qty × days) − discounts` + VAT — reuse the same SQL the RPC uses; factor it into `booking_estimate_total(booking_id)` so two callers cannot drift) → else `gate.payment.over_booking`.
3. `payment_type = 'Security Deposit'` rows are **not** payments against rental (Foundation §2, `payments_no_security_deposit` check already forbids them in `payments`) — nothing to add; the check stays.
4. `sync_payment_to_invoice` (existing) still updates `paid_amount / outstanding_amount / status`; the ceiling runs before it.

**Acceptance.** Lifecycle L9: amount > outstanding → `gate.payment.over_invoice`; amount ≤ 0 → existing check; payment for another client's booking → RLS (Coordinator sees the booking but `client_id` mismatch — add `new.client_id = booking.client_id` to the same trigger, error `gate.payment.client_mismatch`); Warehouse insert → RLS. L10: 3,000 then 4,119 → Paid, outstanding 0.
**Revert.** Drop the trigger and `booking_estimate_total`. One migration.

---

### S1-7 · Prices come from the database when the caller cannot see them

**Evidence.** Stage 0 S0-5 note: `booking_lines_all` admits a Warehouse INSERT carrying a `rate`; `create_booking` takes `rate` from the payload. A Warehouse seat reads rates through money-masked views, so its payload carries whatever the client had — null, zero, or stale.

**Migration `0119_server_side_prices.sql`** — `create or replace function create_booking(jsonb)` copying 0071's body (with S1-8's literal fixed) and changing line pricing:
- For every line: `v_rate := products.daily_rate` (the current rate of the model) **unless** `auth_can_view_money()` and the payload carries an explicit `rate` — then the payload's rate is used and a `rate_overridden boolean` (add the column to `booking_lines` if absent) is set true so Reports can show manual pricing. A money-blind caller whose payload rate differs from the model rate gets `gate.price.money_blind_override`? **No — default ⭐ S1-e: silently use the server price and ignore the payload**; raising would make Warehouse booking creation fail on stale caches. Log a `audit_events` row `price.server_applied` instead.
- `discounts` for a money-blind caller: already refused whole by `booking_discounts_money_blind` (Law 6) — keep; add a clearer message: `GATE:gate.discount.money_blind|…`.
- `before insert on booking_lines` guard: money-blind caller inserting a line outside `create_booking` (`current_setting('app.in_create_booking', true) is distinct from 'on'`) with any non-null money column → refuse. `create_booking` sets the GUC for its transaction.

**Acceptance.** PGlite: Warehouse `create_booking` with `rate: 1` on a Rs 3,500 model → line rate 3,500, `rate_overridden = false`, audit row present; Coordinator with `rate: 3000` → 3,000, `rate_overridden = true`; Warehouse direct `insert into booking_lines (… rate …)` → refused. L1 still green.
**Revert.** `create or replace` back to the S1-8 body; drop the line guard. One migration.

---

### S1-6 · Staff can be seen, and roles have a ceiling

**Evidence.** Audit §6.7: every role reads exactly one `users` row (its own), Owner included. Settings ▸ People & Access cannot list anyone; PERMISSIONS.md §3.1 AD2 (Admin assigns ≤ Manager) is unenforceable today.

**Migration `0120_users_visibility_and_role_ceiling.sql`**
1. Policies on `users`: `users_self_read` (keep) · `users_read_staff_directory` — `auth_user_role() in ('Owner','Admin')` → all rows; `'Manager'` → rows where `branch_id = my branch`; `'Coordinator','Accounts'` → `id, full_name, primary_role, branch_id` only, via a new view `staff_directory_v` (names for assignment dropdowns; no email/mobile — PERMISSIONS.md §10) · everyone else → own row only.
2. `users_update_admin` — Owner/Admin may update `primary_role`, `branch_id`, `deactivated_at`; `before update` trigger: if `auth_user_role() = 'Admin'` and `new.primary_role in ('Owner','Admin')` → `gate.users.role_ceiling`; if `auth_user_role() = 'Manager'` and `new.primary_role is distinct from old.primary_role` → same gate; nobody deactivates themselves (`new.id = current user` and `deactivated_at` set → refuse); nobody deactivates the last Owner.
3. `users_insert_admin` — Owner/Admin insert; Admin cannot insert Owner/Admin (same trigger fires on insert).
4. **No DELETE policy**, ever (Law 3). Deactivation = `deactivated_at`; `auth_user_role()` returns `'Client'` for a deactivated row (one-line change to 0056_0's function, re-created here) so a deactivated seat loses everything immediately.

**Acceptance.** PGlite: Owner reads 9 probe users; Manager reads only own branch; Coordinator reads `staff_directory_v` names and cannot select `users.email`; Admin sets Coordinator → Manager (ok), → Admin (`gate.users.role_ceiling`); Owner → Admin (ok); deactivated user resolves to `Client` and reads 0 bookings; Owner `delete from users` → refused.
**Revert.** Restore the self-read-only policy set; drop the trigger and the view. One migration.

---

### S1-9 · Prove it — lifecycle 13 / 13, live write probes, completion 9 / 9

1. **`scripts/e2e-lifecycle.mjs` v1** — L6, L7, L8, L9, L10, L11 turn from `known-red` to asserted. The script writes the session rows itself the way `runFloorVerb` does (pack session + movements, handover session + lines + signature, return session + lines) — it is testing the database, not the app, and it must also test that **skipping** each row set is refused by the named gate id. Add the S1-5 status walk and the S1-3/S1-6/S1-7 probes as L14–L17 (total becomes 17; the R-29 lifecycle percentage is over the total, so the denominator grows — that is correct).
2. **`scripts/check-db.mjs --write-probes`** — the live-project counterpart: signs in as a real seat and attempts, **inside a transaction it rolls back**, each refusal in the gate table above, printing `gate.id → refused` or `ALLOWED (P0)`. Never runs `create_booking`, never writes a payment (mutating what it measures — the 15 Aug rule); the ceiling probe uses `set constraints`/rollback, the gate probes use a throwaway booking created in the same rolled-back transaction.
3. **`scripts/completion.mjs`** — map the nine gates to lifecycle ids: `L3 · L1 · L12 · L6 · L11 · L14(void+figures) · L13b · L13c · L12d`. Prints 9 / 9 when all green.
4. `docs/PERMISSIONS.md` §6.1 gains the `id` column; §9 lists the new helpers; §4.6 records the S1-a outcome.

**Acceptance.** CI green with lifecycle 17 / 17; `check-db.mjs --write-probes` as Coordinator, Warehouse, Accounts on live prints no `ALLOWED`; `npm run completion` → DB enforcement 9 / 9.
