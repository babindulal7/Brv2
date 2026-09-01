# Babin Rentals OS — Data Flow Audit

Audit of 1 Sep 2026 at `4696af8`.

> ## ⚠ Status: STRUCTURE MAPPED — BEHAVIOUR NOT TESTED
>
> This document records the data layer as it exists in source, plus the data-flow defects
> found during the interaction audit. It does **not** yet answer your §2 trace
> (`USER ACTION → … → DATABASE → … → OTHER AFFECTED SCREENS`), because the runtime pass
> was carried out in **mock mode**, which is in-memory and states plainly that *"nothing
> you change leaves this browser."*
>
> Anything below marked **NOT TESTED** genuinely was not tested. Nothing here is inferred
> from reading code and then reported as verified.

---

## 1. Data layer inventory (§4, §54)

### Server actions — 40 write paths
```
cases/       resolveCase
clients/     createClient · updateClient · blockClient · mergeClients
crew/        bookCrew
documents/   createDocument
finance/     recordPayment            payments/ refundPayment
inspections/ startInspection · passInspection · failInspection
inventory/   createEquipment · createBundle · reserveEquipment · packEquipment
             readyForPickup · createStockTransfer · reconcileStockCheck
             approvePurchaseRequest
maintenance/ createMaintenanceJob · completeMaintenance
notes/       addBookingNote
rentals/     createRental · saveDraft · confirmRental · packRental · handoverRental
             completePickup · startReturn · returnRental · completeReset
             extendRental · cancelRental · reviewEvidence · releaseBookingLineUnit
             floorVerb
subrentals/  createSubRental
core.ts      shared write primitives (idempotentInsert / safeUpdate)
```

### Read layer — 20 query modules
```
audit · availability · backup · bankAccounts · bookingNotes · bookings · bundles
clients · facetCounts · filterParams · finance · inventory · listQuery · numbering
sessionBranch · staff · stockAudits · useClients · useFilters · useList
```

**Observation (positive):** writes are centralised in `actions/` and reads in
`lib/queries/`. Pages do not appear to talk to Supabase directly — consistent with the
project law *"Pages never implement business logic — the engines own it."* This is the
right shape for the propagation tests in §15/§62 to be tractable.

---

## 2. Data-flow defects found in this pass

### DF-001 — A status enum contradiction that would fail on real data
*(Pre-existing, documented, deliberately blocked — repeated here because it is a data-flow
defect and belongs in this file.)*

| Layer | Type | Members |
|---|---|---|
| Postgres `item_quantity_state` (`0001_enums.sql:42-48`) | 5 | Ready, Picked Up, Returned, Missing, **Damaged** |
| `ItemState` (`lib/workflow.ts:120`) | 4 | *no* Damaged — §1.6 rules it a condition carried alongside `Returned` |

`assertItemCounts` sums **four** buckets. A row stored as `'Damaged'` falls into none of
them, **so the invariant fails on real data.** Narrowing the TS type without a migration
would be a lie about the DB — Postgres still accepts `'Damaged'` on
`booking_line_units.unit_state` (`0002:235`) and
`session_line_movements.resulting_item_state` (`0003:198`).

Recorded at `types/database.ts:28`, owned by PLAN.md §4.16. **Needs a schema ruling, not
a code fix.** Flagged here because it is precisely the kind of defect the §14/§15 CRUD
stage would surface as a runtime crash.

### DF-002 — Status *icons* are not linked to a real registry
See BUG-001. The status **colour** pipeline is type-enforced end to end; the status
**icon** pipeline is typed `Record<StatusKey, string>` and three of eight entries name
glyphs that do not exist. A display-layer break, but it originates in the shared
`lib/status.ts` contract that every screen reads.

### DF-003 — Hardcoded operational figure in the shell
The header notification badge renders a literal **"12"** on all 56 routes. It is not
derived from any query. Per your §53 (hardcoded data audit), a demo value driving
production chrome — and it advertises 12 items of pending work that cannot be opened.

*(A systematic §52/§53 sweep for mock/hardcoded values was **not** run. This one surfaced
incidentally.)*

---

## 3. What the status system does guarantee

Verified statically, and worth recording because it is unusually well built:

- Status maps are `Record<Union, StatusKey>`, so **`tsc` proves exhaustiveness** — an
  unmapped status cannot compile. Typecheck passes, so there are none.
- `Badge.tsx:143` degrades safely: `STATUS[statusKey] ?? STATUS.neutral`, with the lookup
  guarded by `if (status && BOOKING_STATUS[status])`.
- Lifecycle ordering is single-sourced in `workflow.ts` (`canAdvance` enforces
  forward-only, no skipping) and rendered from one component per project law.

So the *colour and ordering* half of the status contract is sound. The gaps are the icon
registry (DF-002) and the DB/TS enum mismatch (DF-001).

---

## 4. NOT TESTED — the entire behavioural half

| Spec § | Test | Status |
|---|---|---|
| §12 | Form → DB → success → UI → **refresh → persists** | ❌ |
| §14 | CRUD per entity (rental, client, item, payment, document, expense, crew, bundle…) | ❌ |
| §15 | Propagation: client → rental → invoice → payment → documents → reports | ❌ |
| §16 | Rental lifecycle Quote→Booked→Packed→On Rent→Returned→Closed | ❌ |
| §17 | Pricing: rate × days − discount + VAT + deposit; front vs back agreement | ❌ |
| §30 | Availability reacting to rental state | ❌ |
| §31 | Payment: partial → remaining → PAID | ❌ |
| §33 | Reports derived from DB, not hardcoded | ❌ |
| §44 | Data identity — Customer A never shows Customer B | ❌ |
| §45 | Stale cache across two views | ❌ |
| §46 | FK integrity after edit/delete | ❌ |
| §54–§56 | API contract, DB field mapping, state synchronisation | ❌ |
| §62 | One rental correct across all 9 screens | ❌ |

---

## 5. How to run this stage properly

1. **Environment.** `npm run db:start` (local Supabase) → `npm run db:apply` →
   `npm run dev:local`. **Never the live project** — `CLAUDE.md` forbids applying
   migrations to live Supabase without explicit approval, and §14 requires creating and
   deleting real records.
2. **Seed identifiable data.** `QA TEST CLIENT 001`, `QA Camera 001`, `QA Rental 001` —
   greppable in DB and UI, trivially removable.
3. **Trace one entity end to end** (§61 master test) before breadth. One rental driven
   Quote→Closed, checked on all 9 screens (§62), finds more than 50 shallow CRUD checks.
4. **Assert at the database, not the UI.** After each write, query Postgres directly.
   A green toast is not evidence — your §39 makes exactly this point.
5. **Refresh after every mutation** (§40). This is the step that catches optimistic UI
   that never persisted.
6. **Watch `DF-001` specifically.** Mark an item Damaged on return; if `assertItemCounts`
   throws, that is the predicted failure and it is a P0.

---

## 6. Honest summary

| Question | Answer |
|---|---|
| Is the data layer well structured? | **Yes** — 40 actions, 20 query modules, clean read/write separation |
| Are pages free of business logic? | **Appears so** — no direct Supabase calls found in pages |
| Is the status contract type-safe? | **Colour yes, icon no** (DF-002) |
| Do writes reach the database? | **UNKNOWN — not tested** |
| Does data propagate across screens? | **UNKNOWN — not tested** |
| Does data survive refresh? | **UNKNOWN — not tested** |
| Is pricing arithmetic correct? | **UNKNOWN — not tested** |

**Do not treat the 91% readiness figure in `FULL_FUNCTIONAL_AUDIT.md` as covering any
row in this table.** It scores navigation, buttons and form input only.
