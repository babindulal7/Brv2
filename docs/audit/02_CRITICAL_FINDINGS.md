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

# Critical Findings — P0/P1

## AUD-001 — Booking date edits could bypass reservation synchronisation

Severity: **P0**  
Area: Availability / database  
Verification: **CONFIRMED; RESOLVED IN WORKTREE**

### Summary
Before migration `0124`, confirmation and `extend_booking` maintained reservations but general booking-date changes had no equivalent synchronizer. The working tree now updates every live reservation in the same transaction and re-exercises conflict constraints.

### Evidence
`0124_reservations_follow_booking_dates.sql` installs `trg_reservations_follow_booking_dates` after updates of pickup/return and changes active `inventory_reservations.period`. PGlite applies 122/122 migrations. Lifecycle L18 creates adjacent bookings for one unit, proves a safe date change moves the reservation, and proves overlapping direct and RPC changes roll back; 18/18 lifecycle checks pass.

### Reproduction
Run `npm run check:lifecycle -- --only L18`. The safe reschedule succeeds with matching booking/reservation bounds. Both overlap attempts are refused by `inventory_reservations_no_double_booking`, and original dates remain.

### Root Cause
Historically the invariant lived in confirmation and the extension RPC, not at the booking schedule mutation boundary.

### Business Impact
The historical gap was a double-booking/data-integrity risk. Current residual risk is deployment drift: the live project is not proved to have migration `0124`.

### Affected Files
`supabase/migrations/0124_reservations_follow_booking_dates.sql`, `scripts/e2e-lifecycle.mjs`

### Database Objects
`bookings`, `booking_lines`, `inventory_reservations`, `extend_booking`

### Recommended Fix
Implemented for availability via an atomic trigger. Deploy only after backup/staging verification. Treat line-day and draft-invoice repricing as the separate AUD-010 policy decision.

### Required Tests
Added: serialized safe/direct-conflict/RPC-conflict rollback. Remaining: quantity and bundle reschedules, exact/partial/contained edges, two real concurrent Supabase sessions, and live PostgREST verification.

### Dependencies
Production backup, staging application of `0124`, live migration baseline, and real JWT/PostgREST test identities.

## AUD-002 — Scanner turns unknowns and failures into success

Severity: **P1**  
Area: Operations / error handling  
Verification: **CONFIRMED**

### Summary
The global scanner queries obsolete `equipment_items`; no-match emits “verified” and exceptions emit “scanned,” both as success.

### Evidence
`src/components/shell/ScannerFab.tsx:275-299` contains all three paths. Current inventory readers elsewhere use `product_units_v`/`products_v`.

### Reproduction
Submit an ordinary unknown code or make the lookup fail; observe a green success response.

### Root Cause
Legacy schema reference and fail-open result handling.

### Business Impact
Staff may pack, hand over or return an unverified/wrong physical unit.

### Affected Files
`src/components/shell/ScannerFab.tsx`

### Database Objects
Obsolete `equipment_items`; intended `product_units_v`, `products_v`, `bookings`

### Recommended Fix
Use a canonical lookup service and mutually exclusive verified/unknown/wrong-job/duplicate/unavailable results. Errors must never be success.

### Required Tests
Known unit/booking, unknown, denied query, network failure, malformed UUID, duplicate, wrong job and authorization context.

### Dependencies
Canonical code/asset/serial lookup contract.

## AUD-003 — Seed records replace real empty/error states

Severity: **P1**  
Area: Data truthfulness  
Verification: **CONFIRMED**

### Summary
Sub-rentals, documents and cases substitute fixtures when Supabase returns empty/error results; other screens openly render sample operational data.

### Evidence
`src/lib/queries/subrentals.ts` returns `SUB_RENTAL_DATA`; query tests for sub-rentals, documents and cases explicitly assert seeded fallbacks.

### Reproduction
Return zero rows or an error from one of these query clients and open its list.

### Root Cause
Prototype fixtures remain runtime resilience behavior.

### Business Impact
Staff cannot distinguish real data, an empty business state and an outage.

### Affected Files
`src/lib/queries/subrentals.ts`, `documents.ts`, `cases.ts`, related `src/data/*` fixtures and consumers

### Database Objects
Sub-rental, document and case read models

### Recommended Fix
Allow fixtures only in explicit demo/test mode. Production returns typed empty, denied and failed states.

### Required Tests
Empty, denied, timeout, malformed response, offline and explicit demo injection.

### Dependencies
Environment model and shared query-state UI.

## AUD-004 — Evidence and receipt storage are absent

Severity: **P1**  
Area: Files / operational evidence  
Verification: **CONFIRMED**

### Summary
Evidence upload/download and expense receipt upload are explicitly unavailable; no production Storage client call or object policy was found.

### Evidence
`src/modules/rentals/EvidenceWorkspace.tsx:78-117` states there is no bucket/writer; `src/modules/finance/Expenses.tsx:129` says receipt upload is not built.

### Reproduction
Open Evidence or an expense receipt action; the UI reports that nothing can be stored.

### Root Cause
Metadata/UI were designed before storage ownership, access and retention.

### Business Impact
Damage, handover, return and expense disputes lack durable proof.

### Affected Files
`src/modules/rentals/EvidenceWorkspace.tsx`, `src/modules/finance/Expenses.tsx`

### Database Objects
Evidence/expense metadata; absent/unverified buckets and `storage.objects` policies

### Recommended Fix
Private buckets, deterministic object keys, signed access, MIME/size limits, retention, malware handling and safe metadata/object compensation.

### Required Tests
Cross-role/booking access, wrong type, oversize, interruption/retry, orphan cleanup, signed URL expiry and audit trail.

### Dependencies
Retention/privacy policy and production provisioning.

## AUD-005 — Backup and recovery are presentation-only/unproved

Severity: **P1**  
Area: Disaster recovery  
Verification: **CONFIRMED** for app capability; **UNABLE TO VERIFY** for provider backups

### Summary
The Backup/Restore page has no service. Supabase PITR, object backups, RPO/RTO and restore drills were inaccessible.

### Evidence
`src/modules/admin/BackupRestore.tsx:798` labels the service not built; no automated restore drill/runbook was found.

### Reproduction
Open the admin backup action; it cannot create or restore a checkpoint.

### Root Cause
Recovery UI precedes backend/provider operations.

### Business Impact
Deletion, corruption, bad migration or outage has no demonstrated recovery path.

### Affected Files
`src/modules/admin/BackupRestore.tsx`, deployment/runbook configuration

### Database Objects
Entire database and object storage

### Recommended Fix
Set RPO/RTO, verify provider backups/PITR, and perform isolated restore drills with rollback/roll-forward instructions.

### Required Tests
Latest/PITR restore, payment/rental recovery, failed migration, object restore and credential rotation.

### Dependencies
Supabase plan and named operational owner.

## AUD-006 — Live schema, RLS and identity state are unknown

Severity: **P1**  
Area: Deployment / security assurance  
Verification: **UNABLE TO VERIFY**

### Summary
Repository migrations are strong, but no evidence establishes which migrations, policies or users are active in production.

### Evidence
`supabase migration list` reported “project not linked”; `supabase status`/`check:rebuild` failed because Docker was unavailable. Anonymous `check:db` reached the endpoint and saw no rows in 23 resources, which cannot inspect migration history or authenticated policy behavior.

### Reproduction
Run those commands in the audited environment.

### Root Cause
No read-only audit link/credential or signed deployment manifest.

### Business Impact
Source tests can give false confidence if production has schema/grant/policy drift.

### Affected Files
`supabase/migrations/*`, environment and release configuration

### Database Objects
All schema objects, grants, policies and `auth.users`

### Recommended Fix
Compare migration hashes, functions, triggers, grants and policies in staging then production; gate deploys on a signed drift manifest.

### Required Tests
All roles, anonymous, disabled user, last Owner, money-blind payloads and the 17 lifecycle checks through Supabase/PostgREST.

### Dependencies
Read-only production access and staging clone.

## AUD-007 — Core routed write paths are incomplete

Severity: **P1**  
Area: Functional completeness  
Verification: **CONFIRMED**

### Summary
Decisive actions cannot persist for equipment creation, evidence, case creation, expense receipts/reversals, KYC/tier/credit controls, portions of documents/reports and backup.

### Evidence
Examples: `src/data/addEquipment.ts:231`, `src/data/cases.ts:1009`, `Expenses.tsx:129-144`, client modal unavailability constants, `ReportToolbar.tsx:93`, `BackupRestore.tsx:798`.

### Reproduction
Open each page and invoke its named unavailable action.

### Root Cause
Navigation and visual implementation outpace service/action completion.

### Business Impact
The OS cannot yet be the single operational system of record.

### Affected Files
See the route inventory in `03_FULL_FINDINGS.md`.

### Database Objects
Feature-dependent; several tables lack a supported transactional UI/API.

### Recommended Fix
Define the production minimum, hide deferred features through an explicit manifest, and implement one authoritative action per workflow.

### Required Tests
Save/reload, duplicate submit, auth, validation, audit row, bad network and rollback per action.

### Dependencies
Product scope and live schema verification.

## AUD-008 — Current release gates are red

Severity: **P1**  
Area: Build / quality  
Verification: **CONFIRMED** for lint/tests; build **UNABLE TO VERIFY**

### Summary
Lint has 33 errors/four warnings and Vitest has three failures. A clean build was not established because Windows locked a native dependency during `npm ci`; the recovered local install is missing a declaration file present in the package archive.

### Evidence
Vitest: 203/205 files and 3,292/3,295 tests pass; failures are Law 17 terminology (two assertions) and Operations scope/drawer behavior. Repeated React `act` and jsdom navigation warnings occur. `npm ci` failed with EPERM on `lightningcss`; typecheck/build then stop on the damaged local Tabler package.

### Reproduction
Run `npm ci`, `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build` on this checkout.

### Root Cause
Current regressions/lint debt plus a contaminated locked dependency tree.

### Business Impact
No reproducible release artifact exists for the audited snapshot.

### Affected Files
`DashboardMovementPanel.tsx`, `OperationsQueues.tsx`, `operationRoutes.test.tsx`, lint-reported files and local dependencies

### Database Objects
None directly

### Recommended Fix
Re-run on clean CI, repair test/lint failures, and require the complete CI gate for release. Do not label the local declaration loss a product bug unless CI reproduces it.

### Required Tests
Clean install, typecheck, lint, full Vitest, PGlite, lifecycle, coverage, production bundle and service-worker smoke.

### Dependencies
Clean runner and stable working tree.
