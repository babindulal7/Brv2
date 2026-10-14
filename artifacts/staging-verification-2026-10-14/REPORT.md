# Authentication and permission verification — 14 October 2026

**Release status: staging verification is blocked; local authentication and permission checks pass.** This report does not certify production or real JWT/PostgREST behavior.

## Executed evidence

| Check | Result | Evidence |
|---|---|---|
| `auth.identity.test.tsx` | 6 passed | `local-auth-tests.log` |
| `idleLock.test.tsx` | 6 passed | `local-auth-tests.log` |
| `login.test.tsx` | 7 passed | `local-auth-tests.log` |
| `rbac.test.ts` | 55 passed | `local-auth-tests.log` |
| All four focused suites | 74 passed, exit 0 | `local-auth-tests.log` |
| `npm run check:anon` | 16 assertions passed, exit 0 | `local-anon-check.log` |
| GET-only staging verifier safety self-test | 12 assertions passed; zero network calls | `verifier-safety.log` |
| Unapproved example manifest | Refused before network; exit 2 | `verifier-preflight.log` |

Authentication tests cover successful login and redirect, empty-form inline errors, email remembrance, Caps Lock feedback, initial staff identity, retaining a resolved identity during a failed refresh reread, initial failed-profile lookup without an invented role, Client fallback for an authenticated account without a staff row, and recovery after a later successful lookup. Idle tests verify PIN locking, activity reset, and refusing lock when no PIN exists. These use test doubles; they do not contact Supabase Auth.

The RBAC suite exercises the nine-role set and online/offline restrictions. The separate PGlite anon gate rebuilds the migration chain and proves: 20 callable anon functions are allow-listed helpers; 130 anon-readable tables have RLS; zero owner-rights views are readable by anon; anon and Client/Warehouse cancellation paths are refused; Owner cancellation derives the real caller rather than trusting a payload actor; anon cannot extend/void; Owner's allowed extend/void paths work; anon cannot read audit/staff/service views; Warehouse sees zero audit rows. These are throwaway local transactions, not cloud operations.

## Why staging could not be run

1. `.env.local` targets the known production project `sxguwvgoserhdolewibb`, as also identified in `docs/CURRENT_STATE.md`. It was not treated as staging.
2. `.env.localdb.local` targets loopback. Mock mode is not a real Supabase Auth/PostgREST service.
3. No explicit staging URL, Owner-confirmed staging manifest, or staff test password is available in the process environment. Only variable names and classifications were inspected; no values were printed or recorded.
4. Connected Supabase's read-only project inventory returned two projects, both **INACTIVE**. Neither is the configured production reference and neither is designated staging. No project was resumed, provisioned, altered or queried for business data.
5. The release blocker register already identifies live staging verification as pending staging provisioning. That statement is corroborated by this session's configuration/inventory checks.

**Required Owner input:** identify a separate active staging project and its app URL, confirm its isolation from production, provide a staging public key through the secure environment, and make fresh authenticated sessions available for all nine roles. Provide staging fixture identifiers for one priced product, one priced booking line, two different clients and their bookings. Do not send passwords, access tokens or secret keys into this report or chat. No production deployment or migration application was performed.

## Read-only staging verifier ready to run

`verify-staging-readonly.mjs` uses only GET requests, rejects redirects, rejects the known production reference, requires the manifest's confirmed project reference to match an explicit environment reference and standard Supabase HTTPS origin, accepts only anon/publishable client keys, checks session issuer/expiry/identity shape, and requires all nine JWTs before making any request. It never reads `.env.local` or falls back to production. Credentials and response payloads are never logged or saved.

Required secure environment variable names:

| Variable | Purpose |
|---|---|
| `BABIN_STAGING_SUPABASE_URL` | Confirmed separate staging API origin |
| `BABIN_STAGING_PROJECT_REF` | Independent explicit staging reference |
| `BABIN_STAGING_ANON_KEY` | Staging anon/publishable key only |
| `BABIN_STAGING_OWNER_JWT` | Fresh real Owner session |
| `BABIN_STAGING_ADMIN_JWT` | Fresh real Admin session |
| `BABIN_STAGING_MANAGER_JWT` | Fresh real Manager session |
| `BABIN_STAGING_COORDINATOR_JWT` | Fresh real Coordinator session |
| `BABIN_STAGING_WAREHOUSE_JWT` | Fresh real Warehouse session |
| `BABIN_STAGING_TECHNICIAN_JWT` | Fresh real Technician session |
| `BABIN_STAGING_ACCOUNTS_JWT` | Fresh real Accounts session |
| `BABIN_STAGING_DRIVER_JWT` | Fresh real Driver session |
| `BABIN_STAGING_CLIENT_JWT` | Fresh Client session bound to fixture client |

After those inputs exist, copy `staging-manifest.example.json` into a nonsecret approved manifest, fill its fixture UUIDs, and record explicit staging approval in `approvedStaging`. Run:

```powershell
node artifacts/staging-verification-2026-10-14/verify-staging-readonly.mjs <approved-manifest-path>
```

The verifier checks `/auth/v1/user`, read-only `auth_user_role` and `auth_can_view_money` RPCs, priced `products_v`/`booking_lines_v` positive controls and masks, denied money-table reads for money-blind roles, anon isolation of `audit_logs`/`staff_directory_v`/`product_units_service_v`/bookings/payments, and Client own-row vs other-client denial. Owner positive controls prove both client isolation fixture rows exist. Missing rows, server errors and absent relations cannot silently pass as denial. Empty masked view results cannot pass as successful money masking.

Exit 0 certifies only the named read-only checks. Exit 1 means assertion failures. Exit 2 means configuration or identity preflight is blocked. Results are written to `staging-readonly-result.json` beside the verifier, with names and HTTP status only. There is deliberately no generated live result for this session.

## Nine-role acceptance matrix

These expectations follow current `src/lib/rbac.ts` and the stricter permission authority. A broader module-level “Finance allowed” entry does not grant payment recording. Database enforcement remains the final authority.

| Role | Money visible | Pay / `payment.create` online | Floor sessions / `operations.perform` | Settings mutation |
|---|---|---|---|---|
| Owner | Yes | Allow | Allow | Allow |
| Admin | Yes | Deny | Allow | Deny |
| Manager | Yes | Deny | Allow | Deny |
| Coordinator | Yes | Allow | Deny | Deny |
| Warehouse | No | Deny | Allow | Deny |
| Technician | No | Deny | Allow | Deny |
| Accounts | Yes | Allow | Deny | Deny |
| Driver | No | Deny | Deny | Deny |
| Client | No | Deny | Deny | Deny |

Delivery currently has **no implemented server action or verified assigned-trip access**. The local preview allows mutations only for the intersection of `canPerformOperations` and `canViewMoney` (Owner/Admin/Manager), refuses offline, and refuses every live mutation. Driver reads are refused until assignment access is connected. The floor-session column must not be assumed to authorize Dispatch/Confirm Delivered. This missing server contract is an additional release limitation; record-dependent local preview verification belongs in the integrated action report.

For each real role session on staging:

1. Sign in using the app with the development bypass disabled. Confirm the header role and database role agree. Wrong or inactive/unbound identity must fail closed. Verify failed login stays inline without a success toast.
2. Reload and refresh the access token. Repeat own profile and money checks with the new token. Verify no role changes based on user-editable `user_metadata`; database role is authoritative.
3. For Warehouse, Technician, Driver and Client, inspect authorized payloads, DOM, exports, print and message paths: financial figures must not reach the user. Driver/client assignment scoping is additional to money masking.
4. Using explicit staging-only disposable fixtures, test allowed and blocked Pay, floor lifecycle and Delivery actions through both UI and network API. For denied writes, record refusal and unchanged state/audit. For successful writes, record confirmed readback, immutable audit, UUID idempotency and correct actor. Coordinate with the action-verification owner; do not run any write probe against production.
5. Test Client A's own client/booking and deny Client B's rows with known-existing fixture controls. Test client portal writes only if existing D-5 coverage and product authorization permit them; do not activate a portal path to test it.
6. Verify signout removes the app session and blocks future refresh; do not equate signout with immediate invalidation of every previously issued JWT. Test current policy explicitly rather than inventing a stricter session rule.
7. In separately authorized staging account administration, verify deactivation makes the old identity resolve safely and Owner-only staff role mutations refuse non-Owners. Never demote/deactivate the last active Owner. This session made no account changes.
8. Exercise actual evidence-storage upload/download paths for owned/assigned bookings, deny unrelated client paths, and verify anon access is denied where expected. The GET-only verifier does not certify object storage writes or signed links.

## Supabase skill and current documentation

Applied `supabase:supabase` from `C:/Users/use/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md`. Inspected the current [Supabase changelog](https://supabase.com/changelog) and relevant [Auth sessions](https://supabase.com/docs/guides/auth/sessions) and [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security). The current breaking-change notice concerns older TLS cipher clients; no application auth/API signature change was needed for this verifier. It is relevant to later native-device checks: [TLS change notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated).

**Not completed:** cloud authentication, real session refresh/signout/expiry, cloud PostgREST/RLS serialization, cloud storage policies, cloud action permission/audit probes, production drift comparison, backup rehearsal, migration cutover, deployment, and Owner sign-off. These remain a release hold, not local test failures.
