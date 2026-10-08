# Babin Rentals OS — Production deployment runbook

**Status:** Repository runbook, not evidence of a completed production release.  
**Scope:** The Vite operations app and separate public `marketing.html` entry.  
**Authority:** [Documentation order](docs/00_READ_FIRST.md), [permissions](docs/PERMISSIONS.md), [current state](docs/CURRENT_STATE.md), [progress](PROGRESS.md), and [backup protocol](BACKUP_PROTOCOL.md). Use fresh gate output and a live inventory; dated status text can be stale.

## 1. What this repository actually ships

| Area | Current implementation |
|---|---|
| Client | React 18, TypeScript 5.7, Vite 5, Tailwind v4; npm with `package-lock.json` |
| Backend | Supabase Auth, Postgres, RLS, SQL migrations in `supabase/migrations/` |
| Offline | Dexie outbox and PWA; custody stage transitions refuse offline queuing (R-40) |
| Build | `npm ci` then `npm run build`; output `dist/index.html` and `dist/marketing.html` |
| Verification | GitHub Actions on pushes and pull requests, Node 24; no deploy job |
| Serving | `vercel.json` or `Dockerfile` + `nginx.conf`; the repo does not select a production host |
| Monitoring | Optional `VITE_SENTRY_DSN` reporter; blank disables it |

The committed Vercel and nginx configurations preserve real files, serve unknown app routes from `index.html`, keep hashed assets immutable, and revalidate the service worker. Verify deep links and `marketing.html` on whichever host is chosen. The Docker image has `/healthz`; that endpoint only proves nginx responds.

## 2. Release boundaries

- **N-5:** Agents do not apply migrations to live Supabase. Write and verify them locally; Babin performs the backup and live apply after reviewing the exact pending set. `npm run db:apply` is local only. Never reset the production database.
- A migration is **VERIFIED** only when `npm run check:pglite` and `npm run check:lifecycle` both pass in the same run. Distinguish **WRITTEN**, **VERIFIED locally**, **APPLIED live**, and **PRODUCTION-VERIFIED** in release records.
- Do not disable RLS, expose a service key, weaken a permission to make a release pass, or use a frontend check as the sole authorization layer. [PERMISSIONS.md](docs/PERMISSIONS.md) §§3–6 controls all nine roles: Owner, Admin, Manager, Coordinator, Warehouse, Technician, Accounts, Driver, Client. Warehouse, Technician, Driver, and Client are money-blind.
- Payments are immutable reversal records, deposits are liabilities, and custody transitions are fail-closed RPCs. Check database reservation exclusion, stage gates, and close gates against the live schema before announcing readiness.
- A green CI build proves source integrity, not production configuration or a live migration. `docs/CURRENT_STATE.md` is a dated snapshot; compare it with the migration files, `PROGRESS.md`, and current live evidence.

## 3. Environment and build

Use separate local, staging, and production Supabase targets. Record their project references outside this document and verify the target immediately before each operation. Never point ordinary development at production.

Copy `.env.example` to an ignored local file. The deployed build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `VITE_SENTRY_DSN` and `VITE_APP_VERSION` are optional. `VITE_DEV_AUTH_BYPASS` is development-only and must not be used as a release validation path. Do not add generic `NEXT_PUBLIC_*`, `DATABASE_URL`, or service keys to the Vite build. Every `VITE_*` value is public and is embedded **at build time**; `docker run -e` cannot repair a bundle built against the wrong target. Restart Vite after changing local env values.

The app throws a clear configuration error if required Supabase values are missing at runtime. CI deliberately builds without live values, so a release operator must verify the production build's target and anon key class before upload without printing either credential. Install from the lockfile with `npm ci`. The Dockerfile uses Node 20 for its build stage while CI uses Node 24: verify the chosen production builder against the CI result and resolve any version discrepancy before release.

Secrets for server processes, Supabase functions, and database access stay in their respective secret stores. The repository has no `supabase/functions/` directory or configured function deployment job; do not invent a function deploy step. Keep `.env.local`, `.env.staging`, `.env.production`, and local variants uncommitted.

## 4. Pre-deployment audit and gate

Create a release record with commit, version, operator, chosen host, production origin, Supabase project reference, current live migration head, pending migration filenames, backup reference, and previous deploy reference. Decide staging and production promotion flow before enabling automatic deployment; the repository CI currently validates but does not publish.

1. Inspect `git status`, `package-lock.json`, `vite.config.ts`, `vercel.json`, `Dockerfile`, `nginx.conf`, `.github/workflows/ci.yml`, `.env.example`, and the actual migration directory. Preserve unrelated working-tree changes.
2. Inventory the **live** schema, migration ledger, RLS policies, grants, security-definer RPCs and `search_path`, Auth redirect URLs, storage buckets and object policies, and any external functions or integrations. Compare with the repository. Never infer the live head from a dated document. Review destructive SQL, backfills, locks, and compatibility with the currently deployed frontend.
3. Confirm booking conflicts are rejected at the database level and custody stage transitions, pending-damage close gate, payment integrity, and money-blind reads/writes hold under representative roles. Check client PII isolation through API queries, exports, search, and realtime—not just UI visibility. A critical exposure or double-booking path blocks release.
4. Verify the chosen origin uses HTTPS, Supabase Auth Site/redirect URLs match it, and the host serves direct deep links, `marketing.html`, static assets, and the PWA update files correctly. Set restrictive response headers only after testing the required Supabase and monitoring connections.
5. Check backup and restore procedure with [BACKUP_PROTOCOL.md](BACKUP_PROTOCOL.md). **Its hard-coded migration list is historical**; reconcile it against the current repo and live ledger before use. Protect the database connection string from command logs and release notes. A backup file alone does not prove a restore is possible.

Run in this order for the release commit:

```bash
npm ci
npm run typecheck
npm test
npm run check:pglite
npm run check:lifecycle
npm run build
```

Also run `npm run lint`, `npm run lint:progress`, `npm run check:contrast`, and `npm run test:coverage` as CI does. Record each exit code and the test/lifecycle totals. An incomplete or stalled `npm test` is **unverified**, even if many files passed. A build with missing real `VITE_*` values is a compile check, not a deployable artifact. Review dependency advisories without automatically forcing upgrades.

## 5. Staging and production sequence

1. Build staging against a separate staging Supabase project, apply the exact proposed migration set there, and rehearse representative existing data plus the critical smoke checks below. Prefer compatible additive migrations; remove old schema only in a later release.
2. Babin verifies a fresh, recoverable production backup using the current protocol and records its timestamp and storage location. Record the live migration ledger again and stop if it changed since review.
3. Babin applies the reviewed migrations under N-5. Record **APPLIED** only after checking the live ledger and postconditions. Do not use a blind migration push or an automatic destructive rollback.
4. Deploy the frontend built with the confirmed production **anon** key and URL, then verify the exact deployed commit/version, DNS, HTTPS, auth redirects, direct app routes, `marketing.html`, service-worker update, and error telemetry.
5. Run smoke tests as representative authorized and money-blind roles. Mark **PRODUCTION-VERIFIED** only after observing live behavior. Monitor errors, failed RPCs, and operational reports after release.

### Critical smoke checks

| Surface | Live check |
|---|---|
| Auth | Owner and staff login/logout, expired session, disabled account, protected direct URL, role change |
| Today and dates | Pickups/returns on the correct Kathmandu operational day (06:00–06:00 NPT); AD stored in UTC, BS rendered only |
| Booking | Create, multi-item availability, overlapping concurrent requests, cancellation, reservations and document number |
| Floor | Pack, handover, return, inspect, pending-damage refusal, close; offline custody action visibly refuses instead of queuing |
| Money | Authorized payment record and reversal, partial balance, liability treatment of deposits; no amount in money-blind UI **or API response** |
| Clients and storage | Cross-client PII refusal, private document access, signed URL expiry where used |
| Serving | Refresh a deep link, open `marketing.html`, test mobile/tablet controls and a new PWA version on a cached device |

Use reversible test records or a controlled staging rehearsal for flows that would alter real production business records. Record which checks were run live and which were staging-only. A production release is not complete while a required live check is unverified.

## 6. Failure and rollback

Stop promotion for failed auth, unauthorized data access, double booking, payment or return failure, missing inventory, data corruption, or a failed required gate. Contain any security exposure immediately. Keep the previous frontend artifact available; roll back the frontend only when it remains compatible with the migrated schema. For database errors, prefer a reviewed forward fix. Restore a backup only under an incident plan that accounts for writes made since the backup; never execute destructive rollback SQL automatically.

The release record should end with a table of **PASS / WARNING / BLOCKER** for build, tests, security, database, auth, RLS, booking integrity, workflow, payments, monitoring, backup, and rollback. Include exact verification evidence and outstanding blockers. Do not translate these into an unsupported readiness percentage.
