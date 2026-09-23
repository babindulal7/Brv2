> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# Database Audit

## Verdict and method

Repository schema: **strong, but not sufficient evidence of production state**. All 122 SQL files apply in filename order to PostgreSQL 18/PGlite and all 18 lifecycle assertions pass. PGlite exercises PostgreSQL functions, triggers, constraints and configured RLS roles; it does not reproduce Supabase JWT/PostgREST, production grants, extensions, rows, pooling or drift. Docker/Supabase rebuild and live migration listing were unavailable.

## Data model map

| Domain | Principal objects | Relationships / authority |
| --- | --- | --- |
| Identity | `users`, branches, warehouses, PIN/auth support | `users.id` maps the authenticated identity; role/active status feed authorization functions |
| Clients | `clients`, contacts, addresses, KYC/membership/credit objects | bookings and finance rows retain client relationships |
| Catalogue | `products`, `product_units`, bundles/components, categories | serialized units are distinct from quantity-tracked products |
| Rentals | `bookings`, `booking_lines`, `booking_line_units`, discounts, notes, documents | booking is aggregate root; lines/units are retained and voided rather than deleted |
| Availability | `inventory_reservations`, reservation conflicts | live reservation range ties booking and asset/quantity demand |
| Floor operations | sessions, session items, movements, signatures, findings, cleaning/reset | stage transitions and session close functions own consequential state |
| Finance | invoices/lines, payments, deposits, expenses, reversals, credits | snapshots and append-only restrictions protect historical money |
| Audit/sync | `audit_events`, sync cursors/version columns | audit/event trail and optimistic versioning support traceability |

The generated Supabase type file is large and gives row/insert/update shapes, but generated types do not prove live schema parity.

## Constraints, indexes and impossible states

| Rule | Repository enforcement | Test result |
| --- | --- | --- |
| Return after pickup | `bookings_return_after_pickup` check | migration chain passes |
| Positive quantities/days | line/table checks and RPC validation | lifecycle quantity case passes |
| Serialized overlap | GiST exclusion on `(asset_id, period)` | exact overlap rejected; half-open turnaround accepted |
| Quantity availability | capacity-ceiling function/locking in `0045` | over-capacity demand rejected |
| Direct unit-state writes | engine trigger in `0114` | rejected in L15 |
| Invalid stage/session close | transition/session gates in `0115` | floor sequence requires session rows |
| Negative/wrong/excess payment | payment validation plus global ceiling (`0107`, `0118`) | four invalid payments rejected |
| Invoice rewrite | issued snapshot/immutability controls | issue and immutability pass |
| Invalid closure | `0116` requires invoice settlement, deposits, cases and reservations clear | premature close rejected |
| Role escalation/deletion | `0120` role ceiling, self/last-owner/deletion guards | role/immutability checks pass |

Indexes exist for booking branch/stage/pickup/return/client and numerous foreign-key/search paths. A full index-to-production-query-plan review is **UNABLE TO VERIFY** without representative row counts and `EXPLAIN (ANALYZE, BUFFERS)` from staging.

## Functions, triggers and RPCs

Material server-owned paths include booking creation, stage transitions, reservation writing/conflict recording, booking extension, invoice create/issue/close/void, payment validation, cancellation, and unit-status derivation. The strongest pattern is transactional server ownership plus append-only audit/financial rows.

AUD-001 is resolved in the working tree by `0124`: pickup/return changes move active reservations in the same transaction, re-exercising unit exclusion and quantity capacity enforcement. Lifecycle L18 proves safe synchronization and rollback of conflicting direct/RPC changes. Deployment remains unverified; line-day/invoice repricing remains AUD-010.

## RLS and grants

RLS policies are repeatedly tightened by later migrations. Final-intent examples include client-own rows (`0110`), money-blind masking/write refusal (`0062`, `0102`, `0119`), staff visibility/role ceiling (`0120`), and anonymous audit-write refusal (`0091`). Early `USING (true)` text cannot be judged in isolation because later files drop/recreate policies.

A definitive per-table SELECT/INSERT/UPDATE/DELETE matrix requires evaluating the final applied schema and `information_schema`/`pg_policy`, not grepping individual migrations. That final live matrix is **UNABLE TO VERIFY**. Required release evidence is a generated policy/grant manifest tested as Owner, Admin, Manager, Coordinator, Warehouse, Accounts, Technician, Driver, Client, anonymous and disabled user.

## Migration audit

- Ordering: lexicographic filenames produce 122 successful applications.
- Fresh database: **CONFIRMED in PGlite**, not Supabase.
- Destructive intent: later migrations predominantly add/replace functions, policies, triggers and constraints; the application uses archive/void/cancel patterns for critical records.
- Conflicts: no migration execution conflict in PGlite.
- Environment-specific risk: Supabase Auth/PostgREST, extension availability, object storage and deployed hashes are unproved.
- Live version: **UNABLE TO VERIFY**. Any claim that production stops at a particular migration number is unsupported by this audit.

## Data integrity and live data

Orphans, duplicates, closed bookings without invoices, unmatched payments, blocked-client overrides and live reservation drift are **UNABLE TO VERIFY** because authenticated production rows were unavailable. The anonymous check returning zero rows is evidence that public reads did not reveal those rows, not evidence they do not exist.

## Required database acceptance gate

1. Restore a production-shaped snapshot to isolated staging.
2. Compare migration hashes and final functions/triggers/policies/grants with source.
3. Run the 18 lifecycle checks through real Supabase Auth/PostgREST.
4. Extend AUD-001 to quantity/bundle reschedules and real concurrent sessions.
5. Run invariant SQL for orphans, invalid dates/amounts, reservation/date mismatch, unit-state drift and closure conditions.
6. Capture query plans at production-like volumes.
