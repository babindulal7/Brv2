# Independent spot-check of the Layer D verification

**31 Aug 2026, 13:50.** A second pass, run by a different session from the one that produced
[`../LAYER-D-VERIFICATION.md`](../LAYER-D-VERIFICATION.md) and the fourteen per-screen files.

**Why this exists.** The Layer D register makes a strong claim — *93 of 329 claims survive, 28%* —
and it was produced by the same kind of process it is criticising. This project's documented failure
mode is confident fabrication, and a verification document is exactly the artifact where that would
be hardest to notice: it *looks* like evidence. So the register's most consequential findings were
re-derived from scratch, without reading its per-screen files first, and compared afterwards.

**Result: every claim checked holds.** One apparent discrepancy turned out to be the checker's own
misreading, and it is recorded below rather than quietly dropped, because the correction is itself
worth knowing.

---

## 1. The "zero importers" findings — all confirmed

The register's finding #4 names a repeating pattern: *the fully-built, fully-tested, entirely unwired
module.* This is the highest-value claim in the document, because it is what makes v2.5's
"already does X" lines false. Re-derived by grepping `src/` for importers, excluding each module's
own file and its `__tests__`:

| Module | Register says | Independently found | Verdict |
|---|---|---|---|
| `lib/kpiEngine.ts` | zero importers | **0** | ✅ |
| `lib/queries/facetCounts.ts` | zero callers | **0** | ✅ |
| `lib/bookingQuery.ts` (2,568 lines) | zero callers | **0** | ✅ |
| `fetchCanonicalBooking` | zero call sites outside its own test | **0** | ✅ |
| `lib/queries/bundles.ts` | zero importers | **0** | ✅ |
| `auditForRecord()` | zero callers | **0** | ✅ |

**The one worth pausing on is `bookingQuery.ts`.** It is 2,568 lines and it is the implementation of
**Law 2 — the Single Query Rule, which `PLAN.md` §0 marks as a *hard acceptance gate*.** Nothing in
`src/` calls it. The law is implemented and unreached, which is a different and more awkward state
than either "done" or "not done", and it is not what a reader of v2.5 §10.6 would conclude.

**The operational rule the register draws from this is correct and worth repeating:** before citing
any module as "we already do X", grep for its importers.

## 2. `/calendar` has no data layer — confirmed

`src/modules/calendar/Calendar.tsx` contains **zero** references to `supabase`, `queries/` or
`actions/`. Every line of v2.5 §11.5 therefore specifies something unbuilt, rather than describing
something built. Consistent with `docs/pages/23_calendar.md` marking the screen *Seed-only*, and
with the screen still having **no test coverage at all** since the 30 Aug guard-test retirement.

## 3. Live database facts — all confirmed

Read-only `SELECT` against `sxguwvgoserhdolewibb`, 31 Aug:

| Claim | Found | Verdict |
|---|---|---|
| `booking_lines` empty | **0 rows** | ✅ |
| `product_units` empty | **0 rows** | ✅ |
| `inventory_reservations` empty | **0 rows** (table exists) | ✅ |
| `client_tax_profiles` exists but unused | **exists** | ✅ |
| `starts_at` / `ends_at` name no real column | **0 columns** with either name in the entire `public` schema | ✅ |

That last one is worth stating plainly: v2.5 §11.5's single column-level fact about the Calendar
(`starts_at` → `ends_at`) names **two columns that exist nowhere in the database.**

## 4. The discount-constraint collision — confirmed, and slightly wider than recorded

The register and `CAPTURE-BACKLOG.md` §1 say the Law 10 policy is enforced by **nine CHECK
constraints across five tables**. Independently enumerated from `pg_constraint`:

| Table | Constraints |
|---|---|
| `booking_discounts` | `booking_discounts_hard_cap`, `booking_discounts_over_ten_needs_reason_and_approver` |
| `invoice_lines` | `invoice_lines_discount_cap`, `invoice_lines_discount_over_ten_needs_reason_and_approver` |
| `invoices` | `invoices_discount_cap`, `invoices_discount_over_ten_needs_reason_and_approver` |
| `coupons` | `coupons_discount_pct_cap` |
| `membership_plans` | `membership_plans_discount_hard_cap` |
| `user_approval_authorities` | `user_approval_discount_cap` |

**Nine constraints — confirmed.** Two small corrections:

1. They span **six** tables, not five. The backlog's table groups `membership_plans` and
   `user_approval` on one row, which reads as five.
2. The table is **`user_approval_authorities`**, not `user_approval`. A migration written against
   the shorter name would fail.

Two further related checks exist and are not in the register's list —
`booking_lines_discount_within_line` and `products_deposit_pct_range`. Neither enforces the >10%
rule, so they do not change the argument, but a migration relaxing discount policy should look at
them too.

**The register's central point survives intact and is the thing to act on:** `invoices` and
`invoice_lines` carry their **own independent copies** of both rules, so a discount UI that clears
the booking path still fails at invoicing. Any relaxation has to move every table together, or
discounting works right up until billing.

## 5. The one apparent discrepancy — and why the register was right

`CAPTURE-BACKLOG.md` §1 states that `supabase_migrations.schema_migrations` *"tops out at 0070"*.
A first check appeared to contradict this: the maximum `version` is **`20260828071315`**, a
timestamp, with no `0070` anywhere in that column.

**The register is correct and the check was wrong.** `schema_migrations` has two columns:
`version` holds a timestamp, while `name` holds the repo's file-numbered identifier. The row at
`version = 20260828071315` is named **`0070_create_booking_parent_line_linkage`**. Ordering by
`version` and reading `name` gives exactly the stated result.

**Recorded because it is a trap that will catch the next reader too:** in this project, migration
identity lives in `schema_migrations.name`, not `version`. Comparing repo filenames against
`version` will always look like nothing is applied.

### What that check incidentally established, and it matters

There are **75 migration files** on disk; the highest applied is `0070`. So:

| File | Implements | Applied? |
|---|---|---|
| `0071_create_booking_units_at_creation.sql` | **A0 D5** — serials assigned at creation | **No** |
| `0072_portal_email_binding_policies.sql` | **A0 D2** — portal binding by verified email | **No** |
| `0073_discount_policies.sql` | **A0 D3** — discount policies | **No** |

**All three of Appendix A0's ruled decisions have draft migrations that are written but not
applied.** The rulings are made, the SQL exists, and the database is still running the pre-ruling
schema. Anyone reading A0 as "settled, therefore in effect" will be wrong about all three — which is
precisely why the discount UI would fail against the live constraints.

---

## 6. Verdict

**SOUND.** Six "zero importer" findings, one "no data layer" finding, five live-database facts and
the nine-constraint collision all re-derived independently and all confirmed. The single
contradiction found was this pass's own misreading of `schema_migrations`.

The register's headline — that roughly a quarter of v2.5's Layer D is correct as written — is
supported by every part of it that this pass was able to test independently.

**Not checked by this pass:** the per-claim verdicts inside the fourteen per-screen files. This was
a spot-check of the load-bearing findings, not a re-run of all 329 claims. The claims sampled were
chosen for consequence — the ones that change what gets built — rather than at random, so this is
evidence the register is trustworthy where it matters most, not proof that every individual verdict
is right.
