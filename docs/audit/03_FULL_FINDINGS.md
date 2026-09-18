# Full Findings Register

P0/P1 details are in `02_CRITICAL_FINDINGS.md`. IDs are permanent for this audit.

| ID | Severity | Verification | Finding | Evidence / scope |
| --- | --- | --- | --- | --- |
| AUD-001 | P0 | CONFIRMED; RESOLVED IN WORKTREE | Historical direct schedule updates could desynchronise reservations; `0124` now synchronizes and revalidates atomically | `0124_reservations_follow_booking_dates.sql`; lifecycle L18 |
| AUD-002 | P1 | CONFIRMED | Global scanner reports unknown/error outcomes as success and uses obsolete `equipment_items` | `src/components/shell/ScannerFab.tsx:275-299` |
| AUD-003 | P1 | CONFIRMED | Seeded rows replace empty/error results | sub-rentals/documents/cases queries and tests |
| AUD-004 | P1 | CONFIRMED | Evidence and receipt file storage are not built | `EvidenceWorkspace.tsx:78-117`; `Expenses.tsx:129` |
| AUD-005 | P1 | CONFIRMED / UNABLE | In-app backup is absent; provider recovery is unproved | `BackupRestore.tsx:798`; no restore drill |
| AUD-006 | P1 | UNABLE TO VERIFY | Applied live schema, grants, RLS and identity state are unknown | unlinked CLI; Docker unavailable |
| AUD-007 | P1 | CONFIRMED | Core routed commercial actions are intentionally unavailable | add equipment, evidence, cases, receipts/reversals, client controls, reports, backup |
| AUD-008 | P1 | CONFIRMED / UNABLE | Lint/tests fail; clean build is not presently reproducible | 37 lint problems; 3 tests; locked/contaminated install |
| AUD-009 | P2 | CONFIRMED | No browser E2E covers required commercial/device journeys | no Playwright/Cypress or E2E script |
| AUD-010 | P2 | CONFIRMED | Priced days use rounded elapsed spans; 06:00 relationship is explicitly unresolved | `src/lib/rentalDays.ts` |
| AUD-011 | P2 | CONFIRMED | Error reporting no-ops when `VITE_SENTRY_DSN` is unset, the repo default | `src/lib/monitoring.ts:22,106,206` |
| AUD-012 | P2 | CONFIRMED | Offline catalogue sync truncates products and clients at 300 | `src/lib/syncEngine.ts:162,182` |
| AUD-013 | P2 | CONFIRMED / UNABLE | 320×568 login scrolls and uses ~12.6 px text; authenticated device matrix untested | runtime viewport measurement |
| AUD-014 | P2 | CONFIRMED | Repo deployment headers omit application CSP and Permissions-Policy | `vercel.json`, nginx configuration |
| AUD-015 | P2 | UNABLE TO VERIFY | Reports cannot be reconciled with production source rows or role payloads | no production read access |
| AUD-016 | P2 | CONFIRMED | Broad queries/multi-request refreshes lack large-data proof | documents, equipment performance, Operations, sync engine |
| AUD-017 | P2 | CONFIRMED | Repeated React `act`/jsdom warnings; authenticated accessibility journeys unproved | full Vitest output |
| AUD-018 | P3 | CONFIRMED | Large modules, explicit `any`, archived code and duplicate seed/live models raise change risk | lint, `src/archive`, multi-thousand-line screens |

Every finding requires a regression test appropriate to its layer: database concurrency/invariant tests for AUD-001; explicit scanner result contracts for AUD-002; empty/error/demo-mode tests for AUD-003; object authorization/failure recovery for AUD-004; restore drills for AUD-005; authenticated role/drift verification for AUD-006; save/reload/auth/audit tests for AUD-007; clean CI for AUD-008; browser Scenarios A–J for AUD-009; approved boundary fixtures for AUD-010; staging telemetry for AUD-011; 10k sync tests for AUD-012; viewport/keyboard tests for AUD-013; header smoke tests for AUD-014; golden-ledger tests for AUD-015; query budgets for AUD-016; axe/keyboard/focus tests for AUD-017; characterization tests before AUD-018 cleanup.

## Repository map

| Area | Purpose | Important files | Dependencies | Risk |
| --- | --- | --- | --- | --- |
| Shell/routing | navigation/chrome | `src/App.tsx`, `src/components/shell/*` | Router, auth | scanner/device behavior |
| Rentals/operations | create/detail/floor lifecycle | `src/modules/rentals/*`, `src/actions/rentals/*`, `src/modules/operations/*` | Supabase RPCs | schedule invariant, incomplete evidence |
| Inventory | products, units, bundles | `src/modules/inventory/*` | views/reservations | create persistence incomplete |
| Finance/reports | invoice, payment, expenses, analytics | `src/modules/finance/*`, `src/modules/reports/*` | finance RPCs/views | live reconciliation missing |
| Identity/security | auth, RBAC, money visibility | `src/modules/auth/*`, `src/lib/rbac.ts` | JWT/PostgREST/RLS | live enforcement unknown |
| Data/offline | queries and sync | `src/lib/queries/*`, `src/lib/syncEngine.ts` | Supabase, Dexie | seed fallback, 300-row limits |
| Database | schema/rules/audit | `supabase/migrations/*` | Postgres/Supabase | strong local chain, drift unknown |
| CI/deploy | build/release/hosting | `.github/workflows/ci.yml`, `vercel.json`, Docker/nginx | Node 24/npm | current gate red, no migration deploy |

## Route inventory

| Route group | Purpose | Status from source |
| --- | --- | --- |
| `/login`, forgot/reset | session/recovery | PARTIAL: email present; SMS/PIN primary sign-in unavailable |
| `/today`, `/dashboard` | pickup/return movement | IMPLEMENTED; current Law 17 test red |
| `/rentals`, `/rentals/new`, `/rentals/:id` | list/create/detail | IMPLEMENTED; device E2E missing |
| packing/handover/return/reset/evidence | floor lifecycle | PARTIAL: DB gates strong; evidence incomplete |
| `/calendar` | calendar/agenda | IMPLEMENTED; drag reschedule unavailable |
| inventory/assets/bundles/warehouses/stock-check | catalogue/unit control | PARTIAL: equipment writer unavailable |
| clients/details/membership | client controls | PARTIAL: KYC/tier/credit writers unavailable |
| `/operations` | operation queues | IMPLEMENTED; current scope/drawer tests red |
| `/cases`, `/crew`, `/sub-rental` | exceptions/crew/suppliers | PARTIAL: case/crew actions and seed fallback |
| `/documents` | commercial documents | PARTIAL: several targets/exports unavailable |
| finance/payments/expenses/closing | ledgers/settlement | PARTIAL: payment core guarded; receipts/reversals incomplete |
| `/reports/*` | analytics | PARTIAL: saved/custom/scheduled output incomplete; parity unverified |
| settings/admin/tools | staff/audit/numbering/backup | PARTIAL: backup/settings actions unavailable |

`Crew` is routed and must not be described as inaccessible. No dead-route claim is made without a complete reachability trace.

## Build/runtime record

| Check | Result |
| --- | --- |
| `npm ci` | BLOCKED by Windows EPERM on loaded native `lightningcss` binary |
| Typecheck/build | UNABLE from contaminated install: local Tabler package lacks its declared `.d.ts`; archive contains it |
| Lint | FAIL: 33 errors, 4 warnings |
| Vitest | FAIL: 3,292 passed, 3 failed |
| Migration chain | PASS: 122/122 PGlite |
| Lifecycle | PASS: 18/18 PGlite |
| Supabase rebuild | BLOCKED: Docker unavailable |
| Contrast tokens | PASS: 40/40 |
| Browser E2E | NOT PRESENT / NOT TESTED |
