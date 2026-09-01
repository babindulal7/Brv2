# Law 6 per-role RLS — exercised at runtime, not read off the policies

**31 August 2026.** Closes `DECISION-SHEET.md` §5's first item — *"RLS policy correctness per
money-blind role… **the highest-value follow-up in the pack**"*.

**Method.** Not a policy read. Each probe opened a transaction, dropped to the `authenticated`
role (so RLS actually applies — the MCP connection is superuser and bypasses it), set
`app.current_user_id` to a real user, ran the query, and rolled back. `auth_user_role()` resolves
from that setting (`SECURITY DEFINER`, falling back to `auth.uid()`, defaulting to `'Client'`).
Every statement was a read; nothing was written and no migration was applied.

---

## 1. Verdict

**The gate is real and it works — except on `clients`, where it is bypassable today.**

| Check | Result |
|---|---|
| RLS actually filters at runtime | ✅ proven — same connection, Warehouse sees 246 bookings / 366 clients, Client sees **0 / 0** |
| Unknown user id fails closed | ✅ resolves to `Client`, sees nothing |
| Law 6 SELECT gate correct for all four money-blind roles | ✅ `Warehouse`, `Technician`, `Driver`, `Client` all false on both predicates |
| Column masking in the `_v` views | ✅ proven on live data (§3) |
| Column masking on base tables `bookings`, `booking_lines`, `products`, `product_units` | ✅ armed by 0062 — money columns return **permission denied** |
| Column masking on base `clients` | ❌ **not armed — money reads through** (§4) |
| `payments` immutability (Law) | ✅ no `UPDATE` and no `DELETE` policy exists, so both are denied by default |
| `INSERT` policies | ✅ all three money tables carry real `with_check` allowlists, none null |

## 2. The predicates, across all nine roles

`auth_can_view_money()` = role **not in** (Warehouse, Technician, Driver, Client).
`auth_is_finance_or_admin()` = role **in** (Owner, Admin, Manager, Coordinator, Accounts).

Each money table carries **two** permissive SELECT policies — `*_money_blind` on the first and
`*_select` on the second — and PostgreSQL **OR-combines** permissive policies. Evaluated over the
full `system_role` enum, the two predicates agree on every one of the nine roles, so the OR is
redundant today and the gate is correct.

> ⚠ **Latent trap.** One is a **denylist**, the other an **allowlist**. They coincide only because
> the enum currently has exactly these nine members. **Add a tenth role and it gets money read
> automatically** — `auth_can_view_money()` returns true for anything not on the blind list, and
> the OR grants it. `Manager` was added this way on 30 Aug (`0017_reopen_manager_role`). Any new
> role must be added to the *blind* list or the allowlist deliberately, not just to the enum.

## 3. The `_v` views mask correctly — proven

All eight `_v` views are `postgres`-owned with `security_invoker = false`, which looks like an RLS
bypass and is not: each view carries its **own** `WHERE auth_is_staff()` row gate and
`CASE WHEN auth_can_view_money() THEN col ELSE NULL END` column masks, and the `auth_*` functions
resolve the **caller's** identity regardless of who owns the view. Column masking is something
base-table RLS cannot do at all — RLS filters rows, not columns — so the views are the mechanism.

Measured on `clients_v`, identical row sets:

| Session | rows | `payment_terms` non-null |
|---|---|---|
| Owner | 366 | **366** |
| Warehouse | 366 | **0** |

(`approved_credit_limit` is null for every client in the live data, so it proves nothing either
way — `payment_terms` is the informative column.)

## 4. ❌ The gap — base `clients` leaks what `clients_v` masks

Same Warehouse session, reading the **base table** instead of the view:

| Path | rows | `payment_terms` non-null |
|---|---|---|
| `clients_v` | 366 | 0 |
| `clients` | 366 | **366** |

**`src/lib/queries/clients.ts:18-20` states the opposite as settled fact:**

> *"`approved_credit_limit` and `payment_terms` are column-REVOKEd from `authenticated` on the base
> table (0038), so selecting them from `clients` **fails outright for everyone**."*

It does not fail. Live, `authenticated` (and `anon`) hold `SELECT`, `INSERT`, `UPDATE` and
`REFERENCES` on both columns.

**Root cause, and it is already written down in this repo.**
`0062_law6_column_grants_arm_the_mask.sql`'s own header explains it:

> *"`0019` tried to mask money with `revoke select (col) … from authenticated` and it has never
> worked, because `authenticated` also holds TABLE-level SELECT and a table grant covers every
> column. A column revoke cannot subtract from a table grant."*

`0038` used that same ineffective shape on `clients`. `0062` fixed the pattern properly —
`revoke select on <table>`, then `grant select (<non-money columns>)` — and **is applied**
(`20260828070623`). But it covers exactly four tables:

`bookings` · `booking_lines` · `products` · `product_units`

**`clients` is not mentioned in it at all.** Confirmed both ways in the same session: a Warehouse
read of `bookings.deposit_required` returns `ERROR 42501: permission denied for table bookings`,
while a Warehouse read of `clients.payment_terms` returns 366 values.

**This is reachable from app code.** `src/lib/syncEngine.ts:166` runs
`supabase.from('clients').select('*').limit(300)` as the signed-in user — every column, up to 300
clients, into local storage. `src/lib/queries/clients.ts` is disciplined (reads via `clients_v`,
writes via the base table), but the discipline is a convention, and Law 6's own wording is
**"RLS, not the UI."**

**Not fixed here.** The remedy is a `0062`-shaped migration for `clients`, and `0062`'s header is
explicit that ordering matters — *"DO NOT APPLY THIS BEFORE 0061 AND THE CALL-SITE CHANGE HAVE
SHIPPED… Applying this early takes the app down for every role, Owner included."* `syncEngine.ts`
would need its `select('*')` narrowed first. Applying a migration needs Babin's approval
(`CLAUDE.md`), so this is surfaced, not actioned.

## 5. Two standing cautions

- **`relforcerowsecurity` is `false`** on every money table, so the table **owner** bypasses RLS
  entirely. Anything running as `postgres` or `service_role` — including the MCP connection used
  for this file, and the Edge Functions — sees everything. That is expected, but it means no
  measurement taken as `postgres` says anything about RLS.
- **A zero-row result never proves a gate works.** `invoices`, `payments` and `security_deposits`
  all hold **zero rows** live, so no read of them can demonstrate masking. That is why §3 and §4
  were measured on `clients`, which has 366 rows, and why the money-table verdict in §1 rests on
  predicate evaluation plus the `permission denied` probe rather than on counts.

---

## 6. How this relates to I5 / migration 0077 — it does not overlap

[`I5-RLS-MONEY-VERIFICATION.md`](I5-RLS-MONEY-VERIFICATION.md) and the `0077` draft
(`PROGRESS.md`, 1 Sep) address **four** tables: `accessories`, `booking_transport`,
`maintenance_records`, `vehicle_fuel_logs`. That pass reached the same conclusion about the
mechanism — a bare column revoke cannot subtract from a table grant, and `0062`'s reverse shape is
the fix — and its §3 records that **"nothing in `src/` reads any of the four tables."** Those
breaches are therefore **latent**: they leak on the first row written, through a path no code
currently takes.

**`clients` is not one of the four, and it is the opposite case.** It holds 366 live rows, and the
leak is reachable from the running app today:

```
Header.tsx:45  triggerSync            (a header control every signed-in role can press)
  → syncContext.tsx:36  syncEngine.syncAll()
    → syncEngine.ts:166  supabase.from('clients').select('*').limit(300)
      → payment_terms for up to 300 clients, into IndexedDB, as a Warehouse session
```

`App.tsx:96` mounts `SyncProvider` around the whole app, so the control is present on every
screen. This is **live, not latent**, and it is the one case where the base-table exposure has a
consumer.

Two things follow. First, if `0077` is being written to arm the four latent tables, **`clients`
belongs in the same file** — same mechanism, same `0062` shape, higher severity. Second, narrowing
`syncEngine.ts:166` from `select('*')` to an explicit non-money column list is a **one-line change
that closes the live path immediately**, independent of any migration, and without the ordering
hazard `0062`'s header warns about.
