# Backend / frontend wiring audit — 11 Aug 2026

**Method:** live Supabase project `sxguwvgoserhdolewibb` (`babindulal7's Project`,
ACTIVE_HEALTHY, ap-southeast-1) queried read-only via MCP — migration list, table row
counts, `pg_trigger`, `pg_proc`, `pg_constraint`, `auth.users` join, security advisors.
Frontend assessed by import-graph grep across `src/`.

**Not verified:** `tsc --noEmit`, `npm test`, `npm run build`, and anything in a browser.
The Linux sandbox failed to start on both attempts this session. No build claim is made below.

**Nothing was written to the database.** All queries were `select`. No migration was applied.

## Headline

The backend is a large, carefully-built schema that has **never processed a transaction**,
and the frontend is **not connected to it at any point**. These are not two independent
problems — the second is why the first has gone unnoticed.

---

## Backend

### [W-B1] Migrations 0043–0047 are not on the live database — and they carry Law 3 and Law 4

The live `supabase_migrations` list runs `…0042_deferred_cross_file_fks` → **`0048_view_row_predicates`**.
Five files in the repo are skipped. 0048–0052 were then applied on top of the gap (11 Aug).

This is **not a violation of the repo rule** — 0043, 0044, 0045 and 0046 each carry
`-- FILE ONLY — never applied to any live Supabase project (repo hard rule)`, and 0048–0052
carry no such line. The convention was followed. The problem is what is sitting in the
parked set, and that the live schema now matches no single point in the repo's sequence.

Verified absent from the live database:

| Migration | What is missing | Verified by |
|---|---|---|
| **0046** Law 4 payment/audit immutability | `trg_payments_reject_update`, `…_reject_delete` — `payments` carries only `trg_audit_payments` and `trg_sync_payments` | `pg_trigger` |
| **0044** Law 3 delete backstops | functions `reject_update_append_only`, `reject_delete_nothing_is_deleted` do not exist | `pg_proc` |
| **0045** reservation capacity ceiling | function `enforce_reservation_capacity_ceiling` does not exist | `pg_proc` |
| **0043** flag rename | live CHECK is still `flag = ANY (ARRAY['Returned Early','Late Return','Missing','Damaged'])` | `pg_constraint` |
| **0047** seed reference corpus | not applied — and, unlike the other four, **carries no FILE-ONLY header**, so its absence looks unintentional | migration list |

Two consequences worth stating plainly:

**Law 4 currently rests on `revoke` alone.** 0046's own header argues at length why that is
insufficient: a revoke "does not bind the table owner, which keeps every privilege
regardless", nor `service_role`, "which bypasses RLS and grants by Supabase design". Every
`PLAN.md §0` claim that payments are immutable is, on the live database today, enforced by
the one mechanism the repo already concluded does not enforce it.

**The overdue flag is currently unwritable.** The live CHECK accepts `'Late Return'`;
`src/lib/workflow.ts`'s closed 17-flag registry does not contain that string and uses
`'Overdue'` instead. The database will only accept a value the app refuses to produce, and
the app can only produce a value the database rejects. 0043 is precisely the fix, and it is
parked.

**Suggested action:** this needs your explicit approval either way, per `CLAUDE.md`. The
decision is not "apply them" — it is whether the FILE-ONLY hold is still deliberate now that
0048–0052 have gone in ahead of them. 0047 in particular looks like an oversight rather than
a hold.

---

### [W-B2] Every operational table is empty — the schema has never been transacted against

Row counts, live: `bookings` **0**, `booking_lines` **0**, `payments` **0**, `invoices` **0**,
`products` **0**, `product_units` **0**, `operation_sessions` **0**, `security_deposits` **0**,
`deposit_movements` **0**, `cases` **0**, `crew_members` **0**.

Non-zero rows exist only in reference/config tables: `users` 4, `storage_zones` 3,
`branches` 2, `warehouses` 2, `bank_accounts` 2, `inventory_categories` 6,
`expense_categories` 4, `fiscal_periods` 1, `number_sequences` 7, `clients` 1,
`audit_events` 2.

So: no booking has ever been created, no payment ever recorded, no session ever run. Every
trigger, constraint, RLS policy and masking view in 52 migrations is **untested against real
rows**. This is the direct cause of `PROGRESS.md`'s recurring "verified by typecheck, not by
driving the app".

---

### [W-B3] Three of the four staff roles cannot log in — so Law 6 has never once been exercised

`public.users` holds 4 staff. Joining `auth.users`:

| Staff row | Role | Can sign in? |
|---|---|---|
| Babin Shrestha | Owner | **yes** (`owner@babinrentals.com`) |
| Operations Manager | Admin | no auth identity |
| Senior Gear Tech | **Warehouse** | no auth identity |
| Rental Billing Officer | Coordinator | no auth identity |

`PROGRESS.md` (11 Aug) predicted this: *"Everything still runs as Owner, so the
Warehouse-sees-no-money and column-masking rules remain unexercised — a clean pass under the
bypass proves nothing about them."* Confirmed live.

The consequence is that **the single most important security property in the product — Law 6,
the floor sees no money — has never been executed even once.** All of 0014, 0019, 0035, 0038,
0039 masking, plus every `useCanViewMoney()` call site, is unproven. Combined with the dev
auth bypass (which pins every session to Owner), there is currently no way to observe a
money-blind session at all.

**Suggested action:** create auth identities for the Warehouse and Coordinator rows. That
unblocks the highest-value verification available and needs no product decision.

---

### [W-B4] 25 views are `SECURITY DEFINER` — flagged ERROR by the Supabase advisor

Including exactly the money-masking views: `clients_v`, `client_directory_v`,
`booking_lines_v`, `booking_crew_lines_v`, `crew_bookings_v`, `crew_members_v`, `products_v`,
`purchase_requests_v`, `vehicle_fuel_logs_v`, `cases_v`, `late_fee_findings_v`, and 14 more.

A `SECURITY DEFINER` view enforces the **creator's** permissions and RLS, not the querying
user's. For masking views this is sometimes deliberate — the view body does the masking and
must read the underlying table. But it means Law 6 on these surfaces depends entirely on
each view body being correct, with RLS providing no second line of defence, and the advisor
raises it at ERROR.

**Suggested action:** if it is deliberate, record the ruling and add
`security_invoker = false` explicitly with a comment on each view saying why. If it is not,
these are 25 open read paths. Either way it should not be implicit.

---

### [W-B5] Portal tables have RLS enabled and zero policies

`portal_users`, `portal_sessions`, `portal_auth_challenges` — RLS on, no policy, which
denies all access. Consistent with the portal being unbuilt; recorded so it is not mistaken
for a working surface later. (Advisor level: INFO.)

### [W-B6] Leaked-password protection is disabled

Supabase Auth is not checking new passwords against HaveIBeenPwned. One toggle in Auth
settings. (Advisor level: WARN.)

---

## Frontend

### [W-F1] No screen is connected to the backend — at all

Across the whole of `src/`, only **14 files** reference `supabase` / `dataAccess` /
`offlineQueue`. Thirteen are infrastructure in `src/lib/` (`auth.tsx`, `dataAccess.ts`,
`audit.ts`, `seed.ts`, `bookingTransition.ts`, `queries/clients.ts`, and the seven
`booqable/` files).

Exactly **one** file under `src/modules/` appears, `system/SystemMonitor.tsx`, and it imports
only queue *diagnostics*:

```ts
import { getPendingMutations, getDeadLetterMutations, drainQueue } from '../../lib/offlineQueue'
```

There is **no `supabase.from(` call, no `idempotentInsert`, and no `safeUpdate` in any screen
in the application.** Every module renders static seed data from `src/data/`.

This recontextualises the engine sweep I filed earlier today
(`BUG_SWEEP_ENGINES_v1.1.md`), and I want to be straight about it: the offline-queue data-loss
bugs (E-P1-1/2/3), the `dataAccess` id bug (E-P2-2) and the RBAC contradictions are all real
in the code, but **none of them can currently fire**, because nothing calls those paths. They
are latent-until-wiring, not live defects. The date engine (E-P0-1), `createAction`
(E-P0-3) and the auth hang (E-P1-4) are the ones that bite today, because those paths *are*
reached.

It also explains the empty database in W-B2 without any further mystery: the app has no code
that would ever write a row.

### [W-F2] A view was pushed to production for a query layer nothing imports

`src/lib/queries/clients.ts` is imported by **zero** files. Migration
**0052_client_directory_view** (`client_directory_v`) was applied to the live database on
11 Aug to serve it.

So the newest thing on the production database exists for a caller that does not exist. Not
harmful, but it is the clearest single symptom of the two halves drifting apart: backend
work is being applied to production while the frontend it was built for was never wired up.

### [W-F3] Build and typecheck unverified this session

Sandbox unavailable. `PROGRESS.md`'s last recorded `npx tsc --noEmit` exit 0 was 11 Aug, with
a noted transient `TS6133` in `Calendar.tsx`. I could not re-confirm. Treat build health as
"last known good", not "current".

---

## What I would do next, in order

1. **Create auth identities for the Warehouse and Coordinator staff rows** (W-B3). Cheapest
   possible unblock, and it makes the product's most important security property observable
   for the first time. No decision required.
2. **Rule on the 0043–0047 hold** (W-B1). Specifically 0046 — Law 4 is currently enforced by
   a mechanism the repo itself documented as inadequate — and 0047, which appears to be an
   oversight rather than a deliberate hold. Needs your approval either way.
3. **Wire one screen end-to-end** (W-F1). One vertical slice — Clients Directory is the
   obvious candidate, since `queries/clients.ts` and `client_directory_v` are both already
   built and waiting. That single slice would exercise auth → RLS → masking → dataAccess →
   the offline queue for the first time, and would convert most of the engine sweep from
   speculative to confirmed or dismissed.
4. **Rule on `SECURITY DEFINER`** for the 25 views (W-B4).
5. Fix the date-engine cliff before **17 Aug** — carried from `BUG_SWEEP_ENGINES_v1.1.md`
   E-P0-1, still the only finding with a hard external deadline.
