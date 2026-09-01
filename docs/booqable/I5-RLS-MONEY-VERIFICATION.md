# I5 — RLS money-visibility verification, per money-blind role

**31 August 2026 · live database, read-only · project `sxguwvgoserhdolewibb`**

`CAPTURE-BACKLOG.md` §5 called this *"the highest-value check in the pack — a wrong policy is a
Law 6 breach no UI gating can repair."* This file answers it.

---

## Headline

**Law 6 is correctly enforced where it has been armed, and there are four places where it has not
been.** The masking mechanism provably works — the same view, over the same rows, returns money to
a money-visible role and `NULL` to a money-blind one. But that mask lives in the `_v` views, and it
is only a mask if the base table underneath is unreachable. On **35 of 38 money base tables the
`SELECT` grant to `authenticated` is still open**, and on **four of them the row policy admits a
money-blind role**. Those four carry raw, unmasked money columns.

**Nothing is leaking today. All four tables are empty.** That is the only reason. This is a latent
breach that activates on the first row written, not a theoretical one.

| | |
|---|---|
| Money columns probed | **156** across 44 base tables + 21 views |
| Genuine money leaked to Warehouse **today** | **0** |
| Masking **proven** working (real values → `NULL`) | **3 columns**, plus 12 more masked but unproven |
| **Latent Law 6 breaches** (policy admits a money-blind role to raw money) | **4 tables** |
| Claims that could not be settled because the table is empty | **most of them** — see §4 |

---

## 1. Method — and why it is a valid test

The Supabase MCP connection runs privileged and **bypasses RLS**, so querying through it directly
proves nothing. Every probe below therefore ran inside:

```sql
begin;
set local role authenticated;                                   -- RLS now applies
select set_config('app.current_user_id', '<user uuid>', true);  -- become that user
...                                                             -- probe
rollback;                                                       -- nothing persisted
```

This is legitimate rather than a trick: `auth_user_role()` is defined to resolve from exactly that
GUC before falling back to `auth.uid()`, so this is the same code path a real session takes.

```sql
CREATE FUNCTION public.auth_user_role() RETURNS system_role
  LANGUAGE sql STABLE SECURITY DEFINER AS $$
  select coalesce(
    (select primary_role from users
      where id = coalesce(nullif(current_setting('app.current_user_id', true),'')::uuid, auth.uid())),
    'Client'::system_role)                       -- unmatched user ⇒ Client
$$;
```

Confirmed live before probing: `db_role = authenticated`, `app_role = Warehouse`,
`can_view_money = false`, **`row_security_active('invoices') = true`**.

**Law 6's role list is exact and lives in one function** — worth quoting, because everything below
depends on it:

```sql
CREATE FUNCTION public.auth_can_view_money() RETURNS boolean AS $$
  select auth_user_role() not in ('Warehouse','Technician','Driver','Client');
$$;
```

**Read-only.** Every statement was a `SELECT` inside a rolled-back transaction. No row was created,
changed or deleted; no migration was applied. The one temp table created is `ON COMMIT DROP` inside
the same rolled-back transaction.

### Which roles could be tested directly

The `users` table holds **four rows**: Owner ×2, Admin, Coordinator, **Warehouse**. There is **no
Technician, Driver or Client user**.

| Role | How tested | Confidence |
|---|---|---|
| **Warehouse** | real user `…0103` | **empirical** |
| **Client** | unmatched UUID → falls through to `'Client'`, which is the real production path for an unbound user | **empirical** |
| **Technician**, **Driver** | no user exists; tested by evaluating the policy predicates and the mask expression as SQL | **analytic, see §3** |

---

## 2. What is PROVEN working

### 2.1 The mask genuinely discriminates by role

The essential control. Same view, same rows, different acting role:

| Relation · column | Coordinator (money-**visible**) | Warehouse (money-**blind**) | Client |
|---|---|---|---|
| `products_v.daily_rate` | **204 values** | 0 — all `NULL` | 0 rows |
| `products_v.weekly_rate` | **204 values** | 0 — all `NULL` | 0 rows |
| `bookings_deposit_v.deposit_required` | **200 values** | 0 — all `NULL` | 0 rows |
| `client_directory_v` rows | 366 | 366 | **0 rows** |

Raw values confirmed present underneath: `products.daily_rate` 204 non-null (max Rs.25,000),
`products.weekly_rate` 204 non-null (max Rs.125,000), `bookings.deposit_required` 200 non-null
(max Rs.25,000). **So this is real masking, not a column that happens to be null for everyone** —
the distinction that makes the whole test meaningful.

### 2.2 Client is excluded at the row level, not the column level

A Client session sees **zero rows** in `products_v`, `bookings_deposit_v` and `client_directory_v`.
The views carry `WHERE auth_user_role() <> 'Client'` (via `auth_is_staff()`), so a Client never
reaches the money question at all. Correct, and stronger than masking.

### 2.3 Three money base tables have their money COLUMNS revoked

`bookings`, `products` and `product_units` return **`permission denied for table`** to
`authenticated` when a **money column** is named. This is what makes their `_v` masks real: with
no way to read the money column directly, the masked view is the only door.
**This is the pattern the other 35 tables should follow.**

> **Correction, 31 Aug (later the same day).** This section first read *"…have the grant
> revoked"*, which was imprecise in a way that matters. The revoke is **column-level, not
> table-level** — the mechanism `0062_law6_column_grants_arm_the_mask` installed. Two consequences
> the original wording would have led a reader to get wrong:
>
> - **`has_table_privilege('authenticated','bookings','SELECT')` returns `false`, yet
>   `select count(*) from bookings` as `authenticated` succeeds and returns every row.** Verified
>   as Coordinator: 246 of 246. A table-level check is therefore the *wrong probe* here and will
>   mislead anyone who repeats this audit — ask `has_column_privilege` instead.
> - **The app depends on this.** `listBookings` reads `.from('bookings')` — the base table, not a
>   view (`queries/bookings.ts:420`). If the grant were revoked at table level, every list screen
>   in the product would break for every role. It is revoked per column, so non-money columns read
>   normally and `deposit_required` arrives separately through `bookings_deposit_v`
>   (`queries/bookings.ts:403`).
>
> The §3 recommendation is unaffected and in fact confirmed: `REVOKE SELECT (col)` is precisely
> this established pattern, which is why it is the right fix for the four unarmed tables rather
> than a table-level revoke that would break their screens.

---

## 3. What is BROKEN — four latent Law 6 breaches

For these four, all three conditions hold at once:

1. `authenticated` **has `SELECT`** on the base table (verified via `has_table_privilege`), and
2. the row policy **admits a money-blind role** (predicate evaluated as Warehouse → `true`), and
3. the base table columns are **raw** — the `CASE WHEN auth_can_view_money()` mask exists only in
   the `_v` view, which the role is not obliged to use.

| Table | Raw money column(s) | Policy | Money-blind roles admitted |
|---|---|---|---|
| `accessories` | `replacement_cost` | `accessories_all` | **Warehouse** |
| `booking_transport` | `delivery_charge`, `fuel_charge` | `booking_transport_driver_read` | **Warehouse, Driver** |
| `maintenance_records` | `cost` | `maintenance_records_all` | **Warehouse** |
| `vehicle_fuel_logs` | `cost_amount` | `vehicle_fuel_logs_all` | **Warehouse, Driver** |

Proof, executed as the Warehouse user (`auth_can_view_money() = false`):

```
accessories_admits_me        = true      accessories_rows        = 0
booking_transport_admits_me  = true      booking_transport_rows  = 0
maintenance_admits_me        = true      maintenance_rows        = 0
fuel_logs_admits_me          = true      fuel_log_rows           = 0
```

The `_rows = 0` is **not** a denial — a denial raises `permission denied`, as `bookings` does. These
tables are readable and empty. **`select cost_amount from vehicle_fuel_logs` run by a Driver returns
raw rupees the moment a fuel log exists.**

That each table has a masked `_v` sibling (`accessories_v`, `vehicle_fuel_logs_v`, …) is what makes
this a defect rather than a design choice: **the mask was written, and then left bypassable.**

### Why Driver is the sharper risk

`vehicle_fuel_logs_all` and `booking_transport_driver_read` name `Driver` deliberately — a driver
legitimately needs the trip and the vehicle. But the same policy hands over `cost_amount`,
`delivery_charge` and `fuel_charge`, because RLS filters **rows, not columns**. The policy is doing
what it was written to do; the mistake is expecting it to carry Law 6, which it structurally cannot.

### The fix, and why it is one line per table

Revoke the money columns rather than the table, so the existing `_v` views keep working:

```sql
REVOKE SELECT (replacement_cost)               ON public.accessories        FROM authenticated;
REVOKE SELECT (delivery_charge, fuel_charge)   ON public.booking_transport  FROM authenticated;
REVOKE SELECT (cost)                           ON public.maintenance_records FROM authenticated;
REVOKE SELECT (cost_amount)                    ON public.vehicle_fuel_logs  FROM authenticated;
```

This is the mechanism `0062_law6_column_grants_arm_the_mask` already established — these four were
simply never armed. **Not applied here: no migration is written by this pass.** Verify against
`0019` / `0035` / `0062` before writing one, so the same convention is followed.

---

## 4. What is UNPROVEN, and why — the empty-corpus problem

The first probe reported *"120 of 156 money columns blocked by RLS."* **That number is close to
meaningless and should not be quoted.** An empty table and a perfectly-enforced policy return the
identical result: zero rows.

Of every money-carrying base table, only **four hold any rows at all**:

| Table | Rows |
|---|---|
| `clients` | 366 |
| `products` | 204 |
| `bookings` | 200 |
| `number_sequences` | 10 |

**Empty, therefore untested:** `invoices`, `invoice_lines`, `payments`, `payment_reversals`,
`security_deposits`, `deposit_movements`, `expenses`, `expense_reversals`, `charges`, `cases`,
`booking_lines`, `booking_discounts`, `booking_crew_lines`, `crew_assignments`, `crew_members`,
`crew_bookings`, `crew_profiles_v2`, `tax_ledgers`, `damage_findings`, `late_fee_findings`,
`coupons`, `coupon_redemptions`, `membership_plans`, `client_memberships`, `depreciation_logs`,
`purchase_requests`, `external_invoices`, `user_approval_authorities`, and the four in §3.

**Every RLS policy on the money core — invoices, payments, deposits, expenses — has never been
exercised against a single row.** Their `SELECT` grant to `authenticated` is open (§3 condition 1
holds for all of them); whether their policies admit a money-blind role is the one thing that
still needs checking, and it cannot be checked empirically until rows exist.

Also unproven for the same reason — the column is `NULL` in the data, so masking it proves nothing:
`clients.approved_credit_limit` (0 of 366 non-null), `products.purchase_price`,
`products.replacement_value`, `products.deposit_percent` (all 0 of 204 — consistent with the I3
finding of 0% purchase-cost coverage), and `client_directory_v`'s `outstanding_amount` /
`total_paid_amount` / `deposit_held_amount`, all derived from the empty `invoices` and `payments`.

### The four "leaks" that were not leaks

The probe flagged four columns as readable-with-values by Warehouse. **None is money**, and all four
are correctly visible:

| Column | What it actually is |
|---|---|
| `client_directory_v.total_bookings_count` | a count of bookings |
| `products.total_quantity`, `products_v.total_quantity` | stock quantity |
| `number_sequences.current_value` | a document-number counter |

They matched a regex on `total` / `value`. Worth one note: `number_sequences.current_value` tells a
Warehouse user how many invoices and quotes have ever been issued. That is a mild business-volume
disclosure, not a Law 6 money value, and it is **not** raised as a defect here.

---

## 5. Technician — a separate finding

**`Technician` appears exactly once in the entire schema — inside `auth_can_view_money()`.** Not in
a single policy, not in a single view. Measured across all **232** policies in `public`:

| Role named in a policy predicate | Policies |
|---|---:|
| `Warehouse` | 52 |
| `Coordinator` | 39 |
| `Driver` | 4 |
| **`Technician`** | **0** |

Combined with the default-deny of RLS, a Technician session sees **no rows in any table with a
role-list policy**. The role exists in the `system_role` enum and in the one function that denies
it money — and nowhere else.

For Law 6 that is safe by accident. For the product it means **the Technician role is currently
non-functional at the data layer** — a Technician cannot read the maintenance and damage records
the role exists to work on. That is a gap to raise against the capability matrix
(`PLAN.md` §4.20), not something to fix by widening a policy in passing.

---

## 6. Verdict

| Question | Answer |
|---|---|
| Is RLS *enabled* on the money tables? | Yes — verified previously, and re-confirmed. |
| Is it *correct*? | **Where armed, yes — provably. In four places, no.** |
| Does any money leak today? | **No.** Zero genuine money columns reachable by a money-blind role. |
| Will it leak? | **Yes — on the first row written to any of the four tables in §3.** |
| Is I5 closed? | **Partly.** §2 and §3 are settled. §4 cannot close on an empty corpus. |

**I5 stays open**, narrowed to one sentence: *the money core — invoices, payments, deposits,
expenses — has never been tested against a row, and its base-table `SELECT` grant to
`authenticated` is open.* Closing it needs the seeded corpus that backlog item **I6** already calls
for; the two should be done together, and this file's harness re-run unchanged once rows exist.

---

## 7. Honest limits

- **Technician and Driver were not tested with real sessions** — no such user exists. Their money
  masking is proven *analytically*: every mask is `CASE WHEN auth_can_view_money() THEN col ELSE
  NULL END`, and that function treats all four money-blind roles with one `NOT IN` list, so it
  cannot discriminate between them. Their **row** access, by contrast, is *not* uniform — policies
  name roles individually, which is exactly how `Driver` ended up admitted to two money tables.
- **This tests the database only.** UI-side gating (`useCanViewMoney`, `moneyVisibility`) was not
  exercised. Law 6 requires money-blind roles get money **not built into the DOM**; that is a
  separate check.
- **`service_role` was not tested** and should never be reachable from a browser session.
- **Write paths were not tested.** Whether a money-blind role can *modify* money is a different
  question from whether it can read it, and it is not answered here.
- The probe's regex may have missed a money column whose name matches none of its patterns.
- **This repo is edited concurrently.** These findings describe the live schema at ~14:00 on
  31 Aug 2026 (`schema_migrations` topping out at `0070`). Re-run before relying on them.
