# Babin Rentals OS — Build Plan

**Read this before writing any code. Every session.**
Then update [`PROGRESS.md`](PROGRESS.md) with what you actually did.

**Specs:** [`../mds and photos/Babin Rentals OS/`](../mds%20and%20photos/Babin%20Rentals%20OS/)
Canonical: `00 Getting Started/Foundation Specification.md`. Where anything disagrees with
Foundation, **Foundation wins**.

---

# 0. The laws — non-negotiable

Break any of these and the work gets reverted, however good it looks.

| # | Law | Where it bites |
|---|---|---|
| 1 | **Pages never implement business logic.** Ten engines own it | Every screen |
| 2 | **Single Query Rule** — one booking query serves every surface. *Hard acceptance gate* | Data layer |
| 3 | **Nothing is deleted** — Cancel · Void · Reverse · Retire · Archive · Deactivate · Close | Schema + UI |
| 4 | **Payments immutable** — corrections are reversal rows referencing the original | Schema |
| 5 | **Deposits are liabilities** — never in Rental Total, never reduce Outstanding, never a payment | Schema + finance |
| 6 | **Warehouse sees no money** — including inside gate checklists. **RLS, not the UI** | Schema + RLS |
| 7 | **Store AD in UTC.** BS is rendered, never stored. All logic on AD | Schema + localization |
| 8 | **Every write carries a client UUID.** Duplicates rejected | Data layer + offline |
| 9 | **Days mandatory on every priced line** — explicitly `1`, never by omission | Schema |
| 10 | **Discounts are UNGATED.** No reason, no approver, no cap below 100%, no role tier — any staff role that can write a discount may write one. What remains is arithmetic validity only: negative refused (a price rise is not a discount — the R3-1 hole stays closed) and >100% refused (a negative price). *Ruled first on **20 Aug 2026** — keep discounts, remove the rules, app and migration — in a session with no repo access, so it never reached this file until the 31 Aug rules check. Amended twice on 31 Aug 2026: D3 (ruled 30 Aug, "copy Booqable") was first confirmed as the policies alternative, then overridden by Babin's final word — "don't put any gate on discount." The policies draft (0073) was deleted unapplied. The app half is done (`lib/discount.ts` · `money.ts:discountGate` · `rbac.ts:canApproveDiscount` · both Tools calculators); the DB half, `0074_drop_discount_gate.sql`, was **APPLIED to the live project 31 Aug 2026** with Babin's explicit in-session approval — `booking_discounts_hard_cap`, `booking_discounts_over_ten_needs_reason_and_approver`, `invoices_discount_cap` and `invoices_discount_over_ten_needs_reason_and_approver` are gone, replaced by `*_percent_sane` (0–100). `0075_drop_invoice_lines_discount_gate.sql` finished the job the same session — 0074 had not named `invoice_lines`, which carried its own copy of both halves, so for one session a >10% discount was accepted on the booking and refused at invoicing. **All three discount-writing tables now carry the identical rule** — `booking_discounts_percent_sane`, `invoices_discount_percent_sane`, `invoice_lines_discount_percent_sane`, each `0–100`. **Zero `over_ten_needs_reason` checks remain anywhere.** Still capped at ≤25 and deliberately untouched, because none is a per-discount ceremony: `coupons.discount_percent`, `membership_plans.*_discount_pct`, `user_approval_authorities.max_discount_pct` — the first two ceiling a product configured once, the third defines a role authority that `rbac.ts:canApproveDiscount` now ignores. The exclusive-source stacking matrix (Student/College/Named-client rates) is a separate 0002 ruling and survives.* | Schema |
| 11 | **Never colour alone** — every status is icon + label + colour | Components |
| 12 | **Errors inline and persistent.** Toasts carry successes only | Components |
| 13 | **No platform branch in a layout component.** Branch on capability | Everywhere |
| 14 | **Width decides** — 768 / ~~1180~~ **1280**. Never orientation. *Amended 31 Aug 2026 (§4.38a): desktop begins at 1280, tablet is 768–1279 — per `docs/DESIGN_DIRECTION_SPEC_v4.1.md` §7.7 and every rail built since 30 Aug (`SideRail` at exactly 1280, driven in the browser). The code follow-up is landed: commit `8a16cd7` moved the pair to `src/lib/breakpoints.ts` (`BP = { phone: 768, desktop: 1280 }`), `device.ts` re-exports it, and `__tests__/breakpoints.test.ts` guards TS / `responsive.css` / `index.html` agreement — verified green 31 Aug. README, SCREENS §07 and WIREFRAME_RULINGS §7 are annotated.* | Layout |
| 15 | **44×44 touch targets** on every device, desktop included | Components |
| 16 | **No AI panel renders** until backed by a validated computation | Screens |
| 17 | **The word "customer" appears nowhere in the UI.** They are clients | Copy |

**Gate accessibility failures are release blockers**, not backlog items.

---

# 1. Where things live

```
babin-rentals-os/
├── PLAN.md              ← this file. Read first, every session
├── PROGRESS.md          ← what has been done. Update at the end, every session
├── README.md            ← setup + the token drift decision
├── supabase/migrations/ ← schema
└── src/
    ├── lib/             ← engines + supabase client
    ├── types/           ← generated DB types
    ├── components/      ← design system primitives
    └── modules/         ← screens, one folder per module
```

**Reference build:** `../../Rental_workspace_backup/babin-rentals-os` — 76 JS files, screens
matching the approved capsule render. Port from it; do not import it wholesale. It has no
data layer, which is the thing being replaced.

---

# 2. Build order

Each phase has a gate. **Do not start a phase until the one before it passes its gate** —
the ordering is dependency-driven, not preference.

> ### ⚠ Status markers — reconciled item-by-item against the code, 11 Aug 2026 (§6.32)
>
> Every box below was audited against the actual repository with **evidence required** — a file
> path and line range, or it did not count. Before that audit every box in Phases 1–10 was
> unticked, which was untrue in both directions: a great deal was built and unrecorded, and a
> few things believed complete were not.
>
> | Marker | Meaning |
> |---|---|
> | `[x]` | **DONE** — verified against the artifact |
> | `[~]` | **PARTIAL** — artifact exists, a *named* gap remains, stated inline |
> | `[ ]` | **MISSING** — no implementing artifact found |
> | `[⊘]` | **BLOCKED** — needs a device, account, certificate or service unavailable here |
>
> **Scorecard: 5 DONE · 48 PARTIAL · 6 MISSING · 2 BLOCKED, across 61 audited items.**
>
> The visible markers below total 44, not 61, because two places are written as prose rather
> than as one checkbox per audited item: Phase 6's eleven module groups (all `[~]`, all failing
> identically — see §4.18) and Phase 4's seven components (all `[~]`, all sharing one defect).
> Nothing was dropped; the detail is in the text under each.
>
> `[~]` dominating is the honest shape of this codebase: **broad and shallow.** Almost
> everything is begun; little is finished to its own stated gate. The single most common gap,
> repeated across Phases 4, 5, 6 and 9, is that **the happy path is drawn and the other four
> states are not** — no loading, no error, no drawn restricted state on most screens.
>
> Do not tick a box here from a PROGRESS.md claim. This file has already carried at least one
> stale "done" that a later session had to find the hard way.

## Phase 0 — Scaffold ✅ COMPLETE

TS + Vite + Tailwind v4 + Supabase + router, self-hosted fonts, token layer ported.
**Gate:** `npm run build` passes, renders, zero external requests. ✅
**Re-verified 11 Aug 2026:** `npm run build` exit 0 in 1m36s, ~55 chunks, PWA precache 113
entries / 2595 KiB. This is the one gate in the file that demonstrably passes.

---

## Phase 1 — Schema ⬅ CURRENT

The critical path. 60+ specs assume tables that have never been written down.

- [x] Postgres DDL — tables, enums in **lifecycle order**, FKs, CHECKs — **written AND executed**:
      `0001`-`0042` applied to `sxguwvgoserhdolewibb`, 121 tables, 196 deferred FKs (§6.28 OUTCOME).
      One local-only follow-up remains: `0043`'s `booking_flags` CHECK rename ('Late Return' →
      'Overdue'), plus the retired enum member it cannot drop without a `0015`-style type rebuild.
- [x] Constraints that enforce laws 3, 4, 5, 9, 10 **at the database**
      → Law 9 (days ≥ 1, six priced-line tables) and Law 5 (`payments_no_security_deposit`, no
      FK path from deposits into invoices) genuinely done. **Laws 3 and 10 are now closed —
      re-verified live 16 Aug 2026**, correcting the 11 Aug note below it: `0044` **is applied**
      (version `20260811213239`), `authenticated` holds no DELETE grant on any priced-line
      table, and `trg_booking_discounts_stacking` fires `INSERT UPDATE`. The 11 Aug text said
      `0044` "is not applied" — it had been applied the same day.
- [~] Exclusion constraint so double-booking is impossible, not merely unlikely
      → GiST `EXCLUDE` exists for serialised units. **Gap: quantity-tracked products have no
      equivalent** — a plain EXCLUDE cannot express sum-of-qty-over-a-range. `0045` adds a
      capacity ceiling (unapplied); the general case needs a trigger.
- [x] Triggers: payment immutability, audit append-only, forward-only stages, causal order
      → Forward-only stages + causal order done (`0021`, live). **Payment immutability is now a
      trigger, not only a grant** — `0046` **is applied** (version `20260811213413`); live:
      `trg_payments_reject_update`, `trg_payments_reject_delete`,
      `trg_audit_events_reject_update`, `trg_audit_events_reject_delete`,
      `trg_booking_lines_reject_delete`, `trg_booking_discounts_reject_delete`. The 11 Aug note
      called `0046` unapplied. **Live trigger count: 36** (was 13).
- [~] RLS on every table — role (only) **and** branch **and** warehouse/zone **and** approval limit
      → **One of four dimensions.** Live 16 Aug: 121/121 tables RLS-enabled, **231 policies**
      (was 219). Branch, warehouse/zone and approval-limit scoping are **entirely unbuilt**
      (§6.20) — the largest single gap in Phase 1. Zero-policy tables are now **3, not 6**:
      `0049` gave `crew_documents`, `evidence_files` and `evidence_references` their policies.
      The three that remain are `portal_users`, `portal_sessions`, `portal_auth_challenges` —
      deny-all to everyone including the owner, so **the Client Portal cannot function**; they
      need their own non-`system_role` auth scheme and the session→`client_id` binding ruled.
- [~] Column-level money hiding for Warehouse (law 6) — **ARMED ON 8 TABLES, open on the rest.**
      *Re-verified against the live database 1 Sep 2026 (read-only, then a role-simulated probe).*
      `has_table_privilege(authenticated, …, 'SELECT')` is now **false** on `bookings` (27 column
      grants), `products` (35), `product_units` (29), `booking_lines` (19), `accessories` (11),
      `booking_transport` (12), `maintenance_records` (20) and `vehicle_fuel_logs` (10) — plus
      `staff_auth_pins`, denied outright. `0062` armed the first four; **`0077` (applied 1 Sep,
      §4.38-era)** armed the last four, the I5 breaches. The remaining ~30 money base tables still
      carry the blanket grant, so their `_v` mask stays bypassable — that is what keeps this `[~]`
      and not `[x]`.
      ⚠ **The three reads this entry named as proof are now refused.** Probed as `authenticated`
      inside a rolled-back transaction: `bookings.deposit_required`, `booking_lines.rate` and
      `products.daily_rate` each raise **42501**, while `bookings.project` still reads — so the
      revoke is armed and is not over-broad. The 16 Aug text below is kept under Law 3 as the
      record of what was true then; it is no longer the live state.

  <details><summary>Superseded — the 16 Aug 2026 finding, kept verbatim</summary>

  **NOT ENFORCED. Downgraded from `[~]` to MISSING on 16 Aug 2026 by executing as a Warehouse
  session** (see the gate verdict).
      → The 21 `_v` views are correct and do mask (`booking_lines_v.rate` reads `null` for
      Warehouse). **The `revoke select (col)` half is a no-op**: `authenticated` holds
      table-level SELECT, which covers every column, so the column revokes never took —
      `pg_attribute.attacl` is null on all of them. A Warehouse session reads
      `bookings.deposit_required`, `booking_lines.rate` and `products.daily_rate` off the base
      tables today. `0019:62-72` warned the views would be "dead code sitting next to the
      tables it was written to guard" — that is **no longer true** (9 `_v` reads exist in
      `src/`, listed in §4.28), but the guard beside them was never armed.
      **Blocked on §4.28** — the fix breaks base-table reads until 10 call sites move to `_v`.
  *(That blocker did not materialise for the eight: `0062` moved its call sites, and `0077`
  found zero call sites to move.)*
  </details>
- [x] Indexes: lifecycle-order status sort, AD date sort, GIST range overlap, serial lookup, `client_uuid` unique
      → All present, correctly re-created after the `0015` enum rebuild; 85 `client_uuid`
      unique constraints.
- [~] Seed data **generated through the engines**, never hand-typed
      → `0047_seed_reference_corpus.sql` is now generated by `src/lib/seed.ts` driving the real
      financial engine (was hand-typed SQL). **"Unapplied" is true of the migration and false
      of the data** — corrected 16 Aug 2026. The file has no row in
      `supabase_migrations.schema_migrations`, but its rows ARE live: its first client,
      `client_uuid a8c85792-…c5f7`, is `C-34` "Sagarmatha Pictures Pvt. Ltd.", created 12 Aug.
      It went in by a route that records no migration (`scripts/execute-generated-sql.mjs`).
      Two audits on 15 Aug read the bare word "unapplied" here and in the file header,
      concluded the database was empty, and built their central recommendation on it. Leave it
      unapplied — re-applying is a no-op by design — and see §4.33(3).

**Gate:** an adversarial reviewer cannot construct a legal write sequence that produces a
wrong business outcome. Specifically: no path makes a deposit reduce Outstanding; no path
updates a payment; no path lets Warehouse read a money column.

**Gate verdict 16 Aug 2026 — ❌ STILL FAILS, but not for the reasons below. Re-run against the
live database by executing as a Warehouse session, not by reading the catalogue.**

> The 11 Aug verdict is kept underneath because two of its three exploits are now **closed**,
> and the record of what closed them is worth keeping. `0044`/`0045`/`0046` were described here
> as "written and unapplied" — **they were applied on 11 Aug** (versions `20260811213239`,
> `…213329`, `…213413`). That claim, like `0047`'s and `0058`'s status lines, was stale.

**Closed since, verified live 16 Aug:**

1. **Law 10 — ✅ CLOSED.** `trg_booking_discounts_stacking` now fires `INSERT UPDATE` (was
   INSERT-only). The UPDATE-to-35% sequence no longer bypasses the trigger.
2. **Law 3 — ✅ CLOSED, twice over.** `authenticated` and `anon` hold **no DELETE grant** on
   `booking_lines`, `payments`, `audit_events`, `booking_discounts`, `invoices` or `bookings`;
   and `trg_booking_lines_reject_delete` backstops it at row level. `payments` and
   `audit_events` additionally carry `reject_update` + `reject_delete` triggers, so payment
   immutability is **no longer "a grant, not a trigger"**.

**Still open, deliberately:**

3. **Outstanding is one UPDATE away from wrong.** `authenticated` still holds UPDATE on
   `invoices`. Unchanged and correctly so — it needs the recompute formula ruled first (§4.17).

**NEW — ❌ Law 6 fails at the database. This is the clause the 11 Aug verdict listed under
"What passes."** Executed as `warehouse@babinrentals.com` (`set local role authenticated` +
`app.current_user_id`), inside a rolled-back transaction:

| Read as Warehouse | Result |
|---|---|
| `auth_user_role()` / `auth_can_view_money()` | `Warehouse` / **false** — the DB knows |
| `payments`, `invoices` | 0 rows ✅ |
| `booking_lines_v` (masking view) `sum(rate)` | `null` ✅ — the view mechanism is correct |
| `bookings.deposit_required` | **Rs 13,65,000** ❌ |
| `booking_lines.rate` | **Rs 6,64,695** ❌ |
| `products.daily_rate` | **Rs 1,78,755** ❌ |

**Cause — `0019` never worked, and this is not drift.** `authenticated` holds **table-level**
`SELECT` on `booking_lines`, `products` and `product_units`. In PostgreSQL a table-level grant
covers every column, and a column-level `REVOKE SELECT (col)` cannot subtract from it — the
revoke is a no-op, which is why `pg_attribute.attacl` is **null on every one of these tables**.
`0019:140-143` asserts the opposite in writing: *"revoke … from `authenticated` entirely …
there is no direct-table path left that could accidentally bypass the mask."* There always was
one. The correct sequence is `revoke select on <table> from authenticated` **first**, then
`grant select (<non-money columns>)`.

This also corrects §6.7 in the other direction: the claim that the revoke made
`booking_lines (*)` return `42501` for Owner as much as Warehouse cannot have been caused by
this migration, because the revoke has no effect. Whatever produced that 42501 is unexplained.

`invoices` and `payments` are the two that *are* safe, and they use a different mechanism:
row-level policies predicated on `auth_can_view_money()` / `auth_is_finance_or_admin()`.
`bookings`, `booking_lines` and `products` carry `auth_is_staff()` — which includes Warehouse —
and relied entirely on the column grants that do nothing.

**⬅ NEEDS A RULING BEFORE IT CAN BE FIXED (see §4.28).** The repair is one migration, but
revoking table-level SELECT breaks every `select *` and every base-table money read for *all*
roles until the call sites move to the `_v` views — which PLAN.md already records as queried
**nowhere** in `src/`. That is Phase 2 work, not a migration alone, so it is reported rather
than patched.

---

**Superseded — gate verdict 11 Aug 2026** (kept for the record; items 1 and 2 are now closed):

1. **Law 10 — the 25% cap is escapable by UPDATE.** `trg_booking_discounts_stacking` fires
   `INSERT` only (confirmed live). Insert 10% + 10%, then UPDATE the first to 25% → 35% stacked,
   every statement legal, trigger never fires.
2. **Law 3 — priced booking lines are hard-deletable.** `authenticated` holds a live DELETE
   grant on `booking_lines` (0002 revoked `from public` only, which does not touch it), and
   `booking_lines_all` is `for all`, which includes DELETE.
3. **Outstanding is one UPDATE away from wrong.** `UPDATE invoices SET outstanding_amount = 0`
   is legal for four roles. The gate's literal wording ("no path makes a *deposit* reduce
   Outstanding") does hold — but by absence of a wire, not by a constraint.

**What 11 Aug said passes:** no path updates a payment (still true, now trigger-enforced), and
Warehouse cannot read a money column (**false — see above**).

**No longer blocked.** As of 5 Aug 2026 the decisions §4 listed are ruled or dissolved, and
the spec library has had all 117 corrections applied — so the sections the schema reads from
(04–12, 16, Appendix) are safe to build from. The DDL can be written.

Five product questions remain open (§4.4). **None of them blocks a table.** Where one is
touched, mark `TODO(decision)` at the column and keep going — do not invent an answer.

---

## Phase 2 — Types + data access

- [~] `npm run db:types` → `src/types/database.ts`
      → The script string exists in `package.json:12` but **the Supabase CLI is not a
      dependency and the command has never run.** `src/types/database.ts` is hand-authored
      fiction; its own header admits it ("hand-corrected … pending a real `db:types`
      regeneration"). Now that `0001`–`0042` are live, this is finally unblocked.
- [~] **One booking query** module. Every surface consumes it (law 2)
      → `src/lib/bookingQuery.ts` exists. **Nothing else about the item is true.** It has ~zero
      importers — every screen still reads `src/data/*` seed arrays — and it is built on the
      fictional types above, so it queries columns that do not exist: it selects
      `daily_rate`/`quantity`/`line_total` where the live table has `rate`/`qty`/no such column.
      **Against the real database it returns nothing and `fetchCanonicalBooking` swallows the
      error** (`if (error || !booking) return null`), so every booking silently computes Rs 0.
      This is the single largest correctness gap in the app.
- [~] Write helper that attaches `client_uuid` to every mutation (law 8)
      → `dataAccess.ts` does it for inserts. **Gap:** `safeUpdate` mints a *fresh* uuid per call
      rather than taking a caller-supplied stable one, which defeats replay-idempotency for
      updates; and the offline queue has no producer (see Phase 9).

**Gate:** two different screens rendering the same booking cannot disagree.
**Gate verdict — ❌ FAILS, vacuously.** Two screens cannot disagree about a booking because no
screen reads a booking from the database at all; they read seed arrays. The gate becomes
meaningful only once `bookingQuery.ts` has real importers.

---

## Phase 3 — The engines

**Before any screen.** Law 1 is unenforceable if screens are built first — the logic ends
up in components and never comes out.

- [ ] **Status** — the canonical **six** (`Quote · Booked · Packed · On Rent · Returned · Closed`),
      forward-only transitions, the four jobs, flags, sessions, item quantity states.
      *This line said "12 stages" until 11 Aug 2026 and was wrong: Foundation v2.0 §1.2 retired
      the 12 and `0015_canonical_six_stages.sql` collapsed the enum to match. The 12 survive only
      as `workflow.ts` §1.4's migration map, for the go-live import of pre-v2.0 records.*
      Done: the six + metadata, `canAdvance`, `planTransition` (ordering + §1.9 flags + §1.7
      gates), the applier `src/lib/bookingTransition.ts`, jobs, flags, item-count invariant.
      **Still open: sessions** (`JobMeta.sessions` is a boolean marker; no open/close/partial-quantity
      model exists) and **`JobState` has no persistence** — no job-state table anywhere in the schema.
- [x] **Financial** — the calculation order, rounding half-up per displayed step, reconciliation assertion
      → **The one engine that is genuinely finished.** Independently re-verified *by execution*
      (transpiled and run, not read): the reference case returns subtotal 132750 → discount 9293
      → taxable 123457 → VAT 16049 → **rentalTotal 139506** → outstanding 124506, and
      `formatMoney` gives `Rs 1,39,506`. Half-up holds for negatives (`roundHalfUp(-0.5) = -1`).
      The reconciliation assertion is real *and wired* — `main.tsx:42,57,71` renders a stated
      error screen rather than a white page, and `seed.ts:482` fails the generator on drift.
- [~] **Localization** — BS/AD render, locked month spellings, Latin digits, lakh grouping, fiscal year
      → Lakh grouping and Latin digits done (`money.ts:48-55`, deliberately not ICU-dependent).
      **Gap: no real BS month-length table** (needs 2000–2100 BS per `Date Engine.md:72`), no
      `bs_calendar` Settings table, no CSV import, no anchor validator, no BS→AD inverse.
- [~] **RBAC** — capability checks; forbidden things are *absent*, not disabled
      → `rbac.ts` + `fieldGating.ts` do the real work and the absent-not-disabled rule is
      followed in most places. **Gap: two survivors contradict it** — `maskMoneyForRole` and
      `MoneyCell`'s lock-icon branch *render a placeholder* where the law says omit.
- [~] **Discount** — thresholds, stacking, the approval gate
      → Thresholds + approval gate done (10% reason+approver, 25% cap), enforced in `discount.ts`
      **and** at the DB. **Gap: no stacking function** — nothing composes bundle % + client
      standing discount + coupon + manual into one capped total on the app side. The DB trigger
      does it; the engine does not, so the UI cannot preview what the DB will reject.
- [~] **Validation** — return after pickup, quantities within stock, causal order
      → Date ordering and causal order done. **Gap: no stock/availability validator** — nothing
      checks requested qty against available units for a date window, so the UI cannot warn
      before the GiST constraint rejects.
- [~] **Audit** — append-only writes
      → `audit.ts` + a DB-side append-only trigger exist. **Gap: almost nothing calls it.** The
      `src/actions/*` handlers are `console.log` stubs, so real write paths emit no audit row.

**Gate:** the reference booking `BK-2026-0715` computes to exactly the figures in
`Appendix/Sample Data.md`. Any deviation is a defect in the engine, not the screen.
**Gate verdict — ✅ PASSES for the financial engine specifically**, proven by execution above.
It does not yet mean the *app* shows those figures: the screens read seed arrays, not the
engine's output over live data (Phase 2).

---

## Phase 4 — Design system in code

- [~] **Settle the token drift** (§4.1) — one decision, not seventy-six
      → `theme.css` is the single token source and most drift is gone. **Gap:** the motion row
      was never ruled (capsule pair vs v2.0's four steps) and `--r-sheet` is missing.
- [~] Primitives: Button, Input, Select, Table, Card, Modal/Sheet, Badge, Toast
      → All eight exist. **Gap: three of them (`Select`, `Table`, `Badge`) are still Tailwind
      classNames** while the other five use the inline-style + CSS-variable system — so the
      "one system" claim is false for 3/8.
- [~] **The seven missing components** — gate checklist · money field (capability-gated) · BS/AD date · scanner input · quantity chip · evidence thumbnail · reconciliation assertion
      → **All seven now exist** (they did not when this line was written). **But all seven share
      one defect: they are hardcoded Tailwind/dark-only rather than built on `theme.css`
      variables**, which breaks the per-screen light/dark ruling in §4.0. Individually also:
      the money field duplicates a second capability mechanism instead of using `fieldGating`;
      the quantity chip has no icons (fails Law 11 without colour); the evidence thumbnail's
      size map produces no width/height at all; the scanner input duplicates the shell's global
      ⌘B listener. **Six of the seven are built but adopted nowhere.**
- [~] Five states drawn for each: empty (both kinds) · loading (skeleton + text) · error · offline · restricted
      → `StateViews.tsx` provides the components. **Gap: `EmptyState` does not distinguish the
      two required kinds** (nothing-yet vs no-results) — the kind is not even a required prop,
      so a call site gets it wrong by omission. See Phase 6: adoption is the real problem.

**Gate:** remove colour from a screenshot — every status is still distinguishable.
**Gate verdict — ⚠️ UNVERIFIED.** `status.ts` pairs every status with an icon *and* a label, so
the mechanism satisfies Law 11. But the gate asks for a *screenshot test* and none has been run;
the quantity chip's compact layout is a known colour-only violation. Cannot be ticked from code
reading — it needs the actual desaturation check.

---

## Phase 5 — Shell + navigation

- [~] Sidebar, header, right rail (collapsible, persisted), status bar
      → Sidebar, header and the collapsible/persisted rail all exist. **Gap: there is no status
      bar** — and building one needs a product decision on its contents (connection/sync state?
      branch? fiscal year?).
- [~] Breadcrumbs, **no Back buttons**
      → The no-Back-buttons half holds. **Gap: `Crumb.to` is never rendered as a `<Link>`**, so
      the breadcrumb is decoration, not the upward-navigation mechanism the law intends it to be.
- [~] ⌘K palette · scanner FAB at every width
      → Both exist and the FAB is present at every width. **Gap: at phone width the palette has
      no pointer-reachable trigger** — the header search button is lost to the layout, leaving
      only the keyboard shortcut, which a phone does not have.
- [~] Responsive: 390 / 834 / 1180 / 1920
      → `useViewport()` and the 768/1180 breakpoints are real and correct (Law 14) *(31 Aug 2026: the desktop breakpoint is now 1280 — Law 14 amended, §4.38a; the code reads it from `lib/breakpoints.ts`)*. **Gap: ~59
      screens never call it** — they are fluid rather than deliberately responsive — and **the
      shell header overlaps itself at 390**, which alone blocks this item.

**Gate:** identical layout at identical widths; no platform branch anywhere.
**Gate verdict — ❌ FAILS on the first half, ✅ passes on the second.** No platform branch exists
in any layout component (Law 13 holds). But the 390 header overlap means layout is not correct
at one of the four named widths.

---

## Phase 6 — Screens, module by module

Port in dependency order. **Each module is done when its five states are drawn.**

`Today` → `Rentals` → `Booking` → `Inventory` → `Clients` → `Calendar` → `Finance` →
operational workspaces (Packing → Handover → Return → Reset → Cleaning) → `Reports` →
`Settings`

Per screen: name its page type (Work/List/Record/Report/Settings), delete every panel the
type disallows, ≤4 KPI cards, ≤1 chart, no AI panels, one primary per row.

**Status 11 Aug 2026 — every module `[~]`, and they all fail the same way.** All eleven module
groups exist and are routed. ~~Not one of them draws its five states.~~ Audited per module:

> ### ⚠ Re-audited 16 Aug 2026 — two of these lines were false and one was mis-framed
>
> Checked by grepping the current tree, not by re-reading this block. **Nothing below was
> deleted**; the corrections sit beside the claims so the drift is visible.
>
> - **`BookingDetail` uses `alert()` ZERO times.** Across all of `src/modules` only **3**
>   mentions of `alert(` survive and **every one is a comment saying not to use it**
>   (`AddClientModal.tsx:76,697`, `NewRental.tsx:2284`). The "6 calls" line was true on 11 Aug
>   and has been false for days.
> - **"Not one draws its five states" is no longer true.** **42 of the 72** `.tsx` files under
>   `src/modules` now reference `StateViews` / `EmptyState` / `ErrorState` / `LoadingState`.
>   Adoption happened across the 12–16 Aug wave and was never recorded here. The per-module
>   audit below has NOT been redone, so treat it as unverified rather than corrected — the
>   count only proves the blanket claim wrong.
> - **The Settings "reachability defect" is mostly a RULING, not a defect.**
>   `WIREFRAME_RULINGS_2026-08-12` §1 **removed** Settings' Automation · Channels/Communication ·
>   AI sections ("Removed and parked", spec 11 §11.2). Their data modules
>   (`data/businessHours.ts` 30 KB, `communicationSettings.ts` 25 KB, `inbox.ts`, `sms.ts`,
>   `broadcast.ts`, `triggers.ts` — **~92 KB, all with zero importers**) are the residue of
>   screens that were cut, not screens left unbuilt. Reading this line as a to-do would rebuild
>   something already ruled out.

- **Loading and Error states are absent almost everywhere** — Today, Rentals (3 screens),
  Booking, Inventory, Clients (8 screens), Calendar, Finance, and all four operational
  workspaces. Restricted is content-omission rather than a drawn state; Offline is inherited
  from the shell rather than drawn per module. *(11 Aug; see the correction above.)*
- `Calendar` draws **none** of the five. *(11 Aug, not re-checked.)*
- ~~`BookingDetail` uses **6 `alert()` calls**~~ — **false as of 16 Aug, see above.**
- **Reachability defects:** four routed reports have no way in (`Pulse.tsx:126-138` has null
  `to` values), two report screens are unrouted dead code, and ~4,400 lines of built Settings UI
  (BusinessHours, CommunicationSettings, Tools, Timesheet) is unreachable. *(The Settings half
  is a ruling, not a defect — see above. The report half is confirmed: §6.33.)*
- **Page-type rule violations:** Today ships a 6-KPI strip against a ≤4 cap; Warehouses exceeds
  the ≤1 chart rule.

### 16 Aug 2026 — the reachability inventory, verified

**Built with no way in — ~98 KB of screens.** Each checked for a route AND for any importer:

| Screen | Size | Why unreachable |
|---|---|---|
| `operations/CasesQueue.tsx` | 58 KB | `/operations/cases` renders `CasesWorkspace`. `CasesQueue` is named only inside comments — no import anywhere. |
| `reports/ProductReports.tsx` | 24 KB | No route, no importer. Three files reference `ProductReports.tsx:452` **in prose**. |
| `reports/CasesReports.tsx` | 13 KB | No route, no importer, no mention. |
| `settings/Timesheet.tsx` | 2.7 KB | The only file under `src/modules` with zero references of any kind. |

**Ruled on 12 Aug, never executed — this is the actual remaining Phase 6 work:**

1. **Warehouses was ruled out of Inventory into Settings ▸ Branches & Warehouses**
   (`WIREFRAME_RULINGS` §1, authority "07 line 4, 11 §11.3"). **Both still exist**:
   `/inventory/warehouses` → `Warehouses.tsx` (110 KB, `App.tsx:53,291`) and `BranchesPane`
   (`sections/BranchesWarehouses.tsx`, 55 KB). The duplication the ruling existed to end is
   still live, and `Warehouses` is also one of the two ≤1-chart violators above.
2. **Purchase Requests was ruled "archived"** — table and auto-draft rule stay in the schema
   (authority "07 line 5"). The screen is still built and still routed at
   `/inventory/purchase-requests` (29 KB).

**⬅ TODO(decision) for the ~190 KB above:** wire it, archive it to `src/archive`, or delete it.
Not assumed here. Note the house mechanism is `src/archive` (tsconfig: *"Law 3 keeps the
files"*), so "remove" means move, not `rm`.

**⚠ Source conflict, flagged rather than resolved.** `SCREENS.md` names a **15-section
"Generation C"** sidebar as "the build target". `data/nav.ts:67-79` declares the **fixed
eleven** as "the wireframe's order — the order is the specification", and is four days newer.
Building from `SCREENS.md` would add Automation Center, Notification Center, AI Assistant and
System Monitor — the same family §1 of the wireframe rulings **cut**. Treat `data/nav.ts` and
the rulings as authoritative until told otherwise.

**Gate:** every screen classifiable as exactly one page type.
**Gate verdict — ❌ FAILS, and is currently uncheckable.** No screen declares a page type, and
no registry exists to check against, so the gate has nothing to evaluate. Closing it needs a
declaration per screen plus the registry — then the three violations above.

---

## Phase 7 — Auth + shift handover

- [~] Login, session, **shift handover**, timesheet
      → All four screens exist. **Auth is real and has been since 11 Aug 2026** — this entry
      said "auth is still a local mock, `Login.tsx` never calls
      `supabase.auth.signInWithPassword`, and `AuthProvider` holds a hardcoded user". All three
      clauses were false when read on 16 Aug: `Login.tsx:50` calls `signIn` → 
      `supabase.auth.signInWithPassword`, and `AuthProvider` resolves the role from
      `users.primary_role`. Driven end to end on 16 Aug: signed in as Owner, 52 routes rendered.
      **Password reset added 16 Aug** — `/forgot-password` + `/reset-password`, email via
      `resetPasswordForEmail`, verified by a real `POST /auth/v1/recover` to the live project.
      Remaining gap in this line is **shift handover and timesheet**, which are screens only;
      neither has been driven against the database. See §4.33 for the one thing that stops the
      reset link returning to the app.
- [ ] Biometric unlocks a stored refresh token — **never stores a password**
      → Nothing exists. No longer blocked by the item above — a real session and refresh token
      now exist — so this is buildable whenever it is scheduled.
- [x] RBAC live: forbidden modules removed from nav; forbidden routes show the permission state
      → The remove-don't-grey mechanism is real, and the gap this entry named is **closed**:
      `permittedNav` asks `canViewMoney(role)` (`data/nav.ts:112`), not `role === 'Warehouse'`.
      Fixed 11 Aug 2026; this line went on claiming otherwise for five days. `isMoneySurface`
      is now the one list read by the nav filter, the Shell guard and ToolsLanding, so they
      cannot answer differently.

      ⚠ **A real RBAC defect was found on 16 Aug and fixed** — not in the nav, in the identity
      behind it. `lib/auth.tsx:loadProfile` ran `if (error || !data) → role: 'Client'`, so a
      failed re-read of the staff row demoted the signed-in Owner to `Client`. It re-runs on
      every `onAuthStateChange` including `TOKEN_REFRESHED`, so it fired roughly hourly:
      `/finance` began telling the owner "Access restricted. Your role (Client)…", and a reload
      restored Owner, which is why it reads as a fluke. An error and an absent row are now
      separate branches. Pinned by `lib/__tests__/auth.identity.test.tsx`.

---

## Phase 8 — Scanner

Six workspaces depend on it.

- [~] Camera (tablet/mobile), keyboard-wedge ⌘+B (desktop)
      → `ScannerFab` has a real `@zxing` camera decode and the ⌘B wedge works. **Gap: the second
      scanner, `BarcodeScannerModal` — the one the five workspaces actually use — has no real
      decode**, and `ScannerFab:159-171` still carries a string-matching simulation path.
- [~] **Under 2s per item**, continuous mode
      → **Gap: no same-code cooldown** (holding one barcode in frame re-fires the callback), no
      real continuous loop in the modal (it remounts the camera), and no timing instrumentation
      — so the "under 2s" target is unmeasured, not met.
- [~] Haptic + green frame + sound on success; **audibly distinct** failure; torch
      → Haptic, green frame and distinct success/failure tones all present. **Gap: no torch
      control** — needs `track.getCapabilities().torch` + a 44×44 toggle.
- [x] **Manual entry always beside it**
      → Verified in both scanners, and in `ScannerFab` it sits *outside* the camera-error branch
      so it survives camera failure. (Nit: that input is 36px tall, under Law 15's 44px floor.)

---

## Phase 9 — Offline

- [~] Dexie write queue, `client_uuid` idempotency
      → The queue, retry, dead-lettering and `client_uuid` idempotency are all real
      (`offlineQueue.ts`). **Gap: it has no producer** — no screen write path calls
      `idempotentInsert`/`safeUpdate`, so the queue is unreachable from the UI.
- [~] Precache shell; stale-while-revalidate reference data; network-first operational reads **with an age badge**
      → Precache and SWR are configured in the PWA plugin (113 entries, verified in the build).
      **Gap: no age badge anywhere** — nothing records or displays how stale an operational read is.
- [ ] Conflict UI naming both sides — never silent
      → Nothing exists. No conflict *detection* on replay either (no version/`updated_at` check),
      so a stale offline mutation overwrites silently — the exact failure the item forbids.
- [x] Offline **banner**, never full-screen
      → `App.tsx:756-777`, one strip, returns `null` when online, mounted once.
- [~] Money and approvals blocked, **with the reason stated**
      → The RBAC guards exist and state reasons. **Gap: nothing threads offline state into them**,
      so they never fire *because of* being offline.

**Gate:** proven on a real phone, in a real warehouse, in airplane mode. Non-negotiable —
do not start Phase 10 before this passes.
**Gate verdict — ⊘ CANNOT BE ASSESSED HERE.** There is no phone and no warehouse in this
environment. Note the ordering consequence: this gate is marked non-negotiable before Phase 10,
and Phase 10 is where the physical device would come from — so this is the point where the plan
requires leaving the machine.

---

## Phase 10 — Shells

PWA → install flows → Capacitor Android → Capacitor iOS → Tauri → store submission.

- [~] **PWA** → manifest + service worker are real and the build emits them (113 precache
      entries). **Gap: the icons are five renamed copies of one 1024×1024 file** — no true 192,
      512, maskable-with-safe-zone, or 96 shortcut icon exists.
- [ ] **install flows** → nothing captures `beforeinstallprompt`; no install control exists.
- [ ] **Capacitor Android** → no Capacitor dependency, no `capacitor.config.ts`, no android/.
      Buildable here in principle (scaffolding + Keystore adapter); *shipping* it is not.
      **Pre-flight, from the 30 Aug forensics pack:** (1) re-verify the *wrapped* bundle
      ships no `*.js.map` — `vite.config.ts` pins `sourcemap: false`, but a Capacitor
      template must not override it (Rentman ships maps with `sourcesContent`; their whole
      route tree was reconstructed from them). (2) Decide the web-layer update path before
      wrapping: the PWA's `autoUpdate` ships floor fixes with no store review today, but a
      wrapped WebView loads bundled assets, so that path dies inside the wrap — Rentman uses
      signed live updates (Appflow) with a rollback guard for exactly this reason.
- [⊘] **Capacitor iOS** → needs macOS + Xcode + CocoaPods, a paid Apple Developer account, and
      a device or Simulator. None available.
- [ ] **Tauri** → no `@tauri-apps/cli`, no `src-tauri/`. Scaffolding is buildable here; the
      desktop token store (Stronghold) and a signed build are not.
- [⊘] **store submission** → needs a signed AAB/IPA, a Play Console account with an upload
      keystore, and an Apple distribution certificate. None available.

---

# 3. Every session

1. Read this file.
2. Read [`PROGRESS.md`](PROGRESS.md) — what state is the build actually in?
3. Do the work. Stay inside the current phase.
4. **Verify** — typecheck, build, and drive the running app; do not claim it works from reading code.
5. **Update `PROGRESS.md`** — what changed, what was verified, what is now blocked.

---

# 4. Decisions that block work

**Do not invent answers.** Mark `TODO(decision)` and keep moving on what is unblocked.

## 4.42 ⬅ OPEN ×3 — the migrations do not build a database, and the DB disagrees with the app about money

**Raised 2 Sep 2026** attempting the audit's recommended next stage (§12/§14/§40 CRUD
against `dev:local`). The stage could not be run: the environment it requires cannot be
built. Full evidence in `FUNCTIONAL_BUGS.md` BUG-010 … BUG-013.

> ⚠ This entry cost the local dev database. `npm run db:rebuild` dropped it and could not
> rebuild it; no dump existed. The live project was not touched. **Take a dump before
> touching a database again, local ones included** — `scripts/check-dump.mjs` already
> exists for exactly this and was not used.

### (a) How do the migrations become from-scratch appliable?

Applying all 79 files in filename order into an empty `public` schema produces **five
blockers** (BUG-010). Four are repo-side and three of those are one cause: `0047_seed_
reference_corpus` needs `0051` (audit-trigger column safety) and `0055` (ruled identifier
formats) to have run first, and then hits `validate_booking_gates()`, which refuses the
repo's own seed corpus for an outstanding rental payment.

This is not cosmetic. `scripts/check-dump.mjs` records that this is Supabase **Free** — no
PITR, no automated backup — so **the migration set is the disaster-recovery plan**, and it
does not currently run. It is also why a new machine cannot get a working database.

**The options, none taken here:**
(a) **Renumber** `0047` to sit after `0055`. Straightforward, and directly against the
apply script's header, which says the numbering is load-bearing precisely because
"filename order equals the order that built production" — a claim this finding disproves
for a fresh apply, but which may still hold for the order production was actually built in;
(b) **Split `0047`** into its schema-independent and schema-dependent halves, leaving the
number in place;
(c) **Make `0047` self-sufficient** — seed the retired `CL-…` format it was originally
written for and let `0055`'s existing rewrite migrate it forward. Smallest diff, keeps
every number, and uses a path 0055 already implements and tests;
(d) leave the set as-is and declare `db:rebuild` unsupported, documenting that the live
schema is not reproducible. **Honest but expensive** — it makes the backup gate the only
recovery path.

Blocker 3 needs its own answer whichever wins: **may a seed bypass a business gate?**
Either `0047` seeds a booking that satisfies `validate_booking_gates()`, or seeds are
allowed to suspend triggers, or the gate is wrong. That is a rule question, not a fix.

Blocker 5 (`0067`, `au.email_confirmed_at`) is **environment-dependent** — the column is
absent from this local GoTrue but may exist on the live project. Confirm against live
before treating it as a repo defect.

### (b) Which rounding is correct — the trigger's paisa, or the engine's whole rupee?

`recalculate_invoice_totals()` rounds to 2 dp; `price()` (`src/lib/money.ts`) rounds to the
whole rupee at each step, which `money.ts:118` defends as §2.4's "Half Up, applied at each
displayed step" and as the only chain that reconciles with §2.8.

They disagreed on **41 invoices** in a partial seed run (BUG-011; the seed defines 120, so
41 is a floor), and `0047` already knows —
it prints a NOTICE per invoice and restates the engine's figure over the trigger's. That
fixes the seeded rows only: the trigger stays attached, so an invoice line written through
the app re-fires it and the database's figure wins again.

One of the two has to move, and which one is a **finance ruling**, not an engineering
preference: whole-rupee totals are what the app displays and what §2.4 states, but paisa
precision is what the column type (`numeric(14,2)`) was chosen to hold.

### (c) Is `invoices.vat_rate` meant to be authoritative?

`0006_finance.sql:92` declares `vat_rate numeric(5,4) not null default 0.1300`, and
`recalculate_invoice_totals()` **never reads it** — it hardcodes `0.13` (proved: `vat_rate`
does not occur in the function body). So the column can hold any value and change nothing.

Unlike (b), this error is not sub-rupee. Either the trigger should read the column — in
which case a zero-rated or differently-rated invoice becomes possible and every existing
row needs checking — or the column is decoration and should be dropped so it stops looking
authoritative. `invoice_lines.tax_rate` (`0006:450`) has the same shape and needs the same
answer.

Note the two sides are already wired to different sources: the app takes `vatPercent` as an
argument and `bookingQuery.ts:891` states explicitly that "13 is NOT hardcoded" there.

> Also filed, needing no ruling: **BUG-013** — nine `src/actions/` modules are stubs that
> `console.log('[DB TX] …')` and return `{ success: true }` without writing. They have no
> callers today; wiring one to a button would produce a green toast and no row.


## 4.41 ✅ RULED 2 Sep 2026 — ProductReports ships at `/reports/products`; the other four are archived

**Ruled by Babin, 2 Sep 2026**, both halves in one sitting:

- **(a) `ProductReports` — wanted.** Routed at **`/reports/products`** (its old home
  `/reports/inventory` belongs to `InventoryReports` and now carries a link across).
  Routing revived ~15 dead controls, so the ClientReports remediation shipped with it:
  header buttons / period chips / filter dropdowns → the shared `ReportToolbar` with a
  working money-gated CSV; `PeriodPill` and the presentational pager deleted per
  BUG-003's reasoning, with an honest "Showing all 5 rows" line. **The §9.6 register
  was deliberately NOT given a 44th row** — its 43-count and per-group counts are
  pinned by rulings §11.3 and asserted in `catalog.test.ts`; if a register entry is
  wanted, that is its own small ruling.
  **(a) `CasesReports` — not wanted.** → `src/archive/reports/`. The live Cases screen
  is `CasesWorkspace` at `/inventory/cases`.
- **(b) the three bundle components — not coming back.** → `src/archive/inventory/`.
  The abandoned split leaves the program; the live `AddBundle` keeps its inline
  versions. `FUNCTIONAL_FIX_PLAN.md` item #4 stays void.

The original entry follows, kept for the reasoning trail.

---

**Raised 2 Sep 2026** finishing `FUNCTIONAL_BUGS.md` BUG-005 and BUG-007. Both bugs
end at the same question, so they are filed here once.

Five files under `src/` have **no route and no importer**. They compile, they count as
live code, and between them they hold roughly **twenty dead buttons that can never
render** — which is why they cost audit time repeatedly (`BUG_SWEEP_REGISTER` P2-44,
then BUG-005, then BUG-007) without ever being a defect a user could meet.

The repo already has the mechanism, and `tsconfig.json:30-34` states it: *"`src/archive`
holds screens ruled out of the application. Law 3 keeps the files; excluding them from
the program keeps them from being compiled, bundled or counted as live code. Restoring
one is a move back into `src/modules` plus its route."* **Moving a file there is
therefore not a deletion and is cheaply reversible — but it is exactly the "ruled out"
that only Babin can say.** Hence this entry rather than a commit.

### (a) The two report screens — `ProductReports.tsx` (517 lines), `CasesReports.tsx` (199)

The fix plan called this unknowable from the code. **Git settles half of it.**

`ProductReports` **was routed**, and was *replaced in place*: at `6fb1c62` ("Restore
point before the 11-section wireframe restructure", 12 Aug) the route
`/reports/inventory` stopped rendering `<ProductReports />` under the crumb *Asset
Utilization* and started rendering `<InventoryReports />` under *Inventory Reports*.

So it was not dropped by accident. But it was **not superseded either** — the two are
different reports, and this is the part that needs the ruling:

| | `ProductReports` (unrouted) | `InventoryReports` (live) |
|---|---|---|
| Subject | product/sales performance | asset stock and health |
| Carries | sales trend, profit trend, turnover, fast/slow movers, dead stock, returns, top sellers, suppliers | total assets, utilization, availability, audit accuracy, top categories by value |

Nothing live covers turnover, dead stock or slow movers. `/reports/equipment-performance`
is the nearest and covers revenue and utilization per item, not stock movement.
`data/expenseReports.ts:44` still says the period list is *"Kept for `ClientReports` and
`ProductReports`, which import this list"* — written when it was expected to ship.

`CasesReports` was **never** routed (`git log -S` on `App.tsx` returns nothing). It is not
junk: its docstring records a deliberate rebuild in which every invented figure was
replaced by one counted off `data/cases.ts` or by an explicit `'Not tracked yet'`. It was
written beside `CasesQueue`, which has since been archived and replaced by the live
`CasesWorkspace` at `/inventory/cases`. `data/nav.ts:469` notes the report catalogue is
knowingly incomplete: *"§9.6's catalog of 45 is not built; Pulse is the report index that
exists."*

**The question:** is either report wanted?
- **Wanted** → give it a route and wire its dead pager and buttons (`ProductReports.tsx:372`
  has the same presentational pager BUG-003 removed from Client Ledger).
- **Not wanted** → `git mv` both to `src/archive/reports/`; they leave the program and stop
  being re-audited.

### (b) The three bundle components — `InventoryTree`, `BundleSummaryRail`, `BundleItemsTable`

`src/modules/inventory/components/`. `PROGRESS.md:10209` records them being split out of a
600-line monolith; the live `AddBundle` (routed, `App.tsx:348`) **imports none of them** and
carries its own inline versions instead. `BUG_SWEEP_REGISTER` P2-44 already called them
*"three orphaned bundle components … that shadow the live AddBundle implementations"*.

This is a straightforward abandoned refactor, and the practical point is that **the live
screen is fine**: `AddBundle:1950` has a working `View all blocked items` toggle and a
working `Duplicate`, which are precisely the controls BUG-007 filed as dead. The dead
copies are only in the orphans.

⚠ **`FUNCTIONAL_FIX_PLAN.md` item #4 is void.** It scoped `Collapse All` as an XS
mechanical fix — *"its sibling `Select All` already has `onClick`"*. Both live in
`InventoryTree.tsx`, which nothing renders, so wiring it would have changed nothing a
user can reach. **Do not action that item; answer this instead.**

**The question:** is any of the three coming back? If not, `git mv` all three to
`src/archive/inventory/`. Nothing imports them, so nothing breaks either way.

> Marked `TODO(decision) §4.41` at the head of all five files.

## 4.40 ⬅ OPEN ×2 — who signs a daily closing, and may a day be re-opened?

**Raised 1 Sep 2026** building the Daily Closing screen and
`0078_daily_closings.sql` (DRAFT, pre-flighted, **not applied**).

`WHATSAPP_LINKS_SPEC v1.0` §5.4 defers the closing ritual to
`LOCAL_FIRST_CORE_SPEC` §6. **That document is not in this repo** — the same
absence §4.38(b) records for the 20/24/29 Aug rulings — so the table stores what
the screen computes and leaves the two questions it cannot answer:

### (a) Who may approve a closing?

0078 gates INSERT on **`auth_is_finance_or_admin()`** — Owner, Admin, Manager,
Coordinator, Accounts — because that is the EXISTING predicate for writing
finance, mirrored per §4.20 rather than invented. But approving a closing is
arguably an *approval*, not a *write*, and the schema already has a narrower
predicate for that class: `auth_can_approve_late_fee_waiver()` is **Owner and
Manager only**.

Both readings are defensible and the schema contains both. Narrowing later is
one `create policy … replace` and breaks no stored row, so the wider set was
taken as the reversible option — not as a ruling.

### (b) May a day be re-opened, and by whom?

Answered only as far as Law 3 forces: an approved closing is **immutable**, and
a correction is a **void plus a new closing** (proven against the live database
inside a rolled-back transaction — the void is accepted, the edit and the delete
are refused, and a second live closing for the same branch/day is refused by a
partial unique index). What is NOT ruled is whether staff may void at all, or
only the approver, or only an Owner. Today it follows (a).

### Deliberately NOT ruled here: what an unexplained variance costs

`variance_reason` is **optional**. Requiring one above a threshold would be a new
gate, and §4.38(b) records Babin's 24 Aug standing constraint — *build first,
rules later*. The column exists so a reason can be recorded the day someone rules
it must be; no CHECK demands it. The 31 Aug discount-policy work was the first
thing that stance stopped; this is the second.

---

## 4.39 ✅ RULED 31 Aug 2026 — option (a): released_at/released_by, append-style release

**The owner ruled (a)** the same day this was filed, and **approved applying it the same
day**. `0076_booking_line_units_release.sql` is **APPLIED to the live project**
(schema_migrations `20260831213343`): the `released_at`/`released_by` pair, the
both-or-neither CHECK, a freeze trigger making a released row immutable for every role
including Owner and `service_role`, and a live-rows partial index. Structure and
behaviour were both verified — the freeze, the CHECK and 0044's surviving DELETE refusal
were exercised on real rows in a rolled-back transaction (PROGRESS.md, 31 Aug).

`unit.release` (actions/core.ts) mirrors `booking_line_units_all` per §4.20;
`releaseBookingLineUnit.ts` is the action; the BookingDetail chip's × is live with
§10.4's confirm-past-Packed. `queries/bookings.ts` names `released_at` unconditionally
(the mock-only branch existed for hours and is gone).

**Consequence to remember:** a released assignment is **irreversible by design**. There
is no un-release — re-assigning is a new row. That was the point of the freeze, but it
means a mis-press is corrected by assigning again, not by undo. Original filing kept
below for the reasoning trail.

### The filing as it stood when ruled — how is a creation-time unit assignment released before Pack?

**Raised 31 Aug 2026** building the removable serial chip `REFERENCE_SPEC_v2.5 §10.4`
ruled for BookingDetail ("line removal behind a visible 44×44 control, confirmed past
Packed"). The chip is built; the removal cannot be, because the ruled mechanism — delete
the `booking_line_units` row — is what Law 3 forbids, at two layers **verified against the
live database this day**: DELETE on `booking_line_units` is granted to no signed-in role
(live grants: INSERT and UPDATE only), and 0044's `trg_booking_line_units_reject_delete`
exists live and raises for every role including Owner and `service_role`.

The schema's own release paths (0002:297 — "a unit is released by voiding its parent line
or by Swap, both of which leave the row") do not cover this case:

- **Void the parent line** kills the line and its qty — the operator wanted the serial
  unassigned, not the item removed from the booking.
- **Swap** has no RPC anywhere in the migrations (searched: no `swap_unit`/`release`/
  `unassign` function exists), and §4.30(a) places the swap at **Pack** — a chip on
  BookingDetail is upstream of it.
- `booking_line_units` has **no voided_at / released_at column** — unlike `booking_lines`
  and `booking_crew_lines`, a released assignment has no way to exist as a row.

The tension is in the schema's own words: 0002:295-296 promises "every assignment stays
reversible until the booking is Confirmed", and 0044's trigger rejects the only mechanism
the spec's ruling names, unconditionally. Both cannot stand.

**The options, none taken here:**
(a) a `released_at`/`released_by` pair on `booking_line_units` (migration; append-only
release, Law 3 clean; the availability engine and `unit_count` readers must then filter
live rows);
(b) rule that release = UPDATE `asset_id → null` (grants already permit UPDATE, but it
redefines the column's null semantics — 0002:270 says null means "non-serialised line",
and it silently loses who released and when — Law 10-adjacent);
(c) amend Law 3's enforcement for this one table pre-Confirm (reverses a written backstop
— D3-class, the worst option);
(d) fold into §4.37(c) C3 and rule assignment-bindingness and release together — they are
the same question asked at two moments.

Until ruled, the chip's × is surfaced-as-unavailable with this reason (the established
answer), like the PIN button on Login. Whichever option wins also needs the ruled
confirm-past-Packed guard and the §4.20-style capability string mirroring the policy on
the table the release writes.

## 4.38 — the 31 Aug rules check: one ruling applied, one left OPEN

**Raised 31 Aug 2026** by the rules check of `PROGRESS.md` (its top entry of that date): every
`Law N` citation in the 19 governance files read against §0, and every recorded ruling read
against the rulings Babin made in sessions that had no repo access. Six wrong law numbers were
corrected in place; three rulings were recorded in the repo for the first time (20 Aug discount
rules removed · 24 Aug build first, rules later · 29 Aug Foundation v3.0 fresh start).

### ✅ (a) RULED — Law 14's desktop breakpoint is **1280**, not 1180

§0 Law 14, `src/lib/device.ts` `BREAKPOINT`, `README.md`, `SCREENS.md` §07 and
`WIREFRAME_RULINGS_2026-08-12.md` §7 all said 768 / **1180**. `docs/DESIGN_DIRECTION_SPEC_v4.1.md`
§7.7 (the ruled final look, confirmed 29 Aug) says a spec-locked **768 / 1280** pair, and every rail
built since 30 Aug follows it — `SideRail` appears at exactly 1280 and the inline reflow at exactly
1279, driven in the browser. The 30 Aug PROGRESS entry quoted rulings §7 as "below 1280"; §7 says
1180 — the 1280 is v4.1's. The repo carried two desktop breakpoints without anyone ruling.

**Ruled 31 Aug 2026 (applied on "fix all"): 1280 wins** — it is the ruled design direction and the
built screens. Tablet is 768–1279. Docs corrected in this pass; one code follow-up:

- [x] `src/lib/device.ts` — `BREAKPOINT` desktop 1180 → 1280. Then grep every `useViewport()`
      consumer that branches on `'desktop'` and re-run the §7 reflow tests: a screen that reflowed
      at 1180 may now show its rail at 1180–1279 with too little room (the 31 Aug double-rail
      squeeze, one band lower). `SCREENS.md` §07's "desktop 1180+" is annotated, not rewritten.
      *(Done before this section was written — commit `8a16cd7` (v4.1 repaint, Wave-0 responsive)
      moved the pair to `src/lib/breakpoints.ts`: `BP` 768/1280, `MQ` strings, `viewportFor()`,
      mirrored by `styles/responsive.css` and the `index.html` pre-paint script, with
      `__tests__/breakpoints.test.ts` asserting all three agree. The rules-check session had only
      the md pack, no repo, and could not see it. Verified 31 Aug: that guard plus the §7 reflow
      suites — 55 tests across 3 files — all green.)*

### ⬅ (b) OPEN — precedence of the documents ruled outside this repo

Three of Babin's rulings live only in chat-session deliverables:

| Date | Document | What it claims |
|---|---|---|
| 20 Aug | `BABIN_RENTALS_OS_MASTER.md` | "the single winning reference" over the spec pack; carries the discount-rule removal, local-first, corrected date engine, 12 Aug nav, milestones M0–M6 |
| 24 Aug | Product Goal & North Star v2.0 | **BUILD FIRST, RULES LATER** — no new business rules until the working app is finished; direction-only, MASTER.md wins on implementation |
| 29 Aug | `FOUNDATION_SPEC_v3.0_FRESH_START.md` + `UI_UX_SPEC_v1.0.md` | "single authority for the NEW app" — sub-rentals core, crew light, 10-item v1 nav, v4.1 look final, glass on chrome |

None of the three is in this repo. `CLAUDE.md` and this file still name
`00 Getting Started/Foundation Specification.md` as canonical, and `PROGRESS.md` keeps building
this codebase. Until Babin places the files and rules the order, **§0 + `PROGRESS.md` govern this
repo and the 29 Aug specs govern nothing here** — that is a description of the current state, not
a ruling on which should win.

The 24 Aug stance is recorded here as a **standing constraint on every §4 ruling**: a new business
rule (a gate, a tier, a ceremony) is out of scope until the app runs real jobs. The 31 Aug
"discount policies" work was the first thing it would have stopped.

---

## 4.37 ⬅ OPEN ×5 — contracts raised by the 30 Aug reference-app forensics pack

**Raised 31 Aug 2026** from `../rental-management-analyzes/` (Rentman/Booqable/Zoho
forensics; `06-babin-findings.md` and `07-frontend-assessment.md`). None of these blocks
Phase 1. They are recorded now because each is a *contract* screens will consume — deciding
them before screens multiply is what keeps them cheap. Evidence tags per the pack; the calls
are the owner's.

### (a) B2 — what shape does availability serve?

Booqable serves five numbers per item/location (`stock · planned · needed · available ·
plannable`), not one `[OBSERVED]`. "3 available" cannot distinguish *own 3, all free* from
*own 8, 5 out* from *own 3 free but 2 wanted by an unconfirmed quote* — and the sub-rent
decision needs the difference. `src/lib/availability.ts` stays the pure engine either way;
this ruling is about the **served contract** (view or RPC) every screen renders instead of
doing per-screen arithmetic. Rule the number set, and **bound the query window in the same
contract** (Rentman's `TIMEFRAME_TOO_BIG`; `RENTAL_WINDOW_BOUNDS` from §4.30 is the natural
constant to reuse).

### (b) B5 — which layer receives entity-type realtime invalidation?

Both references push *what entity type changed*, never the change itself `[OBSERVED]` —
small payloads, no stale-push risk, client refetches. The findings pack maps this onto "your
TanStack Query layer", **which does not exist**: data access is hand-rolled
(`lib/bookingQuery.ts`, `lib/dataAccess.ts`, Dexie) and there is no `@tanstack/*` dependency.
The ruling: extend the hand-rolled layer with an invalidation hook, or adopt TanStack Query
first. Must also state how invalidation interacts with the Workbox `NetworkFirst` bookings
cache (`vite.config.ts`) — a "refetch" served by the service-worker cache is not a refetch.
Blocks the Supabase Realtime port, nothing earlier.

### (c) C3 — which unit assignment is binding: booking-time reservation or packing scan?

Both references defer unit choice to the floor because the planned unit is routinely not
the packed unit `[OBSERVED]`; ours auto-reserves least-used at creation with a fallback
(27 Jul lock). The pack's recommendation — booking-time assignment is a **suggestion that
holds availability**, the packing scan is the **authority** — is close to what is built, but
no document states which one wins, and every floor screen implicitly answers it. One
sentence to rule; contradictory screens if left unruled.

### (d) C1 — may a packer's floor verb reprice a confirmed booking?

The Packing spec's open ⭐, promoted here so it has a number. Rentman's `add` and
`alternative` are floor verbs with defined consequences, not booking edits `[OBSERVED]` —
a substitution marks the line Replaced and records what went instead. Our `substitute` verb
can follow that pattern without a pricing question; **`add_unlisted` cannot** — an added
line reprices a confirmed booking or creates an unpriced one, and that is the ruling.
Blocks half of C1 in M3; `substitute` is buildable without it.

### (e) B4 — does the least-used ranking run on the client or behind an RPC?

The 27 Jul lock's implementation landed 31 Aug (same day this entry was written, by a
parallel session): `rankLeastUsed` in `lib/availability.ts` (pure) and `planCreationUnits`
in `lib/queries/availability.ts`, with tests; the client computes the choice and passes
`units[]` to the create RPC (draft `0071`). Booqable serves `stock_item_suggestions` as a
**server endpoint** `[OBSERVED]`, and the pack's argument holds here: the ranking reads
rental history across all bookings, must give the same answer to the web form, the Pack
workspace, and any future shell, and is a tunable rule (the open ⭐: 30-day window vs
lifetime). Nothing is misplaced today — no component imports it, so it sits correctly in
the engine layer. The ruling: promote the ranking into an RPC (client sends product + window,
server returns ranked units), or accept client-computed-and-passed as the durable shape.

## 4.36 ⬅ OPEN — should a failed audit write stop the business action? (`R3-5`)

**Raised 16 Aug 2026 by re-verifying `R3-5`. The defect is confirmed; the fix needs one ruling.**

`lib/audit.ts` catches every failure from the `audit_events` insert into `console.error` and
returns `Promise<void>`. The caller cannot know it failed, and there is a live path where it
does: `dataAccess` writes `.insert().select().single()`, `audit_events` grants INSERT to all
staff but **SELECT to Owner/Admin/Manager only**, so a **Warehouse** actor's read-back is
denied, throws, and is swallowed.

`operation_sessions` is not among the six tables carrying an audit trigger, so a Warehouse
user completing a return gets `operation_sessions`, `return_lines` and movements committed, a
success screen — and **no audit row anywhere**. Nothing later can reconstruct who did it.

**Two parts, and only one needs you:**

- **Mechanical, no ruling — ✅ BOTH APPLIED 16 Aug 2026.** `logAuditEvent` now returns
  `{ ok, error }` and never throws; `idempotentInsert` grew a `returnRow` option and
  `audit.ts` passes `false`, so the write no longer runs a `RETURNING` clause the role has no
  SELECT for. Pinned by `lib/__tests__/audit.test.ts` — **4 of its 7 cases fail against the
  pre-fix engine**. Behaviour at the call sites is deliberately unchanged.
- **⬅ The ruling is STILL OPEN.** The two call sites in `actions/rentals/floorVerb.ts` now
  carry `TODO(decision) §4.36` and check `ok`, but both still **proceed** on failure, exactly
  as before. Nothing has been pre-empted.
- **⬅ The ruling.** When the audit write still fails, does the business verb **fail with it**?
  Law 3's append-only intent argues yes — an unaudited state change is exactly what the law
  exists to prevent. Against: a floor operator loses a completed return to an audit outage.
  A middle answer (queue the audit row, let the verb proceed, surface a banner until it
  drains) is available but is itself a design decision. **Do not pick one in code.**

  **One wrinkle the ruling must cover, found applying the mechanical half.** The second call
  site (`resetUnits`, per-entry) sits *inside a loop whose earlier `safeUpdate` calls have
  already committed*. "Fail the verb with it" therefore cannot mean a clean refusal there — it
  means stopping part-way through a batch that is already partly written. Rule that shape
  explicitly rather than leaving it to be inferred at the call site.

## 4.34 ⏰ DATED — the BS calendar stops converting on **17 August 2026**

**Not a decision. Data entry, and it is due today.** `src/lib/bs.ts` anchors
1 Shrawan 2083 = 16 Jul 2026 (`ANCHOR_BS`, :43) and holds exactly one month length —
`SHRAWAN_2083_DAYS = 32` (:50). `toBs()` returns `null` for any day outside it (:97).

Day 32 of Shrawan 2083 is **16 Aug 2026**. That is the last date this application can render
in Bikram Sambat. **From 17 Aug 2026 every BS date in the app is `null`** — Today's header,
Calendar, Cash Flow, Working Capital, Booking Detail, every report that stamps a BS period.

The file is honest about it — *"only the anchor month is known here… an honest gap beats a
wrong date"* — and that judgement was right. But the gap becomes total tomorrow.

**Why this is not filed as a ruling:** BS month lengths are published data, not a product
choice. They are determined astronomically and published annually by the Nepal Calendar
Determination Committee (`Date Engine.md` §0.1), so they must be **transcribed, never
inferred** — a plausible-looking wrong table puts wrong dates on VAT filings, which is far
worse than `null`.

**⛔ And the data is not in this workspace.** Checked 16 Aug 2026. `Date Engine.md` §2.1 is
the only month-length table anywhere in the repo or the spec library, and **it is marked
"DO NOT SEED — arithmetically impossible"** by its own author:

```
2083 : 31 32 31 32 31 30 30 30 29 30 29 31   ⛔ illustrative, and wrong
```

Re-derived here rather than taken on trust, and the warning is correct: the row sums to
**366** where BS 2083 totals **365**, and gives Baishakh + Jestha + Ashadh = **94** days
where the document's own anchors — 1 Baishakh 2083 = 14 Apr 2026, 1 Shrawan 2083 =
16 Jul 2026 — are exactly **93** apart (30 + 31 + 30 + 2). It fails §3.3's validator on two
of its four rules. Seeding it would put every BS date from Shrawan 2083 onward one day out,
which `Calendar.md` §4.2 calls *"the highest-priority correctness bug in the product"*.

**Nor can the gap be closed by derivation.** The two known anchors fix only the SUM of the
first three months (93). They say nothing about Bhadra 2083 — the month that begins on
17 Aug — so the very month that breaks tomorrow is the one no data in this workspace
describes.

**⬅ What is needed from the owner: the NCDC published month lengths**, at minimum 2083 and
2084, ideally the 2078–2095 range `ARCHIVE_AUDIT` B10 asks for. Everything else is ready:
one table plus `fiscalYear()`, no screen changes, because everything downstream already
refuses correctly rather than guessing.

`ARCHIVE_AUDIT` B10 is the same item. **Do not let anyone "unblock" this by typing a
plausible row.**

## 4.35 ⬅ OPEN — 24 engine-layer findings were filed on 11 Aug and never entered this plan

`BUG_SWEEP_ENGINES_v1.1.md` (14 findings) and `v1.2.md` (10) are referenced **nowhere** in
this file or `PROGRESS.md`. They sit in `src/lib/`, which is where §0 puts the laws.

**Both sweeps carry the same caveat and it still applies: read, not run** — the sandbox failed
to start that session, and the tree has moved a great deal since. **Re-verify every row against
the current tree before working it.** Some are already closed incidentally: `E-P0-3`
(`createAction` never checking permissions, defaulting the caller to `admin`) was fixed in the
11 Aug wave by a different route.

### Re-verified against the current tree, 16 Aug 2026

Six were re-checked by reading the files as they stand. **Every mechanism was real at the
quoted lines; every claim's REACH was mis-stated — three too high, one too low.** That is the
expected shape for a read-not-run sweep, and it is why nothing here was actioned on the filing
alone.

| ID | Verdict | Sev | What is actually true |
|---|---|---|---|
| `R3-1` | ✅ **FIXED 16 Aug** | P1 | Real, and **worse**: Law 10 has **seven** implementations, not four. `money.ts:discountGate` and `rbac.ts:canApproveDiscount` both accepted a negative percent, and `canApproveDiscount`'s `percent <= 0` sat *above* the role check — so `canApproveDiscount('Client', -5)` returned **true**. It reached a screen: Settings ▸ Tools' calculator feeds `discountGate` (`Tools.tsx:783`), its input is `type="number"` with no `min`, and `:817` renders a green tick on `gate.ok`. Typing `-5` produced an approving tick for a price increase. Both now refuse; tests in `money.test.ts` and `rbac.test.ts`, including a cross-engine agreement check. |
| `R3-5` | ⬅ **CONFIRMED — needs a ruling** | P1 | Real. `audit.ts` swallows every insert failure into `console.error` and returns `Promise<void>`. The live path: `dataAccess` writes `.insert().select().single()`, and `audit_events` allows INSERT to all but **SELECT to Owner/Admin/Manager only** — so a **Warehouse** actor's read-back is denied, throws, and vanishes. `operation_sessions` is not one of the six trigger-covered tables, so a Warehouse return completes with **no audit row anywhere** and a success screen. See §4.36. |
| `E-P0-1` | ⏰ **CONFIRMED** | P0 | See §4.34. One addition: when `toBs` returns null, `BsAdDate` puts the **AD date in the BS-primary slot** and suppresses the parenthetical — handing a Nepali reader a Gregorian date presented as the BS answer. That render fix needs no external data and should land before 17 Aug even though the table cannot. |
| `R3-2` | ⚠ **PARTLY — inverted. Re-verified 16 Aug; the prescribed fix is now REVERSED** | P2 | Every mechanism confirmed live. `validateHandoverReadiness` has zero callers — and so does **everything else in `lib/validation.ts`**: a sweep of all 201 `.ts`/`.tsx` files outside `archive/` found **not one import of the module**, so `validateRentalDates` and `DateRangeValidation` are dead too. The inverted defect is confirmed at `floorVerb.ts:979` — `applyBookingTransition` is called with **no `flags`**, so `'Deposit Pending'` and `'Payment Due'` (both `blocks: BLOCKS_HANDOVER` in `workflow.ts:221-222`) never fire; the only live gate is four `useState(false)` checkboxes in `HandoverWorkspace` (`:151-154`). **DO NOT delete the function** — see §4.35a. Wiring the flags remains blocked on the deposit-waiver ruling. |
| `R3-4` | ⚠ **PARTLY — not reachable** | P2 | The arithmetic is real (`moneyScope({role:'Owner'})` → `'full'`), but the sole constructor always sets `surface:'default'`, all 15 call sites use it, and no floor screen renders money. A fail-open API default, **not a live leak**. Hardening only. One edge the sweep missed: `...opts` spreads *after* the default, so `{surface: undefined}` would clobber it. |
| `R3-6` | ✅ **FIXED 16 Aug** | P2 | Confirmed and worse than filed, then closed. `parseCsv` returned a bare `string[][]` with no error channel, and opened quote mode on **any** `"` — so `6" Pipe` … `24" Ladder` collapsed every row between them into one, and `ImportCenter` showed a green "Ready" badge over it. Now: a quote opens a field **only at a field boundary** (RFC 4180 §2.5), an unterminated quote and ragged rows are reported by line number, and the return is `{ ok, rows, errors }`. `ImportCenter` refuses a file with `ok: false` rather than mapping it. 12 tests in `lib/__tests__/csv.test.ts`, including a `csvCell` → `parseCsv` round trip. Fixed **before** the import action exists, which was the whole point. |

**Fix order:** `R3-1` ✅ done · `E-P0-1` render half ✅ **done 16 Aug** (`BsAdDate` tags the AD
fallback instead of passing it off as BS; 6 tests proven to fail against the pre-fix component.
**The §4.34 data blocker is untouched** — BS is still `null` from 17 Aug, the app just says so)
· `R3-5` ⚠ **mechanical half done 16 Aug** (`logAuditEvent` returns `{ok, error}`; the write no
longer asks for a SELECT it does not hold. **The ruling in §4.36 is still open** and every
caller still proceeds on failure, unchanged) · `R3-6` ✅ **done 16 Aug** (quote opens only at a
field boundary per RFC 4180 §2.5, so inch marks are data; unterminated quotes and ragged rows
reported by line; return is `{ok, rows, errors}` and `ImportCenter` refuses `ok: false`. Landed
**before** the import action exists, which was the point) · `R3-2` delete the dead function,
then rule the waiver · `R3-4` hardening whenever `fieldGating.ts` is next touched.

**Four of six closed. The two that remain are the two that need a ruling or have no reachable
failure** — which is the right place to stop.

> ⚠ **Process note, 16 Aug 2026.** `BsAdDate` was fixed *twice*, in parallel, by two sessions
> working the same register — two implementations and two test files for one defect. The
> duplicate (`BsAdDate.fallback.test.tsx`) was deleted in favour of `BsAdDate.test.tsx`, which
> covers all three layouts plus `ad-only` and invalid input, and deliberately does not pin the
> wording of the explanation. Worth noting because it is the same failure this very section
> catalogues — `R3-1` was seven implementations of one law — arriving in the process rather
> than the code. **Claim a §4.35 row in `PROGRESS.md` before starting it.**

**`v1.2`'s closing observation belongs in this plan, not only in that file:** Law 1 has been
followed well, and the failure mode that replaced logic-in-pages is **duplication between
engines** — every copy in the correct architectural layer, each right in isolation. `R3-1` and
`R3-2` are both that shape. Worth watching for as a class, not four separate bugs.

## 4.35a ⬅ OPEN ×2 — reversing `R3-2`'s "delete it (free)", and a Law 1 violation under it

**Raised 16 Aug 2026 by acting on §4.35's fix order and finding the prescribed action wrong.**

### (a) The dead function must be KEPT, not deleted

`R3-2`'s stated action was "delete the dead function (free)". Checking that instruction before
following it turned up three reasons it is not free, and the function is deliberately left in
place with the evidence recorded in its own header:

1. **It is the only written statement of the Handover gate.** The gate is unbuilt — the flags
   are not passed — so deleting this deletes the spec of the thing still to be wired.
2. **The gate cannot live on the screen instead.** Handover is warehouse-facing and Warehouse
   is money-blind (Law 6); `HandoverWorkspace.tsx:945` states it outright. A deposit gate is
   therefore expressible **only** in an engine. That is Law 1, not preference.
3. **Deleting the file would bury (b).**

**⬅ Needs ruling only if you disagree.** The conservative option was taken — nothing was
removed. If the owner wants the file gone, `src/archive` is the house mechanism (tsconfig's own
comment: *"Law 3 keeps the files"*), not `rm`.

### (b) ⬅ OPEN — Law 1 is violated on the booking date rule, and the two copies disagree

`validateRentalDates` is dead while `NewRental.tsx:1283` re-derives the same rule inline. Law 1
says pages never implement business logic. This is the §4.35 closing observation's failure mode
one level worse: not duplication *between engines*, but an engine bypassed by a page.

They do not agree:

| | `lib/validation.ts` (dead) | `NewRental.tsx:1283` (live) |
|---|---|---|
| formula | `Math.max(1, ceil(diff / DAY))` | `Math.max(0, round(diff / DAY))` |
| same-day booking | **1 day** | **0 days → Confirm blocked** |
| agrees with Law 9 (`days >= 1`, DB-enforced) | yes | no |

`round` vs `ceil` is dormant — `pickup`/`ret` are date-only there, time is separate state, so
the difference is always a whole number of days. **The floor is not dormant.** A same-day
rental — out Monday morning, back Monday evening — is one day to the engine and to the
database, and an error on the screen ("Return must be later than pickup"). It cannot be booked.

**TODO(decision):** is a same-day rental a one-day booking? Law 9 and this engine both already
say yes and the database enforces it, so this may be the screen contradicting a ruled law rather
than an open product question — but the fix makes same-day bookings bookable, which is a
behaviour change with money consequences, so it is not being taken unilaterally.

---

## 4.33 ⬅ OPEN ×3 — blockers that cannot be fixed from inside this repo, 16 Aug 2026

None of these is a product decision. Each is an action in a console this repo cannot reach,
and each was found by driving the app or querying the live project rather than by reading
code. They are collected here because they were previously recorded only in `PROGRESS.md`,
where a blocker is invisible to anyone reading the plan.

**(1) The password-reset link cannot return to the app.** `/forgot-password` sends a real
email (verified: `POST /auth/v1/recover`, 813 ms, against the live project), but Supabase only
honours a `redirectTo` that appears in **Auth → URL Configuration → Redirect URLs**. An
unlisted URL falls back silently to the Site URL, which lands the operator somewhere else
holding a valid recovery token. Needs `http://localhost:3000/reset-password` and the deployed
origin added. **Not settable from code and no migration can do it** — the feature is built and
incomplete until this is done.

**(2) Only one of five staff rows can sign in.** Queried live 15 Aug: `babindulal7@gmail.com`
(Owner) has an `auth.users` row, a password and a confirmed email. `owner@babinrentals.com`,
`manager@` (Admin), `warehouse@` (Warehouse) and `billing@` (Coordinator) have staff rows and
**no auth account at all**.

That blocks verification, not just convenience. §4.20 gave Coordinator and Warehouse role sets
that differ from Owner's, §4.28 turns on whether a Warehouse session sees money, and RLS
answers to the JWT — so **none of those paths can be driven** without real accounts. Creating
them is a Supabase dashboard action.

**(3) This repo cannot rebuild the live database.** Two independent gaps, both verified
against `supabase_migrations.schema_migrations`:

- `0056_auth_role_falls_back_to_auth_uid` is **applied with no source file** in
  `supabase/migrations/`. Its SQL exists only in the migration table.
- The seed corpus went in **outside the migration table** — `0047_seed_reference_corpus.sql`
  is unapplied, yet its rows are live (its first client is `C-34` "Sagarmatha Pictures Pvt.
  Ltd."). The recorded `0047` is a different, 811-character tail patch.

So a fresh environment built from this directory does not reproduce production. Recovering
(1) is a copy-out of `schema_migrations.statements`; (2) is a decision about whether the seed
route becomes a real migration.

## 4.32 ⬅ OPEN — what surfaced making the rulings settings-controlled, 16 Aug 2026

The §4.30/§4.31 rules became Settings keys so the owner can change them without a release
(`unitAvailabilityRule`, `rentalTurnaround`, `packingTreeGrouping`, `packingPhotosRequired`,
`evidenceRetentionDays` — all in `lib/settingsStore.ts`, rendered on **Settings ▸ System ▸
Operations rules**). Every default is the ruled answer, so surfacing them changed no behaviour.

An adversarial pass over that work found five things. Two were defects in it and are **fixed**;
three are open and are recorded here rather than patched.

### ✅ Fixed in the same pass

1. **`toTstzRangeLiteral`'s `bounds` defaulted to the module constant.** Safe only because the
   one caller passed `plan.bounds` explicitly — and one careless call from writing a period
   under the *ruled* default while the check that produced it ran under the *owner's* choice.
   The parameter is now required.
2. **`readSettings()` discarded an invalid stored value in total silence.** Right for a VAT rate
   (visible on the next invoice); wrong for an operations rule. An owner who chose
   `Only In Stock` would be silently returned to `Condition only` after a spec rename —
   availability *loosens*, gear held back becomes bookable, and nothing on screen says so. It
   now warns, naming the key and the substituted default. Warning rather than throwing, because
   refusing to load settings would take the app down over one bad key.

### ⬅ (a) OPEN — `rentalTurnaround` is written into the database as data, not just read

`toTstzRangeLiteral` puts the convention into the **bracket** of
`inventory_reservations.period`, and the live GiST exclusion compares with `&&`, which honours
the bracket each row was written with. **Flipping the setting does not rewrite existing rows**,
so the table would hold mixed conventions and the constraint would enforce per-row history:

- half-open → closed: the app refuses a back-to-back the database would have accepted.
- closed → half-open: **the database rejects a booking the app just told the operator was
  fine**, surfacing as `reserveAssignedUnits`'s "Another booking may have taken it" — which is
  wrong, and unfalsifiable from the UI.

Latent today: `inventory_reservations` has **0 rows**, which is precisely why it is cheap to
decide now. **TODO(decision):** does changing this setting (i) re-write live holds, (ii) apply
only to new holds and accept the mixed table, or (iii) become an Owner-only action with a
stated warning? None may be assumed.

### ⬅ (b) OPEN — `evidenceRetentionDays` cannot stay in localStorage

`readSettings()` returns `SETTINGS_DEFAULTS` when `typeof window === 'undefined'`. Any
server-side expiry job therefore reads **0 = keep forever**, whatever the owner set — silently,
and in the safe direction, which is the kind of bug that survives testing. A retention rule that
only a browser can see is not a retention rule. It needs `system_settings` (live, key/jsonb,
**0 rows**, `is_public` column present) before the expiry job is built. The same argument
applies to `unitAvailabilityRule` for a weaker reason: two operators with different
localStorage get different candidate pools for the same booking, with no audit row recording
which rule applied.

### ⬅ (c) OPEN — three blockers sit under "move settings into `system_settings`"

1. **`insertViaSourceSwitch` cannot type a write to it.** `dataAccess.ts` imports `Database`
   from `types/database.ts`, which is hand-maintained "for migrations 0001 through 0012" and
   lists 24 tables — no `system_settings`, no `evidence_files`, no `product_units`. (This is
   also why ruling (a) typechecked: `inventory_reservations` happens to be in that list.)
2. **`canManageSettings` is Owner-only; the live policy is not.** `system_settings_manage`
   (ALL) is `Owner | Admin | Manager`, and `system_settings_select` is
   `is_public OR Owner|Admin|Manager`. Per §4.20's closed ruling — mirror the policy — **the
   app is the wrong side of this drift.** It bites only once something writes the table.
3. **`is_public` must be `true` for every operations rule.** A rule stored non-public is
   invisible to exactly the Warehouse, Coordinator, Technician and Driver sessions whose work
   it governs.

## 4.31 ✅ ALL FOUR RULED — the floor rulings, 16 Aug 2026

Raised as a `TODO(decision)` block at `lib/queries/bookings.ts:1089` — the four things the
floor-lines read deliberately does not supply, without which the five workspaces cannot be
wired.

### ✅ (2) The packing tree `group` — `bundles.name`, falling back to the category

Group a line under the bundle it belongs to (`booking_lines.bundle_id` → `bundles.name`); a
line with no bundle falls back to `inventory_categories.name`. Reflects how the gear was
actually sold, which is what a packer pulling a booking works from, and it matches the
fixture's own labels ('Lens Set — NISI Athena Prime').

**Second consequence, and the reason this one mattered beyond the tree:** it is also the
grouping `planAssignment` needs to expand a bundle line into its member products. Bundle lines
are currently *reported as skipped* rather than assigned (`queries/availability.ts`), because
`booking_lines.product_id` is null on them. This ruling is what unblocks that.

### ✅ (3) Reset's `demand` / `vip` / `rush` flags — dropped **and now implemented**

No column exists for any of them anywhere in the schema. **Implemented 16 Aug 2026.**

`priorityTier` had **four** inputs, not three, and the ruling named only three. The fourth was
`waitingMinutes > 240` — which is exactly `queueTimeTone(m) === 'danger'`, already rendered on
every row as Queue Time. So a Priority flag reduced to that one surviving clause would have been
a second control saying precisely what the first one says. All of it went: the chip tile, the
filter toggle, both row flag icons, the `Next Priority Items` card, `PriorityTier`,
`priorityTier` and `isPriority`. **Urgency did not leave the screen; the duplicate did** —
"Longest wait 5h 20m" and the per-row Queue Time tone are untouched.

Both hardcoded grid counts were changed with the arrays they lay out (`repeat(5,…)` →
`repeat(4,…)` for the chips, `'1fr 1fr'` → `'1fr'` for the summary), which an adversarial pass
named as the most likely way this ships looking broken.

Verified by driving `/rentals/B-715/reset` in the mock app: four chip tiles, zero occurrences of
"priorit" in the rendered text, no `[aria-label="Priority"]` node, no `Next Priority Items` card.
⚠ The browser harness reported a 0×0 viewport, so the **rendered** layout was not measured —
the grid/array agreement was checked in source instead. 126 tests pass across the six affected
suites, and the pass confirmed by execution that ruling (3) breaks none.

If the floor later asks for prioritisation, the option this ruling passed over — deriving it from
the next booking's urgency (`queue entry → product_units.id → inventory_reservations.asset_id →
bookings.pickup_at`), which is real data and needs no migration — is the one to revisit. Do not
re-add a hand-set flag.

### ✅ (4) Empty-state copy for Handover, Return and Cleaning & Reset — to be drafted

Drafted against the pattern Packing and Evidence already establish, and **marked in the code as
drafted-not-ruled** so the wording can be corrected without anyone mistaking it for a spec
sentence. Unblocks the three screens now; copy is cheap to change later.

### ✅ (1) The packing `case` — DISSOLVED. The gate is one photo per BOOKING

**There is no per-booking case model, and none is needed.** Complete Packing requires a photo
for the booking as a whole, not one per packed case. The original question — which physical
case an item goes into for this booking — **no longer has to be answered at all**, so the
migration it would have required is not needed and `product_units.container_id` is not
pressed into a role it does not fill (it remains what it is: a unit's *home* container).

The first answer given was *"Photo upload and deleets if the booking comptetes all the
stages"*, which did not by itself say whether the gate was per case or per booking; it was put
back as a direct question and ruled **per booking**. Recorded because "the packing case was
dropped" reads like an oversight otherwise.

⚠ The evidence trade-off is real and accepted: when an item comes back missing, the photos no
longer say **which case** it was in. That is the cost of dropping the model, and it is a
deliberate choice, not something to quietly re-add.

### ✅ (1b) Photo retention — the image file is deleted, the row is kept

Ruled: the stored image is removed on a retention schedule once the booking has completed all
its stages; the **`evidence_files` row remains** as the record that a photo was taken, by whom
and when.

This is what keeps the ruling inside **Law 0** — *"Nothing is deleted; every entity has a named
terminal action."* The entity is not destroyed; its binary is expired, and the row is the named
terminal state. A plain "delete both" would have been an override of Law 0 and would have had
to be recorded as an explicit exception.

⚠ Accepted consequence: if a dispute arrives after the retention window, the **picture itself
is gone** and only the metadata survives. The retention *period* is not part of this ruling and
nobody has stated one.

**Not built.** This is a storage lifecycle policy plus a job, and neither exists. Until it is
built, nothing expires — which is the safe direction (the evidence is still there), but it
means the ruling is currently a statement of intent rather than behaviour. It must not be
recorded anywhere as done.

## 4.30 ✅ RULED 16 Aug 2026 — where a Confirm-time serial assignment writes, and where a window ends

> **The rulings, taken 16 Aug 2026. Everything below this box is the evidence they were taken
> from, kept because the derivation is what makes them checkable.**
>
> **(a) The OS writes `inventory_reservations`** — option (a2). It is dropped from
> `BOOQABLE_READ_ONLY_TABLES` and Confirm writes it directly, so a double-booking is refused
> by the GiST exclusion at the database rather than by the app trying not to make one. This
> **deliberately overrides Booqable bridge spec §5.1's "indirectly via order writes only"**;
> that conflict is now recorded rather than latent. Should the bridge ever go live, §5.1 and
> this ruling must be reconciled explicitly — a later session must not "fix" one to match the
> other by assuming this was an oversight.
>
> ⚠ **No migration is required, checked live 16 Aug.** `inventory_reservations_all` is already
> `Owner · Admin · Manager · Coordinator · Warehouse` for ALL commands — the same set as
> `rental.confirm` and as the `inventory.reserve` capability ruled in §4.29. The database has
> been ready for this write the whole time; only `dataAccess.ts` refused it.
>
> **(b) Window bounds are `half-open`** — `[from, to)`. A booking ending at 18:00 frees its
> unit for one starting at 18:00. Taken against the recommendation in the evidence below,
> which argued for `closed` on turnaround grounds; recorded here so the reasoning is not
> re-litigated. If same-instant turnaround proves wrong in practice the change is one
> constant, `RENTAL_WINDOW_BOUNDS`, and `availability.test.ts` already pins both answers.
>
> **(c) §4.14 — condition states only.** `Maintenance`, `Missing` and `Retired` remove a unit
> from the pool. The four booking-lifecycle states (`Reserved`, `Packed`, `On Rent`,
> `Returning`) deliberately do **not**: they are facts about *today*, and the date-overlap
> check already answers per-window. Disqualifying them outright would make a unit that is out
> on rent today unassignable for a booking three months from now. `Inspection` and `Cleaning`
> stay assignable on the stated assumption that those queues clear before a future pickup —
> the one part of this ruling most likely to need revisiting, and it is one entry in
> `DISQUALIFYING_UNIT_STATES`.
>
> This also closes **§4.14**, open since 11 Aug. `0045`'s capacity ceiling may now be tightened
> to match with one `where` clause in `enforce_inventory_reservation_capacity()`, which §4.14
> said was all it was waiting for. That tightening is **not** done here — it is a migration
> against a live database and needs its own approval.

### The evidence these were ruled from

**Raised 16 Aug 2026 building the availability engine**, which PROGRESS.md's 16 Aug entry
identified as the prerequisite blocking Packing, Handover, Return, Reset and Evidence
*equally*: nothing in the app writes `booking_line_units`, so wiring the floor screens to a
working read would only turn "not loaded yet" into "loaded — nothing to pack".

The engine itself is built and tested (`lib/availability.ts`). It is pure, and it **refuses to
default** the two questions below — both are required parameters, so no call site can acquire
an invented answer by omission. What is missing is not code.

### (a) The two candidate tables, and the problem with each — **the real blocker**

`workflow.ts:45` defines the stage this happens at: Booked means *"Committed. Gear reserved,
calendar held, **serials assigned**."* The schema agrees and is unusually explicit —
`0003:1483` says `inventory_reservations.reserved_at` is *"Written by the Confirm
transaction, never earlier"*, and `0003:1478` says *"If reservation fails on any line, Confirm
is rejected with the conflicting line named."* So Confirm reserving is designed, not inferred.

Measured on the live project, 16 Aug 2026:

| | `inventory_reservations` | `booking_line_units` |
|---|---|---|
| Overlap protection | ✅ `exclude using gist (asset_id with =, period with &&) where (released_at is null and asset_id is not null)` | ❌ **none** — only `qty > 0`, two CHECKs and FKs |
| Holds a date range | ✅ `period tstzrange not null` | ❌ no period column at all |
| Live rows | **0** | 18 (all 6 lines of the reference booking; **all 18 carry `asset_id`**) |
| The OS may write it | ❌ **`BOOQABLE_READ_ONLY_TABLES`** (`dataAccess.ts:195`) — spec §5.1, *"indirectly via order writes only"*, i.e. only through `pushOrderReserve` | ✅ os-native |

**So the table that is protected may not be written, and the table that may be written is not
protected.** Writing assignments straight into `booking_line_units` reproduces exactly the lie
`seed.ts:762-770` refused to generate — *"the same `EQ000241-U01` on two bookings whose dates
overlap — a lie the floor screens would render as fact"* — except at runtime, where an
operator would act on it.

This is a **conflict between two specs that no document records**: the OS schema says Confirm
reserves; the Booqable bridge spec says Booqable owns reservations. Three ways out:

- **(a1) Reserve through the bridge** — `pushOrderReserve` (`booqable/sync.ts:1838`), letting
  Booqable be the availability authority. Consistent with spec §5.1 and with the read-only
  set. The `booqable-proxy` Edge Function **is deployed and ACTIVE** on the project (checked
  16 Aug), so the route exists; whether `BOOQABLE_TOKEN`/`BOOQABLE_SLUG` are set, and whether
  there is a Booqable account behind them, is unverified. Makes Confirm depend on a third
  party being reachable, which the offline-first laws sit awkwardly with.
- **(a2) Make the OS the authority** — drop `inventory_reservations` from the read-only set
  and have Confirm write it, keeping the GiST constraint as the enforcement. Contradicts spec
  §5.1 and needs that contradiction ruled, not ignored. Closest to what the OS schema was
  clearly designed for, and the only option where **the database refuses a double-booking**
  rather than the app trying to.
- **(a3) Add the same exclusion to `booking_line_units`** and assign only there. Needs a
  period on the row (it has none) or a trigger joining to `bookings`, so it is a real
  migration — and it leaves two tables modelling the same fact.

**Recommendation: (a2)**, because it is the only one where Law 4 is enforced by a constraint
rather than by hope, and because `inventory_reservations` carries four `TRIGGER REQUIRED`
comments describing precisely the Confirm-time behaviour the OS wants. But §5.1 is a written
spec and overriding it is a product call, not an engineering one.

### (b) Does a window that ends at 18:00 free the unit for one starting at 18:00?

`inventory_reservations.period` is a `tstzrange` and the table has **zero rows**, so no live
row reveals which bound convention a writer used. The schema disagrees with itself elsewhere:
`crew_bookings` and `crew_leaves` both chose `daterange(…, '[]')` — **closed**, touching
conflicts — while Postgres's own `tstzrange` default is `[)`. Turnaround, cleaning and
inspection time are a real argument for closed that no spec here states.

`lib/availability.ts` takes `bounds: 'half-open' | 'closed'` with no default, and
`availability.test.ts` pins **both** answers for the touching case, so ruling this is a
one-line change against a test that already states the consequence.

### Already open and needed by the same feature

**§4.14** — which `inventory_state` values remove a unit from the pool. `disqualifyingStates`
is a required parameter for the same reason. `0045` took the loose bound for its capacity
*ceiling*, reasoning that too-permissive can only fail to reject a legal hold; **that
reasoning does not transfer to assignment**, where too-permissive puts a unit that is in
Maintenance onto a shoot. The engine will not pick it on a caller's behalf, and a test pins
the honest consequence of passing an empty set.

## 4.29 ⬅ OPEN ×2 — the residue of closing the capability matrix, 16 Aug 2026

**Raised applying `CAPABILITY_MAPPING_2026-08-16.md`.** 24 declared-but-unhandled capability
strings were closed by the §4.20 method — mirror the RLS policy on the table the action
writes. Twenty-one derived cleanly and are live in `actions/core.ts`. Two things did not, and
neither may be answered by inventing a role set.

### (a) `inspection.create` · `inspection.pass` · `inspection.fail` — nothing to mirror

**There is no write target.** No table in the schema matches `inspect`, and
`operation_session_type` is `Packing | Handover | Return | Reset | Cleaning` — Inspection is
not a member. So the mirroring rule has no input, and any role set assigned here would be
invented, which `CLAUDE.md` forbids.

**TODO(decision) — where does an inspection write?** Either

- **(a)** add `Inspection` to `operation_session_type` and mirror `operation_sessions`
  (which would make it the floor set: Owner · Admin · Manager · Warehouse), or
- **(b)** give inspections their own table with its own policy.

All three actions are stubs, so **this blocks nobody until one is built** — and all three
now fail closed *by name*, which is the correct state for an unbuildable verb. It becomes
urgent the moment someone writes a body.

### (b) `purchase.approve` is broad because the RLS policy is broad

`purchase_requests_all` is `auth_is_staff()` on the live project, so mirroring it faithfully
**admits Driver and Technician to approving a purchase request** — a spend-authorising verb.
That is probably not intended.

`crew.assign` (`crew_assignments_all`) is the same shape and is plausible for shared triage.
`case.resolve` (`cases_all`) is consistent with the shared-triage lock and is likely correct.

**TODO(decision) — should `purchase.approve` be narrower, and if so, at what rank?**

⚠ **If it should be, fix the RLS policy first and let the capability follow.** Tightening only
`lib/rbac.canWriteSharedTriage` would put the app and the database back out of step, which is
the exact failure the mirroring rule exists to prevent — and the app would then forbid in the
UI something the row still permits to a crafted request. The broad behaviour is **pinned by a
test in both `rbac.test.ts` and `core.test.ts`**, each carrying a note that says so: when the
policy is tightened those two tests are *meant* to fail, and that failure is the signal to
split the set.

### Not open — recorded so it is not re-derived

- The mapping document counted **32** declared capability strings; the real number is **31**.
  It scanned `src/actions/**` including `__tests__`, and `money.view` is declared only by a
  probe in `core.test.ts`. `money.view` is an app-level rule (the Law 6 read gate) that no
  action declares, by design. The off-by-one changed no mapping.
- A regression guard now reads both files and asserts every declared capability resolves
  (`core.test.ts`, "every declared capability resolves to a rule"). Both previous gaps were
  found by a person grepping; this is the first thing that finds the next one. It was
  mutation-tested — commenting out a `case` must make it fail, and at first it did not,
  because `// case 'x':` still matched the pattern. Both scans strip comments now.

## 4.28 ⚠ RULED and HALF-APPLIED — how Law 6 gets enforced, now that we know `0019` never enforced it

> **Status, 16 Aug 2026 — ruled (a), and the safe half is done.**
>
> | Step | State |
> |---|---|
> | 1. `0061_bookings_deposit_masking_view.sql` — creates `bookings_deposit_v` | ✅ **APPLIED** with explicit approval. Verified live as both roles: Owner 121 rows / Rs 13,65,000, Warehouse 121 rows / `null`. |
> | 2. Move the call sites off the base column | ✅ **DONE.** `lib/queries/bookings.ts` and `lib/bookingQuery.ts` no longer name `deposit_required` on `bookings` at all; `withDeposit` reads the view in a second id-keyed query. Closed the `TODO(persistence)` that stood in **both** files. |
> | 3. `0062_law6_column_grants_arm_the_mask.sql` — revoke table-level SELECT, grant the non-money columns | ⬅ **WRITTEN, NOT APPLIED.** Dry-run in a rolled-back transaction confirms it makes money unreadable on the base tables while `stage`/`qty` stay readable. |
>
> **Until step 3 is applied, Law 6 is a UI convention.** No module names the column any more,
> so the app cannot leak it — but a crafted request still can. That is the whole remaining gap.
>
> Applying 0062 also makes `alter table … add column` a **two-file change** on `bookings`,
> `booking_lines`, `products` and `product_units`: a new column is unreadable until granted.
> Fail-closed and deliberate, but a real maintenance obligation.
>
> The analysis below is kept because it is why (a) was chosen, and because the inventory
> numbers in it are what made (a) affordable.

**Raised 16 Aug 2026 by re-running the Phase 1 gate as a Warehouse session.** Law 6 —
"Warehouse sees no money — enforced by RLS, not the UI" — **does not hold at the database**.
A Warehouse session reads `bookings.deposit_required` (Rs 13,65,000), `booking_lines.rate`
(Rs 6,64,695) and `products.daily_rate` (Rs 1,78,755) straight off the base tables, which
PostgREST exposes. Full evidence in the Phase 1 gate verdict.

The cause is not drift and not a regression: `0019`'s `revoke select (col) … from
authenticated` is a **no-op while `authenticated` holds table-level SELECT**, which it does.
The masking views are fine; the guard beside them was never armed.

**Why this needs a ruling rather than a patch.** The repair is a one-line-per-table migration:

```sql
revoke select on booking_lines from authenticated;
grant  select (id, client_uuid, booking_id, line_type, qty, days, …) on booking_lines to authenticated;
```

— but the moment it applies, **every base-table read of those tables breaks for every role**,
Owner included, because `select *` and any projection naming a money column now fails with
`42501`. So this is a migration **plus** a call-site change, and the two must land together or
the app goes down.

**The inventory is small — measured 16 Aug, and it contradicts this file's older claim that
"zero `_v` views are queried anywhere in `src/`".** That is no longer so:

- **9 `_v` reads already exist**: `products_v`, `product_units_v` (`lib/queries/inventory.ts`),
  `client_directory_v` ×4, `membership_plans_v`, `clients_v` (`lib/queries/clients.ts`),
  `booking_lines_v` (`data/rentals.ts:514`). The pattern is established and working.
- **Only 10 base-table reads remain** across 5 files on the four money-bearing tables:
  `lib/booqable/sync.ts` (2), `lib/bookingQuery.ts` (1), `actions/rentals/floorVerb.ts` (2),
  `actions/rentals/confirmRental.ts` (3), `lib/queries/bookings.ts` (2).

Three of those ten (`confirmRental`) name no money column at all and would survive a column
grant untouched. So (a) is roughly **seven call sites**, not a rewrite.

**The three ways out, and what each costs:**

- **(a) Column grants + move every call site to `_v`.** The design `0019` intended. Correct and
  complete; the largest change. Needs an inventory of every base-table read first.
- **(b) Row-level policies predicated on `auth_can_view_money()`, as `invoices` and `payments`
  already use.** Cheapest and consistent with what demonstrably works — but RLS is row-level:
  it would hide whole bookings and lines from Warehouse, not just the money, and Warehouse must
  see bookings to pack them. **Viable only if a second money-blind policy pair is written so
  the money-bearing columns come from a view while the rows stay visible** — which collapses
  back into (a).
- **(c) Accept it and enforce Law 6 in the UI only.** Contradicts Law 6's own wording ("enforced
  by RLS, not the UI") and PLAN.md §0. Recorded because it is what the code does *today*, not
  because it is recommended.

**Recommendation: (a), sequenced** — inventory the base-table reads, add `_v` reads behind the
existing query layer, then apply the grant migration last. Do not apply the migration first.

**Until it is ruled, Law 6 is a UI convention.** `lib/moneyVisibility` and `canViewMoney` do
hold in the app; nothing stops a crafted request.

## 4.20 ✅ RULED 15 Aug 2026 — `client.block`, `client.create`, `rental.confirm` **and `inventory.create`**

**Raised 13 Aug 2026 by the post-rebuild sweep; ruled 15 Aug by mirroring the
database.** Actions flipped to `implemented: true` during the 11-section rebuild
carried real bodies but declared capability strings that
`src/actions/core.ts:checkCapability` did not handle. An unhandled capability
returns `undefined`, which the dispatcher reads as a denial **for every role,
Owner included** — so those controls were *permission-denied* rather than
*not-implemented*: a different error for the same non-outcome.

**There was a fourth, and this register did not have it.** `inventory.create`
(`inventory/createBundle.ts:25`) fell through the same way. It surfaced by
checking every `permissions:` string in `src/actions/` against the switch instead
of reading this section — worth repeating whenever an action is implemented.

**The ruling: each capability takes the role set of the RLS policy on the table
its action actually writes.** This is not a guess and not an invention — the rule
had already been ruled, in SQL, on the live project. Read 15 Aug 2026:

| Capability | Action | Table written | Live policy | Roles |
|---|---|---|---|---|
| `rental.confirm` | `rentals/confirmRental.ts` | `booking_stage_transitions` | `booking_stage_transitions_insert` | Owner, Admin, Manager, Coordinator, Warehouse |
| `client.create` | `clients/createClient.ts` | `clients` | `clients_insert` | Owner, Admin, Manager, Coordinator, Warehouse |
| `client.block` | `clients/blockClient.ts` | `client_flags` | `client_flags_insert`, `flag_type = 'Blocked'` branch | Owner, Admin, Manager |
| `inventory.create` | `inventory/createBundle.ts` | `bundles` + `bundle_items` | `bundles_manage` ∩ `bundle_items_all` | Owner, Admin, Manager |

Two are worth stating because they are not symmetric:

- **`client.block` is narrower than `client.create` by the database's own hand.**
  `client_flags_insert` splits on the flag: Owner/Admin/Manager for `Blocked`,
  and additionally Coordinator/Warehouse for every other flag type. A Coordinator
  may take a walk-in client's details and may not block them.
- **`inventory.create` is an intersection.** `bundle_items_all` admits Warehouse
  and `bundles_manage` does not, so Warehouse may add items to a bundle that
  exists and may not create one. Granting the wider set would pass the check and
  fail at the first insert — the shape Law 6 exists to prevent.

`rental.confirm` deliberately does **not** reuse `operations.perform`: that one
admits Technician (whom the policy excludes) and excludes Coordinator (the
booking desk, whose job this is). The two sets differ in both directions and
`lib/rbac` now states both.

**Landed in:** `lib/rbac.ts` (`canConfirmRental`, `canCreateClient`,
`canBlockClient`, `canCreateBundle`, plus the shared `BOOKING_DESK` set),
`actions/core.ts:checkCapability`, and the three action suites whose
"denies every role" tests were rewritten to assert the ruled lists rather than
deleted, as each of them instructed.

**Still open, and deliberately:** every other capability string in
`src/actions/` — `rental.create`, `rental.draft`, `rental.cancel`,
`inspection.*`, `maintenance.*` and the rest. Each belongs to an action whose
`implemented` flag is false, so the dispatcher refuses it a step earlier and the
question is not yet live. Answer each the same way when its body is written.

## 4.0 ✅ RESOLVED — the design source

**Ruled 4 Aug 2026.** The module specs and the 113 renders in
`../mds and photos/Babin Rentals OS/Appendix/Screenshots/` **are the same design**.

**Build from the module spec, checked against its render.** The spec carries what a
screenshot cannot — lakh grouping, risk lines that only appear above zero, hover formulas,
click targets.

**Superseded:** Page Standard v1.0's correction pass (4-KPI cap, no tiles on Work pages,
7-item sidebar) and Design Tokens v2.0 §1.3's purple ban. Both contradict the module specs
*and* the renders. Purple is legitimate — `Dashboard.md` §5.5 says "Accent purple" in prose.

**Theme is per screen.** The corpus is 107 dark / 6 light by design. Both themes work; each
screen defaults to its render's theme. Today is light.

---

## 4.0b ✅ RULED — the UI typeface is Outfit

**5 Aug 2026.** Outfit, weights **400 / 500 / 600 / 700**, locally bundled `.woff2`,
fallback **`-apple-system, sans-serif`**.

Inter is **dropped** — Design Tokens v2.0 §2.2 named it; the ruling overrides that. Removing
it also cut five unused subsets (greek, cyrillic, latin-ext…) from the bundle.

**JetBrains Mono stays locked for every number** — currency, IDs, serials, dates, quantities,
percentages.

⭐ **Still open:** neither face ships **Devanagari**, so Nepali month names (`साउन`) would
render as tofu. See §4.2.

---

## 4.1 Token drift — blocks Phase 4

Capsule render vs Design Tokens v2.0. Full table in [README](README.md#-token-drift--needs-a-decision-before-the-ui-port).

`--radius-card` 14 vs **8** · `--radius-sheet` 20 vs **14** · `--radius-field` 10 vs **6** ·
`--rail-w` 264 vs **240** · `--head-h` 56 vs **64/56** · motion 200/260 vs **180/240/320** ·
**Outfit vs Inter** · Material Symbols vs **Tabler**

Colours need no decision — all six already match the spec exactly.

## 4.2 Devanagari font — blocks the Nepali toggle

Foundation §3.3: under Nepali, month names render in Devanagari (`साउन`). **Neither Outfit
nor Inter as installed ships Devanagari** — those glyphs would render as tofu. A
Devanagari-capable face is needed.

**→ Answered and superseded by [§4.26](#426-nepali-is-0-translated-and-the-faces-are-not-installed--12-aug-2026)**
(12 Aug 2026): the faces are **Asar** and **Hind**, neither is installed, and the real blocker
turned out not to be the font at all — the Nepali catalogue is at 0%. Read §4.26 instead of this.

## 4.3 ✅ SUPERSEDED 8 Aug 2026 — roles: **eight**, not six

**Re-ruled 8 Aug 2026** (`supabase/migrations/0013_business_8_roles.sql`,
`0014_business_8_policies.sql`), closing Foundation §14.2's own flagged open item. The
eight are:

```
Owner · Admin · Coordinator · Warehouse · Technician · Accounts · Driver · Client
```

Three renames plus two additions from the 4 Aug six: `Manager→Admin` (22 Jul lock: Admin
*is* the Ops Manager), `Billing→Coordinator` (the coordinator takes the advance),
`Viewer→Client` (external, portal-only — see 0013's note on why the no-session fallback
landing on `Client` is *safer*, not weaker, since every Client policy is scoped by a
`client_id` link an unidentified session can't satisfy). `Technician` and `Driver` are new:
two real floor jobs the six had no way to represent.

0013 renamed enum values in place (`alter type … rename value`) specifically so the 22
existing RLS policy expressions in `0011_rls_policies.sql` needed zero edits — they
reference the enum member, not its text label. Case is preserved (`'Admin'`, not
`'admin'`) for the same reason: 63 source files already carry these literals.

Below (§6.2) is the reconciliation entry that first caught this file disagreeing with
`lib/rbac.ts`'s own comment — left in place as the record of *how* it was caught, not as a
still-open question. This ruling is what closes it.

The old six-role ruling and its Permissions Matrix reasoning are superseded, not
reinterpreted — the matrix's extra labels question is moot now that the engine itself
carries eight.

**Reopened 9 Aug 2026 — the business 8 is now the business 9.** Hover Intel System v2.1's
gating tables list Owner/Admin/Manager/Accounts as four distinct roles, not three, on
explicit user instruction to reopen rather than treat "Manager" as a synonym for "Admin".
`0017_reopen_manager_role.sql` **adds** a new `'Manager'` enum value — the old label was
consumed by 0013's rename, not preserved, so this is additive, not a second rename.
`0018_manager_role_policies.sql` gives Manager exactly the grants Admin already has
everywhere (the ~20 policy expressions 0013 left reading `Admin`, restated a second time
with `Manager` alongside it), since HIS v2.1 states no rule where the two roles diverge —
if a future spec wants them to differ on some specific action, that is a new ruling, not
assumed here. `types/database.ts`, `lib/rbac.ts`, `data/nav.ts`, and the two exhaustive
`ROLES` arrays (`Settings.tsx`, `CasesQueue.tsx`) all updated; see PROGRESS.md's 9 Aug HIS
v2.1 entry.

## 4.4 ✅ MOSTLY RESOLVED — schema decisions

**All 11 ⛔ schema-blocking conflicts were ruled 4 Aug 2026**
([Spec Conflicts](../mds%20and%20photos/Babin%20Rentals%20OS/00%20Getting%20Started/Spec%20Conflicts.md)),
and the Corrections Backlog — applied in full 5 Aug — showed most of the rest were already
specified and had been wrongly logged as gaps.

| Was listed as blocking | Actually |
|---|---|
| Transfers have no in-transit state | **7-state flow, In Transit among them** (Warehouse v3.0) |
| Consumables aren't modelled | **Tracking mode on every record** — serialised · quantity · consumable (Add Equipment §5.1) |
| Credit-limit engine undefined | **Derived from membership level**, read-only, gated override; breach is Critical and blocks Confirm |
| Depreciation method + acquisition cost | **Straight line**, per-category lives, 10% residual; purchase price + date captured (Add Equipment §10.1) |
| No chart of accounts | **Correct, and deliberate** — no general ledger in v1 (ruling A) |
| Serialisation policy | **Per-record declaration**, not a category rule |
| Sub-rental markup fixed or per line | **Per line** — and it is gross margin on revenue, never markup on cost |
| Retention vs "nothing is deleted" | **Parent record permanent; only detail ages out** |

**Genuinely still open — and none of these blocks the DDL:**

- ⚠ **`Dashboard.md` §5.7's throughput figure does not reconcile with its own §5.2/§5.3.**
  The strip reads *"12 of 25 movements completed today"*. The **25** is exactly §5.2's 14
  pickups + §5.3's 11 returns and is reproduced in the build. The **12** cannot be derived:
  §5.2 gives 6 completed pickups, and §5.3's 11 returns are all still open (4 overdue +
  7 expected), so the completed count can only be **6**. §5.8 requires one query and card
  counts that equal the panel counts, so the strip derives its figure and currently reads
  "6 of 25". **Confirm 6, or say which movements the 12 counts.** `data/today.ts`.
- ⚠ **`Dashboard.md` §17 says card radius 14px**; Theme Design System v1.0 says 16px, and
  the whole app is 16. Neither is Foundation, so neither wins automatically. Kept at 16 —
  a one-page radius would break shell consistency. **Amend §17 to 16, or say Today is the
  exception.** `theme.css` `--r-card`.
- ⚠ **`Dashboard.md` §3 shows the date pill as `2083/04/17`** (numeric, no suffix).
  Foundation §3.2/§3.3 require BS to lead *with a "BS" suffix* and the locked month
  romanization, which gives `16 Shrawan 2083 BS`. Foundation wins per CLAUDE.md and that is
  what ships. **Confirm, or say the pill is a deliberate numeric exception.**
- ⚠ **`Calendar.md` — the mini-month cannot show BS on every cell.** `lib/bs.ts` vouches for
  Shrawan 2083 only (16 Jul – 16 Aug), so 1–15 July render their AD day where the BS day
  belongs. Fixing it needs the neighbouring BS month lengths (Ashadh and Bhadra 2083), which
  is real calendar data — **not something to infer**. Same blocker keeps `CAL_EVENT_DAYS`
  beyond today on seed values: a movement carries a time, not a date.
- ⚠ **`Dashboard.md` §16 — one booking ID format.** `BK-2026-0715` (Rentals, Today) or
  `BR-2613` (the workspaces). The build uses `BK-YYYY-NNNN` throughout; the render's
  workspaces still show `BK-2026-2613`, which is the BK form with the BR number. Pick one.
- ⚠ **`Dashboard.md` §19 — three the spec itself flags.** Are §5.4's three at-risk buckets
  the right three? Where does "6 crew available today" come from — a roster, or headcount
  minus leave? And is Utilization the top 10 assets by value or the whole fleet? The card
  says top 10; §19 suspects it should be the fleet.
- **Cases and Weight in the item master** — are they there today, or to be added?
- **Insurance** — percentage or flat, and is it taxable?
- **Deposit per item or per category** — the percentage exists; where it is configured does not
- **When `Missing` becomes `Lost`** (Inventory §13)
- **Profit per booking** — the one profitability dimension no spec owns

## 4.5 Carried from the specs

Deposit Pending blocks Confirm or only Handover? · Warehouse handover with payment
outstanding? · mandatory evidence minimums · the green Verified tick (raised five times) ·
Crew Assist's home · Executive Dashboard deleted (confirm) · auto-lock timeout ·
screenshot blocking on financial screens · Client Portal as an app?

## 4.6 Operations Popup Shell v1.0 — received 9 Aug, not started

**Locked except §13.** Supersedes the current `Operations ▾` dropdown in `BookingDetail.tsx`
(full-screen routes per step) with one popup shell — 5 steps (Packing/Pickup/Return/
Cleaning/Reset) sharing one item record, always-viewable steps with status-gated writes,
per-scan server writes (no local-only state), offline queue with first-write-wins conflict
resolution, and a required `direction` (out/in) field on evidence and signatures.

**Scoped before starting** (agent-audited 9 Aug, not from memory): the schema is ~90% there
already — `operation_sessions`, `handover_lines`/`return_lines` (the dispatched/returned set
the spec calls for), and an append-only correction mechanism via
`session_line_movements.reverses_movement_id` (`revoke update, delete` already on the table)
all exist in `0003_operations.sql`. The real gap is that **none of the 5 existing workspace
screens (~4,100 lines) are wired to this schema at all** — `PackingWorkspace.tsx`,
`HandoverWorkspace.tsx`, `ReturnWorkspace.tsx`, `ResetWorkspace.tsx` all still read static
`data/*.ts` seed files, same as every other screen pre-Phase-2. Building this is therefore
not "replace 5 screens with 1," it's "build the real data-layer wiring for the first time,
in whichever shape gets picked" — plus a genuinely new offline-drain-and-conflict-resolve
loop (`lib/offlineQueue.ts` exists but nothing drains it; `scan_sync_conflicts` exists in
schema but nothing populates or resolves it).

**§13's open items, as they stand today:**

- ✅ **Resolved, not open.** §13 says the role set "8 business roles vs Foundation's 6...
  unresolved, and still blocking the schema." It is not open — see §4.3 above,
  `supabase/migrations/0013_business_8_roles.sql` / `0014`. The business 8 is the ruling in
  force; the schema is not blocked on this.
- ⚠ **Still genuinely open — do not infer:** `operations.session.abandoned_after_hours` — a
  value, or leave open indefinitely and rely on Today's "Handover in progress" surfacing.
- ✅ **Resolved, not open — found while building the shell.** `lib/workflow.ts` (Foundation
  v2.0 §1.5, already locked) states outright: *"Four operations, not five. Reset absorbs
  Cleaning — the separate Cleaning workspace in the renders is deleted and its per-item
  category checklists move inside Reset."* `JobName` is typed as `'Pack' | 'Handover' |
  'Return' | 'Reset'` — four, not five, and the type makes a fifth unrepresentable (§11:
  "modules import; modules never redefine"). The shell's step rail is **4 steps**
  (Packing/Handover/Return/Reset), not the spec's literal 5 — Cleaning's content lives
  inside the Reset step's checklist. Also note: the engine's job is named `Handover`, not
  `Pickup` — the shell uses `Handover` to stay one vocabulary with `JOBS`/
  `HandoverWorkspace.tsx`, labelled "Handover · Pickup" where the spec's term helps orient
  a reader unfamiliar with the engine name.
- ⚠ **New, not in the spec's own §13 but found while scoping:** `evidence`/`signatures`
  currently derive direction from `operation_sessions.operation` rather than storing it
  (`0003_operations.sql:212`, comment: "never stored"). That was a deliberate prior choice.
  Adding an explicit stored `direction` column per this spec's §7 reverses it — worth a
  one-line ruling before the migration, not just adding the column.

**In progress, 9 Aug** — building the shell UI on mock data (user's call: same contract as
every other screen this session, real Supabase wiring waits for Phase 2). No migrations
written against this spec — the existing schema already covers it (see above).

## 4.7 Found auditing the schema against the 8 Aug Decisions doc — not yet ruled

An agent-driven audit checked all 15 migrations against `Decisions — 8 Aug 2026.md` directly
(not a summary of it) rather than trusting the still-pending "reconcile against the 11
rulings" task description, which turned out to be stale — the real document rules 26 things,
not 11. One finding (`auth_user_role()` casting a literal enum label `0013` had renamed away)
would have broken the entire RLS layer on first apply; fixed directly, since it was a Postgres
correctness bug, not a decision. `0015_canonical_six_stages.sql` closed the retired-12-stages
gap the same way. What's left is genuinely open:

- ⚠ **Q2, late fee — the formula is built, nothing feeds it.** `lib/money.ts`'s `lateFee()`
  implements the ruled tiering exactly (≤30min→0 · <2h→half day · ≥2h→full day, then full
  days) and is tested against its own boundary cases, but has no caller: `bookings.actual_
  return_at` is a schema column nothing in `src/` ever writes (`ReturnWorkspace.tsx` has no
  persistence layer at all yet), and no function aggregates `booking_lines.rate × qty` into
  a discrete day-rate. Two rulings this needs before it can be wired: **(a)** does "one day's
  rate" scope to equipment only, or also crew (`booking_crew_lines.day_rate`) and/or
  transport (a flat, non-daily charge)? **(b)** on a multi-session Return, does `actual_
  return_at` stamp at the first partial session's close, or only once the whole booking's
  Return job completes? `supabase/migrations/0016_late_fee.sql` (schema for storing a raised
  finding, mirroring `damage_findings` → `charges`) is written and unapplied.
- ⚠ **Q3, deposit auto-apply — not started, and not just a formula.** "Unpaid balance
  auto-applies the deposit, remainder refunded; the accountant confirms before issue." The
  schema currently does the opposite: `validate_booking_gates()` blocks Handover/Closed
  outright on any outstanding balance or pending deposit rather than netting one against the
  other. This needs a real workflow state (something is "pending accountant confirmation"
  before it's "applied"), not a pure function — scope it before building.
- ⚠ **Q5, sub-rental margin — ruled twice already (§4.4 above, and the 8 Aug doc's Q5), never
  wired.** `booking_lines.supplier_cost` / `markup_amount` are dead columns carrying a stale
  `TODO(decision)` comment that predates both rulings. No formula — correct or incorrect —
  reads either column anywhere. `src/modules/operations/SubRental.tsx` already computes the
  right thing (gross margin on revenue) but only against hardcoded mock data, not
  `booking_lines`.
- ⚠ **`auth_is_staff()` — partially wired as of `0017` (9 Aug 2026), 21 of 22 still not.**
  `0017_column_level_money_masking.sql` made it the real gate for `products_select` and
  `product_units_select` (both brand new — `0004`'s tables had no SELECT policy at all before
  this) and retrofitted it into `booking_lines_select` (one of the 22 in `0011`, replacing its
  `using (true)`). The other 21 of the 22 still hold "Client never staff" only because they
  happen to omit Client from a hand-written allow-list, same as before. Retrofitting the
  remaining 21 is still its own pass, not done here — this was 3 policies, touched because a
  Law 6 money-leak audit needed them anyway, not a deliberate start on the full retrofit.
- ⚠ **`booking_client_state_map`'s premise no longer holds.** Built for "thirteen internal
  stages projecting onto eight client-visible states"; `0015` leaves it with six possible
  keys against an unchanged eight-value `client_visible_state` enum. Does `client_visible_
  state` shrink to match, or does one canonical stage need to resolve to more than one
  client-visible value? Structurally re-pointed, not redesigned.
- ⚠ **C26/C29's client-facing wording, two words off.** The ruling: `Quote → Confirmed →
  Ready → With you → Returned → Completed`. `workflow.ts`'s `BOOKING_STATUS[...].client`
  labels currently read "Ready **for pickup**" and "**Complete**" instead. `client_timeline_
  step` (the DB-side enum) matches the ruling exactly; only the app-side labels drift.

## 4.8 ⏳ PROVISIONAL, 9 Aug 2026 — target Supabase project

Two projects exist on this account, both `INACTIVE` (paused), neither previously connected to
this app. Asked the user which to target before anything gets provisioned; answered **"for
now babindulal7"** — provisional, not a final ruling, so noted as such rather than upgraded to
✅ RESOLVED:

- **`sxguwvgoserhdolewibb`** — "babindulal7's Project", `ap-southeast-1`, Postgres 17.6.1,
  created 8 May 2026. **This one.**
- `seojubaeuwkmsssrftdz` — "Miraz Bakery POS", `ap-southeast-1`, Postgres 17.6.1, created 29
  Jun 2026. Unrelated project (different business), not this app's target.

Nothing has been applied, restored, or otherwise mutated on either project — this is a name-only
decision recorded for whenever a migration apply is explicitly approved. The project is still
paused; waking it (and applying `0001`–`0017`) each need their own explicit go-ahead per
CLAUDE.md's hard rule, not implied by this answer alone.

## 4.9 Asset Detail Money tab — no revenue/maintenance-cost engine yet

**Found reviewing the Hover Intel v2.1 session's changes, fixed 9 Aug 2026.**
`AssetDetail.tsx`'s Money tab (Tab 4) rendered NPR 465,000 purchase price, NPR 3,301,500
lifetime earnings, 142% recovery, NPR 13,700 repairs and a 7-month revenue bar chart —
the same literals for every asset, never read from the `ParentRow` actually open. The
Maintenance tab's `maintenanceHistory` and Activity tab's `activityLog` were the same
pattern: fixed hardcoded arrays regardless of which asset was open.

Purchase price now reads `asset.purchasePricePaisa` (real, seedable field — same status as
`warranty`/`lastServiceAd`, just unseeded on most rows) and Recovery % reads
`asset.recoveryPct`, both already declared. Four new fields on `ParentRow`
(`src/data/inventory.ts`) cover what had no backing field at all — declared, deliberately
left unseeded, same convention as `utilizationPct`/`recoveryPct`:

- `lifetimeEarningsPaisa` / the monthly revenue chart — need a **revenue engine** summing a
  given asset's `booking_lines`/payments over time. Nothing in `src/` aggregates income per
  asset today.
- `repairsToDatePaisa` — needs a **maintenance-cost engine**. `maintenanceTicketsOpen` /
  `damageCasesOpen` count open tickets; neither carries a cost.
- `serviceHistory` — needs a **costed service-ticket log** (date, unit, work done, cost,
  downtime, technician per event). `lastServiceAd`/`nextServiceDueAd` are summary dates with
  no backing per-event record.
- `activityLog` — needs an **audit-log engine** recording per-asset events (stock checks, QC
  passes, dispatches, resets). `ChildRow.history` is rental history (booking/client/days),
  not this.

None of these block a screen — the Money/Maintenance/Activity tabs render an honest gap
state when the field is absent, same pattern as `utilizationPct`/`recoveryPct` at §4 above.

## 4.10 Two migration-deployment blockers fixed 9 Aug 2026 — one product decision deferred, not made

The bug audit (`AUDIT_FINDINGS.md`) found the schema could not apply at all: `0009_crew_vehicles.sql`
redefined `crew_members` under a name `0003_operations.sql` already used with an incompatible
column set, and 13 foreign keys across `0002`/`0003`/`0005` referenced `assets`/`documents`/
`cases`/`charges` — none of which is a real table anywhere in the schema. Fixed mechanically,
without making the two product decisions this would otherwise have forced:

- **`0009`'s `crew_members` renamed to `crew_profiles_v2`**, its own `crew_skills`/
  `crew_assignments` repointed to match. This unblocks deployment only — it does **not** decide
  whether `0009`'s crew model (crew_code/mobile/primary_role/is_active — and `crew_assignments`,
  which itself overlaps `0003`'s `crew_bookings`) should merge with `0003`'s richer HR-style
  `crew_members` (engagement_type/pan_status/deactivated_at). **TODO(decision):** which crew
  model is canonical, and whether `crew_assignments` and `crew_bookings` are the same concept.
- **`assets`→`product_units` and `documents`→`document_registry`** were genuine typos (both real
  tables already exist, just later in the migration sequence) — fixed as deferred
  `alter table ... add constraint ... foreign key` statements added right after each target table
  is created (`0004_inventory.sql`, `0009_crew_vehicles.sql`), the same cross-file extension of
  the forward-reference pattern `0003_operations.sql` already uses within one file.
- **`cases`/`charges` were not typos, but this was still not an open product decision** —
  ✅ **RESOLVED, same day.** `src/data/cases.ts`'s own header cites a real, build-locked spec
  (`04 Operations/Cases.md` v1.1) with a fully-typed `Case` interface — the schema was simply
  never written from it, which is a missed step, not an undecided question. `0023_cases_
  charges.sql` ports that interface's scalar/enum fields to a real `cases` table (case_no,
  type, priority, status, disposition as free text — see the file for why, same reasoning as
  `damage_findings.severity` — the §7.3 allocation buckets, an `owner_id` referencing `users`
  rather than a redundant role column) plus a deliberately thin `charges` table (the bridge
  from an approved `damage_findings`/`late_fee_findings` row to a posted `invoice_lines` row —
  no dedicated spec exists for `charges` itself, so it carries only what those two tables'
  own comments already required of it). `damage_findings.case_id`/`.charge_id` and
  `evidence_references.case_id` now have real `foreign key` constraints, added in `0023` after
  `cases`/`charges`/`invoice_lines`/`late_fee_findings` all exist. **Deliberately NOT ported**
  from `Case`: the `equipment` unit list, `evidence` (already covered by `evidence_references`
  itself), the rest of `linked` (Sub-Rental/maintenance/invoice/insurance), and
  `timelineExtra` — left for whenever `CasesWorkspace.tsx`/`CasesQueue.tsx`'s existing
  dual-dataset bug (`AUDIT_FINDINGS.md` P1 #13) is fixed and one of them is wired to a real
  query against this table, since building the fuller relational model has no live consumer
  to build it against yet.

Nothing else in the schema was touched — RLS coverage, the `stage_number` phantom column, and
invoice immutability are separate, already-logged findings, left for whoever picks those up next
(the RLS gap in particular is already being worked on in this same session's parallel edits to
`0010`/`0011`).

## 4.11 ✅ RESOLVED 10 Aug 2026 — a third migration-deployment blocker, same class as §4.10's

Found while writing RLS policy for `0003_operations.sql`'s operation-session tables (§6.13):
`return_accessory_checks.accessory_id`, `evidence_files.matched_item_id`, and
`evidence_references.item_id` all read `references items (id)`. **No `create table items`
statement exists anywhere in the schema** — confirmed by grep across all 26 migration files.
Applying migrations in order fails at the first of these three `CREATE TABLE` statements with
`relation "items" does not exist`; the schema still cannot deploy, same failure mode §4.10's
`assets`/`documents`/`cases`/`charges` fix already closed for four other phantom names.

**Left unfixed for a full day deliberately** — until the user asked to make the app actually run
against a real database "any how" and this became the concrete thing blocking migration 0003 from
applying, not a hypothetical. Re-read the three columns' own comments before picking anything, the
same discipline this thread has used for every prior phantom-table fix (`assets`, `documents`,
`categories`):

- **`return_accessory_checks.accessory_id`** → **`accessories`**, not `product_units`/`products`.
  Its own comment says "Child accessory in the item master," and `accessories.replacement_cost`
  matches this column's sibling `return_accessory_checks.replacement_cost` comment exactly ("The
  accessory's own replacement cost, **not the item's**") — a real table already named the thing
  the comment describes, once read as `accessories` rather than a literal `items` table.
- **`evidence_files.matched_item_id`** and **`evidence_references.item_id`** → **`product_units`**.
  Both sit directly beside a redundant `matched_serial`/`serial` free-text column — the same
  pairing `product_units.serial_no` already establishes for one physical scanned unit. Evidence is
  matched to a specific serialized unit (a scan, a photo of one camera body), never to a catalogue
  line — `products` would be the wrong granularity for what these columns are actually for.

This is the same class of fix as §4.10's `assets`→`product_units`/`documents`→`document_registry`
— reading each column's own comment resolved which real table it always meant, not a business
decision invented to unblock deployment. `0003_operations.sql`'s three inline
`references items (id)` declarations are now plain `uuid` columns with a comment pointing at the
deferred FK; `0004_inventory.sql` adds all three real foreign keys once their targets exist
(`product_units` early in the file, `accessories` right after its own `create table`) — same
cross-file forward-reference pattern already established for `assets`/`documents`/`categories`.

## 4.12 Crew Booking rebuilt to spec v3.2, 9 Aug 2026 — two assumptions taken by default, several genuinely deferred

User supplied **Crew Booking UI/UX Specification v3.2**, which closes several previously-open
decisions (nav placement, margin-model shape, travel scope, crew ratings → facts, utilization
removal, staff-vs-freelance costing) but leaves a few explicitly open — two of which change the
money on screen. Asked the user to choose (expense-recharge model, fee default handling, session
scope); no response came back, so the two money-affecting ones were taken on the spec's own
**recommended** option, called out here rather than silently baked in:

- **§2.3 expense recharge — Model A taken** (meals/travel/hotel/fuel recharged to the client at
  cost as a separate invoice line; the coordination fee is the only margin). The spec's own
  recommendation, and the only one of the two that produces a non-negative margin on its own
  worked example. `crewBilling()` in `lib/money.ts` supports Model B (`rechargeExpenses: false`)
  structurally if this is overridden.
- **`fee_per_crew_day` — defaulted to Rs 1,000/crew-day**, the spec's own proposed figure,
  mirrored in Settings ▸ Financial ▸ Taxes & fiscal year (same display convention as VAT rate) and
  named as `FEE_PER_CREW_DAY_PAISA` in `data/crew.ts` — not a magic literal at the call site, but
  not a confirmed number either.

**TODO(decision) — genuinely deferred, not built this pass:**

- Full capability-based permissions (`crew.book`, `finance.view_cost`, `admin.view_pii`, …). This
  codebase's actual RBAC (`lib/rbac.ts`) gates on named roles only — no dot-separated capability
  string exists anywhere in `src/lib` today. Introducing the spec's capability table is a
  cross-cutting change bigger than one screen; Crew Booking instead reuses the existing
  `asset-finance` `MoneyField` gate it already had, correctly, before this rebuild.
- TDS rate and registered/unregistered treatment — spec explicitly declines to supply a figure
  ("your accountant's call"). No payout ledger exists yet (Payouts tab is stubbed).
- Timesheets data model (planned/actual/overtime/approval) — stubbed tab, no backing data.
- Call sheets (§13) — needs Documents module wiring, not started.
- VAT treatment of recharged expenses — tied to the expense-recharge decision above.
- Standard shift length (10h ⭐) and overtime multiplier (1.5× ⭐) — unconfirmed, unused until
  Timesheets exists.
- Medical-certificate role scope, crew-facing view timing — spec's own open items, unchanged.

Also fixed in passing: `data/nav.ts`'s Crew Assist sidebar entry pointed at `/crew`, but the only
registered route was `/operations/crew` — a live dead link (`Placeholder` screen, not
`CrewBooking`). Moved the route to top-level `/crew` with a back-compat redirect from the old
path, and moved `CrewBooking.tsx` into its own `modules/crew/` folder to match.

## 4.13 Booqable bridge — ✅ 4½ of six API facts CONFIRMED against the official docs
     (10 Aug 2026, same day); three product items still open

User supplied **BOOQABLE INTEGRATION SPEC v1.0** (locked for build): Booqable is the live
operational system for a 7-month bridge, the OS is the working surface on top of it, sync is
two-way **at field level, never record level** — every mapped field has exactly one master and
nothing is ever merged. The scaffold is built (§6.29).

**§3.2 verification ran the same day** — the spec says confirm against
`developers.booqable.com`, which is public; no account needed for the docs themselves (§6.30
for the full pass). Scorecard, mirrored in `UNCONFIRMED_BOOQABLE_FACTS[n]` in
`src/lib/booqable/types.ts` with source URLs:

1. ✅ **CONFIRMED — and the spec's §9 assumption was wrong twice.** Order `status` is
   `new · draft · reserved · started · stopped · archived · canceled`: `concept` was RENAMED to
   `draft` (v1 webhooks still say `concept`), and `canceled` was missing entirely. `canceled` has
   no obvious local stage (it frees inventory and blocks further booking — it is not `archived`)
   — imports as a logged conflict + skip, `TODO(decision)`. Orders also carry `statuses[]` and
   `status_counts` because an order can be in a MIXED state (partially started/stopped) — the
   singular `status` is a documented simplification.
2. ⏳ **Verified genuinely undocumented.** The docs' entire statement on rate limits is the 429
   error entry ("You're doing too many requests! Slow down!"). No numbers, no `X-RateLimit-*`,
   no `Retry-After`. The proxy's token bucket + backoff stands on its own conservative defaults
   and must not depend on headers; log response headers on the first real 429 in staging.
3. ✅ **CONFIRMED — the placeholder assumption was wrong: v4 webhooks are NOT signed at all.**
   No signing secret exists at subscription time; `webhook_endpoints` has six fields, none a
   secret. The scaffold's HMAC placeholder was replaced with the honest model: webhooks are
   unauthenticated hints, the worker's re-fetch-by-id is the actual trust boundary, and
   `GET /api/4/webhooks/{id}` is the verification fallback. Envelope confirmed
   (`{id, created_at, event, resource_type, data}`), and the full 45-event enum is documented —
   notably **`order.created` and `product.updated`/`product.archived` do not exist**; the real
   events are `order.updated` + per-status events (`order.reserved/started/stopped/canceled/…`)
   and `product_group.*` for catalogue changes.
4. ✅ **CONFIRMED — and the answer inverts the spec's framing entirely.** A deposit is not a
   field on the order, not a line type, and not a payment kind: it is a **monetary dimension on
   every payment record**. Payments are polymorphic (`payment_charges | payment_authorizations |
   payment_refunds`) and every record carries `amount_in_cents` (rental money) +
   `deposit_in_cents` (trust money) with `total_in_cents = amount + deposit`. A single charge
   can be legally mixed. The classifier now keys on the documented split as its PRIMARY signal
   (§6.30); the spec's `SECURITY DEPOSIT` method-name fallback survives as the secondary. Order-
   level `deposit_*_in_cents` tracking fields and the `deposit_holds` withholding resource also
   confirmed and typed.
5. ✅ **CONFIRMED.** `page[number]` / `page[size]`, JSON:API style, on every list endpoint; no
   cursor exists; `links` carries only `self/first/last` (no `next`); totals are opt-in via
   `stats[total]=count`; default/max page size undocumented — always pass `page[size]`
   explicitly.
6. 🟡 **PARTIALLY CONFIRMED.** Archive IS v4's only delete (the documented `DELETE` endpoints
   are literally titled "Archive a customer/product" and return the full record with
   `archived: true`; orders have no DELETE at all — archiving is a status transition), and
   `filter[archived]` / `filter[archived_at]` exist on lists — so Law 3 holds structurally.
   Still open, needs ONE live sandbox call: whether `GET /{resource}/{id}` returns 200 after
   archive, and whether lists exclude archived by default.

**Also settled by the same pass — the scaffold's hand-guessed v4 attribute names, five of which
were wrong in load-bearing ways** (all fixed in `types.ts` + mappers, §6.30): `payment_type`
does not exist (polymorphic `type` instead) · product's enum is `product_type: rental |
sales_item | service` + a separate `trackable` boolean, not `trackable/bulk/consumable/service`
(`sales_item` used to be called `consumable` — v1 name) · Customer has **no phone/address/tax
columns at all** — those live in separate `Properties` resources · StockItem has no `barcode`
column — `Barcodes` is its own resource linked by relationship · order `number` is an integer,
and the rental period is `starts_at`/`stops_at`.

**The spec's own §15 open items, unchanged by the build:**

- `BOOQABLE_SLUG` / `BOOQABLE_TOKEN` are not set. They belong in Supabase Edge Function secrets
  and nowhere else — never a `VITE_` variable (the build enforces this structurally: the token is
  read only via `Deno.env.get` inside the two Edge Functions, and no file under `src/` can reach
  it).
- Whether the OS's own consumables ledger runs in parallel during the bridge, or waits for
  cutover. `map/products.ts` mirrors the consumable *definition* only and deliberately moves no
  stock quantities, pending this.
- Crew, maintenance, and the operations workspaces have **no Booqable counterpart at all**.
  The spec's §15.4 asks this be confirmed: they run OS-native on Supabase from day one while
  bookings come from Booqable. This is the one genuinely hybrid seam in the bridge, not a mirror —
  and it is the reason §5.2's "OS is sole master" list is as long as it is.

**Two schema facts the build surfaced that the spec did not anticipate** (detail in §6.29): the
spec's §8.1 target tables `equipment` / `equipment_models` / `rate_card` **do not exist in this
schema** (the real catalogue is `products` / `product_units` / `bundles`), and
`products.asset_code` carries a `^EQ[0-9]{6}$` CHECK a raw Booqable SKU cannot satisfy. Both are
mapping-target questions the spec author should confirm, not defects in either system.

## 4.14 ✅ RULED 16 Aug 2026 (in §4.30c) — which `inventory_state` values remove a unit from the availability pool

Raised while closing Phase 1's "exclusion constraint so double-booking is impossible" item.
`0045_reservation_capacity_ceiling.sql` caps concurrent holds at stock on hand.
`06 Inventory/Add Equipment.md` §5.1 defines that ceiling per tracking mode and the two
quantity modes are unambiguous — it is `products.total_quantity`. For **Serialised** it says
"Stock = number of units", and the spec never says *which* units. The locked ten
(`inventory_state`, `0001:526`) include `Retired` — explicitly terminal — and `Lost`,
`Damaged` and the repair states. A retired unit is plainly not rentable, so counting it
inflates capacity.

`0045` therefore counts **every** unit row, deliberately: it is the loose bound, so it can
only ever be too permissive and can never reject a legal hold, and it still removes the
unbounded case (500 held against a three-unit product is now rejected). Tightening it is one
`where` clause in `enforce_inventory_reservation_capacity()` once this is ruled.

**✅ Decided 16 Aug 2026 — see §4.30(c).** The disqualifying subset is `Maintenance`,
`Missing`, `Retired`, and it lives in `lib/availability.ts` as `DISQUALIFYING_UNIT_STATES`.
The four booking-lifecycle states are handled by the date-overlap check instead, because they
are facts about today rather than about a future window.

The `where` clause this section says would tighten `enforce_inventory_reservation_capacity()`
is now writable, but is **not** applied — that is a live migration and needs its own approval.

**Related, and also unruled:** whether a **model-level** hold (`product_id` set, `asset_id`
null) against a *Serialised* product is legal at all, or whether every serialised hold must
name a unit. `inventory_reservations_serialised_xor_quantity`'s own name and its comment
("A hold is either serialised or quantity, never both") read as though the tracking mode
picks the column, but nothing enforces it. `0045` neither blesses nor forbids the shape — it
just refuses to let it exceed the unit count. Ruling it is Phase 3's Status/Validation
engine work, not a CHECK.

## 4.15 Two decisions surfaced closing the payment/audit immutability triggers — 11 Aug 2026

Raised writing `0046_law4_payment_and_audit_immutability_backstops.sql`. Phase 1's checklist
promised four triggers; two of the four (`payments` immutability, `audit_events` append-only)
turned out to be **revokes only** — `0006:174` and `0007:235` both *state* triggers exist and
none did. A revoke binds role grants, never the table owner and never `service_role`
(`0040:60-68`), so law 4 held for app roles and nowhere else. `0046` writes the missing
BEFORE UPDATE/DELETE backstops for `payments`, `payment_reversals`, `audit_events` and
`backup_logs`, reusing `0044`'s two generic reject functions. Two things it refused to decide:

- **How a coupon redemption is withdrawn.** `coupon_redemptions` sits in the same
  `revoke update` list (`0006:555-562`) with the same missing backstop, but it carries
  `unique (coupon_id, booking_id)` (`0006:427`) — so pinning both UPDATE and DELETE shut
  leaves a wrongly-redeemed coupon with **no** correction path, compensating row included.
  Law 3 needs a named terminal action here before the table can be pinned. `0046` therefore
  leaves it, and `deposit_movements` / `expense_reversals` / `tax_ledgers` (law 5 and ledger
  concerns, not payment immutability), untouched.
- **Which tables the universal audit trigger covers.** `log_audit_event()` (`0010:19-105`) is
  attached to **6 tables of 121** (`0010:107-128`) — bookings, clients, invoices, payments,
  security_deposits, product_units. The other 115 write nothing to `audit_events`, so law 3
  has no audit trail across most of the schema and Phase 3's Audit engine has nothing to read
  for them. Not a mechanical gap: it is a volume/retention call against
  `audit_settings.retention_period` (`0007:280`, default 7 Years), and the trigger hardcodes
  `module := 'Rentals'` (`0010:30`) while `audit_settings` is keyed per `audit_module` — so
  attaching 115 more tables today would write a large volume of rows under a label known to
  be wrong for most of them. Needs a ruling on coverage **and** on how module is derived.

**Also noted, not a decision:** nothing implements `retention_period` at all. Now that DELETE
on `audit_events` raises for every role, any future retention job must drop or replace
`trg_audit_events_reject_delete` in its own migration rather than discover the block at run
time.

## 4.16 Four things surfaced building the status transition executor — 11 Aug 2026

Raised writing `src/lib/bookingTransition.ts` and `planTransition()`. Phase 3's Status item
had an engine that could answer "is this move legal" and **nothing that asked it** —
`canAdvance` had zero callers. It now has one. Four things that executor refused to decide:

- **`item_quantity_state` has five members; `workflow.ts`'s `ItemState` has four.**
  `0001_enums.sql:42-48` stores `Damaged` as a bucket; §1.6 rules it "a condition carried
  alongside `Returned`, not a fifth mutually-exclusive bucket", and `assertItemCounts` sums
  four. A row stored `Damaged` is in none of them, so the invariant fails on real data.
  Narrowing the TS type alone would make `database.ts` lie about the DB — Postgres would still
  accept the value on `booking_line_units.unit_state` (`0002:235`) and
  `session_line_movements.resulting_item_state` (`0003:198`). **Needs deciding:** an enum
  rebuild (`0015`-style, Postgres cannot drop one member) plus where the condition lives —
  `booking_line_units.condition` (`0002:245`) is the obvious candidate but nothing says so.
  Phase 1 work; flagged at the type, not silently fixed.
- **Does the `Cancelled` flag block advancing?** §1.3 and `0015`'s header both make
  cancellation "an orthogonal terminal action on bookings, not a step in the forward-only
  stage lifecycle", and no spec text says a cancelled booking may not still be walked to
  `Closed` for settlement. `FLAGS.Cancelled.blocks` is therefore empty. If it should be every
  status, that is one array literal.
- **Does `Security Held` block Close?** Its effect reads "blocks silently closing", which is
  not "blocks Close" — it asks for custody to be acknowledged. §1.7 names four close gates and
  says Reset is deliberately not one, so the gate list reads as closed. Left non-blocking.
- **Must an OS-initiated advance also push to Booqable?** `booqable/sync.ts` §11's
  `pushOrderReserve` / `pushOrderStart` / `pushOrderStop` are the write-back for exactly the
  three advances `Booked→Packed→On Rent→Returned` cover, and each takes a sign-off boolean the
  transition executor cannot derive. `applyBookingTransition` writes the local transition only
  and does not enqueue `sync_outbox`; callers push themselves, as they do today. Whether the
  two should be one atomic action is an integration ruling, not a refactor.

**Also noted, not a decision:** `booking_stage_transitions` was missing from
`src/types/database.ts` entirely and is now typed there from `0002:427-462`; and it has been
added to `safeUpdate`'s `immutableTables`, which `0002:485`'s revoke always implied.

## 4.17 `invoices.outstanding_amount` — the recompute formula must be ruled before it can be
     protected — 11 Aug 2026

The Phase 1 gate says *"no path makes a deposit reduce Outstanding."* Read literally it holds —
there is genuinely no wire from `deposit_movements` into `invoices`, and
`payments_no_security_deposit` blocks a deposit entering the payment ledger. **But Outstanding
is a plain writable column**: `UPDATE invoices SET outstanding_amount = 0` is a single legal
statement for Owner/Admin/Manager/Coordinator, verified live. It holds by absence of a wire, not
by a constraint.

The obvious fix — a trigger rejecting direct writes to `paid_amount`/`outstanding_amount` outside
the sanctioned recompute — **cannot be written yet, and this is not procrastination.** §6.8 found
that the two existing triggers writing these columns *disagree with each other*: one floors at 0,
one does not, and **`payment_reversals` never flow back into `paid_amount` at all**. A recompute
trigger written against `payments` alone would therefore be confidently wrong the moment a
reversal exists — worse than the current gap, because it would look enforced.

**TODO(decision), three parts:** (1) is `outstanding = total − paid` floored at 0, or may it go
negative to represent an overpayment; (2) does `paid_amount` net out `payment_reversals`
(almost certainly yes, but it is unstated and the two triggers imply different answers); (3) do
credit notes participate. Rule these three and the trigger is half an hour's work.

## 4.18 The five states — a systemic gap, not eleven separate ones — 11 Aug 2026

Phase 6's audit found the same defect in all eleven module groups: **the happy path is drawn and
the other four states are not.** Loading and Error are absent from essentially every screen;
Restricted is content-omission rather than a drawn state; Offline is inherited from the shell.

Recording it here rather than as eleven Phase-6 line items because it is one decision with one
answer, and treating it as eleven invites eleven inconsistent solutions. **TODO(decision):** is
the five-state contract enforced by *convention* (a documented checklist per screen), by a
*wrapper* (`<Screen loading error empty>` that every module must route through), or by *typing*
(a discriminated union the render must exhaust)? The wrapper and the type both make the gate
mechanically checkable; convention does not, and convention is what produced the current state.

Two concrete sub-items are already known and do not need the ruling: `EmptyState` must
distinguish its two required kinds (nothing-yet vs no-results) — today the kind is not even a
required prop — and `BookingDetail`'s six `alert()` calls must become inline persistent errors
per Law 12.

## 4.19 "Allow overbooking" toggle scope — global or per-role — 12 Aug 2026

`NEW_RENTAL_REDESIGN_v1.md` §3 adds `Settings ▸ Financial ▸ Booking rules ▸ Allow overbooking`
(off by default), gating whether a booked/maintenance chip in Add Item opens an override dialog
(sub-rent preferred, or book-anyway with a required reason ≥10 chars and a named approver — the
same shape as the existing >10% discount gate). The spec's own text flags this as unresolved:

> should the toggle be global, or per-role? A global switch means a Coordinator can overbook
> once an Owner turns it on. Per-role (Owner + Admin only) is the safer default but is a new
> capability string.

**Not assumed either way.** Shipped the global reading of the spec's literal text — the toggle
lives in Settings, gated only by whoever can already reach Settings (`canManageSettings`, Owner
only, per `lib/rbac.ts`) — and did **not** add a new `rbac.ts` capability function or RLS mirror
for a per-role restriction, since Law 6/§0 requires any such gate be enforced by RLS, not the UI,
and no migration exists for it. **TODO(decision):** if per-role (Owner + Admin only) is ruled the
safer default, that needs a new `canOverrideBooking(role, isOnline)` in `lib/rbac.ts` mirrored by
a migration-level function, per the file's own header rule.

A second, smaller gap from the same feature: the toggle itself is **client-only** state
(`lib/bookingRules.ts`, localStorage), not a Supabase-backed setting — every other Settings.tsx
toggle is local-state-only today (no settings-persistence layer exists in this build at all), so
this did not stand up a first settings-backend connection as a side effect of one toggle. Real
persistence is a separate, larger piece of work than this redesign.

---

## 4.20 The §2.2 record-number rename landed in TypeScript only — 12 Aug 2026

`WIREFRAME_RULINGS_2026-08-12.md` §2 ruled one ID per entity with **no year segment and no zero
padding** — `B-1`, `C-1`, `INV-1`, not `BK-2026-0715`. That ruling was implemented in
`src/data/numbering.ts` and `src/lib/seed.ts`, and **not** in the schema. The database still
enforces the retired shapes:

| Table | Constraint | Live definition | New format |
|---|---|---|---|
| `clients` | `clients_client_code_format` | `CHECK (client_code ~ '^CL-[0-9]{4}-[0-9]{4}$')` | rejects `C-34` |
| `bookings` | `bookings_booking_no_format` | `CHECK (booking_no ~ '^BK-[0-9]{4}-[0-9]{4}$')` | rejects `B-715` |

Exactly two constraints block it. `invoices`, `payments` and `security_deposits` have **no**
format constraint at all, so `INV-1` and `PAY-2026-0001` would both be accepted — verified
against the live project, not inferred from the migrations.

This is what stopped `0047_seed_reference_corpus` from applying on 12 Aug: regenerating it
through `npm run seed:sql` (the sanctioned path — it is a generated file) correctly emits the
new identifiers, and the first `insert into clients` is then rejected by the old CHECK. The
ruling's own lines 86-88 predicted this: *"This rename is a single coordinated pass, not eleven
piecemeal edits."* Half the pass landed.

**TODO(decision).** Completing it needs a `0055` swapping both CHECKs to the §2.2 formats, and
that carries a real sub-decision: the one surviving client row is `CL-2026-0102` (Himalayan
Mountain Media, created 11 Aug), which the **new** regex would reject. Migrating it to `C-102`,
widening the regex to accept both during a transition, or reverting the TypeScript half are
three different answers with different costs, and the exact regex is itself a call —
`numbering.ts` uses one `N` token meaning "no padding", which `^C-[0-9]+$` expresses but does
not constrain. Put to the user 12 Aug 2026 and **not answered**, so nothing was assumed and no
`0055` was written.

**Consequence while it is open:** the operational tables stay empty, so a converted screen
renders its empty state rather than rows. The conversions themselves are unaffected — they are
written against the real schema, which the rename does not touch. What is blocked is
*verification by driving the app*, which `CLAUDE.md` requires before any of this is called done.
Not a reason to stop wiring; a reason not to claim it is verified.

> ### ✅ CLOSED 12 Aug 2026, confirmed live 15 Aug 2026
>
> Everything above this line is history. `0055_ruled_identifier_formats` **was** written and
> applied, and the sub-decision was answered by migrating the surviving row: `CL-2026-0102` →
> `C-102`. Read from project `sxguwvgoserhdolewibb` on 15 Aug: `booking_no ~ '^B-[0-9]+$'`
> and `client_code ~ '^C-[0-9]+$'`; 121 bookings `B-715`…`B-917` with **0** in the retired
> shape; `number_sequences` booking `B-` · client `C-` · invoice `INV-`, padding 1,
> `include_year false`. The operational tables are not empty — see PROGRESS.md 15 Aug.
>
> The related worry that `next_document_number()` would re-issue `B-1` every January is also
> closed by the same migration: its reset branch is now guarded by `if v_rec.include_year and
> …`, so a year-less sequence cannot reset. Verified against the live function body.

**TODO(decision) — EQ's format string does not match any equipment code that exists.**
`data/numbering.ts`'s `EQ` row declares `format: 'EQ-CAT-NNNNNN'`, and `numbering.test.ts:112`
pins `buildNumber('EQ-CAT-NNNNNN', …) === 'EQ-CAT-000824'`. Live, all **126** `products.asset_code`
values are bare six-digit `EQ000234`…`EQ001025` — **0** in the `EQ-CAT-` form — and
`next_document_number` emits `prefix || lpad(val, 6)`, i.e. `EQ000824`, which `0055`'s own
comment calls "its separator-less six-digit form". The cost is not cosmetic: `isIssuedBy` tests
the whole **format**, so `isIssuedBy('EQ', 'EQ000824')` returns **`false`** — verified by
running it against three real live codes. That is exactly the silent-failure mode
`numbering.ts`'s own comment says prefix/format matching exists to prevent. Either the format
string should be `EQNNNNNN`, or the minting function and 126 rows are wrong. **Not guessed.**

**TODO(decision) — Settings ▸ Numbering shows counters that are not the database's.**
`SEQUENCES` carries `counter: '4861'` for booking (and `LAST_SEQUENCE_USED === 'B-4861'`,
pinned at `numbering.test.ts:78`), `'492'` for invoice, `'2481'` for client. Live
`number_sequences.current_value` is **917**, **120**, **73**. So the screen offers an operator
"Current 4861 / Next `B-4862`" when the database would actually issue `B-918`.
`NumberingSequences.tsx:75` names this exact hazard in its own header — *"A wrong counter mints
duplicate IDs"* — and `:91` hardcodes the `B-4862` claim into a comment. The fix is to source
counters from `number_sequences` rather than the seed array; whether the screen should read
live or stay static until that wiring exists is the call. **Not guessed.**

Unrelated to the rename but found in the same attempt, and already fixed: the seed inserted each
invoice as `Sent` and *then* its `invoice_lines`, so `recalculate_invoice_totals()` (0010) fired
and its `update invoices` was correctly rejected by `reject_invoice_edit_after_issue()` (0006).
`src/lib/seed.ts` now emits the lawful lifecycle — Draft → lines → restate → issue — which is the
flow `0006_finance.sql:481-483` always described. The triggers were right; the seed's ordering
was not.

---

## 4.21 ✅ DISSOLVED 12 Aug 2026 — "what `productions` should be"

§6.27 opened a `TODO(decision)`: *what `productions` should be (its own table? a view over
`crew_bookings`/`bookings` grouped by client+date-range?)*. It is **dissolved, not answered.**

`../updated mds/04_RENTALS.md` line 3: *"Bookings only. **Productions removed.** Sub-Rental is a
filter chip."* That is prose, so it is one of the eight genuine removals in
`WIREFRAME_RULINGS_2026-08-12.md` §1 — the standing rule elsewhere is that a panel survives
unless a spec removes it in words, and this one does.

There is nothing to design because the entity never existed: §6.27 already recorded that
`productions` has never been a real table in any of the 54 migrations, and dropped
`crew_bookings.production_id`'s inline FK for exactly that reason (the column stays a nullable
`uuid` stub). Nothing was wired to a database, so nothing loses a source.

**Deleted 12 Aug 2026:** the Rentals tab strip, `ProductionsTab` in
`src/modules/rentals/RentalsList.tsx`, `src/data/productions.ts` and `src/data/productionIntel.ts`.
`src/data/nav.ts` already carried the ruling (`SPEC_TABS['/rentals'] = []`, asserted by
`nav.test.ts:222`); the screen now agrees with it.

⚠ **Do not resurrect this from Foundation §5.1**, which still lists three tabs on Rentals
(Bookings · Productions · Sub-Rental) and is the older document. `src/data/crew.ts`'s
`production: string` stays free text — that is a label on a crew row, not the entity.

---

## 4.22 Rentals ▸ Export — two product calls, neither answered — 12 Aug 2026

`04_RENTALS.md` §4.1 draws `[＋ New Rental] [Export]` in the page header. The button is built and
**stays honestly disabled with its reason**, because the spec draws a control, not a pipeline, and
two things it needs are unruled:

1. **The file format.** CSV, XLSX and a PDF register are different products with different
   consumers; nothing in the spec library picks one.
2. **Which columns a role may export.** This is the one that matters. Law 6 keeps money off a
   Warehouse/Technician/Driver session by *not selecting the column*
   (`lib/queries/bookings.ts`'s `withDeposit`), and a full-column export would walk straight around
   that — an export is a read path like any other and needs the same role rule, expressed once,
   not re-derived per format.

**TODO(decision).** Until both are ruled the button carries the sentence rather than a guess.
Related and already done in the same pass: the **Import** button beside it is removed — §4.1 draws
no such control and it too was a disabled placeholder with no pipeline behind it.

---

## 4.21 The offline write path returns success for a write that has not happened — 12 Aug 2026

`lib/dataAccess.ts`'s `idempotentInsert` contains this, and it is reached by every implemented
action:

```ts
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  await enqueueMutation(String(table), 'insert', finalPayload, finalPayload.client_uuid)
  return { data: finalPayload, error: null }   // Optimistic response
}
```

The queued and the written case return **the same shape**. There is no flag, no discriminant,
nothing a caller can branch on. So an action cannot tell its screen whether the row reached
Postgres or is sitting in IndexedDB, and the screen therefore cannot tell the operator. That is
the "success for work it did not do" defect `actions/core.ts` was written to end, re-created one
layer below the dispatcher.

Four of the five implemented actions already refuse offline rather than trust this:
`recordPayment`, `confirmRental`, `createClient` and `blockClient` all check `navigator.onLine`.
`recordPayment`'s header states the reasoning — *"a receipt for money the ledger has not recorded
is worse than no receipt"*.

**`src/actions/rentals/floorVerb.ts` has no such guard** — zero references to `navigator.onLine` —
so Pack, Handover, Return and Reset all take the optimistic path. A dead-lettered mutation
(`offlineQueue.ts`, `MAX_RETRIES = 5`) then leaves an operator believing a booking is packed when
the server has no record of it.

**TODO(decision)** — and it is genuinely two decisions, not one:

1. **Should the floor verbs queue offline at all, or refuse like the money path?** Queueing is
   defensible for warehouse work — poor connectivity is the reason the queue exists, and these
   verbs write no money, so Law 6 is not in play. Refusing is defensible because a mis-stated
   stage propagates to every other screen through the single booking query. Not assumed either
   way.
2. Regardless of (1), the API gap is **not** a product decision and should be closed: give
   `idempotentInsert` a `queued: true` discriminant so a caller *can* distinguish, and let the
   screen say "queued — not yet saved" instead of "saved". Until that exists, no floor verb can
   report the truth even if it wants to.

Related, same file: `offlineQueue.ts:78` constructs its Dexie instance at module scope
(`export const db = new OfflineQueueDB()`), so importing `dataAccess` reaches IndexedDB. Under
jsdom there is none, which is why `npx vitest run` currently exits 1 with five
`MissingAPIError: IndexedDB API missing` unhandled rejections while every test passes.

---

## 4.23 ✅ RULED 12 Aug 2026 — a waiver needs an approver too

Both give money away. The rules are not symmetric, and neither file mentions the other.

| | Reason required | Named approver | Where |
|---|---|---|---|
| Discount > 10% | ≥10 chars | **yes** — Manager or Owner | `lib/discount.ts` (Law 10) |
| Late-fee waiver | ≥10 chars | **no** — any staff | `lib/lateFee.ts` (ruled 12 Aug) |

The waiver rule was ruled deliberately, on the 21 Jul precedent that any staff may release gear
after an unpaid-advance warning, logged. So this is **not a bug report** — it is a question about
whether the asymmetry is intended at the same rupee value.

A Rs 6,000 late fee waived by a Warehouse operator and a Rs 6,000 discount that needs an Owner
are the same money leaving the business.

**Ruled: the asymmetry was not intended.** A waiver now needs a **named Manager or Owner**, and
the table above becomes symmetric in kind:

| | Reason ≥10 chars | Named approver |
|---|---|---|
| Discount > 10% | yes | yes |
| Late-fee waiver | yes | **yes** |

**No threshold**, deliberately. Law 10's gate is a *percentage* and a waiver has no base to take
a percentage of, so the only non-arbitrary line is "all of them" — picking a rupee figure would
have been inventing the decision this section was asked to settle.

Any staff member may still *raise* a waiver; the approver signs it. Both names and the reason go
to the audit log. `WAIVER_NEEDS_APPROVER` in `lib/lateFee.ts` is the switch, and
`validateWaiver` refuses without it rather than silently waiving.

> **Note 31 Aug 2026.** Law 10 is now **UNGATED**, so the table above is asymmetric again, in the
> other direction: a discount of any size needs neither reason nor approver; a late-fee waiver
> still needs a named Manager or Owner. Whether the waiver rule follows the discount rule is a
> fresh question — recorded here, **not ruled**, and the 24 Aug "build first, rules later" stance
> (§4.38b) says it can wait.

---

## 4.24 ✅ RULED 12 Aug 2026 — one day's rate is the whole booking

`LateFeeInput.dayRatePaisa` in `lib/money.ts` has carried this gap since the engine was written;
its own header says no function anywhere in `src/` aggregates a booking's live
`booking_lines.rate × qty` into one "one day" figure, and that the scope is unruled.

Building the Return/Booking Detail panel forced the question into the open, because a panel has
to show *a* number.

**Ruled: the whole booking** — equipment **and** crew **and** transport. A client who keeps the
kit an extra day keeps the crew, and the vehicle too if the vehicle was billed daily.

The question assumed transport is always flat. It is not: **transport can be billed flat or per
day, and both are real.** `TransportBilling` in `lib/lateFee.ts` models the two, and a booking
declares which it used.

That settles the "a per-day share of a flat charge is an invention" objection without
excluding transport wholesale:

| Transport billed | Contributes to a late day | Why |
|---|---|---|
| **per day** | in full, undivided — it is already a daily figure | the vehicle was held, and held one day longer |
| **flat** | nothing | that is what *flat* means; a delivery run quoted once does not happen again because the return was late |

Equipment and crew are booking **totals**, so they divide by the rental days. `bookingDayRate()`
is the aggregator `money.ts`'s `LateFeeInput` note said did not exist anywhere in `src/`.
`DAY_RATE_BASIS` still renders under the figure, so the operator sees the reading before
approving it.

**Still open, and separate:** nothing writes `bookings.actual_return_at`. The column exists and
`bookingQuery.ts:435` reads it; which session-close event stamps it — the first partial close, or
the one that completes the booking's Return job — is unruled.

Related and still true: **nothing writes `bookings.actual_return_at`.** The column exists and
`bookingQuery.ts:435` reads it; which session-close event should stamp it — the first partial
close, or the one that finally completes the booking's Return job — is also unruled.

---

## 4.25 ✅ RULED 12 Aug 2026 — Country is optional too

The 12 Aug ruling relaxed Add Client's required set to **name and phone**, enumerating address,
city, PAN and contact person as newly optional. It did not mention **Country**, which is still
gated.

The result was incoherent: a client could be saved with a country and no city.

**Ruled: country is optional too.** The whole address block — address, city, district, postal
code, country — is now fill-in-later, and can be completed when an invoice needs it. The
incoherence is gone because the last gate went with it.

The required set on Add Client is therefore exactly **name and phone**. Phone is the one that
earns it: it is the only unique key a client has, so duplicate detection and the merge tool have
nothing to match on without it.

Format checks are untouched — optional does not mean unvalidated. A phone or an email that is
*present* still has to be shaped correctly.

---

## 4.26 ✅ RULED 12 Aug 2026 — Nepali is on: catalogue at 100%, faces installed

Supersedes nothing in §4.2 — it **answers half of it and measures the rest.**

§4.2 asked for "a Devanagari-capable face". The 12 Aug spec names the two: **Asar** (headings)
and **Hind** (body). Neither is in `package.json`. `main.tsx` §4.3.7 already documents the
loading policy — they must load *on the toggle*, never eagerly, because each Hind weight is
1,146 glyphs an English-only user must not download.

Two costs are now encoded and tested in `lib/i18n.ts` rather than left to be discovered:

- **Asar ships one weight.** A browser asked for a weight a face lacks **synthesises** it, and a
  faux-bold smears the conjuncts Devanagari depends on. `safeWeight()` clamps; a test asserts
  over its whole output space that it never returns a weight that would be synthesised.
- **The toggle changes body metrics** (Source Sans 3 → Hind), so a table that fits in English
  may not fit in Nepali. Every table screen needs a Nepali layout pass.

**Ruled 12 Aug: translate it and install the faces.** Done:

- `@fontsource/asar` and `@fontsource/hind` are installed. Checking them corrected a mistake in
  the first draft: **Asar ships only 400** (the spec's warning was right), but **Hind ships
  300/400/500/600/700**, so body text needs no clamp at all — only headings do. `safeWeight` was
  wrong and is fixed.
- `loadNepaliFonts()` imports the **per-subset** files (`devanagari-400`, `latin-400`, …), not
  the barrel, so §4.3.7's payload concern is honoured: an English-only user downloads nothing.
- `applyLanguage()` swaps `--font-display` / `--font-body` to the `--font-ne-*` pair `theme.css`
  already declared, and sets `<html lang>` — which is what a screen reader switches voice on.
- The catalogue is at **100%** and `canEnable('ne')` returns true. Settings ▸ Language is a real
  setting, stored per browser by `settingsStore`.

**Two caveats worth keeping visible.**

1. The catalogue is currently **17 keys** — nav, five statuses, three actions. It covers the
   machinery, not the app. Every string added from here is a translation decision, and the
   coverage gate will drop below 100% the moment an English key is added without its Nepali
   pair, which is the intended behaviour.
2. **A native speaker should review the wording before this is shown to staff.** The terms
   chosen lean on standard business Nepali — `मौज्दात` for inventory rather than the literal
   `सामान सूची`, `पात्रो` for the calendar because the screen's whole point is BS — and those are
   judgement calls a Nepali-speaking operator may want to overrule.

**Still to do:** the per-table Nepali layout pass. The action labels are ~2.5× their English
width (`सुरक्षित गर्नुहोस्` vs `Save`), which is the metric problem in miniature.

---

## 4.27 ✅ SUPERSEDED 31 Aug 2026 — a client's *standing* discount has no way to satisfy Law 10 — 12 Aug 2026

> **Superseded by Law 10 UNGATED (ruled 20 Aug, final 31 Aug).** There is no reason or approver to
> satisfy any more, so the three options below are void and the schema does **not** grow
> `standing_discount_reason` / `standing_discount_approver_id`. What survives as a follow-up:
> `ClientDetail`'s inline edit still **refuses** a standing discount above 10% — lift that with the
> gate drop, in the same commit. Original text kept below under Law 3.

Law 10 gates a discount above 10% on a **reason ≥10 chars** and a **named approver**.
`lib/discount.ts` implements that, and `validateDiscount(percent, reason, approverId)` takes both.

`ClientRecord` carries neither. The nearest field is `discountSource`, a three-value enum
(`Type Rule` · `Membership` · `Named Client`) — that is a *category*, not a justification, and
there is no approver column anywhere on the client.

So a standing discount above 10% is currently unjustifiable by construction: the law demands two
things the schema cannot hold. Two seed records already sit above the line (`C-2` at 12%), which
means this is not hypothetical — it is a rule the data predates.

Inline edit on `ClientDetail` therefore **refuses to set** a standing discount above 10%, and
says why on the field. Existing records above 10% still display; nothing was rewritten.

**TODO(decision):** either

- **the schema grows** `standing_discount_reason` and `standing_discount_approver_id`, and Law
  10 applies to standing discounts exactly as it does to per-booking ones; or
- **standing discounts are capped at 10%** and anything larger has to be taken per booking,
  where the reason and approver already exist; or
- **standing discounts are outside Law 10** — a deliberate carve-out, on the argument that they
  are set once by an Owner rather than applied per transaction. If so it should be written down,
  because the current silence reads as an oversight.

### The counter-argument, since the carve-out is the tempting option

The carve-out looks safe — "an Owner sets it once, so the approver *is* the Owner" — and it is
the reading that needs no schema change. It is also the weakest of the three, for a reason worth
stating before it gets picked by default:

**A standing discount is not applied once. It is applied on every future booking, silently.** A
per-booking discount above 10% is a visible event with a reason attached to that booking; a 12%
standing discount is invisible from the booking that uses it, and the reason — if one ever
existed — lives nowhere. Law 10's whole purpose is that money given away carries a name and a
justification, and the standing case gives away *more* money over time with *less* record.

The precedent also cuts the other way. §4.23 has just ruled that a late-fee waiver gains an
approver **precisely because** the asymmetry with Law 10 was unintended. Carving standing
discounts out would re-open the same asymmetry in a third place, days after closing it in the
second.

**Recommendation: grow the schema** (`standing_discount_reason`, `standing_discount_approver_id`)
and apply Law 10 unchanged. The cap-at-10% option is a reasonable interim — it needs no
migration, and the two seed rows above the line keep displaying — but it moves real business
(a 12% Production Alliance rate) into per-booking discounts that then need approving one at a
time, which is more friction, not less.

---

# 5. Conventions

**TypeScript strict**, incl. `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
`@/` → `src/`. Icons **Tabler** outline 2px. **JetBrains Mono for every number.**
Money `numeric(14,2)` — never float. snake_case in the DB, camelCase in TS.

**Never**: a `DELETE`; an `UPDATE` on payments or audit; a hardcoded VAT rate; a hex value
in a component; a per-screen seed array; a second dashboard; a second codebase.

---

# 6. External audit reconciliation — 8 Aug 2026

The user pasted a 44-section "Full Product Audit & Development Blueprint" (external, source
unstated) proposing a from-scratch IA and a 40-page build list. Reconciled against this file
and the current build rather than actioned wholesale — most of it either restates a law
already here or repeats a fight already settled. Two genuine, previously-unknown bugs came
out of doing this properly; those are the real yield.

## 6.1 Settled, not reopened — "Customer" naming and sidebar width

The audit's §4/§39 propose renaming Clients → Customers and a 13-section sidebar. This is
the **third** time this exact shape has surfaced:

1. The original Generation C renders carried a 15-item numbered sidebar — `data/nav.ts`'s own
   header comment documents rejecting it ("the renders were the defect").
2. Earlier this session, a design pack (2 screenshots + 2 spec `.md`s) proposed the same
   13-item "Customers" nav from Global spec §6. Asked the user directly; they chose **Client**
   — keep law 17 and the existing 8-item nav.
3. This audit proposes it again.

**Ruling: closed.** Law 17 and the 8-item nav (§5.1 in `data/nav.ts`) stand. Do not re-ask
this question from a fourth source without new information — cite this entry instead.

One thing the audit's §39 gets right without realizing it already happened: Operations
Queues → "Operations" with Packing/Handover/Return/Reset/Cases as **children**, not flat
top-level items, is exactly what `data/nav.ts` already does. Same for Crew Assist (kept,
because `CrewBooking.tsx` is a real workflow, not a stub) and Calendar (top-level). The
8-item nesting nav already satisfies most of §39's actual complaint (flat-list sprawl)
without adopting its 13-item structure.

## 6.2 Two real bugs this audit corroborated

**1. Dark theme's primary button is still gold, not blue.** Measured live in this session
(`getComputedStyle` on the Save button, dark theme): `background: rgb(216,169,58)`,
`color: rgb(0,0,0)` — i.e. `--btn-primary-bg`/`--btn-primary-fg` in `theme.css`'s dark block
are still `#d8a93a`/`#000`. This audit's §30 ("avoid yellow as the primary action color")
and the earlier design pack's Global spec §2.2 ("blue replaces yellow/gold... never the
default CTA color") both say the same thing independently — and the 5 Aug PROGRESS.md entry
claims *"the gold-as-primary problem in the older design system was already fixed in the
capsule build."* That claim is about the **reference render**, not this codebase:
`theme.css`'s dark tokens were never actually migrated. `NewRental.tsx` §13 already worked
around this locally ("the workspace primary is blue in *both* themes... where the app
primary is gold") rather than fixing the token — so every other screen using
`<Button variant="primary">` in dark mode ships gold. TODO(decision): settle this as part of
§4.1 (token drift, already blocks Phase 4) rather than patching it screen by screen again.

**2. §4.3 ("roles: six") is stale.** `lib/rbac.ts`'s own header comment: *"the business 8
(ruled 8 Aug 2026)"* — Owner · Admin · Coordinator · Warehouse · Technician · Accounts ·
Driver · Client. That is eight, live in code, dated **today**, and it does not match this
file's §4.3 ruling of six (Owner · Manager · Warehouse · Billing · Accounts · Viewer). One of
these two rulings is the one actually in force; §4.3 needs a re-ruling entry pointing at
whichever is current, not two documents disagreeing about how many roles the RBAC engine has.
→ **Resolved same day**: `supabase/migrations/0013_business_8_roles.sql` and `0014` are the
real, applied migrations implementing the eight — that is the ruling in force. §4.3 above is
now rewritten to match; this bullet stays as the record of how the drift was first caught.

## 6.3 Already covered — no new decision needed

Payment immutability (§13/§25/§27 ↔ laws 4/5/10, already enforced and verified —
"§10.8 discount hard-block verified in four states"), single source of truth (§2 ↔ law 2,
Phase 3's ten engines), rental lifecycle (§10 ↔ the canonical 6-stage status engine in
`lib/workflow.ts`), return/inspection flow (§12 ↔ `ReturnWorkspace.tsx`, already built and
verified), responsive/capability rules (§29/§30 ↔ laws 13/14, `lib/device.ts`), five-states
gate (§32 ↔ Phase 4's own gate), offline conflict handling (§35 ↔ all of Phase 9), AI
restraint (§37 ↔ law 16), command palette (§16 — `CommandPalette.tsx` already exists),
audit log (§18 — `lib/audit.ts` + `/admin/audit` already exist, though nothing calls
`logAuditEvent` yet), notification triage (§17 — `BroadcastCenter.tsx`/`SmsCenter.tsx`/
`UnifiedInbox.tsx` already exist).

## 6.4 Genuinely missing — confirmed by reading the code, not assumed

- **Client/Customer Detail page.** No `/clients/:id` route exists — `ClientsDirectory.tsx`
  only ever shows a right-rail summary panel, never a full profile page. Audit §7/§38#8.
- **Import Center.** `ClientsDirectory.tsx`'s Import button is `disabled`, reason on file:
  *"no CSV mapping or duplicate-merge step exists."* Audit §21/§38#15.
- **Duplicate/Merge Center.** Same disabled-button reason names this directly. This session's
  Add Client page added a first, narrow instance (phone-match warning on one form) — not a
  merge workflow. Audit §22/§38#16.
- **Bulk Actions.** `ClientsDirectory.tsx` has row-selection checkboxes and a "N selected"
  counter with nothing wired to them yet. Audit §20/§38#27.

Everything else in the audit's §38 "must build" list needs a one-by-one check against
`src/modules/*` before being trusted as missing — several (Rental Detail, Equipment Unit
Detail, Damage/Missing workflow, System Health, Audit Log, Notification Center) already exist
under the names this codebase settled on, just not the audit's names.

## 6.5 Likely not applicable to this product

§3 P0.6 and §37 both carry an oddly specific "no charging functionality/workflows/statuses"
exclusion. Nothing in this product's domain (camera, grip, lighting, audio rental) has a
charging concept — reads like a carried-over constraint from a different template the audit
was built from. Not adopted as a law; flag to the user if it turns out to mean something
domain-specific.

## 6.6 Process note — Phase 1 is still open while Phase 4–6 work continues

This file's own rule (§2): *"Do not start a phase until the one before it passes its gate."*
Phase 1 (schema) is marked current and its checklist is unchecked, yet PROGRESS.md shows
extensive Phase 4 (design system), Phase 5 (shell/nav) and Phase 6 (screens — Today, Rentals,
Booking, Inventory, Calendar, Operations, Finance, Clients all substantially built) already
done on mock/seed data. The audit's own §41 phase order would have the schema finished before
more screens — which is just this file's rule, restated by an outside reader. Not re-litigating
the sequencing choice here, only naming it: it is a live divergence from this file's own gate,
not a hidden one.

## 6.7 Phase 1 audit against this file's own gate, 9 Aug 2026 — one violation fixed, four still open

Re-read all 16 existing migrations (`0001`–`0016`) against this phase's checklist and gate
("no path lets Warehouse read a money column"). Found the gate was actually being violated, not
merely unverified:

- `booking_lines_select` (`0011`) was `using (true)` — no role check at all. `booking_lines`
  carries `rate`, `discount_amount`, `supplier_cost`, `markup_amount`; every money-blind floor
  role (Warehouse, Technician, Driver — `0014`) could read them.
- `products` (`0004`) had RLS enabled but **zero policies anywhere** across all 16 files
  (confirmed by grep) — fail-closed, so safe but unreadable by anyone. `product_units` looked
  the same at first read; §6.8 below found the real cause was different and worse. `0004`'s own
  header comment already promises "Warehouse sees NO monetary values" for this table — a promise
  nothing enforced.

Fixed in `supabase/migrations/0019_column_level_money_masking.sql` (drafted as `0017`, renumbered
in §6.8 below; local file only — **not** applied to any live project, per this file's hard rule
and CLAUDE.md): a masking view per table (`booking_lines_v`, `products_v`, `product_units_v`)
using the already-defined `auth_can_view_money()` (`0014`), plus a column-level
`revoke select (...) ... from authenticated` on the base tables so the base table itself cannot
be queried for those columns by any session — only the view's `case when` logic can return them,
and only to a role that passes the check. `0019`'s own header documents the full reasoning and
cites which columns/tables are covered.

**Explicitly still open** as of this entry (§6.8 below closes one more; see it for the current
list) — so the checklist item stays unchecked rather than implying more was done than was:
- The RLS-dimensions checklist line above is role-only everywhere; branch / warehouse-zone /
  approval-limit RLS do not exist anywhere in `0001`–`0019`.
- No trigger enforces forward-only booking-stage transitions. `0015`'s own column comment claims
  one exists ("a direct UPDATE is rejected") — it does not, in any of `0001`–`0019`. That comment
  is currently false.
- `invoices.outstanding_amount` / `paid_amount` are plain stored columns with no CHECK tying them
  to `subtotal - paid` — today's gate claim ("no path makes a deposit reduce Outstanding") holds
  only because no FK path from deposits into invoices exists yet, not because a constraint forbids
  a direct tamper-UPDATE.
- `invoice_lines` and a few adjacent tables have the same mixed money/operational-column shape as
  the three tables `0019` covers, but were not audited or covered in this pass.
- `0012`'s seed data is still hand-typed INSERTs, not engine-generated (checklist's last line).

## 6.8 Same-day follow-up audit, 9 Aug 2026 — a foundational bug, two migration-breaking typos,
      and a file-numbering collision with the concurrent session

Continuing straight from §6.7 (user chose "Continue Phase 1 schema gaps"), dispatched a 4-way
research pass — full re-read of every policy in `0011`, the stage-transition trigger claim, the
`invoices` money columns, and what branch/warehouse/approval infrastructure already exists —
before writing more fixes. It surfaced something bigger than any of the four questions asked:

**The foundational bug: `auth_user_role()` cannot read `users`.** It is `language sql stable`,
not `security definer`, so its internal `select primary_role from users where id = ...` runs as
the *calling* role. `users` has `enable row level security` (`0007`) and, confirmed by an
exhaustive grep of every `create policy` statement in all 19 files, has never had a single
policy. Postgres returns zero rows (not an error) to a non-owner role from an RLS-enabled table
with no policies. Net effect, if ever applied: `auth_user_role()` resolves to its `'Client'`
fallback for **every** user, Owner included — and since `'Client'` is excluded from every
staff/finance allow-list in the schema (correctly, elsewhere), **every role-gated policy in the
entire database would deny everyone.** Only the small number of `using (true)` policies — the
exact opposite problem this session has otherwise been closing — would have actually worked.
Not a leak; a total, silent, first-query outage that would have taken a live debugging session
to trace back to the one table underneath the entire auth layer.

**Two migration-breaking typos, found while verifying the research agents' findings directly:**
- `0010`'s audit trigger and three of `0011`'s policies (`inventory_units_select`/`_insert`/
  `_update`, later touched again by `0018`) all target a table called `inventory_units` — which
  has never existed anywhere in this schema. `product_units` (`0004`) is the real table; grep
  confirms no rename statement, so this is a drafting-time rename that was never propagated to
  these six statements. As written, all six would have raised "relation does not exist" and
  aborted the migration chain at `0010`, before `0011`'s money-relevant policies even ran.
- `validate_booking_gates()` (`0010`) branches on `NEW.stage_number`/`OLD.stage_number` — a
  column from the retired 13-stage model that has never existed on `bookings` in this schema
  (its only two occurrences anywhere in `0001`–`0019` were inside this one function body). Would
  have raised "record 'new' has no field 'stage_number'" on **every** `UPDATE` to `bookings`.

**Fixed directly at the source** (these files have never been applied anywhere, so fixing the
bug in place is cleaner than patching around it): `0010` and `0011`'s six `inventory_units_*`
statements retargeted to `product_units` (`0018`'s two references fixed the same way); `0010`'s
gate function retargeted at `bookings.stage`'s real enum values (old Stage 6/Handover → `'On
Rent'`, old Stage 10/Closed → `'Closed'`, same ordinal-comparison idiom `0015` already
established) — the gate logic itself is unchanged, only the broken column reference. New
`supabase/migrations/0020_role_lookup_and_staff_retrofit.sql` adds the one missing policy
(`users_select_own`, a session reading only its own row — the minimum fix for the foundational
bug, not a broad "list all users" grant) and retrofits the four remaining `using (true)` SELECT
policies this session hadn't reached yet (`bookings_select`, `maintenance_records_select`,
`operation_sessions_select`, `clients_select`) to `auth_is_staff()`.

**The file-numbering collision:** the concurrent session's own `0017_reopen_manager_role.sql` /
`0018_manager_role_policies.sql` (reopening Manager as a role distinct from Admin, Hover Intel
System v2.1) landed on the same `0017` number as this session's money-masking migration.
Renumbered mine to `0019` rather than touch theirs — theirs was already two files deep and
actively part of ongoing work.

**Also corrected while re-reading `0011`:** its own comment and `0014`'s both estimated "22
policies" in that file; the real count, verified by `grep -c "create policy"` and manual
enumeration, is 32. §4.7's `auth_is_staff()` bullet and this file's Phase 1 checklist line 82
should be read against 32 as the real retrofit surface, not 22 — sizing the remaining work off
the smaller number would silently drop 10 policies.

**Explicitly still open, updated from §6.7:**
- RLS branch / warehouse-zone / approval-limit dimensions — still entirely missing. Worse than
  "missing a check": `branches`, `warehouses`, `storage_zones`, `user_roles`, and
  `user_approval_authorities` (the tables a real fix would need to read) are *themselves*
  RLS-enabled with zero policies, the identical shape as the `users` bug above. A branch/zone/
  approval fix needs its own pass extending the `users_select_own` pattern to each, then real
  row-scoping logic per table — genuine design work, not done here.
- No forward-only stage-transition trigger. **Closed same day — see §6.9.**
- `invoices.outstanding_amount`/`paid_amount` still have no integrity trigger. Found while
  researching it: the two existing triggers that write these columns *disagree* — one floors at
  0, one doesn't — and `payment_reversals` rows never flow back into `paid_amount`, so a
  "correct" recompute trigger written against `payments` alone would still be wrong once a
  reversal exists. Needs a formula decision before writing it, not assumed here.
- 21 of the 32 policies in `0011` are still not retrofitted to `auth_is_staff()` — see §4.7.
- `invoice_lines` and other mixed money/operational tables — not audited in this pass.
- `0012`'s seed data — still hand-typed.

## 6.9 Forward-only stage trigger built; found the RLS gap is systemic, not incidental — 9 Aug
     2026

Closed the "no forward-only stage-transition trigger" item from §6.8 in
`supabase/migrations/0021_forward_only_stage_transitions.sql`: `booking_stage_transitions`
(AFTER INSERT, `security definer`) validates from_stage matches the booking's real current
stage, forward-only/no-skip (unless an approved reversal — already CHECK-enforced), causal order
(`occurred_at` can't precede the booking's prior transition), and that a Closed booking accepts
no further transition — then writes `bookings.stage`/`closed_at` itself. `bookings.stage`'s own
column comment ("Written ONLY by that table's trigger; a direct UPDATE is rejected") is now true:
`revoke update (stage, closed_at) on bookings from authenticated` makes this table the only path.
Composes correctly with the `validate_booking_gates()` fix from §6.8 — the trigger's own `UPDATE
bookings` still passes through that BEFORE UPDATE gate check exactly as a direct client UPDATE
would, so a pending-deposit/outstanding-invoice failure still rolls back the whole transition.
Deliberately does not implement the other four `0002`-commented "TRIGGER REQUIRED" items on this
table (inventory release on cancel, the full Confirm-transaction bundle, the Critical-condition
gate) — those are Phase 3 engine responsibilities needing real unspecified business logic, not
schema plumbing; see `0021`'s own header for the exact boundary.

**Found while building it, not something narrower would have caught:** `booking_stage_transitions`
itself had RLS enabled with zero policies — inserting the very rows this trigger depends on would
have been impossible, meaning shipping the trigger *alone* would have frozen every booking's stage
at Quote forever, a regression on top of the bug it fixes. Added `booking_stage_transitions_insert`
(the same five-role set `bookings_update` already allows, `with check` pinning `actor_id` to the
session's own identity) and `_select` (`auth_is_staff()` — no money columns here, no reason to
gate reading it as tight as writing it) in the same migration.

**That near-miss prompted checking whether this "RLS enabled, zero policies anywhere" shape is
rare or common.** It is not rare. Diffed every `alter table ... enable row level security`
statement against every `create policy ... on <table>` statement across all 21 migration files:
**111 tables have RLS enabled; only 19 have ever had a single policy written for them. 92 tables
— the large majority of this schema — are fail-closed with no policy at all.** This is a
different, more basic problem than §6.8's "branch/zone/approval dimension is missing" finding:
those tables at least have a role-only policy to extend. These 92 have nothing, including tables
central to daily operation — `branches`, `warehouses`, `crew_members`, `vehicles`, `expenses`,
`suppliers`, `containers`, `client_contacts`, all of `booking_*` line-item and flag tables, the
entire client-portal auth path (`portal_users`, `portal_auth_challenges`, `portal_sessions`), and
more (full list in this session's own working notes, not reproduced here — it is genuinely most
of the schema, not a short list worth hand-copying into this file).

**Deliberately not attempted in this pass.** Writing 92 real policies means 92 real judgment
calls — which role set, does it need row-scoping, does it carry a money column that needs the
`0019` masking-view treatment instead of a plain policy, does it even use `system_role`-based
auth at all (`portal_*` almost certainly needs a separate scheme entirely, since portal sessions
are a different auth path from staff `app.current_user_id`). Rushing that in the same breath as
everything else this session already touched risks the exact kind of sloppy, unreviewed security
decision this whole audit has been trying to prevent. This is its own dedicated pass: categorize
the 92 by domain/sensitivity first, then write policies in reviewed batches — not a same-session
addition. **This is now the single largest concrete item blocking Phase 1's RLS checklist line,
larger than the branch/zone/approval-dimension gap it was found alongside.**

## 6.10 First reviewed batch of the 92-table RLS gap — 4 tables closed, the rest categorised — 9
     Aug 2026

Picked up §6.9's own instruction: categorise the 92 by domain/sensitivity, then write policies in
reviewed batches. This entry does both — a verified re-derivation of the 92 (§6.9 didn't reproduce
the list, "most of the schema, not worth hand-copying"), a first categorisation, and one migration
covering the least ambiguous slice.

**Re-deriving the 92, correctly this time.** A first attempt at the diff undercounted: a plain
text grep for `create policy ... on <table>` misses the two `execute format(...)` loops in `0014`
that generate policies for table names held in a Postgres array variable, not a literal. Resolving
those loops against their actual array contents — `['vehicle_trips', 'trips', 'booking_transport']`
(only `booking_transport` is a real table; `vehicle_trips`/`trips` are not — `vehicle_trip_logs` is
the real name, already known-broken per `AUDIT_FINDINGS.md` P1 #1) and
`['invoices', 'payments', 'security_deposits', 'deposit_movements', 'expenses']` (all five real) —
plus discounting `0014`'s dead `maintenance_tickets` conditional (that table doesn't exist either;
`maintenance_records` is the real one, already covered separately by `0018`) gives **19 tables with
real, firing policy coverage**, matching §6.9's count exactly. Cross-checked against the actual
`create table` list (not assumed): **111 real tables**, also matching. 111 − 19 = **92**, confirmed
independently rather than trusted from the prior entry.

**First-pass categorisation of the 92** (automated column-name sweep for
`_amount`/`_price`/`_rate`/`_cost`/`_value`/`_fee` typed `numeric`/`bigint`/`integer` columns, then
spot-checked, NOT a full manual read of all 92 — treat as a starting sort, not a final ruling):

- **Closed this migration (4):** `branches`, `warehouses`, `storage_zones`, `user_roles` — see
  `0022_branch_zone_role_lookup_policies.sql`.
- **Money-adjacent, needs a `0019`-style masking review before a policy is written (≈19):**
  `accessories`, `booking_crew_lines`, `bundles`, `coupon_redemptions`, `coupons`,
  `crew_assignments`, `crew_bookings`, `crew_members`, `damage_findings`, `depreciation_logs`,
  `late_fee_findings`, `membership_plans`, `purchase_requests`, `return_accessory_checks`,
  `tax_ledgers`, `vehicle_fuel_logs`, plus two the automated sweep missed and a manual read caught:
  `user_approval_authorities` (`max_amount_limit`, `max_discount_pct` — column names didn't match
  the sweep's suffix list) and `bank_accounts` (no money-amount column, but holds the business's
  own `account_number` — sensitive by content, not by the sweep's pattern). **`crew_members` is
  also the table `AUDIT_FINDINGS.md` P0 #4 says has two conflicting `create table` definitions
  (`0003` and `0009`) — that has to be resolved before a policy on it means anything.**
- **Corrected off the sweep (1):** `number_sequences` — flagged by the automated sweep
  (`current_value bigint`) but manually confirmed to be a document-numbering counter
  (invoice/PO sequence state), not money. Belongs in "plain."
- **External client-portal auth path, not `system_role`-based (3):** `portal_users`,
  `portal_sessions`, `portal_auth_challenges` — needs its own scheme design, flagged since §6.8,
  not attempted here or in this categorisation pass.
- **Plain operational/internal tables, no money columns, `auth_is_staff()`-shaped (≈62):**
  the remainder — mostly booking sub-tables (`booking_documents`, `booking_flags`,
  `booking_line_units`, `booking_notes`, `booking_client_state_map`),
  client sub-tables (`client_contacts`, `client_documents`, `client_flags`,
  `client_marketing_consents`, `client_merges`, `client_tax_profiles`,
  `client_change_requests`),
  crew/inventory/logistics tables, automation/notification/audit-adjacent tables, and system
  config (`system_settings`, `sms_gateways`, `webhooks`, `automation_rules`). **Two inside this
  bucket still need per-table judgment before treating them as a uniform `auth_is_staff()`
  batch**: `timesheets` and `signatures` are personal/HR-flavoured (a timesheet is one person's
  attendance record; a signature is evidence of one person's consent) and may need the same
  self-or-admin row-scoping shape as `users_select_own` (0020) rather than blanket staff-readable.
  Not resolved here — flagged so the next pass doesn't default them to broad read without
  noticing.

**What `0022_branch_zone_role_lookup_policies.sql` does:** `branches`/`warehouses`/
`storage_zones` get `auth_is_staff()` SELECT (pure location/reference data every internal role
needs to do its own job) and `('Owner', 'Admin', 'Manager')` for structural writes — the same
literal tier `audit_settings` (0018) already uses for "who edits configuration," not a new one.
`user_roles` gets the same `('Owner', 'Admin', 'Manager')` tier for **both** read and write —
unlike the other three, it's access-control metadata (who holds which role), not operational
reference data, so it does not get the broad staff-read the other three do. Confirmed `user_roles`
is not what `auth_user_role()` itself reads (that function reads `users.primary_role` directly),
so unlike `0020`'s `users_select_own` fix, there's no auth-bootstrapping risk in gating it.
`user_approval_authorities`, the fifth table §6.9 named alongside these four, is deliberately
**not** included — its money columns put it in the "needs masking review" bucket above, not this
one.

**Explicitly still open, in priority order:**
1. The ≈19-table money-adjacent bucket above — needs the same considered pass `0019` got, not a
   rushed one. `crew_members`'s duplicate-definition bug (`AUDIT_FINDINGS.md` P0 #4) blocks it
   specifically until that's resolved.
2. The ≈66-table plain-operational bucket — the safest remaining slice, but still ≈66 individual
   role-set calls; `timesheets`/`signatures` specifically need row-scoping thought, not a blanket
   grant.
3. `portal_users`/`portal_sessions`/`portal_auth_challenges` — separate, not-`system_role`-based
   auth design, unstarted.
4. Everything §6.8 already listed and this entry didn't touch: 21 of 32 `0011` policies still not
   retrofitted to `auth_is_staff()`; the `invoices.outstanding_amount`/`paid_amount` integrity
   trigger, blocked on a flooring/reversal formula decision; `0012`'s seed data, still hand-typed.

**Not verified by execution** — same as every entry in this thread: no local Postgres instance,
nothing applied to either Supabase project, per `CLAUDE.md`'s hard rule.

## 6.11 Second reviewed batch: `bookings`' own child/lookup tables (5 tables) — 9 Aug 2026

Picked `booking_line_units`/`booking_flags`/`booking_documents`/`booking_notes`/
`booking_client_state_map` next — all five are `bookings`' own children or a lookup it depends
on, so the correct role tier already exists on the parent rather than needing to be invented.
`0024_booking_subtable_policies.sql`: the first four get `bookings_lines_all`'s exact tier
(`'Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'`, from `0018`) for write, since all four
are written during the same floor workflows (packing/handover/return) that already write
`booking_lines` — `booking_line_units.packed`/`packed_by` is a Warehouse action, not a desk one.
`booking_client_state_map` gets the narrower `('Owner', 'Admin', 'Manager')` config tier (0022's
`branches_manage` tier) instead — unlike the other four it isn't per-booking data at all (no
`booking_id`, no `client_uuid` column), it's a fixed global lookup the client portal's timeline
reads, so writing it changes what every client sees system-wide. All five get `auth_is_staff()`
read, matching `bookings_select` (0020).

**Correction to §6.10's categorisation, made while reading these tables' actual columns:**
`booking_discounts` was sorted "plain" in the first-pass automated sweep, but it carries
`percent`/`reason`/`approver_id` — the identical shape §6.10 already put
`user_approval_authorities` (`max_discount_pct`) in the money-adjacent bucket for. Treating one
and not the other inconsistently would be worse than leaving both for the same considered pass —
moved to the money-adjacent bucket (now ≈20, not ≈19; plain bucket now ≈65, not ≈66) rather than
writing it a policy here.

**Not verified by execution** — same as every entry in this thread.

## 6.12 Third reviewed batch: 7 of `clients`' 10 child tables — a new "PII-masking-adjacent"
     bucket found — 9 Aug 2026

Same pattern as `0024`: mirror the parent's already-decided tier rather than invent one.
`clients_select` (0020) is `auth_is_staff()`; `clients_insert`/`clients_update` (0018) is
`('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')`. `0025_client_subtable_policies.sql`
applies both, unchanged, to seven of `clients`' ten child tables.

**Three of the ten don't belong in §6.10's "plain" bucket — found by reading their actual
columns before writing policy, the same discipline that caught `booking_discounts` in §6.11:**

- `client_memberships.fee_paid` (numeric) and `client_commercial_overrides.
  requested_credit_limit` (numeric) are both money — the automated sweep missed them because its
  suffix list doesn't cover `fee_` as a *prefix* or `_limit` as a suffix. Moved to the
  money-adjacent bucket (now ≈22).
- `client_channel_identities` isn't money, but can't take a plain policy either — its own column
  comment already states: `address` (the phone/email itself) is "Masked to last four for every
  role below Manager/Accounts." A row-level `auth_is_staff()` policy would show the floor roles
  the *full* address, directly contradicting a requirement the schema already wrote down for
  itself. This needs the same column-masking-view treatment `0019` gave money columns — a **new
  bucket, not the money one: "PII-masking-adjacent."** Currently a bucket of one; worth watching
  whether other columns elsewhere carry the same kind of comment before assuming it stays that
  way.

Plain bucket is now ≈62 (was ≈65), money-adjacent ≈22 (was ≈20), plus the new
PII-masking-adjacent bucket (1 table so far).

**Two tables also referenced by `client_documents`/`client_change_requests` but not covered
here:** both have a real, live `portal_user_id` column (`uploaded_by_portal_user_id`/
`signed_by_portal_user_id` on the former, `portal_user_id` on the latter) — a second, genuinely
different auth path (client-portal sessions, not `system_role`) that this migration's staff-side
policies don't address at all. Noted on the policies themselves via `comment on policy`, not
silently left implicit — same as the `portal_*` deferral already logged in §6.9/§6.10.

**Not verified by execution** — same as every entry in this thread.

## 6.13 Fourth reviewed batch: 6 operation-session-family tables — and a new,
     previously-uncaught deployment blocker found, same class as §4.10's — 9 Aug 2026

`0026_operation_session_line_policies.sql`: mirrors `operation_sessions_all`'s current, live tier
(`('Owner', 'Admin', 'Manager', 'Warehouse')`, from `0018` — **not** the Technician-inclusive
version some of `0014`'s comments describe as intended but never actually wired into this
specific policy) onto six per-session floor tables: `session_line_movements`, `packing_lines`,
`handover_lines`, `return_lines`, `scan_events`, `scan_sync_conflicts`. The Technician gap on
`operation_sessions` itself is left alone — it's already tracked under §6.8's "21 of 32 `0011`
policies not retrofitted," not this migration's job to fix in passing.

`return_accessory_checks`, sitting in the same file next to these six, is deliberately **not**
included — `replacement_cost numeric(14,2)` plus its own column comment ("Writable by Owner,
Manager or Billing only and hidden from Warehouse entirely") already states the exact Law-6 gate
needed. That is a column-mask case, not a plain policy — stays in the money-adjacent bucket.

**Found while reading that same file for this batch — a new deployment blocker, not in
`AUDIT_FINDINGS.md` and not touched by §4.10's fix:** `return_accessory_checks.accessory_id`,
`evidence_files.matched_item_id`, and `evidence_references.item_id` all read
`references items (id)`. **`items` is not a real table anywhere in the schema** — confirmed by
grep, zero `create table items` statements across all 26 migration files. This is the identical
bug class §4.10 fixed for `assets`/`documents`/`cases`/`charges`: applying these migrations in
order would fail at the first of these three `CREATE TABLE` statements with
`relation "items" does not exist`, aborting the transaction — the schema still cannot deploy.

**Deliberately not fixed here.** Unlike `assets`→`product_units`/`documents`→`document_registry`,
which were unambiguous 1:1 renames (one obviously-intended real table, just created later in
the sequence), `items` has no equally obvious single answer: this schema has both `products`
(the catalog/model table) and `product_units` (individual serialized physical units), and
`accessory_id`/`matched_item_id`/`item_id` could plausibly mean either depending on whether the
reference is to "a specific serial" or "a catalog line" — a real product decision, not a typo to
mechanically correct. Per `CLAUDE.md`'s hard rule, not invented here. **TODO(decision):** which
target table each of these three columns should reference — flagged, not guessed.

**Not verified by execution** — same as every entry in this thread.

## 6.14 Fifth reviewed batch: `products`' catalogue children — and `products` itself was
     missing its write policies entirely — 9 Aug 2026

`0027_product_catalogue_policies.sql` covers two new `products` children,
`product_compatibilities` and `product_documents` (compatibility links and attached manuals/
certificates — no money columns), mirroring `product_units`'s write tier (`0018`,
`('Owner', 'Admin', 'Manager', 'Warehouse')`) and `auth_is_staff()` read.

**Found while scoping them:** `products` itself has never had an INSERT or UPDATE policy
anywhere. `0019`'s money-masking migration added `products_select`, but its own scope was
read-side masking, not a full policy set — write was never added by that migration or any other.
Confirmed by grep across all 26 migration files before writing this. Practical effect: with RLS
enabled and only a SELECT policy present, Postgres denies INSERT/UPDATE to every role by default,
Owner included — nobody could add or edit a catalogue product. Closed in this same migration,
mirroring `product_units`'s tier rather than opening a separate one, since the two tables are the
same domain (catalogue line vs. one of its serialized units).

**Not verified by execution** — same as every entry in this thread.

## 6.15 Sixth reviewed batch: 8 warehouse/logistics tables, split into three tiers by who
     actually acts on them — 9 Aug 2026

`0028_inventory_logistics_policies.sql`. None of the eight carry a money column, but a single
uniform grant would have been wrong — split by who actually does the work, not just "no money
means plain":

- `inventory_categories`/`suppliers` — taxonomy and vendor master data, structural like
  `branches`/`warehouses`/`storage_zones` (0022): `auth_is_staff()` read,
  `('Owner', 'Admin', 'Manager')` write. Warehouse uses these values daily but doesn't create
  new categories or suppliers.
- `containers`/`stock_transfers`/`stock_transfer_lines`/`stock_audits`/`stock_audit_items` — the
  actual floor work (packing containers, dispatching/receiving transfers, scanning a physical
  count). Mirrors `product_units`'s tier (0018): `('Owner', 'Admin', 'Manager', 'Warehouse')`.
- `inventory_reservations` — a hold placed against inventory *for a specific booking line*
  (`booking_line_id not null`), not pure floor data. Mirrors `booking_lines_all`'s tier instead
  (`('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')`) — Coordinator manages booking
  fulfillment and needs to place/release a hold; the plain floor tier would have excluded them.

Plain bucket now ≈46 (was ≈54).

**Not verified by execution** — same as every entry in this thread.

## 6.16 Seventh reviewed batch: 5 system/integration config tables — `webhooks` gets its own,
     tighter tier — 9 Aug 2026

`0029_system_config_policies.sql`. `notification_templates`/`automation_rules`/`sms_gateways`
get `auth_is_staff()` read, `('Owner', 'Admin', 'Manager')` write — same shape as
`inventory_categories`/`suppliers` (0028). Two needed more care than a blanket config tier:

- `webhooks` holds a real secret (`secret_token`, the inbound-webhook signing secret). Nothing
  else in the row is useful to non-admin staff either, so instead of a `client_channel_identities`
  -style column mask (§6.12), the whole row gets a tighter tier: `('Owner', 'Admin')` only, no
  Manager — the narrowest tier of any table policed so far.
- `system_settings` already has its own `is_public`/`is_encrypted` boolean columns — the schema
  itself already states visibility is conditional per row, not uniform. The policy reads that
  column instead of overriding it: `using (is_public or auth_user_role() in ('Owner', 'Admin',
  'Manager'))`.

Plain bucket now ≈41 (was ≈46).

**Not verified by execution** — same as every entry in this thread.

## 6.17 Eighth reviewed batch: crew scheduling (4 of 5 siblings) + the document registry itself
     was still uncovered — 9 Aug 2026

`0030_crew_scheduling_and_document_registry_policies.sql`, two unrelated groups:

- **Crew scheduling** — `crew_skills`/`crew_shoot_days`/`crew_leaves` get
  `('Owner', 'Admin', 'Manager', 'Coordinator')` (desk/coordination data, not floor-scan work);
  `crew_equipment_assignments` adds Warehouse — it's floor equipment handout
  (`released_by` records who physically took gear back). The fifth sibling, `crew_documents`, is
  **not** included: it has `evidence_file_id not null references evidence_files (id)`, and
  `evidence_files` itself can't be created in a real deploy today (§4.11's `items` phantom-table
  bug reaches it via `matched_item_id`). Transitively blocked, not forgotten.
- **`document_registry`/`document_deliveries`** — the central document store that
  `booking_documents`/`client_tax_profiles`/`client_documents` (0024/0025) already reference, but
  which itself had zero policy the whole time — same class of gap as `products`' missing write
  policies (§6.14): a dependent got policed before the table it depends on. Mirrors
  `booking_documents_all`'s tier.

Plain bucket now ≈35 (was ≈41).

**Not verified by execution** — same as every entry in this thread.

## 6.18 Ninth reviewed batch: cleaning/reset + notifications/comms — a fourth phantom-table
     reference fixed, and the first real self-row-scoping policy — 9 Aug 2026

`0031_cleaning_and_comms_policies.sql`. Cleaning/reset floor tables (`cleaning_queue_entries`,
`cleaning_task_results`) mirror `operation_sessions_all`'s tier (0018); `category_checklist_tasks`
(the checklist *definition*, not a per-unit result) gets the tighter config tier instead — Warehouse
performs the checklist, doesn't define what's on it. Comms/log tables
(`message_logs`/`broadcast_batches`/`automation_logs`) get the general config tier;
`backup_logs` gets the narrow Owner/Admin-only tier `webhooks` (§6.16) established, for the same
reason — nothing in the row is useful to non-admin staff.

**A fourth phantom-table reference, found and fixed directly (not deferred like `items`):**
`category_checklist_tasks.category_id` declared `references categories (id)` —
`categories` was never a real table (confirmed by grep). Unlike `items` (§4.11), this one has
exactly one plausible target: `inventory_categories`, the only category-shaped table in the
schema, already created earlier in the same file. Fixed the same mechanical way
`assets`→`product_units`/`documents`→`document_registry` were in §4.10 — inline reference
removed from `0003_operations.sql`, deferred `alter table ... add constraint ... foreign key`
added to `0004_inventory.sql`'s existing cross-file-FK section, right after
`inventory_categories` is created.

**`notifications` is the first table in this whole thread to actually need self-row-scoping** —
flagged as a future need back in §6.10 for `timesheets`/`signatures`, never implemented until
now. Each row is one person's notification; a blanket `auth_is_staff()` read (the default
everywhere else in this thread) would let any staff session read every other user's
notifications. Reuses `users_select_own`'s exact self-lookup expression (0020) for SELECT/UPDATE,
plus an Owner/Admin oversight carve-out; INSERT stays broad (`auth_is_staff()`) since one
person's action routinely creates a notification for someone else. `timesheets`/`signatures`
still aren't done — this is the first instance of the pattern, not a retrofit of the other two.

Plain bucket now ≈24 (was ≈35 — cleaning-workflow and comms tables were a larger slice than
earlier batches, plus `category_checklist_tasks`' phantom-FK fix didn't change the count, it was
already counted).

**Not verified by execution** — same as every entry in this thread.

## 6.19 Tenth reviewed batch: 9 HR/misc operational tables — a fifth money-column sweep miss,
     and a correction to §6.10's own earlier assumption — 9 Aug 2026

`0032_hr_and_misc_operational_policies.sql`. `timesheets` gets the second real self-row-scoping
policy in this thread (after `notifications`, 0031) — self read/update, `('Owner', 'Admin',
'Manager')` oversight, self-only insert (you clock yourself in, nobody else). `override_records`
(gate-bypass audit trail) gets the tight `audit_settings`-style tier. `fulfillment_outcomes` and
`membership_limit_breaches` mirror their closest booking/client-tier precedent. `fiscal_periods`/
`expense_categories`/`shifts` get the general config tier. `vehicle_trip_logs` gets the role set
0014's dead `driver_read` policy always intended for this kind of table (its actual named target,
`vehicle_trips`, was itself a phantom name — `AUDIT_FINDINGS.md` P1 #1).

**`expense_reversals` excluded, moved to money-adjacent** — its `amount numeric(14,2)` column is
money, but the automated sweep never caught it: the column is bare `amount`, not `xxx_amount`, so
the suffix match on `_amount` never fired. Same underlying miss class as `fee_paid`/
`max_amount_limit` (§6.12) — different surface (prefix vs. suffix vs. bare word) each time,
worth remembering the sweep is a first-pass tool, not a source of truth.

**`signatures` corrected, not just newly policed.** §6.10 flagged it alongside `timesheets` as
needing self-row-scoping — reading its actual columns for this batch showed that was wrong: it's
evidence attached to an operation session (`session_id not null`), and `signer_name` is often a
*client's* name captured on a handover screen, not the acting staff member's. Whoever works that
session needs to see it, same as any other session artifact — mirrors `operation_sessions_all`'s
tier instead.

Plain bucket now ≈14 (was ≈24); money-adjacent bucket now ≈23 (was ≈22, `expense_reversals`
added).

**Not verified by execution** — same as every entry in this thread.

## 6.20 Eleventh batch closes the "plain" bucket entirely — `0033_fleet_bundle_and_sequence_
     policies.sql` — 9 Aug 2026

The running "≈N" counts through this thread were estimates, updated by arithmetic on each
batch rather than recomputed from source — worth not trusting further. Recomputed mechanically
instead: diffed every `create policy ... on <table>` statement actually written across
`0022`–`0032` against the original 92-table list. **32 remained, not ≈14.** Of those, 29 were
already correctly bucketed by prior entries — 22 money-adjacent, 1 PII-masking-adjacent
(`client_channel_identities`), 3 `portal_*`, 3 transitively blocked on the `items` decision
(`crew_documents`/`evidence_files`/`evidence_references`) — meaning the estimate drift was in
the arithmetic, not in any table being miscategorized.

The other **three were genuinely plain and simply never got a migration**: `number_sequences`
(corrected to "plain" back in §6.10, but the correction was never followed by an actual policy),
`vehicles` (the fleet master record `vehicle_trip_logs`, §6.19, already references — mirrors its
tier exactly, Driver included), and `bundle_items` (bundle composition, no money itself even
though `bundles` is money-adjacent — mirrors `product_compatibilities_all`, §6.14).
`0033_fleet_bundle_and_sequence_policies.sql` closes all three.

**With this migration, the "plain" bucket from §6.10's original categorisation is empty.**
What remains of the original 92-table gap is entirely the four deliberately-deferred buckets:
money-adjacent (~23, needs a `0019`-style masking review), PII-masking-adjacent (1), the
`portal_*` auth path (3), and `items`-blocked (3). PLAN.md's Phase 1 checklist RLS line stays
unchecked — role-only coverage for one bucket isn't the "role and branch and warehouse-zone and
approval limit" the checklist actually asks for, and three of the four remaining buckets are
still fully open.

**Not verified by execution** — same as every entry in this thread.

## 6.21 Twelfth batch: the incident-management chain + both crew-identity tables +
     two structural-config stragglers — `0034_incident_and_crew_profile_policies.sql` — 9 Aug 2026

Recomputed the remaining money-adjacent set the same mechanical way §6.20 did (diffed real
`create policy` statements against the 92-table list) before picking this batch, rather than
trust the running count — found **3 tables never named in any §6.x bucket at all**: `cases`,
`charges` (both from `0023_cases_charges.sql`, written for a different thread — §4.10's
deployment-blocker fix — that never cross-referenced this one), and `crew_profiles_v2` (has
`daily_rate`/`hourly_rate`, should have tripped §6.10's automated sweep at the rename but
apparently wasn't re-scanned after). All three folded into this batch.

**Two genuine "promise not kept" bugs closed.** `damage_findings` (0003) and `cases` (0023) each
carry their own migration's comment — *"TRIGGER REQUIRED (RLS): Warehouse sees no money columns
on this table"* — written the day the table was created and never implemented: `enable row
level security` with zero policies means **nobody could read either table at all**, not the
column-masked-but-visible row the comment describes. Both now get the `0019` view-masking
pattern (`damage_findings_v`, `cases_v`) — money columns null unless `auth_can_view_money()`,
every other column passes through. `charges` gets the *other* shape its own comment asks for
("Warehouse sees no rows at all... money by definition") — folded into `auth_can_view_money()`
as a blanket row-block, same shape as `0014`'s five-table loop.

**`crew_members` / `crew_profiles_v2` — both policed, neither merged.** §6.10 flagged
`crew_members` as blocked on `AUDIT_FINDINGS.md` P0 #4's "two conflicting `create table`
definitions" bug. Reading `0009`'s own header shows that bug was already fixed (renamed 0009's
version to `crew_profiles_v2` to resolve a literal name collision that broke every subsequent
migration) — but which of the two crew models is canonical was deliberately left unruled, a
separate `TODO(decision)` this migration does not touch. The technical blocker (collision) is
gone, so both tables get real access control as they stand today: staff-readable, Owner/Admin/
Manager for writes, pay-shaped columns (`day_rate`/`withholding_rate`/`internal_note` on
`crew_members`; `daily_rate`/`hourly_rate` on `crew_profiles_v2`) masked via view.

**`bank_accounts` and `user_approval_authorities` closed** — §6.10's original list, no money
column on either (account-number sensitivity and approval-limit metadata respectively), so both
get a role-tier policy rather than a view: `bank_accounts` mirrors the money-blind shape plus
Owner/Admin/Accounts for writes; `user_approval_authorities` gets the `audit_settings`/`branches`
structural-config tier (Owner/Admin/Manager, read and write both).

**Flagged, not invented:** `crew_profiles_v2`/`crew_members`'s pay columns use
`auth_can_view_money()`, the only money gate this thread has built at the DB level. The app
layer's own `src/lib/fieldGating.ts` gates crew pay stricter — `'asset-finance'` explicitly
excludes Coordinator too, not just the three floor roles (HIS v2.1 §4.1, "no crew pay"). No DB
function distinguishes that yet. Using the broader gate here is consistent with every other
money-adjacent table in this thread, not a claim it fully matches the app's rule — a real gap,
recorded rather than silently narrowed by inventing a new function unasked.

Money-adjacent bucket now **18 remaining** (was 25, counted exactly rather than "≈" — this
thread has already caught its own arithmetic drift twice, §6.19/§6.20): `accessories`,
`booking_crew_lines`, `booking_discounts`, `bundles`, `client_commercial_overrides`,
`client_memberships`, `coupon_redemptions`, `coupons`, `crew_assignments`, `crew_bookings`,
`depreciation_logs`, `expense_reversals`, `late_fee_findings`, `membership_plans`,
`purchase_requests`, `return_accessory_checks`, `tax_ledgers`, `vehicle_fuel_logs` — still
untouched. (`crew_assignments`/
`crew_bookings` are each one layer up from the two tables this batch just closed — natural next
batch.) PII-masking-adjacent (`client_channel_identities`, 1), `portal_*` (3), and
`items`-blocked (3) are unchanged.

**Not verified by execution** — same as every entry in this thread: no local Postgres instance,
nothing applied to either Supabase project, per `CLAUDE.md`'s hard rule.

## 6.22 Thirteenth batch: 3 mixed-row masks + 2 whole-row accounting tables —
     `0035_accessory_bundle_and_ledger_masking.sql` — 9 Aug 2026

Continues straight from §6.21's list of 18 untouched money-adjacent tables. Five closed here,
split by whether the row is actually mixed:

- **Mixed rows** (`accessories`, `bundles`, `late_fee_findings`) — same `0019`/§6.21 view-masking
  pattern: the operational columns (accessory name/qty, bundle code/name, a late-fee finding's
  band/overage) stay visible to every staff role; only the money columns
  (`replacement_cost`; `daily_rate`/`weekly_rate`; `day_rate_amount`/`fee_amount`) resolve to
  `NULL` unless `auth_can_view_money()`.
- **Not actually mixed** (`depreciation_logs`, `tax_ledgers`) — checked column by column before
  assuming a view was needed. Every column in both is either a money figure itself or pure
  accounting metadata (fiscal year, depreciation method, tax direction, PAN/VAT number) with no
  floor use at all. Building a masking view for a row with nothing worth un-masking would be
  ceremony, not protection — gave both a whole-row `auth_can_view_money()` gate instead, the same
  shape §6.21 used for `bank_accounts`, with the same `('Owner', 'Admin', 'Accounts')`
  finance-function write tier rather than the general config tier, since this is accounting
  output, not something Coordinator/Manager configure.

Money-adjacent bucket now **13 remaining**: `booking_crew_lines`, `booking_discounts`,
`client_commercial_overrides`, `client_memberships`, `coupon_redemptions`, `coupons`,
`crew_assignments`, `crew_bookings`, `expense_reversals`, `membership_plans`,
`purchase_requests`, `return_accessory_checks`, `vehicle_fuel_logs`. PII-masking-adjacent (1),
`portal_*` (3), and `items`-blocked (3) unchanged.

**Not verified by execution** — same as every entry in this thread.

## 6.23 Fourteenth batch: crew-booking trio + booking_discounts + vehicle/purchase
     mixed rows — `0036_crew_booking_and_vehicle_expense_policies.sql` — 9 Aug 2026

Closes 7 of §6.22's 13 remaining: `crew_bookings`, `crew_assignments`, `booking_crew_lines`
(three separate "a crew member costs money on a booking" tables — the first two are the two
halves of 0009's still-open crew-model duplication, §6.21; the third is bookings' own inline
crew-charge line, unrelated to either crew-identity table — each masks its own rate columns
independently), `booking_discounts` (whole-row gate, every column is approval/finance metadata
with no floor use — same reasoning §6.22 used for `depreciation_logs`/`tax_ledgers`, but the
write tier stays the broad `auth_can_view_money()` rather than narrowed to Accounts-only, since
Coordinator legitimately applies discounts per `lib/money.ts`'s `discountGate()`), and
`vehicle_fuel_logs`/`purchase_requests` (ordinary mixed-row masks).

**A real column-list miss caught before commit, not after:** first draft of `vehicle_fuel_logs_v`
was written from an incomplete read of the source table (the read window cut off mid-table) and
silently dropped `branch_id`/`recorded_by` — a view missing columns that exist on the base table
doesn't error, it just quietly hides them from every session, including sessions that need them.
Caught by a second, deliberate full-table read before finalizing, not by any tooling. Worth
naming as a reminder for whoever writes the next batch: a masking view is only as correct as the
column list was read completely, and Postgres will not tell you if it wasn't.

**`return_accessory_checks` exposes a real gap, flagged rather than half-built.** Its own column
comment asks for `replacement_cost` to be writable by Owner/Manager/Accounts only — a
column-level WRITE restricted to a role *subset*. Plain `revoke`/`grant` can't express that here:
the actual Postgres connection role is uniformly `authenticated`, with the real business role
looked up per-row from `users.primary_role`, and column GRANTs are static, not row-aware. That
needs a `BEFORE INSERT/UPDATE` trigger, which does not exist. `TRIGGER REQUIRED` note left in the
migration rather than either building a trigger unasked or leaving the gap unstated.

Money-adjacent bucket now **6 remaining**: `client_commercial_overrides`, `client_memberships`,
`coupon_redemptions`, `coupons`, `expense_reversals`, `membership_plans`. All six are
client/commercial-facing (memberships, coupons, commercial overrides) — a coherent last batch.
PII-masking-adjacent (`client_channel_identities`, 1), `portal_*` (3), and `items`-blocked (3)
unchanged.

**Not verified by execution** — same as every entry in this thread: no local Postgres instance,
nothing applied to either Supabase project, per `CLAUDE.md`'s hard rule.

## 6.24 Fifteenth batch — **the money-adjacent bucket is now empty** —
     `0037_client_commercial_and_coupon_policies.sql` — 9 Aug 2026

Closes the final six from §6.23's list. Found something better than a re-derivation this time:
`0005_clients.sql` already carries an authoritative, never-implemented design comment (lines
~1032-1051, "WAREHOUSE SEES NO MONEY... Emitted here as the required column-level revokes")
naming the exact columns to mask on `membership_plans` (`annual_fee`,
`individual_discount_pct`, `bundle_discount_pct`, `default_credit_limit`) and
`client_memberships` (`fee_paid` only), and naming `client_commercial_overrides` as a whole-
table gate. Used verbatim rather than re-derived from scratch — the schema had already done
this analysis once, back when the table was designed; this migration is the first time it was
actually wired up.

That same comment also states "Approve on `client_commercial_overrides` is Owner/Manager only",
narrower than the general read/create gate. Unlike `0036`'s `return_accessory_checks` gap (a
column-*subset* write restriction, which genuinely needs a trigger because Postgres column
GRANTs are static and not row-aware), this one is a restriction on a single *proposed value* —
`status` transitioning to `'Approved'` — which a `with check` clause evaluates directly against
the incoming row. Implemented as a real policy, not flagged: any money-visible role may create
or edit a Pending request, only Owner/Admin/Manager may set `status = 'Approved'`. Worth naming
the distinction for whoever hits a similar-looking case next — "needs a trigger" and "needs a
smarter `with check`" look the same at first read and are not the same fix.

`expense_reversals`, `coupons`, `coupon_redemptions` weren't named in that comment (it's scoped
to the client domain; these three are finance/booking domain) but read the same way on
inspection — no column in any of the three has floor use — so each got the whole-row
`auth_can_view_money()` shape §6.22 established.

**With this migration, the money-adjacent bucket from §6.10's original 92-table categorisation
is empty.** Combined with §6.20 closing "plain," what remains of the original gap is entirely
three buckets none of which are a role-tier RLS policy in the shape this whole thread (§6.10-
§6.24, fifteen migrations, `0022`-`0037`) has been writing:

1. **PII-masking-adjacent (1 table):** `client_channel_identities` — flagged since §6.12 as
   needing a column-mask *view*, same mechanism as everywhere in this thread, just never picked
   up. Likely a one-migration close for whoever takes it next.
2. **`portal_*` auth path (3 tables):** `portal_users`, `portal_sessions`,
   `portal_auth_challenges` — not `system_role`-based at all; needs its own scheme design
   (flagged since §6.8), a genuinely different piece of work, not a batch of this shape.
3. **`items`-blocked (3 tables):** `crew_documents`, `evidence_files`, `evidence_references` —
   transitively blocked on the still-open `items` phantom-table `TODO(decision)` (§4.11): what
   `product_units`/`products`/`items` should mean in three FK columns that currently reference a
   table that was never created. Not a permissions question; a schema-modeling one.

None of the three is "the next RLS batch" in the sense the last fifteen entries have meant it —
each needs its own kind of work before a policy on it would mean anything. Phase 1's checklist
RLS line still can't be checked off regardless: role-only coverage, however complete, isn't the
"role and branch and warehouse-zone and approval limit" the checklist actually asks for (§6.20
already noted this; still true).

## 6.25 §6.24 was wrong that only three buckets remained — the design comment it used covers
     more ground than either batch that read it used — `0038_client_money_masking_corrections.sql`
     — 9 Aug 2026

`0005_clients.sql`'s "WAREHOUSE SEES NO MONEY" comment (§6.24) names six items, not three —
`0037` used the three in its own batch's scope (`membership_plans`, `client_memberships`,
`client_commercial_overrides`) and correctly declared the money-adjacent *bucket* empty on that
basis. But the comment also names `clients` itself, `client_documents`, `client_tax_profiles`,
and a `client_flags`/`client_merges` restriction — reading the comment's full six-item scope
instead of the three relevant to one migration surfaces real, already-shipped bugs:

- **`clients` was never masked at all.** It's been `auth_is_staff()`-readable since `0020`, one
  of the original 19 tables this whole thread started counting from — predating every batch in
  it, so it was never flagged as a gap because it was never counted as uncovered.
  `approved_credit_limit`/`payment_terms` had zero column-level protection until this migration.
- **`client_documents` and `client_tax_profiles` are worse: this thread's own `0025` gave them
  the wrong shape**, not just an unfilled gap. `0025` mirrored the generic `clients`-child tier
  (staff-broad read, `Coordinator`/`Warehouse`-inclusive write) onto both — directly
  contradicting this comment, which names `client_documents` "Owner / Manager / Billing only"
  and lists `client_tax_profiles` as a whole-table money-blind gate. A real over-permission bug
  in already-committed work, caught five entries later by re-reading a comment that was sitting
  in the same file the whole time.
- **`client_flags`/`client_merges` also inherited the wrong tier from `0025`** — the comment
  states "Rental Coordinator may see money but may not Block (`client_flags`) or Merge
  (`client_merges`)", which `0025`'s blanket `Coordinator`-inclusive tier for both tables
  violates. Corrected with a value-conditional `with check` on `client_flags` (only the
  `'Blocked'` flag value is restricted — VIP/Upgrade Candidate are unaffected) and a tightened
  `client_merges` tier (Owner/Admin/Manager only).

**A role-name mistake caught before it shipped, not after.** The comment's "Owner / Manager /
Billing only" for `client_documents` was nearly implemented as `('Owner', 'Admin', 'Manager',
'Accounts')` — treating "Billing" as a synonym for the schema's `Accounts` role. Grepped
`0013_business_8_roles.sql` before committing to that instead of assuming: it renames
`'Billing'` to `'Coordinator'` specifically (`alter type system_role rename value 'Billing' to
'Coordinator'`) — a completely different label from `Accounts`, which was never called
"Billing" at any point. Would have been a self-inflicted version of the exact
`inventory_units`/`categories`/`items` phantom-name mistake this thread has spent five entries
catching in *other* people's migrations. Fixed to `Coordinator` before commit.

**A column-list omission caught the same way `0036` caught its own** (that entry's own note:
"a masking view is only as correct as the column list was read completely, and Postgres will
not tell you if it wasn't"). First draft of `clients_v` was written from a read that stopped at
`deactivation_reason`, silently dropping `merged_into_client_id`, `portal_default_language`,
`created_at`, `created_by`, `updated_at` — a `create table` block that runs past what one`Read`
call returns is exactly the trap `0036` named. Caught by re-reading the full table definition
through its closing `)` before finalizing, not by any tooling.

**Money-adjacent bucket note revised:** §6.24's "empty" claim stands for the 92-table
categorisation it was tracking, but that categorisation never included `clients` (already
"covered" from turn one) — so `clients` masking was a real gap this thread's own accounting
structurally couldn't see. Worth remembering for whoever audits this thread's completeness
later: "empty bucket" describes the tracked list, not a guarantee every table with money in it
has been checked.

**Not verified by execution** — same as every entry in this thread.

**Not verified by execution** — same as every entry in this thread: no local Postgres instance,
nothing applied to either Supabase project, per `CLAUDE.md`'s hard rule.

## 6.26 Sixteenth batch closes the PII-masking-adjacent bucket — `0039_client_channel_
     identity_masking.sql` — 10 Aug 2026

Picked up the one bucket §6.25 explicitly called "likely a one-migration close for whoever
takes it next": `client_channel_identities`, excluded from `0025`'s clients-child batch back in
§6.12 because its own column comment ("`address` ... masked to last four for every role below
Manager/Accounts") needs a column-masking view, not a plain row policy.

**Deliberately a different mask shape than every prior view in this thread, on purpose, not by
accident.** `0019`/`0021`/`0034`-`0038` all follow Foundation §8.3 — a gated money column
resolves to `NULL`, "the field is absent, not masked-and-shown." This table's own comment asks
for a *partial* reveal instead (last four characters) — a different, already-written
requirement, not money and not this thread inventing a new masking style. Implemented as
`'•••• ' || right(address, 4)` for every role below the four named.

**"Manager/Accounts" has exactly one precedent in this schema, reused rather than invented:**
`0018`'s `payment_reversals_select` is the only existing policy gating precisely
`('Owner', 'Admin', 'Manager', 'Accounts')` — no named function covers this four-role set
(`auth_can_view_money()` is money-specific and includes Coordinator, which this comment does not
ask for), so the check is inline, same as `0018`'s own precedent, not a new function for one
column in one table.

Row visibility and the write tier are otherwise unchanged from what this table would have
gotten in `0025` — `auth_is_staff()` read, `('Owner', 'Admin', 'Manager', 'Coordinator',
'Warehouse')` write — the mask is a column concern layered on top, not a different row policy.

**With this migration, all three of §6.25's remaining buckets have exactly one left standing.**
Status of the three:

1. ✅ **PII-masking-adjacent — closed.** `client_channel_identities` was the only table in it.
2. ⬜ **`portal_*` auth path (3 tables)** — `portal_users`, `portal_sessions`,
   `portal_auth_challenges`. Still needs its own non-`system_role` auth scheme design, not a
   batch of this shape. Unstarted.
3. ⬜→**unblocked, not yet closed** (see §6.27) — **`crew_documents`, `evidence_files`,
   `evidence_references`**. §4.11's `items` question is resolved as of §6.27, so these three can
   now be created in a real deploy; they still have zero RLS policies written for them, which is
   real work still to do, just no longer blocked on a schema-modeling question.

Neither remaining bucket is "the next RLS batch" in the sixteen-migration sense §6.10-§6.26 has
meant it. Phase 1's checklist RLS line still can't be checked off regardless — role-only
coverage, however complete now, still isn't the "role and branch and warehouse-zone and
approval limit" the checklist itself asks for (§6.20/§6.24 already noted this; still true), and
the branch/zone/approval dimension itself remains entirely unbuilt (§6.9).

**Not verified by execution** — same as every entry in this thread: no local Postgres instance,
nothing applied to either Supabase project, per `CLAUDE.md`'s hard rule.

## 6.27 Full exhaustive phantom-table sweep across all 39 migrations, 10 Aug 2026 — §4.11
     resolved, two more real bugs of the same class found, one fixed and one flagged

User asked to make the app actually persist data ("any how"), which meant, for the first time in
this thread, actually attempting `apply_migration` against the real (paused) `sxguwvgoserhdolewibb`
project rather than writing another unapplied file. Blocked immediately by the harness's own
permission classifier on `restore_project` (waking the paused project) — a tool-level guard, not a
Supabase error, and not something to route around. While that's pending the user's decision, used
the time to make sure the 39-migration chain will actually apply cleanly in one pass once it *can*
run, rather than fail partway through and need this same discovery process live against a real
database.

**Method: mechanical, not agent-judgment, for the detection step.** Extracted every
`create table <name>` (114 real tables) and every `references <name> (` target (58 distinct names)
across all 39 files with a plain `grep`/`sort`/`comm` diff — anything referenced but never created.
This is the same bug class §4.10/§4.11/§6.13/§6.18 have each found piecemeal, one migration-read at
a time; running it exhaustively in one pass, mechanically, is what should have caught all of them
together from the start. Judgment is still needed for *what a match means* — same as every prior
fix in this class — just not for finding the candidates.

**Confirmed `items` (§4.11) is now fully resolved** — the sweep no longer finds it as a live SQL
statement, only as prose inside comments explaining the fix (expected, harmless).

**Two more real, previously-uncaught phantom references, both in `0003_operations.sql`:**

- **`crew_bookings.production_id references productions (id)`** — `productions` has never been a
  real table anywhere in this schema, and unlike every phantom-name bug fixed so far, there is no
  existing real table this obviously renames to. Read `04 Operations/Crew Booking.md` (the older
  spec version, superseded by this session's own Crew Booking v3.2 rebuild — PLAN.md §4.12) to
  check: it describes "Production" as its own real, never-built entity ("Crew lives inside a
  Production record as a tab... `Productions ▸ [production] ▸ Crew`"), and `src/data/crew.ts`'s
  own `production: string` field is free text today, not a relation, for the same reason. This is
  genuinely unbuilt, not a phantom rename — per `CLAUDE.md`'s hard rule, not invented here. Fixed
  the deployment blocker without inventing the entity: the inline FK is removed, the column stays
  a plain nullable `uuid` stub with a comment naming exactly why, and a fresh `TODO(decision)`
  (design `productions` before this can be a real FK).
- **`fulfillment_outcomes.sub_rental_id references sub_rentals (id)`** — also never a real table,
  but *this* one has an obvious, evidenced target: `booking_lines.line_type = 'Sub-rental'`
  (`0002_bookings.sql`) already carries `supplier_cost`/`markup_amount`, and this column's own
  comment — "the sub-rental that covered the gap. **Its cost** is a Profitability input" — matches
  those two columns exactly. Repointed to `booking_lines (id)`, no forward-reference needed since
  `booking_lines` (`0002`) is created before `0003` runs.

**Re-ran the sweep after both fixes: zero real phantom references remain** in any of the 39 files
— every remaining `comm` hit is either prose inside a comment or `products`/`booking_lines`/etc.
column-level noise, individually confirmed. As far as static analysis can tell without an actual
Postgres instance to run it against, **the full migration chain should now apply in order without
aborting on a missing relation** — the first time this thread has been able to say that about the
whole chain at once, not just the specific migrations each entry happened to touch.

**Still not the same as verified.** No local Postgres instance exists, and nothing has been applied
to either Supabase project — this sweep only proves the *shape* is consistent, not that every
`CHECK`, trigger, or `DEFAULT` expression is itself valid Postgres. The real test is still the
first actual `apply_migration` run, whenever the paused project is available.

**~~Open TODO(decision), new:~~ ✅ DISSOLVED 12 Aug 2026 — see §4.21.** What `productions` should be
(its own table? a view over `crew_bookings`/`bookings` grouped by client+date-range?) no longer
needs an answer: `04_RENTALS.md` line 3 removes Productions from the product in prose, so there is
no entity left to design. The nullable `uuid` stub column stays; the UI, the two seed files and the
tab are deleted.

## 6.28 FIRST REAL APPLY — the chain's numeric order never matched its dependency order;
     196 forward FKs mechanically deferred — 10 Aug 2026

User approved going live ("MAKE THE APP WORKING ANY HOW" → real backend; "REMOVE BAKERY DATA FOR
NOW 2 BABINDULAL" → target `sxguwvgoserhdolewibb` per §4.8). Sequence of real, applied-to-a-live-
project actions, each a first for this repo:

1. **Woke the paused project** (`restore_project`), found it NOT empty: a live 20-table bakery
   POS schema (cake_orders, recipes, staff_users, sales…) sat on `public` — the project the user
   picked by name turned out to hold the *other* business's data, opposite of what §4.8 assumed.
   Stopped and asked rather than overwrite; user said remove it. Honoured **non-destructively**:
   all 20 tables moved to a `bakery_archive` schema (API grants revoked), not dropped — "for
   now" reads as "recoverable", and the hard `DROP` was repeatedly blocked by the harness's own
   permission classifier anyway. `public` cleared, data intact.
2. **Pre-flight caught a seed bug the FK sweep structurally couldn't see:** `0012` §8 inserted
   into `equipment_categories` — a table that never existed (real: `inventory_categories`, whose
   `name` is the `product_category` ENUM and whose slug column is `code`). Same phantom-name bug
   class as §4.10/§4.11/§6.27, but on an INSERT target. Fixed: remapped to the enum's own locked
   labels, "Grip & Support" split into the enum's two distinct labels. Also verified every seed
   `on conflict` target has a matching unique constraint, and the `users` seed's column list
   matches `0007`'s real table — all clean.
3. **First apply run: `0001` landed, `0002` failed** — `relation "branches" does not exist`.
   The real lesson: §6.27's sweep only caught references to tables that *never* exist; it could
   not see references to tables created *later in the numeric sequence*. The chain was written
   as if order didn't matter — `0002` references `users`/`branches`/`clients` (created in
   `0007`/`0005`), and nothing ever caught it because the chain had never actually been run.
   **Mechanical count: 196 forward references across `0002`-`0007`** (37/53/52/20/28/6 per
   file), all inline column FKs, zero constraint-level, zero `on delete` clauses.
4. **Fixed by scaling the schema's own §4.10 pattern, mechanically:** a Node script
   (scratchpad, `fkanalyze.mjs`) stripped each forward `references X (id)` clause in place
   (bare column + marker comment stays at the declaration site) and generated
   `0042_deferred_cross_file_fks.sql` adding all 196 back as `alter table` constraints at the
   end of the chain, when every target exists. Net schema on an empty database is identical —
   only the attach moment moved. Re-ran the analyzer after: **zero forward references remain in
   all 42 files.** Comment-text hits are excluded by design (the §6.27 false-positive lesson).
5. **`0041_supabase_auth_bridge.sql` written** (new, this session): every auth-aware expression
   in the schema reads `current_setting('app.current_user_id')` — unreachable from a browser
   Supabase client, so as-applied the whole RLS layer would resolve everyone to the `Client`
   fallback and deny all staff reads (the §6.8 silent-outage shape, one link further out).
   Bridge: a PostgREST `db_pre_request` hook sets that GUC from `auth.uid()` on every API
   request — zero function bodies or policies rewritten, one definition to audit. Plus a
   bootstrap `auth.users`/`auth.identities` pair for `0012`'s seeded Owner (auth id == staff id
   `…101`, the identity contract), with a TEMPORARY password flagged for immediate rotation.
   `portal_*` (Client-side) auth remains its own open scheme — unchanged, still deferred.

Second apply run (0002-0042, 8 sequential batches, stop-on-first-error) is in flight as this
entry is written; its outcome gets its own PROGRESS.md entry. `.env.local` now carries the
project URL + anon key (gitignored; anon key only, per Platform Build Instructions §7).

**OUTCOME (added 11 Aug 2026 — the in-flight run above finished; this paragraph exists because
its absence made two later audits re-derive "the chain has never executed"): the chain landed.**
PROGRESS.md's "GO-LIVE: all 42 migrations applied" entry (10 Aug) is the full record — three
further stop-on-error failures fixed at source (`0018` unguarded `drop policy`, `0023` duplicate
case enums, `0041` restructured to drop a cleartext bootstrap password), then verified by driving
the live REST API, not by reading SQL. Re-confirmed independently 11 Aug by a read-only
`list_migrations`/`list_tables` on `sxguwvgoserhdolewibb`: **43 migration rows**
(`archive_bakery_pos_schema` + `0001`-`0042`, none missing, none out of order) and **121 tables in
`public`, every one `rls_enabled`**, with the seeded counts alive (`users` 4, `number_sequences` 7,
`branches`/`warehouses`/`bank_accounts` 2 each, `storage_zones` 3, `inventory_categories` 6,
`expense_categories` 4, `fiscal_periods` 1). This also supersedes §6.29's closing "`0040` is a
**local file only** — confirmed unapplied": `0040_booqable_sync` is applied, and its seven sync
tables are present. The only local-and-unapplied migration is now `0043`.

## 6.29 Booqable bridge scaffold built to spec v1.0 — 14 artifacts, orchestrated —
     10 Aug 2026

BOOQABLE INTEGRATION SPEC v1.0 (see §4.13 for what it leaves open) built as a 20-agent workflow:
migration → types/client → 7 parallel domain mappers → sync/conflicts orchestration → 2 parallel
Edge Functions → `dataAccess` seam → 5-way adversarial verify → targeted fix pass.

**What exists now:** `supabase/migrations/0040_booqable_sync.sql` (7 tables: `external_refs`,
`sync_state`, `sync_inbox`, `sync_outbox`, `sync_conflicts`, `sync_log`, `external_invoices`) ·
`src/lib/booqable/{types,client,sync,conflicts}.ts` + `map/{products,stock,clients,orders,
documents,payments,availability}.ts` · `supabase/functions/booqable-{proxy,webhook}/index.ts` ·
an additive source switch in `dataAccess.ts` that leaves `idempotentInsert`/`safeUpdate`
signatures and the `immutableTables` guard untouched, so no screen or engine changed.

**The spec's own draft DDL carried this project's most-repeated bug, and it was caught rather
than copied.** §6's SQL enables RLS on all 7 tables but supplies a policy for only 3 —
`external_refs`/`sync_state`/`sync_inbox`/`sync_outbox` would have shipped RLS-enabled with zero
policies: fail-closed, unreadable by anyone. That is precisely the shape §6.9 found on 92 tables
and §6.10–§6.26 spent seventeen migrations closing. Policies added for all four, with the
reasoning recorded in the migration: the Edge Functions write these as `service_role` (which
bypasses RLS by Postgres design), so the added policies exist so Owner/Admin can *inspect* queue
state, not to permit the sync writes.

**Law 5, the spec's own "highest-risk mapping", got two independent adversarial reviewers.** Both
found real defects in the first draft of the classifier, and both were fixed:

- `ORDINARY_PAYMENT_TYPE_SIGNALS` had contained payment **method** labels — `cash`, `card`,
  `bank transfer`. A security deposit is exactly as likely to be paid by cash as a rental payment
  is, so a deposit would have matched a method string and been routed **confidently into
  `payments`** — money held in trust booked as revenue, the exact corruption Law 5 exists to
  prevent. Removed.
- Bare `refund` had counted as a confident ordinary payment; it describes money *direction*, not
  category, and a deposit *release* is refund-shaped. Removed — now falls through to held.
- **Fixed in review, not by an agent:** bare `deposit` was still a confident *deposit* signal.
  In rental businesses "booking deposit" very commonly means an advance payment — ordinary
  revenue. Every other member of that set qualifies the word (`security deposit`, `sec deposit`);
  the bare form does not, and fact 4 does not say which sense Booqable uses. Now falls through to
  held. This is the mirror-image error of the one above, and the same rule settles both:
  **a held row is recoverable, a misfiled one is not.**

The classifier is genuinely three-way. `ambiguous` is a first-class result, not an error branch:
`PaymentsPullResult.held` is a distinct array, and `sync.ts` persists each held row as a
`sync_conflicts` row (`field='payment_classification'`) carrying booking, raw type, method,
amount and reason — enough for a human to classify, and in **neither** money table meanwhile.
The file's own comment is honest that no dedicated review-queue table exists yet; `sync_conflicts`
is the interim home.

**A Law 9 idempotency defect the reviewers caught that no test would have.** The pull path wrote
`payments`/`deposit_movements`/`security_deposits` without `client_uuid`, and `idempotentInsert`
mints a fresh random one when the field is absent — so the nightly reconciliation (§12.6), which
re-fetches everything by design, would have **duplicated every payment row on every run**. Fixed
with `deterministicClientUuid(table, key)`: a UUIDv5-shaped digest of `booqable:<table>:<key>`,
so the same Booqable-side fact always resolves to the same key and re-pulls land on
`idempotentInsert`'s existing `23505` dedup path instead of inserting again. Reuses the dedup
machinery the whole app already has rather than building a second one.

**Law 17 came out clean, with one correct refusal.** After the fix pass, `customer` appears in
exactly one file outside `types.ts`: `map/orders.ts`'s `DeliveryType`, because `'Customer Pickup'`
is a real `delivery_type` enum member in `0001_enums.sql` (lines 34, 280) that this mapper writes
to a live enum column. Renaming it locally would desync the type from what the column accepts —
a correctness regression, not a Law 17 fix. The agent refused and left a `TODO(decision)`; that
matches `AUDIT_FINDINGS.md` P3's own read, which already flagged this enum as needing a
coordinated schema-wide rename.

**Three findings recorded rather than fixed**, because each is a real limitation, not a defect:
`sync_state` is created but never read or written — cursor-based incremental sync is not built,
only full pull, so the table is schema-correct and functionally dead this pass; the spec's §8.1
target tables don't exist in this schema (§4.13); and `products.asset_code`'s `^EQ[0-9]{6}$`
CHECK means a raw Booqable SKU can't be written into it, so `sync.ts` must mint a code via
`next_document_number('EQ')` — threaded as caller-supplied context, never invented in a mapper.

**Verified:** `npx tsc --noEmit` exits **0** across the whole project (run twice — the first run
surfaced two errors in `SmsCenter.tsx` that were a concurrent session mid-save on its own Law 17
rename, not this work; clean on re-run once that settled). No Booqable secret reaches `src/`:
`BOOQABLE_TOKEN`/`BOOQABLE_SLUG` are read only via `Deno.env.get` in the two Edge Functions, and
the only `src/` mentions are explanatory comments. No `service_role` key is referenced in any
browser-reachable file.

**Not verified, and cannot be here:** nothing was run against a live Booqable API — no account,
no token, no slug exist in this environment, so every one of §4.13's six facts stays unconfirmed
and the spec's P0–P5 acceptance checks (which all require real data) are untouched. `0040` is a
**local file only** — confirmed unapplied: `list_migrations` on `sxguwvgoserhdolewibb` shows only
`0001`/`0002` plus the bakery archive, and the sync tables do not exist in the live project.
Applying it needs the same explicit approval §6.28's chain got.

*(Superseded same-day on one point: §6.29 wrote "every one of §4.13's six facts stays
unconfirmed" because live-API access is absent — but the spec's §3.2 actually says to confirm
against the public docs site, which needs no account. §6.30 did exactly that.)*

## 6.30 §3.2 fact-verification pass against the official public docs — 4½ of 6 confirmed,
     the scaffold corrected where the docs disagreed — 10 Aug 2026

The six §3.2 facts were researched against `developers.booqable.com` (public, no account
needed — the spec's own instruction) by six parallel research agents, each answer requiring a
source URL; then one apply agent updated the scaffold only where facts were CONFIRMED, and an
independent verify agent re-checked the result. Scorecard in §4.13. What changed in code:

- **`types.ts`** — `UNCONFIRMED_BOOQABLE_FACTS` rewritten per fact (confirmed entries carry
  exact values + source URLs + date; fact 2 recorded as "verified undocumented"; fact 6 keeps
  its one open sandbox question). `BooqableOrderStatus` corrected (`concept`→`draft`, +
  `canceled`); orders gained `statuses[]`/`status_counts` + the full documented deposit block;
  payments rewritten to the polymorphic three-type shape with the `amount/deposit/total`
  split; Customer rewritten (no phone/address/tax columns — `properties` hash + separate
  Properties resources); StockItem's real status enum; new `BooqableBarcode` and
  `BooqableDepositHold` resources; pagination meta/links narrowed to what is actually
  documented.
- **`map/payments.ts`** — the Law 5 classifier rebuilt on the DOCUMENTED mechanism: deposit =
  the `deposit_in_cents` dimension, not a payment kind. Pure-deposit charge → deposit ledger;
  amount-only charge → revenue (unless the `SECURITY DEPOSIT` method-name secondary signal
  fires — the spec's own configured fallback, kept); **mixed records (both portions > 0) are
  held whole** — the docs require a two-row split this mapper cannot express yet,
  `TODO(decision)`, and holding beats half-filing; deposit-carrying refunds held (a trust
  *release* has no inbound mechanism — 'Released' movements are OS-side per §5.2);
  authorizations never classified as cash. The guessed `payment_type` signal-string sets are
  deleted along with the nonexistent attribute they matched. Post-verify hardening (caught by
  the verify agent, fixed by hand): a record violating the documented `total = amount +
  deposit` invariant (both portions 0, total > 0) now holds instead of booking a 0-amount
  revenue row.
- **`map/orders.ts`** — status map keys off the corrected enum; `draft`→Quote; **`canceled`
  deliberately unmapped** (frees inventory, blocks booking — not `archived`): imports log a
  conflict and skip, `TODO(decision)` for the local lifecycle answer. Branch resolution now
  uses the documented `start_location_id`.
- **`client.ts`** — pagination pinned to the single documented style (`page[number]/page[size]`,
  no cursor, no `links.next` — stop on short page); the two-style config flag removed.
- **`booqable-webhook/index.ts`** — the HMAC placeholder REPLACED, not filled in: v4 webhooks
  are documented-unsigned (no secret exists to verify), so the function now implements the
  honest model — record trust status per row, rely on the worker's re-fetch-by-id as the real
  boundary, `GET /api/4/webhooks/{id}` as the subscription-verification fallback. Event
  subscriptions corrected to the documented 45-event enum (`order.created` does not exist).
- **`booqable-proxy/index.ts`** — 429 handling annotated with fact 2's verified-undocumented
  status: conservative defaults, no header dependence, log headers on first real 429.

**Verified:** `tsc --noEmit` exit 0 (three runs: apply agent, verify agent, and once more by
hand after the invariant-guard fix). Law 17 unchanged — the only code occurrence of the banned
word outside `types.ts` is still `map/orders.ts`'s justified `DeliveryType` enum. The verify
agent confirmed the held/ambiguous path survived the rebuild as a first-class outcome with no
default-to-`payments` branch anywhere.

**Still open after this pass:** fact 2 (genuinely undocumented — needs a live 429 to observe),
fact 6's one sandbox call (GET-by-id after archive), the mixed-payment two-row split, the
`canceled`→local-stage decision, and everything §4.13's product-items list already carried
(secrets not set; consumables-ledger timing; the hybrid crew/ops seam).

## 6.31 The three buildable gaps closed — and the pass found the transport layer had
     never worked at all — 10 Aug 2026

Set out to close the three items §6.30 left buildable. Closed all three, and the adversarial
verify turned up **21 findings, several of which were pre-existing defects that would have made
the bridge fail completely on first contact with a real account.** The scaffold typechecked
cleanly through all of it — none of this was visible to a compiler.

**The three intended fixes:**

1. **Client import unblocked.** `clients.phone` is `NOT NULL UNIQUE` with a
   `^\+977(97|98)[0-9]{8}$` CHECK, and fact-0 confirmed the Booqable client resource has no
   phone column — it lives in separate `Properties` resources. The mapper was guessing
   account-configured identifier strings, so on any account not using the default key, **every
   client would fail to import** (and clients gate orders, so P2 with it). Now resolves phone by
   the documented closed `property_type` enum first (identifier-matching only as fallback, since
   a phone may legitimately be modelled as a `text_field`), grouped by `owner_id` with
   `owner_type` filtering — a polymorphic Property belonging to an *order* must never become a
   client's phone. Unresolvable/unnormalisable/colliding phones still conflict-and-skip; **no
   client is ever inserted with a fabricated phone**.
2. **Mixed payments now split.** Fact 4 confirmed a single charge is legally part-revenue,
   part-trust. A fourth classification `'mixed'` was added *inside* `classifyBooqablePayment`
   rather than splitting above it — deliberately, because the file's own rule is that one
   function makes the revenue-vs-trust call and nowhere else. Amount portion → `payments`,
   deposit portion → the trust ledger, never the total in either, with the documented
   `total = amount + deposit` invariant asserted before any split.
3. **`canceled` orders mapped** to the schema's own existing cancellation dimension
   (`cancelled_at`/`cancelled_by`/`cancellation_reason`, governed by
   `bookings_cancelled_requires_actor_and_reason`) rather than a new mechanism. The reason
   string is honest about provenance — it states Booqable's API carries no cancellation reason —
   and `cancelled_by` is threaded from context with no hardcoded uuid; if the actor cannot be
   resolved the record holds rather than violating the CHECK.

**What the verify pass found that nobody was looking for:**

- 🔴 **The proxy transport never worked.** `client.ts` invoked the Edge Function with `POST` and
  put `{path, method, query}` in the JSON body; the proxy routes on `url.pathname`,
  `req.method` and `url.search` and never reads that body. **Every call would have hit the
  function root with no path.** Compounded by a second mismatch: the client expected a
  `{status, ok, body}` envelope while the proxy returned Booqable's body raw at Booqable's own
  status, so even a success would have thrown. Both fixed — the client now carries path+query
  in the invoke URL (mechanism verified against `@supabase/functions-js`' actual source, not
  assumed) and the proxy routes *every* return path through one `envelopeResponse` helper,
  including the pre-`try` config-sanity 500 that the finding hadn't listed.
- 🔴 **A path-vocabulary mismatch would have 403'd the clients pull** even after the transport
  fix: `sync.ts` requested the wire name `customers`, but the allowlist deliberately registers
  the OS vocabulary `clients` and translates server-side in `toBooqablePath`. Fixed on the
  `sync.ts` side, keeping Law 17's boundary intact.
- 🔴 **Three more paths were 403ing and nobody had noticed** — `bundle_items`,
  `payment_methods`, `availabilities` were requested by `sync.ts` but absent from the allowlist,
  which had been written from the spec's §3.1 resource families rather than from the actual call
  sites. `payment_methods` is the worst of the three: without it the Law 5 classifier's
  SECONDARY signal (the `SECURITY DEPOSIT` method name) **can never fire**. Fixed by hand and
  verified by replaying the allowlist regexes against all 12 requested paths.
- 🔴 **Law 4's correction path silently deduped into the row it was correcting.** The corrected
  re-insert derived its deterministic `client_uuid` from the bare Booqable payment id — the same
  seed as the original row — so `payments_client_uuid_key` caught it, `idempotentInsert`
  returned the *existing* row, and the correction vanished while `external_refs` recorded
  success. Now seeded with the payload hash, plus a tripwire that withholds the reversal if the
  replacement did not actually land.
- 🔴 **A deposit refund taken through the `SECURITY DEPOSIT` method was classified as ordinary
  revenue** — the refund branch never consulted the method signal. Straight Law 5 corruption.
- 🟠 **Self-collision made client updates permanently impossible**, found by the mapper agent
  driving its own code rather than reading it: `knownPhones` was built from *all* local clients
  including the one being synced, so after first import every client collided with its own phone
  forever and appended a fresh conflict row each pass.

**Two suggested fixes were rejected with reasoning, which is the behaviour worth keeping.** A
reviewer proposed applying the hash-suffixed uuid seed to `deposit_movements` "for symmetry" —
that would have *created* a duplicate-on-retry bug, since that table only ever emits one row per
external id and the bare seed is precisely what makes a failed-`external_refs` retry converge.
Another proposed a bare-`externalId` seed for reversals — which would make two successive
corrections of the same payment collide, overstating cash.

**Verified:** `tsc --noEmit` exit 0 (after the mapper handoff error, after sync wiring, after
each fix agent, and once more by hand after the allowlist edit). Law 17 unchanged — one code
occurrence outside `types.ts`, still the justified `DeliveryType` enum. Allowlist coverage
proven by replaying the real regexes over every path `sync.ts` requests, with `customers`
confirmed still-403 (translation is server-side by design). One mapper agent additionally
compiled its file standalone and ran 18 behavioural checks against fabricated payloads —
including the original blocker case (identifier renamed to `mobiel_nummer`, typed match still
finds it).

**Still not verified, and cannot be here:** no live Booqable account exists, so the transport
fix is proven by reading `@supabase/functions-js`' source and simulating the allowlist, **not by
a real 200**. Migration `0040` remains local and unapplied. Everything in §4.13's open list
stands, minus the three items this entry closed.

## 6.32 First security-advisor pass against the LIVE database — 44 findings to 24, and the
     masking layer turns out to have been inert since `0019` — 11 Aug 2026

Three migrations written and **applied** to `sxguwvgoserhdolewibb`: `0048_view_row_predicates`,
`0049_evidence_and_crew_document_policies`, `0050_function_hardening`. Numbered 0048-0050, not
0043-0045 as briefed — a concurrent session had already taken 0043-0047. Nothing in those five
touches anything here; checked before renumbering rather than assumed.

**Advisor counts, before → after** (`get_advisors(security)`, both runs against the live project):

| Finding | Level | Before | After |
| --- | --- | ---: | ---: |
| `security_definer_view` | ERROR | 20 | **20** (unchanged, on purpose — see below) |
| `function_search_path_mutable` | WARN | 16 | **0** |
| `extension_in_public` (btree_gist) | WARN | 1 | **0** |
| `rls_enabled_no_policy` | INFO | 6 | **3** |
| `auth_leaked_password_protection` | WARN | 1 | 1 (not SQL-fixable) |
| **Total** | | **44** | **24** |

The brief said 22 `security_definer_view` ERRORs; the advisor reports 20, one per masking view.
Reporting what the tool returned.

**The 20 ERRORs are not closed, and should not be.** The linter's remedy is
`security_invoker = true`. That would break the product: the masking expressions *reference* the
sensitive base columns, so an invoker-rights view needs the caller to hold SELECT on exactly the
columns the design says they must not have. It would either fail outright or, once grants were
loosened to make it pass, hand over the unmasked column. Accepted deviation, documented in the
`0048` header so nobody "fixes" it later by breaking it.

What `0048` *did* close is the real hole underneath that lint. All 20 views were
`select ... from <table>` with **no WHERE clause at all** — verified against `pg_views.definition`,
not against the migrations that wrote them. Definer-rights views bypass base-table ROW policies,
so the only row gate in front of them was the blanket grant to `authenticated`, i.e. none. Each
view now carries its base table's real SELECT predicate, read from live `pg_policies`: 18 get
`auth_is_staff()`; `accessories_v` and `vehicle_fuel_logs_v` get their tables' role lists (those
two carry only an ALL policy, so that list *is* the read gate). **No view needed
`auth_can_view_money()` as a row gate** — that function appears on these tables only as a column
mask. Each of the 20 was checked individually rather than pattern-matched.

**The §6.23/§6.25 column-loss trap was closed mechanically, not by care.** Both prior incidents
were caught by a human re-read, which is not a control. Two real controls replace it: every view
body is Postgres's own deparse of the live view with only a WHERE appended (nothing retyped, so
nothing mistypeable), and `create or replace view` — never `drop`+`create` — makes a changed
column list a hard error at apply time. A third check asserts all 20 column counts in a `do`
block. All three held.

### The finding that matters more than any of the above

**Column-level money masking has never actually been in force.** `0019_column_level_money_
masking.sql` writes `revoke select (purchase_price, ...) on products from authenticated`. A
column-level REVOKE cannot subtract from a table-level GRANT, and Supabase grants table-level
SELECT on every `public` table to `authenticated`. Verified on the live database:
`pg_class.relacl` shows `authenticated=arwDxtm/postgres` — the `r` is table-wide SELECT — and
**not one column of any of the 20 tables has a column-level ACL entry** (`pg_attribute.attacl` is
null throughout). The revokes were no-ops the day they were written.

Proven behaviourally, not inferred, with real rows inside a rolled-back transaction (probe
verified gone afterwards: 0 branches, 0 users, 0 clients):

| probe | result | meaning |
| --- | --- | --- |
| `clients_v` as unauth/Client | 0 rows | **row predicate bites** — was 1 before `0048` |
| `clients_v` as Owner | 1 row, credit = 12345 | staff read intact |
| `clients_v` as Warehouse | 1 row, credit = **NULL** | money mask works *through the view* |
| **base** `clients` as Warehouse | credit = **12345** | **mask bypassable by reading the table** |

So "Warehouse sees no money" holds only for a caller who goes through `_v`. Nothing forces that,
and `src/` contains **zero** references to any `_v` view — it reads base tables directly.

**Not fixed here, deliberately.** The repair is, per table, `revoke select on <t> from
authenticated, anon` then `grant select (<non-money columns>)`. That is only safe once the app
reads the views; applying it first breaks reads at runtime, which neither `tsc` nor `npm run
build` would catch. It also needs `src/` changes this session did not own. **Top open item.**

### Also closed, and deliberately left

`0049` closes 3 of the 6 `rls_enabled_no_policy` findings. `crew_documents`/`evidence_files`/
`evidence_references` were blocked on §4.11's `items` phantom-table question until `0042`
resolved it (§6.17). Tiers mirrored from live `pg_policies`: the evidence pair follows
`operation_sessions` (staff read, Owner/Admin/Manager/Warehouse write), `crew_documents` follows
the crew-scheduling tier (staff read, Owner/Admin/Manager/Coordinator write). **None of the three
has a money column** — checked against `information_schema.columns`, not assumed; `evidence_files`'
only numerics are `gps_lat`/`gps_lng`/`confidence`.

`0050` pins `search_path = public, pg_temp` on all 16 flagged functions. Not `''`: every body
references `public` objects unqualified, so `''` would break all 16, and a rewrite that silently
changes behaviour is worse than a pinned path. `pg_temp` is listed **last** — unlisted, Postgres
searches the temp schema *first* for relations, leaving the shadowing hole half-open. The highest-
leverage one was `auth_user_role()`: it reads `users` unqualified and is the root of every RLS
policy in the schema, so shadowing `users` would have unlocked every policy in `0018`-`0042` at
once. `btree_gist` moved to `extensions`; it was relocatable, index-to-opclass dependencies are by
OID, and the 3 exclusion constraints that use it are asserted present and valid post-move.

**TODO(decision) — `portal_users` / `portal_sessions` / `portal_auth_challenges`.** Not
attempted, per the brief. Every policy here is written in terms of `auth_user_role()`, which
resolves a staff `system_role` and defaults to `'Client'`; portal rows belong to non-staff who
have no such role. Scoping a portal session to *its own* portal user needs an identity claim the
schema does not have (a `portal_user_id` GUC? a JWT claim? service-role-only behind an edge
function?). Genuine unmade design decision. They stay fail-closed meanwhile — RLS on with no
policy denies every row — so the 3 INFOs are load-bearing, not neglect.

**TODO(decision) — `crew_documents` read breadth.** `auth_is_staff()` faithfully mirrors the four
crew-scheduling siblings, which is what `0049` was scoped to do. Flagging rather than silently
narrowing: those siblings hold scheduling facts, whereas `crew_documents` points at identity
paperwork, and `auth_is_staff()` includes Warehouse, Technician and Driver. Whether a Driver may
list a colleague's citizenship document is an HR/privacy call this migration was not entitled to
make.

`auth_leaked_password_protection` is a Supabase Auth dashboard toggle (Authentication - Policies),
not a database object. No migration can close it.

**Verified:** all three applied clean, each with in-migration `do`-block post-conditions that
would have aborted on failure (20 column counts unchanged + all 20 views carry a WHERE; 6 policies
created; 16 functions pinned + btree_gist relocated + 3 exclusion constraints valid). Advisors
re-run against live. Row predicate and money mask proven behaviourally with real rows, rolled
back. No `src/` file touched — this session changed three `.sql` files and this entry, nothing else.

**Typecheck was flapping while this entry was written, and none of it is from this work.** Four
consecutive runs, minutes apart, disagreed with each other — each red run pointing at a different
file, and each file one a concurrent session was mid-edit on:

1. `NewRental.tsx` (TS2375, `exactOptionalPropertyTypes`) + `AddClient.phone.test.tsx` — red
2. `AddClient.phone.test.tsx` only, 5 errors — red (`NewRental.tsx` fixed in between)
3. `npm run build` (`tsc --noEmit && vite build`) — **exit 0, clean**
4. `NewRental.render.test.tsx` (TS6133 unused var, TS2307 missing `node:fs` types) — red, a test
   file that did not exist at step 1

So the tree is being actively rewritten underneath the measurement and a single reading of it
means little. What *can* be stated firmly: this session touched **zero** TypeScript files — three
`.sql` files and this entry — so it cannot be the cause of any of the above, and the one clean
`npm run build` (step 3) fell in the middle of the sequence. Not fixed here: every implicated
file is another agent's ownership this run.

Method note worth keeping, because it nearly produced a false "green" in this very entry: a first
measurement used `npx tsc ... | tail -5; echo $?`, which reports **`tail`'s** exit status, not
`tsc`'s — it printed 0 while `tsc` was failing. Any future verification claim in this file that
rests on a piped exit code should be re-taken with the pipe removed (or via `PIPESTATUS`).
