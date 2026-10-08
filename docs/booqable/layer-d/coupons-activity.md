# Layer D verification — Coupons and Activity logs
v2.5 section: §16 (lines 1029-1119)   ·   Our route(s): /tools/activity-log, /admin/activity-log, /admin/audit-log
Verified: 31 Aug 2026   ·   Method: repo read + live DB (read-only)

Layers A/B/C of §16 (the five live coupons, the rail, the columns, the nine verbatim sentences,
the master-detail layout) are trusted and were not re-checked. Everything below is §16.3's
backend data link plus the behavioural assertions §16.1/§16.2 make about our side.

## Verdict table

| # | v2.5 Layer D claim | Verdict | Real answer | Evidence (file:line or SQL) |
|---|---|---|---|---|
| 1 | A coupons screen exists on our side (`/coupons`, nav table) | GAP — not built | No `/coupons` route, no coupons module, no coupons query module, no coupons action. `grep -ril coupon src/` returns 10 files, none of them a screen: `booking_discounts.coupon_id` plumbing (createRental, bookingQuery), Booqable API types, a seed report, and a numbering constant. | ROUTES export map (no `/coupons`); `src/actions/rentals/createRental.ts:152,407`; `src/lib/bookingQuery.ts:407,982,1022,1770`; `src/modules/reports/PromotionsReports.tsx:9` (all-seed) |
| 2 | `discount_policies` table `{code, pct, scope, window, usage_limit, authorised_by, reason}` | GAP — not built | The table does not exist. `select to_regclass('public.discount_policies')` → `null`. It is a draft only: `0073_discount_policies.sql` is named in a comment and nowhere else. | SQL: `select to_regclass('public.discount_policies')` → null; `src/lib/discount.ts:81-82` ("`0073_discount_policies.sql`, draft") |
| 3 | …and that shape is new / needs building | MISLEADING | A `coupons` table already exists carrying six of the seven proposed fields under different names: `code`, `discount_percent`, `max_discount_amount`, `min_booking_amount`, `valid_from`, `valid_until`, `max_redemptions`, `current_redemptions`, `is_active`. What it genuinely lacks is the Law 10 pair — no `authorised_by`, no `reason` — and product/client `scope`. 0 rows. | Live schema brief, `coupons`; SQL: `select count(*) from coupons` → 0 |
| 4 | Applications "counted via `booking_discounts` referencing the policy" | WRONG-NAME | Two real mechanisms already exist and neither is a policy join. `coupon_redemptions` (coupon_id, booking_id, client_id, discount_amount, redeemed_at) is the per-application ledger, and `coupons.current_redemptions` is the running count. `booking_discounts.coupon_id` exists and is written, but it is the *link*, not the counter. | Live schema brief, `coupon_redemptions` / `coupons.current_redemptions`; `src/actions/rentals/createRental.ts:407` writes `coupon_id` |
| 5 | "`lib/discount` owns the combined-cap rule" | MISLEADING | `src/lib/discount.ts` owns the per-row cap only, and says so in prose: "The 25% cap binds the STACKED total per booking and is enforced by `trg_booking_discounts_stacking` at the database; this function checks only its own row against the cap." The stacking rule lives in the DB trigger `enforce_booking_discount_stacking`, wired BEFORE INSERT/UPDATE on `booking_discounts`. | `src/lib/discount.ts:118-123` (applyPolicy header) and `:141-147`; live schema brief, `enforce_booking_discount_stacking` |
| 6 | "Creation writes the Law 10 `audit_events` row" | GAP — not built | There is no coupon or policy creation path at all — no action file, no screen, no RPC. `coupons` also carries no `log_audit_event` trigger (the six trigger-covered tables do not include it), so even a direct insert would produce no audit row. | SQL below (trigger census); `grep -ril coupon src/` → no `src/actions/**` coupon writer |
| 7 | "`audit_events` (already triggered on 6 tables)" | CONFIRMED | Exactly six, and they are `bookings`, `clients`, `invoices`, `payments`, `product_units`, `security_deposits`. Note the sixth is `product_units`, not "inventory_units". | SQL: `select c.relname, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and p.proname='log_audit_event'` → 6 rows |
| 8 | `lib/audit` is the engine that writes those rows | CONFIRMED | `logAuditEvent` inserts into `audit_events` via `idempotentInsert` with `returnRow: false`, never throws, returns `AuditWriteResult` so the caller knows. It is the app-side half; the six triggers are the DB half. | `src/lib/audit.ts:69-104` |
| 9 | "+ a sentence-template registry per event type" | GAP — not built | No registry, no template map, no per-event-type renderer anywhere in `src/`. `/admin/audit-log` renders a table (`when · who · action · entity · before → after`), not sentences. | `src/modules/admin/AuditLog.tsx:28-35, 256`; repo grep for a template registry returns only unrelated prose |
| 10 | "actor filter = users join" | MISLEADING | A users join cannot work and the built filter deliberately does not use one. `users` has one SELECT policy, `users_select_own` (`id = coalesce(app.current_user_id, auth.uid())`), so an actor-name embed resolves for exactly one row — the viewer's own — and renders "unknown" beside everyone else. The shipped filter is by **`actor_role`**, stamped on the event itself. | SQL: `pg_policies` → `users_select_own` qual `(id = COALESCE((NULLIF(current_setting('app.current_user_id',true),''))::uuid, auth.uid()))`; `src/lib/queries/audit.ts:126-135` |
| 11 | "per-entity scoping already exists (booking sidebar 'View activity logs')" | GAP — not built | The *query* exists and has zero callers: `auditForRecord(tableName, recordId)` is exported but imported by nothing outside its own module. BookingDetail's "Activity Timeline" card renders a `NotWiredNote` saying the history lives in `booking_stage_transitions`, which has no query module. ClientDetail's "activity" tab renders four static client facts, no events. | `src/lib/queries/audit.ts:294-299`; caller grep → only `listAuditEvents` in `AuditLog.tsx:14,129`; `src/modules/rentals/BookingDetail.tsx:1044-1051`; `src/modules/clients/ClientDetail.tsx:1194-1215` |
| 12 | "detail right pane = event payload inspection … ours renders the audit row's before/after" | CONFIRMED | `/admin/audit-log` derives the diff from `old_values`/`new_values` field-by-field, filtered to fields that actually differ, and renders `<Diff before after />` inline plus expanded. The `diff` column is carried but deliberately not read (no ruling fixes its shape). | `src/modules/admin/AuditLog.tsx:301, 407-432, 535, 570, 601`; `src/lib/queries/audit.ts:174-175` |
| 13 | §16.2: "Our Dashboard feed reads `audit_events`" | GAP — not built | `/dashboard` (`Today.tsx`) contains no audit read of any kind — no import of `lib/audit`, `queries/audit`, or `audit_events`. The only hit for "activity" in the file is a comment. The §4.5 ruling this sentence leans on has no implementation to lean on. | grep of `src/modules/today/Today.tsx` for audit/activity/feed → one comment at `:466`, no query |
| 14 | §16.2: "Law 6 means money-blind roles get the event with the amount elided … not the event hidden" | MISLEADING | On our side the event *is* hidden, twice over, and elision never arises. `audit_events_select` admits `auth_user_role() in ('Owner','Admin','Manager')` — Coordinator and Accounts get zero rows; Warehouse/Technician/Driver/Client get zero rows AND are refused the route by the `/admin` money-surface gate. Elided-amount rendering would be a new ruling, not a Law 6 consequence. | SQL: `pg_policies` → `audit_events_select` qual `auth_user_role() = ANY (ARRAY['Owner','Admin','Manager'])`; `src/lib/queries/audit.ts:82, 111-117`; `docs/pages/52_activity_log.md:79-82` |
| 15 | Implied: `/reports/activity_logs` has a counterpart of ours | WRONG-NAME | Ours is `/admin/activity-log` (`src/modules/admin/ActivityLog.tsx`), with `/tools/activity-log` a `replace` redirect to it. There is no `/reports/*` activity route. The audit trail is a separate screen, `/admin/audit-log`. | ROUTES export map; `src/App.tsx:133` |
| 16 | Implied: our Activity Log is a live event feed | MISLEADING | It is seed-only. `ActivityLog.tsx` imports no query, no action and no `supabase` client — all eight rows, four KPIs, three filter vocabularies and the "90 days" retention line are constants in `src/data/activityLog.ts`. The page doc's "Status: Seed-only" is still accurate against current code. | `src/modules/admin/ActivityLog.tsx:1-18` (complete import list); `docs/pages/52_activity_log.md:7,13,45-56` |

**Known-bad facts:** §16 repeats **none** of the six known-bad facts. It does not name ClickableRow, does not touch BrandKey or Card, does not call `next_document_number`, does not mention facetCounts, and its "6 tables" figure is correct. The only law reference in range is Law 10 (discount ceremony) and Law 6 (money blindness), both cited by the right number.

## Corrected Layer D

```
coupons     GAP — not built. No /coupons route, no module, no query, no action.
            DB side is NOT a gap: table `coupons` exists (code, discount_percent,
            max_discount_amount, min_booking_amount, valid_from, valid_until,
            max_redemptions, current_redemptions, is_active) with 0 rows, plus
            `coupon_redemptions` (coupon_id, booking_id, client_id,
            discount_amount, redeemed_at) as the per-application ledger.
            `discount_policies` DOES NOT EXIST (0073 is a draft filename in a
            comment). What `coupons` lacks for Law 10 is authorised_by, reason,
            and product/client scope.
  source    coupons  (base table; RLS coupons_select = auth_can_view_money())
  filter    is_active for the Active/Inactive rail; valid_from/valid_until for
            the validity window. No filterParams schema exists for this screen.
  order     none built. `coupons` has no display_order column.
  window    valid_from / valid_until (date, date)
  money     max_discount_amount, min_booking_amount — RLS-gated by
            auth_can_view_money() on the table itself; discount_percent is not
            money and is not masked.
  engine    src/lib/discount.ts — validateDiscount() (per-application ceremony,
            >10% needs reason ≥10 chars + approverId; hard cap 25) and
            applyPolicy() (steps DOWN from an authorised ceiling, refuses a
            revoked policy). It owns the PER-ROW cap only.
            The STACKED per-booking cap is the DB trigger
            enforce_booking_discount_stacking on booking_discounts, plus the
            CHECKs booking_discounts_hard_cap (0-25) and
            booking_discounts_over_ten_needs_reason_and_approver.
  action    GAP — no coupon create/edit/revoke action file exists.
  Writes:   GAP — not built  →  (would be) coupons, coupon_redemptions
  Reads:    GAP — not built  →  coupons (there is no coupons_v view)

  NOTE      `coupons` carries NO log_audit_event trigger, so "creation writes
            the Law 10 audit_events row" is not true today and would have to be
            written explicitly by the action via lib/audit logAuditEvent().
            booking_discounts also has no audit trigger — only the six tables
            below do.

activity    TWO screens, not one, and they are different things.

  (a) /admin/activity-log  — usage timeline. SEED-ONLY.
      source  none. src/data/activityLog.ts:75-172, eight hand-written rows.
      filter  three local <select>s (user, module, date), useState only.
      order   newest-first, over the constant (ACTIVITY_TIMELINE :175-177).
      money   none rendered. Route is money-gated only as a side effect of the
              '/admin' prefix in MONEY_ROUTES.
      engine  none.
      action  none — no import from src/actions/ at all.
      Writes: none  |  Reads: src/data/activityLog.ts (SEED, no DB row)

  (b) /admin/audit-log  — the real append-only trail. LIVE.
      source  audit_events (base table, 5378 rows).
      filter  module (audit_module enum), actor_role (system_role enum — NOT a
              users join; users is self-scoped), period (All time / Today /
              Last 7 / Last 30, bounded at the NPT instant not bare UTC dates).
      order   created_at desc, tiebreak id (idx_audit_events_created_at desc).
      window  auditPeriodFilters() → dateRange on created_at. The timestamp
              column is created_at; there is NO occurred_at on this table.
      money   audit_events has no money column. Nothing calls rupees()/
              toRupees(). old_values/new_values are rendered verbatim as
              historical record content, never re-priced.
      engine  src/lib/queries/audit.ts (listAuditEvents, auditForRecord,
              auditRestriction, AUDIT_KPI_FILTERS, auditPeriodFilters)
              src/lib/audit.ts (logAuditEvent — the writer)
      action  none. View-only for every role including Owner; no update, no
              delete, no archive exists and none may be added
              (reject_update_append_only is wired on audit_events in the DB).
      Writes: src/lib/audit.ts logAuditEvent()  →  audit_events
              + the DB trigger log_audit_event() on SIX tables:
                bookings, clients, invoices, payments, product_units,
                security_deposits.  (product_units — not "inventory_units".)
      Reads:  audit_events  (base table; there is no audit_events_v view)

  sentence-template registry   GAP — not built. Nothing in src/ maps an event
              type to a sentence. /admin/audit-log draws a table:
              when · who · action · entity · before → after.

  per-entity scoping           GAP — not built. auditForRecord(tableName,
              recordId) exists (queries/audit.ts:294) and has ZERO callers.
              BookingDetail's "Activity Timeline" is a NotWiredNote pointing at
              booking_stage_transitions, which has no query module.
              ClientDetail's "activity" tab shows four static client facts.

  dashboard feed               GAP — not built. Today.tsx reads no audit_events.

detail      CONFIRMED. The expanded row is a field-by-field before → after
            derived from old_values/new_values, filtered to fields that differ.
            The `diff` jsonb column is carried in the row type but deliberately
            NOT read — no ruling fixes its shape.
            Writes: none  |  Reads: audit_events.old_values / .new_values
```

## Money and Law 6

**Coupons.** `max_discount_amount` and `min_booking_amount` are money; `discount_percent` is not.
Gating is **RLS on the base table**: `coupons_select` is `auth_can_view_money()`, so Warehouse,
Technician, Driver and Client get zero coupon rows — not masked columns, no rows at all.
`coupons_manage` (ALL) is `auth_user_role() in ('Owner','Admin','Manager')`.
`coupon_redemptions_all` is `auth_can_view_money()` for both USING and WITH CHECK, and
`discount_amount` on it is money. There is **no `coupons_v` view**, so there is no masked-column
path here — the pattern is row-level exclusion, not column NULLing. Nothing is built into the DOM
today for any role, because the screen does not exist.

**Activity Log (`/admin/activity-log`).** No money of any kind is rendered. The page does not call
`useCanViewMoney()`. Its route refusal for Warehouse/Technician/Driver/Client is a **side effect of
the bare `/admin` prefix** in `MONEY_ROUTES`, not of its content — those four roles see
`RestrictedState`, which is "hidden" in the correct sense (absent from the DOM), but for the wrong
reason.

**Audit Log (`/admin/audit-log`).** `audit_events` has no money column, so Law 6 column-masking is
not in play. What *is* in play is a narrower gate than Law 6: `audit_events_select` admits
**Owner, Admin, Manager only**. The route admits five roles, so a **Coordinator or Accounts**
session gets HTTP 200 and zero rows from RLS. That must render as **restricted, never empty** —
`auditRestriction()` exists precisely for this and is spread into `PageBody`. v2.5's §16.2 line
about money-blind roles receiving an amount-elided event is therefore not our behaviour: those
roles receive nothing, and adopting elision would be a new ruling, not a Law 6 consequence.

## What this changes for the build

1. **Do not build `discount_policies`.** Extend `coupons` instead. It already carries code, percent,
   min spend, max discount, validity window, usage limit, usage count and an active flag. The three
   genuinely missing pieces are `authorised_by`, `reason` and a scope link (product/client). That is
   an ALTER, not a new table — and it keeps `coupon_redemptions` and `booking_discounts.coupon_id`,
   both of which already exist and are already written by `createRental`.
2. **Stop attributing the stacking cap to `lib/discount`.** `applyPolicy()` checks one row. The
   per-booking 25% stacked total is `enforce_booking_discount_stacking` on `booking_discounts`,
   backed by `booking_discounts_hard_cap` and
   `booking_discounts_over_ten_needs_reason_and_approver`. Any coupon screen must expect a DB
   rejection it did not compute, and must surface the trigger's message.
3. **A coupon-creation action must write its own audit row.** `coupons` has no `log_audit_event`
   trigger and neither does `booking_discounts`. Only six tables do. The Law 10 ceremony row is an
   explicit `logAuditEvent()` call in the action, or it does not happen.
4. **Build the actor filter on `actor_role`, not on a users join.** `users_select_own` makes a name
   embed resolve for the viewer's own row and nobody else's. `queries/audit.ts` already made this
   decision; a sentence renderer must not silently re-introduce the join to print "Rupesh Karki".
   If real actor names are required, that needs a new SECURITY DEFINER view or a widened `users`
   policy — a schema change with an RLS consequence, not a UI task.
5. **The sentence-template registry is a green field, and it has a natural first caller.**
   `auditForRecord()` is written, tested-by-shape and unused. Wiring the per-entity trail into
   BookingDetail (replacing the `NotWiredNote`) is the smallest honest first use of a template
   registry, and it exercises the registry against exactly the six trigger-covered tables.
6. **The Dashboard activity feed does not exist.** Any §4.5 ruling that assumes "our Dashboard feed
   reads audit_events" is describing intent. Today.tsx has no audit read. Either build it or stop
   citing it as existing.
7. **Keep the two log screens distinct, and fix the seed one honestly.** `/admin/activity-log` is
   eight constants; `/admin/audit-log` is the live trail. Pointing the Activity Log at
   `audit_events` would merge two screens the code deliberately separates (usage vs. state change).
   If Activity Log is to go live it needs a source of its own — there is no activity table in the
   schema and none in the mock corpus.
8. **Expect an empty coupons screen against live data.** `coupons` = 0 rows, `coupon_redemptions` =
   0, `booking_discounts` = 0. v2.5's five live coupons are Booqable's, not ours. That is corpus,
   not defect — but the screen must draw a real empty state, not a spinner.

## Open questions

1. **Does `coupons` get `authorised_by` + `reason`, or does the Law 10 ceremony live only in
   `booking_discounts` per application?** *Settles it:* a ruling in PLAN.md §4. The DB constraint
   `booking_discounts_over_ten_needs_reason_and_approver` already forces reason+approver onto every
   >10% application row, so a policy-level pair is a convenience for copying, not a requirement.
   Two of v2.5's five live coupons (−25%, −20%) exceed the threshold, so the question is live.
2. **What is coupon "scope" scoped to?** v2.5 shows product scoping ("77mm Close-Up Filter, +169")
   and implies client scoping (§13.5's standing client discount). `coupons` has neither column and
   there is no join table. *Settles it:* deciding whether scope is a `coupon_products` join, a
   `client_id` column, or both — then one migration.
3. **Is `coupons.current_redemptions` authoritative, or is `count(coupon_redemptions)`?** Both exist
   and this pass did not check whether anything keeps them in step. *Settles it:*
   `select tgname from pg_trigger where tgrelid = 'coupon_redemptions'::regclass and not tgisinternal`
   — if that returns nothing, a ruling must name one of the two as the source of truth and either
   add a trigger or drop the column.
4. **Does the sentence registry key on `(module, action)` or on `table_name`?** Live data offers only
   three `(module, action)` pairs today — Rentals/Create 2985, Rentals/Update 2273, Rentals/Approve
   120 — which is far too coarse to render "Pick up CFX-A-LEX-002 on Booking #898". *Settles it:*
   deciding whether richer event types get added to `audit_action`/`audit_module`, or whether the
   sentence is composed from `table_name` + the before/after diff.
5. **Should `/admin` stay in `MONEY_ROUTES`?** It refuses four roles from two screens that show no
   money, and `src/data/nav.ts:143-145` argues in prose against exactly that outcome while
   `:149` causes it. *Settles it:* a ruling on whether audit/activity/numbering/backup are
   money surfaces or back-office surfaces; if the latter, they need their own predicate, not the
   money one.
6. **Is real actor-name rendering wanted enough to change `users` RLS?** *Settles it:* a decision on
   whether to add a staff-name lookup view (like `staff_directory_v`, but not Owner-only) that the
   audit trail may join. Until then every rendered actor is a role, not a person.
