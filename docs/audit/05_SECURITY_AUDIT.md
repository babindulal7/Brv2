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

# Security Audit

## Verdict

The repository shows serious defense-in-depth work, but production security is **not attested**. No P0 unauthorized-access exploit was confirmed. The live schema/policy/identity state and deployed headers are incomplete or unavailable, so the correct readiness posture is fail-closed.

## Authentication

Supabase Auth owns login/reset/session handling. Source inspection found no developer Owner bypass; an unknown identity falls back to Client, and deactivated users resolve conservatively in migration `0120`. Email password recovery exists. SMS recovery and PIN-as-primary login are explicitly unavailable.

Expired session, refresh, multi-tab, invalid reset token, deleted staff and brute-force behavior were not exercised with real accounts. Staff counts in `auth.users` are **UNABLE TO VERIFY**; this audit makes no claim that four of five users are locked out.

## RBAC matrix

This is the application-intent matrix from `src/lib/rbac.ts` and migrations; the names requested by the brief map approximately as Rental Staff→Coordinator, Operations→Warehouse/Technician/Driver, Finance→Accounts. `Caretaker` is not a schema role.

| Function | Owner | Admin | Manager | Coordinator | Warehouse | Accounts | Technician | Driver | Client |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View money | Yes | Yes | Yes | Yes | No | Yes | No | No | No |
| Create/manage rentals | Yes | Yes | Yes | Yes | Limited operations | Finance-specific | Limited | Limited | Own/read scope |
| Floor operations | Yes | Yes | Yes | By action | Yes | No | Yes | Driver actions | No |
| Record payments | Yes | No/limited | No/limited | Yes by policy mapping | No | Yes | No | No | No |
| Issue/close invoices | Yes | Yes | Yes | No | No | Yes | No | No | No |
| Staff/role control | Yes | Yes below ceiling | Narrow visibility | No | No | No | No | No | No |

Exact authorization varies by action and must be generated from final policies/capabilities before release; the table is not a substitute for that manifest.

## Money-blind staff

Warehouse, Technician, Driver and Client are treated as money-blind. UI query paths frequently short-circuit before requesting finance data; views/column grants and write guards exist. Lifecycle L12 confirms money-blind reads/writes are refused under the PGlite role model. Production network payloads, exports, hover cards, print and RPC responses were not captured, so end-to-end non-disclosure is **UNABLE TO VERIFY**.

## RLS, IDOR and SECURITY DEFINER

Late migrations provide client-own policies, role lookup, money masking and role ceilings. SECURITY DEFINER functions generally set a controlled `search_path` and perform role/actor checks. The remaining assurance gap is the final deployed grant/policy manifest and real JWT behavior. All entity-by-ID routes/RPCs require cross-tenant/cross-client negative tests; none may rely on hidden UI.

## Secrets and client exposure

No service-role key should be shipped to Vite. The expected `VITE_SUPABASE_*` values are public client configuration, while a service-role secret would be critical. Source/config search did not establish an exposed service-role credential. A full historical Git/CI secret scan and deployed bundle inspection were not performed; treat as **UNABLE TO VERIFY** until CI runs dedicated scanning.

## Attack surfaces

| Surface | Assessment |
| --- | --- |
| SQL injection | Supabase query builder/RPC parameters dominate; no confirmed concatenated user SQL path |
| XSS | React escaping is the default; no confirmed raw-HTML sink in audited critical paths |
| CSRF | Bearer-token API model reduces classic cookie CSRF; auth flow still needs browser testing |
| IDOR | RLS intent exists; production negative tests absent |
| Upload | Functionality absent (AUD-004); future implementation is a major new attack surface |
| Scanner | Confirmed fail-open truthfulness problem (AUD-002), primarily operational integrity |
| Rate limiting/brute force | Supabase/provider configuration unavailable |
| Redirects | No confirmed unsafe redirect; reset flows need hostile URL tests |
| Logging | `monitoring.ts` avoids intentional money/PII but telemetry is disabled unless DSN set |
| Security headers | `nosniff`, frame and referrer headers exist; app CSP/Permissions-Policy absent in repo config |

## Destructive actions and auditability

Database design favors cancel, void, release, deactivate and append-only histories. Payments and audit logs resist update/delete in the lifecycle harness; users cannot be deleted. Core transitions/actions write audit events. Incomplete features create no trustworthy audit trail because they perform no write.

## Required security gate

Run an authenticated role-by-resource CRUD matrix on staging and production; inspect actual JWT claims; prove disabled/deleted/expired/multi-tab behavior; capture money-blind network/DOM/export responses; test IDOR; enable rate-limit and alert evidence; scan source/history/artifacts for secrets; deploy/report CSP; and threat-model private uploads before implementing them.

