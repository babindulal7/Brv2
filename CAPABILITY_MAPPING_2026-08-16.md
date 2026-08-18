> ✅ **APPLIED 16 Aug 2026 — kept as the derivation record.** `checkCapability` went from 11
> cases to 32, and `core.test.ts` now carries a regression guard ("every declared capability
> resolves to a rule") that was mutation-tested — its first version could not see a
> commented-out `case`. Only the three `inspection.*` remain unmapped, deliberately: no table
> exists to mirror. `ARCHIVE_AUDIT` B1 is closed against this file.
>
> Its method is the one `PLAN.md` §4.20 established and should be reused: **a capability takes
> the role set of the RLS policy on the table its action writes.** That is not inventing a
> product decision — it is reading one already made, in SQL.

# Closing B1 — the 24 unmapped capability strings

**Status:** ready to apply. No source files touched by this document.
**Derived:** 16 Aug 2026, read off project `sxguwvgoserhdolewibb` (live).

---

## 1 · The problem, precisely

`src/actions/core.ts:116-161` is the whole capability switch. It handles **11** cases and
ends `default: return undefined`. `createAction` treats `undefined` as a denial:

```ts
if (config.implemented !== true) throw new ActionNotImplementedError(config.name)
```

32 distinct capability strings are declared across `src/actions/`. Eight are both declared
and handled. **24 are declared and unhandled** — so the moment any of those 24 actions gets
a real body, it is denied **for every role including Owner**.

This is not hypothetical. The comment block already in `core.ts` records that exact failure
shipping for three days across `rental.confirm`, `client.create`, `client.block` and
`inventory.create`. The remaining 24 are the same trap, unsprung.

**Close this before writing any action body.** It is a prerequisite of B2, not a follow-up.

---

## 2 · Method — not invented

The rule is already established and closed (PLAN.md §4.20, and the `core.ts` comment):

> *"Each capability is now the role set of the RLS policy on the table its action actually
> writes… so a capability still cannot be granted here and denied at the row."*

Every entry below is that, and nothing else. The role sets were read from `pg_policies` on
the live project, not from a spec or a migration file header.

Because the actions are stubs, none of them names its own target table. The table was
established from the schema instead — named in each row below so the derivation is
checkable rather than asserted.

---

## 3 · The four role sets that actually exist

Read from `pg_policies`, 16 Aug:

| Set | Roles | Live policy expression |
|---|---|---|
| **A — booking desk** | Owner · Admin · Manager · Coordinator · Warehouse | `auth_user_role() = ANY(ARRAY['Owner','Admin','Manager','Coordinator','Warehouse'])` |
| **B — floor** | Owner · Admin · Manager · Warehouse | same, **without Coordinator** |
| **C — back office** | Owner · Admin · Manager | same, three only |
| **D — any staff** | all eight staff roles (Client excluded) | `auth_is_staff()` |

Set A already exists in code as `BOOKING_DESK` (`src/lib/rbac.ts:71`).
Set D already exists as `isStaff()` (`src/lib/rbac.ts:53`, `role !== 'Client'`).
**Sets B and C need adding.**

The A/B split is the meaningful one: Coordinator can take a booking and a client, and
cannot touch the floor — no operation session, no stock movement, no maintenance record.

---

## 4 · The mapping — 21 of 24 derivable

| Capability | Action | Writes | Set | Roles |
|---|---|---|---|---|
| `rental.create` | createRental | `bookings` (INSERT) | **A** | Owner·Admin·Manager·Coordinator·Warehouse |
| `rental.draft` | saveDraft | `bookings` (INSERT, Quote) | **A** | ” |
| `rental.cancel` | cancelRental | `bookings` (UPDATE) | **A** | ” |
| `rental.extend` | extendRental | `bookings` + `booking_lines` | **A** | ” |
| `client.update` | updateClient | `clients` (UPDATE) | **A** | ” |
| `inventory.reserve` | reserveEquipment | `inventory_reservations` | **A** | ” |
| `document.create` | createDocument | `document_registry` | **A** | ” |
| `subrental.create` | createSubRental | `booking_lines` (`line_type='Sub-rental'`) | **A** | ” |
| `rental.pickup` | completePickup | `operation_sessions` | **B** | Owner·Admin·Manager·Warehouse |
| `rental.return` | startReturn | `operation_sessions` | **B** | ” |
| `inventory.pack` | packEquipment | `operation_sessions` | **B** | ” |
| `inventory.ready` | readyForPickup | `operation_sessions` | **B** | ” |
| `inventory.audit` | reconcileStockCheck | `stock_audits` | **B** | ” |
| `inventory.transfer` | createStockTransfer | `stock_transfers` | **B** | ” |
| `maintenance.create` | createMaintenanceJob | `maintenance_records` | **B** | ” |
| `maintenance.complete` | completeMaintenance | `maintenance_records` | **B** | ” |
| `evidence.review` | reviewEvidence | `evidence_files` | **B** | ” |
| `client.merge` | mergeClients | `client_merges` | **C** | Owner·Admin·Manager |
| `case.resolve` | resolveCase | `cases` | **D** | any staff |
| `crew.assign` | bookCrew | `crew_assignments` | **D** | any staff |
| `purchase.approve` | approvePurchaseRequest | `purchase_requests` | **D** | any staff |

### Two derivations worth showing

**`subrental.create` has no table of its own.** There is no `sub_rentals` table. Sub-rental
is a `booking_lines` row: `line_type` is an enum whose values are
`Equipment | Bundle | Accessory | Service | Sub-rental | Manual item`, and the line carries
`supplier_id`, `supplier_cost` and `markup_amount`. So it mirrors `booking_lines_all` → set A.
*(Creating a new **supplier** is a different act on `suppliers`, which is set C. If the
sub-rental flow ever creates suppliers inline, it needs both.)*

**`client.merge` is deliberately narrower than `client.update`.** Both touch clients, but
`client_merges_all` is Owner/Admin/Manager while `clients_update` is the booking desk five.
Merging is irreversible in a way that editing is not, and the database already says so.

---

## 5 · Three that cannot be derived — do not invent them

`inspection.create` · `inspection.pass` · `inspection.fail`

**There is no table to mirror.**

- No table matches `inspect` anywhere in the schema.
- `operation_sessions.operation` is an enum of `Packing | Handover | Return | Reset | Cleaning`
  — **Inspection is not one of them.**

So the inspection verbs have no write target, and any role set assigned to them would be
invented. Per CLAUDE.md — *"Never invent a product decision to unblock yourself"* — these
three stay unmapped and become a `TODO(decision)`:

> **TODO(decision) — where does an inspection write?** Either (a) add `Inspection` to
> `operation_session_type` and mirror `operation_sessions` (set B), or (b) give inspections
> their own table with its own policy. Until one is chosen, `inspection.*` must keep failing
> closed. Note the three actions already exist as stubs, so the decision is only blocking if
> someone tries to build them.

Failing closed on three unbuildable verbs is correct. Guessing a role set so the switch looks
complete is the failure this whole exercise exists to prevent.

---

## 6 · Ready to apply

### 6a · `src/lib/rbac.ts` — two constants

```ts
/**
 * The floor. `BOOKING_DESK` minus Coordinator.
 *
 * Mirrors the live write policy shared by `operation_sessions`, `stock_audits`,
 * `stock_transfers`, `maintenance_records` and `evidence_files` (read 16 Aug 2026):
 * Owner, Admin, Manager, Warehouse. Coordinator is absent from every one of them —
 * taking a booking is desk work, moving the gear is not.
 */
const FLOOR: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager', 'Warehouse'])

/**
 * Back office. Mirrors `client_merges_all` and `suppliers_all`: Owner, Admin, Manager.
 * Narrower than the desk because these acts are irreversible or contractual.
 */
const BACK_OFFICE: ReadonlySet<SystemRole> = new Set<SystemRole>(['Owner', 'Admin', 'Manager'])
```

### 6b · `src/lib/rbac.ts` — four predicates

One predicate per **role set**, not per capability, because the derivation is per-table and
21 near-identical functions would obscure that four rules are doing all the work. Each cites
the policy it mirrors, matching the house pattern.

```ts
/** Booking-desk writes: bookings, booking_lines, clients, inventory_reservations,
 *  document_registry. Mirrors `bookings_insert` / `clients_update` (set A). */
export function canWriteBookingDesk(role: SystemRole): boolean {
  return BOOKING_DESK.has(role)
}

/** Floor writes: operation_sessions, stock_audits, stock_transfers,
 *  maintenance_records, evidence_files. Mirrors `operation_sessions_all` (set B). */
export function canWriteFloor(role: SystemRole): boolean {
  return FLOOR.has(role)
}

/** Irreversible client-record acts. Mirrors `client_merges_all` (set C). */
export function canMergeClients(role: SystemRole): boolean {
  return BACK_OFFICE.has(role)
}

/** Shared-triage surfaces: cases, crew_assignments, purchase_requests.
 *  Mirrors `auth_is_staff()` (set D). See §7 — the DB rule here is broad. */
export function canWriteSharedTriage(role: SystemRole): boolean {
  return isStaff(role)
}
```

### 6c · `src/actions/core.ts` — 21 cases

Insert before `default:`.

```ts
    /* ── Ruled 16 Aug 2026 — the remaining 24, same method as the four above ──
     *
     * Role sets read from pg_policies on the live project, per capability, from
     * the table that capability's action writes. Derivation table:
     * CAPABILITY_MAPPING_2026-08-16.md §4.
     *
     * inspection.create / .pass / .fail are deliberately ABSENT: no inspections
     * table exists and `operation_session_type` has no Inspection value, so
     * there is nothing to mirror. They keep failing closed. See §5.
     */
    case 'rental.create':
    case 'rental.draft':
    case 'rental.cancel':
    case 'rental.extend':
    case 'client.update':
    case 'inventory.reserve':
    case 'document.create':
    case 'subrental.create':
      return rbac.canWriteBookingDesk(ctx.role);

    case 'rental.pickup':
    case 'rental.return':
    case 'inventory.pack':
    case 'inventory.ready':
    case 'inventory.audit':
    case 'inventory.transfer':
    case 'maintenance.create':
    case 'maintenance.complete':
    case 'evidence.review':
      return rbac.canWriteFloor(ctx.role);

    case 'client.merge':
      return rbac.canMergeClients(ctx.role);

    case 'case.resolve':
    case 'crew.assign':
    case 'purchase.approve':
      return rbac.canWriteSharedTriage(ctx.role);
```

---

## 7 · Three to review before shipping — mirroring gave a broad answer

Mirroring RLS is the ruled method and these follow it faithfully, but the **database rule
itself is permissive** for a verb that sounds like an approval:

- **`purchase.approve`** → `purchase_requests_all` is `auth_is_staff()`, so **Driver and
  Technician could approve a purchase request.** For a spend-authorising verb that is
  probably not intended.
- **`crew.assign`** → `crew_assignments_all` is `auth_is_staff()`. Plausible for shared
  triage; worth a glance.
- **`case.resolve`** → `cases_all` is `auth_is_staff()`. This one is consistent with the
  21 Jul shared-triage lock and is likely correct as-is.

If `purchase.approve` should be narrower, **fix the RLS policy first and let the capability
follow**, not the reverse. Tightening only the TypeScript predicate would put the app and the
database back out of step, which is the exact failure the mirroring rule prevents.

---

## 8 · How to verify it worked

1. `grep -c "case '" src/actions/core.ts` → **32** (was 11).
2. Every declared capability resolves:
   ```bash
   grep -rhoE "permissions: \[[^]]*\]" src/actions --include=*.ts | grep -oE "'[a-z]+\.[a-z]+'"
   ```
   Every result except the three `inspection.*` should appear as a `case` in `core.ts`.
3. `npx tsc --noEmit` → clean.
4. `npx vitest run` → the 1,843 baseline holds.
5. The real test: give **one** stub a body — `cancelRental` is the cheapest — and confirm it
   executes as Owner. Before this change it would have been denied.
