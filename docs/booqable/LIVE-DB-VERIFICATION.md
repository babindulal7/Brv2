# Live database verification — 31 Aug 2026

**What this closes.** The v1.1 extraction spec ends with an honest limit: *"No claim here was
checked against the live Supabase database."* This document removes that limit for the claims
that a database can settle. Every figure below was read from the live project over the Supabase
MCP connection on 31 Aug 2026, not from a migration file, a doc, or a dated line in `PROGRESS.md`.

**Project read:** `sxguwvgoserhdolewibb` (`babindulal7's Project`), `ap-southeast-1`,
Postgres 17.6, status `ACTIVE_HEALTHY`.

**Method:** read-only `SELECT` only. No row was created, changed or deleted, and no migration
was applied. Anyone can re-run every query in this file.

> **Why this file exists at all.** The standing trap in this repo is that migration headers
> saying `NOT APPLIED` are stale and have already caused three wrong diagnoses. The cure is not
> a better-maintained header, it is asking the database. This file is that question, asked once
> and written down.

---

## 1. The finding that changes what gets built next

> ## ✅ RESOLVED the same day — read this before the section below
>
> **This section is kept as written, and it is now out of date.** `0076_seed_operational_stage_corpus`
> was applied by a concurrent session later on 31 Aug. Re-measured after it landed:
>
> | Stage | Then | **Now** |
> |---|---|---|
> | Booked | **0** | **30** |
> | Packed | **0** | **16** |
> | Returned · Closed · Quote · On Rent | 130 · 60 · 7 · 3 | unchanged |
>
> **The Going out panel is no longer structurally empty.** The diagnosis below was correct when
> taken and the fix it called for — *"seed data that exercises `Booked` and `Packed`"* — is exactly
> what was done.
>
> **What survives, and is the reason this section is not deleted:** the *rule*. An empty floor panel
> in this project is far more often the corpus than the code. **Run the stage census before debugging
> a query** — and note that the documented suspect, the 06:00 day-boundary, would have been the wrong
> one. That reasoning is worth more than the figures it was derived from.

**The Dashboard's two main panels render empty against the live database, and will keep doing
so no matter which date you pick.** *(As measured earlier on 31 Aug — superseded, see above.)*

Today, 31 August 2026, the live answers are:

| Dashboard panel | Filter set | Live count |
|---|---|---|
| Going out | `todaysOutgoing` — stage `['Booked','Packed']` | **0** |
| Coming back | `todaysIncoming` — stage `['On Rent']`, not yet returned | **0** |
| Overdue KPI | `overdue` — stage `['On Rent']`, `return_at` in the past | **1** |

The reason is not the date window. Pickups in the corpus span **22 Jul 2026 → 25 Nov 2026**, so
there is plenty of data on either side of today. The reason is the **stage** predicate:

| Stage | Rows | Cancelled | Notes |
|---|---|---|---|
| Returned | 130 | 0 | |
| Closed | 60 | **60** | every Closed row is also cancelled |
| Quote | 7 | 0 | |
| On Rent | 3 | 0 | the only rows any floor panel can reach |
| **Booked** | **0** | — | **no row has ever been in this stage** |
| **Packed** | **0** | — | **no row has ever been in this stage** |

The `booking_stage` enum itself is correct and complete — `Quote, Booked, Packed, On Rent,
Returned, Closed`, exactly the canonical six the spec names. Two of the six simply have no rows.

**Why this matters more than it looks.** `todaysOutgoing` is the query behind the busiest panel
on the busiest screen, and it is structurally unsatisfiable in this corpus. The next person to
open `/dashboard` against live data will see an empty Going out panel and have to decide whether
they are looking at a bug, a wrong filter, a date-boundary error, or correct behaviour. They will
reach for the 06:00-vs-midnight `TODO(decision)` first, because that is the documented suspect,
and it is the wrong suspect. It would cost a session.

`[ruled]` **Do not debug an empty Going out panel before running the stage census above.** An
empty panel here is the corpus telling the truth.

**What would fix it:** seed data that exercises `Booked` and `Packed`, or a transition run that
moves some Quote rows forward. This is a seed-fidelity gap, not a code defect — nothing in
`bookings.ts` is wrong.

### A second corpus caveat, in the same family

All 130 `Returned` rows have `actual_return_at` **null**. `todaysIncoming` and `overdue` both
carry `presence: { actual_return_at: false }` to mean "still out", so in this corpus that
predicate excludes nothing — the column is simply never populated. The filters are written
correctly; they are just not being exercised. Verify any change to them against data that
populates the column, or the test proves nothing.

---

## 2. The spec's §2.4 contract list — all 26 objects confirmed live

Every table and view the spec names as "measured, do not re-derive" exists. This is the spec's
strongest section and it verified cleanly:

**Base tables (21):** `bookings` · `booking_lines` · `booking_line_units` · `clients` ·
`client_flags` · `invoices` · `payments` · `payment_reversals` · `security_deposits` ·
`expenses` · `expense_categories` · `branches` · `operation_sessions` ·
`cleaning_queue_entries` · `users` · `audit_events` · `number_sequences` · `external_refs` ·
`external_invoices` · `sync_outbox` · `sync_conflicts`

**Views (5):** `clients_v` · `client_directory_v` · `membership_plans_v` · `products_v` ·
`product_units_v`

**Plus one the spec does not mention:** `cases` **exists as a base table** (RLS on, 1 policy,
**0 rows**). See §5.

### RPCs

| Spec claims | Live reality |
|---|---|
| `create_booking(jsonb)` | ✅ `create_booking(p_payload jsonb)` |
| `next_document_number(kind)` | ✅ exists, but the parameter is **`p_sequence_key text`**, not `kind` |
| `booking_facets(filters jsonb)` — *recommended* | **Does not exist.** Correctly described as unbuilt |

Also present and worth knowing: `apply_booking_stage_transition`, `next_booking_stage(booking_stage)`,
`validate_booking_gates`, `enforce_booking_discount_stacking` — the transition and gate machinery
is in the database, not only in `lib/workflow`.

### Booking number format — confirmed

`^B-[0-9]+$` holds for **200 of 200** rows, zero violations, range `B-700` → `B-899`. The spec's
claim is exactly right.

---

## 3. Law 6 — RLS is enabled everywhere it must be

Law 6 says money visibility is enforced by **RLS, not the UI**, and `PLAN.md` §4.28 records that
ruling as *half-applied*. The live state: row-level security is **enabled with policies on every
money-bearing table**.

| Table | RLS | Policies |
|---|---|---|
| `invoices` | on | 4 |
| `security_deposits` | on | 4 |
| `bookings` · `payments` · `clients` · `expenses` | on | 3 each |
| `booking_lines` · `payment_reversals` · `audit_events` | on | 2 each |
| `cases` | on | 1 |

`relforcerowsecurity` is **false** on all of them, which is normal — it only matters for the
table's owner role — but it is worth stating so nobody reads "forced: false" later as a hole.

**What this does and does not prove.** It proves the enforcement point exists where Law 6 requires
it. It does **not** prove the policies are *correct* — that needs a session authenticated as each
of the money-blind roles (Warehouse · Technician · Driver · Client), reading these tables and
confirming the columns come back empty. `[unverified]` — and it is the single most valuable
follow-up in this pack, because a wrong policy here is a Law 6 breach that no amount of UI
gating can repair.

---

## 4. `audit_events` — the Dashboard feed proposal is feasible, but it would be monotonous today

The spec's §4.5 ruling replaces Booqable's free-text notes panel with a **recent-activity feed
reading `audit_events`**. That ruling is sound, and the table is richer than the spec assumed.

**Live shape** — 21 columns: `event_class`, `category`, `module`, `action`, `severity`, `status`,
`table_name`, `record_id`, `actor_id`, `actor_role`, `branch_id`, `old_values`, `new_values`,
`diff`, `reason`, `created_at`, `client_uuid`, `ip_address`, `user_agent`, `device_type`, `id`.

**Two corrections to the spec's §4.5 data block:**

1. It says `filter: latest N by **occurred_at**`. There is no `occurred_at` column. The timestamp
   is **`created_at`**.
2. It lists the audit triggers as covering "bookings, clients, invoices, payments,
   security_deposits, **inventory_units**". The sixth table is **`product_units`**. `inventory_units`
   does not exist.

**Triggers confirmed live** on `bookings`, `clients`, `invoices`, `payments`, `product_units`,
`security_deposits` — six, as claimed, with one name corrected. `audit_events` additionally
carries `trg_audit_events_reject_update` and `trg_audit_events_reject_delete`, which is Law 3 and
Law 4 enforced in the database rather than trusted to the app. Good.

**The catch — 5,378 rows, but only one module:**

| module | action | rows | last seen |
|---|---|---|---|
| Rentals | Create | 2,985 | 29 Aug 2026 |
| Rentals | Update | 2,273 | 28 Aug 2026 |
| Rentals | Approve | 120 | 12 Aug 2026 |

Every recorded event is `Rentals`, in three actions. Despite triggers existing on `payments`,
`invoices` and `security_deposits`, none has fired — those tables hold **zero rows** (§5).

So the feed would render today, with real data and real timestamps, but it would be a wall of
"Rentals · Create". The spec's vision — *typed events with their own icons and amounts, free-text
notes as one type among many* — is the right design and is **not currently demonstrable**. Build it
against this table by all means; do not use this corpus to judge whether it looks good.

`[ruled]` The feed reads `created_at`, not `occurred_at`, and amounts on payment and charge events
stay behind `useCanViewMoney` per Law 6.

---

## 5. Empty tables — what the money screens have to work with

| Table | Rows |
|---|---|
| `clients` | 366 |
| `bookings` | 200 |
| `audit_events` | 5,378 |
| `external_refs` | 171 |
| **`payments`** | **0** |
| **`invoices`** | **0** |
| **`cases`** | **0** |

**This constrains two of the spec's headline sections.**

§9.3's two money definitions (Revenue = ex-tax including unpaid orders; Due = remaining to be
paid) and §5's Paid/Due sidebar figures are both good rulings — and both would render **zero or
empty** on every screen today, because there is not one invoice or one payment in the database.
The ruling that *every money tile carries its definition on the tile* is still worth applying now;
just do not expect a live figure to check it against.

**`cases` is the interesting one.** `PROGRESS.md` (30 Aug) says the Cases chip count "goes live the
day a `cases` table query exists" — and the table **already exists**, with RLS and a policy. But it
holds **0 rows**, while the seed the chip and page both read shows **12 open cases**.

`[ruled]` **Switching the Cases chip from the seed to the table is a one-line change that turns 12
into 0.** That is not an improvement, it is a regression the operator will report as a bug. Move the
chip and the page together, and only once the table has data. The seed note already in the chip
comment should be updated to say the blocker is *rows*, not the table.

---

## 6. The Booqable bridge has never carried a single order

`external_refs` holds 171 rows, and they are only two entities:

| provider | entity | rows | `last_pulled_at` |
|---|---|---|---|
| booqable | clients | 100 | null |
| booqable | products | 71 | null |

**No orders. No payments. No invoices. No documents.** `last_pulled_at` is null on every row, so
these were written by an import push, not by a pull cycle.

**What follows from that, and it is the most consequential thing in this file after §1:**

Standing rulings **R2 (money: whole rupees vs their paisa + VAT-on-discounted-total)**,
**R3 (status: map ours down to theirs)** and **R4 (sub-rental has no counterpart)** are all rulings
about **how a Booqable *order* is translated**. Not one Booqable order has ever crossed the bridge.
Those three rulings are therefore **unexercised** — reasoned, written down, and never once run
against real data.

They may well be right. R2 in particular is an arithmetic argument that does not need data to be
sound. But "ruled" and "proven in transit" are different states, and this pack should not let them
blur. The first real order sync is the test, and it will be the moment the paisa-rounding and
status-mapping decisions either hold or produce a discrepancy on every booking for the whole
bridge period, exactly as R2 warns.

`[ruled]` Before the first production order sync, run one order through the bridge in isolation and
diff every money field and the stage by hand.

---

## 7. `npm run check:db` cannot see any of this — and the spec leans on it

The v1.1 spec's §7 item 6 is emphatic, and right in spirit:

> *"Any statement about the live database must be checked with `npm run check:db` (v2) and not
> quoted from a dated line in an older doc. That failure mode has already cost this project once."*

The script exists (`scripts/check-db.mjs`, wired as `check:db` in `package.json`). It was run
against live during this pass. **Every one of its 23 tables came back ZERO** — including
`bookings`, `clients` and `external_refs`, which this pass has just proved hold 200, 366 and 171
rows.

The reason is printed by the tool itself, in its own header:

> `session: anon — no identity.`
> `RLS will filter nearly every table to zero rows WITHOUT raising an error, so the zero counts
> below mean almost nothing. Pass --email/--password.`

**The tool is not broken and it is not lying — it is one of the more honest diagnostics in this
repo.** It refuses to let a zero be read as evidence, twice, in its header and again in its footer.
The problem is the instruction that points at it. Run with no credentials, `check:db` cannot
distinguish *"this table is empty"* from *"RLS refused me"*, so it can neither confirm nor refute a
single claim in this document.

**Why this is the most dangerous item in the pack.** Someone following §7 item 6 literally, without
credentials, sees 23 zeros against a healthy production project. The available wrong conclusions are
"the database is empty", "the migrations were never applied", or "the bridge has synced nothing" —
and the second of those is *precisely* the failure mode that has already cost this project three
wrong diagnoses via stale `NOT APPLIED` migration headers. The instruction meant to prevent
that failure can reproduce it.

`[ruled]` **A live-database claim needs an identity.** `npm run check:db` is only evidence when run
with `--email/--password` (or `--local` against the local stack). Run bare, its output is evidence
of nothing and must not be quoted as a count.

`[ruled]` **The Supabase MCP connection is the better route for schema and census questions** and
is how every figure in this document was obtained. It reads past RLS **on base tables**, so a zero
from a base table is a real zero.

> ⚠ **Corrected 31 Aug — this claim was too broad, and the exception is a trap.** The MCP session
> connects as `postgres`, which bypasses RLS on base tables. But `auth_user_role()` reads
> `app.current_user_id` (unset) then `auth.uid()` (null) and **falls through to its `'Client'`
> default** — so on this connection `auth_can_view_money()` is **false** and `auth_is_staff()` is
> **false**. Every `_v` masking view filters on those functions in its own `WHERE` clause, which
> nothing bypasses. Measured: `clients` **366 rows**, `clients_v` **0 rows**, on the same connection,
> in the same statement.
>
> **So there are now two ways to read a misleading zero in this project**, not one: `check:db` as
> `anon` (RLS filters everything), and **MCP as `postgres` (every `_v` view reads as Client)**. To
> inspect a view, impersonate first — `select set_config('app.current_user_id', '<user uuid>', false);` — which is exactly what makes §5's empty `payments`, `invoices` and `cases` meaningful, and
what makes §1's stage census trustworthy enough to build on.

One incidental confirmation from the script's own annotations: it labels `external_refs`,
`external_invoices`, `sync_outbox` and `sync_conflicts` as *"lib/booqable/sync.ts — no screen
imports it yet"*. That matches §6: the bridge has data but no user interface reaches it.

---

## 8. What is still unverified after this pass

- ~~**RLS policy correctness per role.**~~ ✅ **DONE 31 Aug — see §9.** It passed.
- **Anything about Booqable's own screens.** This pass read our database. No Booqable screen was
  observed; every Booqable-side claim in this pack is inherited from the v1.1 spec's live session
  and is tagged as such.
- **Whether the app renders what these queries return.** No browser was driven and no test suite was
  run by this pass. The counts in §1 are what the *filters* return, verified in SQL by reproducing
  their predicates; confirming the *panels* show them is a separate check.
- **`membership_plans_v`, `products_v`, `product_units_v`, `client_directory_v` row counts** — the
  views exist; their contents were not inspected.
- **`check:db` run with an identity.** Every figure here came from the MCP route (§7). Running the
  repo's own script with `--email/--password` and reconciling it against this document would either
  corroborate these counts through a second independent path or expose a discrepancy worth knowing
  about. It was not done in this pass because it needs credentials this session does not hold.

---

## Appendix — re-running this

Every claim above comes from a read-only query against project `sxguwvgoserhdolewibb`. The two
worth re-running most often:

```sql
-- §1  Why the floor panels are empty. Run this BEFORE debugging one.
select stage::text, count(*) n,
       count(*) filter (where cancelled_at is not null) cancelled
from public.bookings group by 1 order by 2 desc;

-- §5  What the money screens have to work with.
select (select count(*) from payments) payments,
       (select count(*) from invoices) invoices,
       (select count(*) from cases)    cases;
```


---

## 9. Law 6 verified per role — the check this document twice called its highest-value follow-up

**31 Aug 2026.** Every earlier section here said the same thing: RLS is *enabled* on the money
tables, but enabled is not correct, and only a session authenticated as a money-blind role could
settle it. That session has now been run. **Law 6 passes, at both layers.**

**Method.** `auth_user_role()` resolves `app.current_user_id` before `auth.uid()`, so a role can be
impersonated inside one transaction without credentials:

```sql
select set_config('app.current_user_id', '<user uuid>', false);
set local role authenticated;   -- so RLS actually applies
```

Users used: Warehouse `…0103`, Owner `…0101`. Read-only throughout.

### Layer 1 — row denial on pure-money tables

`bank_accounts` is the only money table with rows live (2), which makes it the only non-vacuous
test available. A zero from an empty table proves nothing, so this is the one that counts:

| Role | `bank_accounts` rows |
|---|---|
| **Warehouse** | **0** |
| **Owner** | **2** |

Same query, same instant, opposite results. The policy works.

`payments`, `invoices` and `expenses` returned 0 for **both** roles — they are empty, so those
comparisons are **vacuous and prove nothing**. Stated plainly because reading them as a pass would
be exactly the error this document exists to prevent.

### Layer 2 — column masking in the `_v` views

This is the subtler half, and the one Law 6 actually needs: a Warehouse operator **must** see the
booking, and **must not** see its money. Row denial cannot express that. Column masking can:

| Role | `bookings_deposit_v` rows | non-null `deposit_required` |
|---|---|---|
| **Warehouse** | **246** | **0** |
| **Owner** | **246** | **246** |

Both roles see all 246 rows. Only Owner sees a single figure. **That is precisely the designed
behaviour**, and it is now measured rather than assumed.

### Layer 3 — the column grant that arms the mask

`0062_law6_column_grants_arm_the_mask` is real and working. Comparing `SELECT` grants on `bookings`:

- **`authenticated`** — every column **except `deposit_required`**.
- **`service_role`** — all columns, including it (expected; it is the trusted path).

A direct `select deposit_required from bookings` as `authenticated` fails with
`42501: permission denied`. **The masking view is not merely the polite route to the money — it is
the only route.** Going around it is refused by the grant, not by convention.

### ⚠ One asymmetry worth fixing, though it is not a live breach

**`anon` retains `SELECT` on `deposit_required`; `authenticated` does not.** The unauthenticated
role holds a column grant on a money column that the authenticated one has been denied.

**Not currently exploitable** — measured as `anon`: **0 rows** from `bookings`, because RLS denies
them before any column is read. So the grant is unreachable today.

It is still worth closing, for one reason: it is unreachable **only** because no permissive `anon`
policy exists. The day anyone adds one — a public availability endpoint, a share link, a status
page — the money column comes with it, silently, because the grant was already there. Defence in
depth is what makes that day survivable. `authenticated` is already the stricter of the two, which
is the wrong way round.

Related, same shape: both `anon` and `authenticated` hold `INSERT`/`UPDATE` on `deposit_required`
while `authenticated` cannot `SELECT` it. Writing a money field you are forbidden to read is not a
Law 6 read-breach, but it is an integrity hazard and reads as an oversight rather than a decision.

### What this section does and does not establish

**Established:** Law 6 holds for **Warehouse** against `bank_accounts` and `bookings_deposit_v`,
and the column grant blocks the base-table bypass.

**Not established:** the other three money-blind roles — **Technician, Driver, Client** — have
**no users in the `users` table** (live roles are Owner ×2, Admin, Coordinator, Warehouse), so they
could not be impersonated. They share the same `auth_can_view_money()` predicate, which is a strong
argument that they behave identically, but it is an argument, not a measurement. Nor was any
`_v` view other than `bookings_deposit_v` checked column by column.
