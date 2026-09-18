# Babin Rentals OS — Executive Audit Summary

Audit date: 2026-09-15  
Scope: repository, migration chain, automated checks, unauthenticated browser surface, and read-only public Supabase reachability  
Verdict: **NOT READY** for commercial production; **INTERNAL TESTING READY** after restoring a reproducible install

## Confidence and limitations

This is an audit, not a remediation pass. No application source or database state was changed. The Codebase Memory MCP required by `AGENTS.md` was unavailable, so discovery used source inspection and executable checks. The Supabase project is not linked locally and Docker was unavailable. The applied live migration version, authenticated RLS behavior, staff provisioning, production rows, backups, and recovery settings are therefore **UNABLE TO VERIFY**. The public endpoint was reachable and returned no anonymous rows for 23 probed resources; that is not an authenticated security proof.

The working tree changed during the audit. Findings describe the tested snapshot; three failing tests touch files that also have uncommitted changes.

## Scores

| Dimension | Score | Basis |
| --- | ---: | --- |
| Overall production readiness | **57/100** | AUD-001 is resolved in the working tree; live deployment and operational completeness still block release |
| Architecture | 76 | Clear React/Supabase boundaries; large screens and parallel seed/live models remain |
| Database | 85 | 122/122 migrations and 18/18 lifecycle checks pass in PGlite; live drift unverified |
| Security | 67 | Substantial RLS/RBAC and money masking; live enforcement, headers and throttling unverified |
| Rental workflow | 72 | Schedule/reservation regression passes; evidence, some actions and browser/device E2E remain incomplete |
| Financial integrity | 78 | Invoice/payment/VAT protections exist in migrations; production parity unverified |
| Testing | 66 | Database lifecycle now covers rescheduling; application tests remain red and browser E2E absent |
| Performance | 61 | Pagination is common; broad queries and bounded offline sync lack scale proof |
| Maintainability | 58 | 33 lint errors, four hook warnings, very large modules, seed fallbacks, archive |
| Desktop UI | 72 | Mature source design; authenticated desktop UI not exercised |
| iPad UI | 45 | Responsive intent exists; mandatory authenticated device workflows not testable |
| Phone UI | 48 | Login works at 390 px; 320 px scrolls; authenticated workflows untested |
| Touch usability | 51 | Login controls meet 44 px; floor touch workflows lack E2E proof |
| Accessibility | 60 | Contrast token test passes; full keyboard/screen-reader audit remains |

## Verified strengths

- `npm run check:pglite`: **122/122 migrations applied, 0 failed** in PostgreSQL 18/PGlite.
- `npm run check:lifecycle`: **18/18 passed**, including safe schedule synchronization and rollback of conflicting direct/RPC reschedules.
- `npm run check:contrast`: **40/40 theme tokens passed** in light and dark.
- The schema contains physical-unit exclusion constraints, quantity capacity enforcement, append-only finance/audit controls, server-side prices for money-blind callers and a guarded extension RPC.
- Authentication source contains no development Owner bypass; unknown/deactivated identities resolve conservatively.

## Findings

| Severity | Count |
| --- | ---: |
| P0 open | 0 |
| P0 resolved in working tree; deployment unverified | 1 |
| P1 | 7 |
| P2 | 9 |
| P3 | 1 |
| **Total** | **18** |

Counts include CONFIRMED, LIKELY and UNABLE TO VERIFY findings; they are not counts of proven live incidents.

## Top 10 risks

1. **AUD-006:** live migration/RLS state is unknown; migration 0124 and other repository protections cannot be assumed deployed.
2. **AUD-002:** the global scanner reports unknown codes and query failures as successful.
3. **AUD-003:** production-facing lists substitute seeded rows on empty/error responses.
4. **AUD-004:** evidence and receipt upload/storage are explicitly not implemented.
5. **AUD-005:** backup/restore controls are presentation-only and no recovery proof exists.
6. **AUD-007:** equipment persistence and portions of cases/documents/expenses/client controls are unavailable.
7. **AUD-008:** lint has 33 errors/four warnings and the current test snapshot has three failures.
8. **AUD-009:** no browser E2E proves the full rental, iPad, or phone journeys.
9. **AUD-010:** priced days use rounded elapsed spans while the 06:00 operational-day relationship is unresolved.
10. **AUD-015:** production reports and money-blind payloads have not been reconciled against source rows.

## Decisive answers

| Question | Evidence-backed answer |
| --- | --- |
| Double booking? | Creation and rescheduling conflicts are rejected in the current PGlite chain; safe reschedules synchronize holds. Live deployment remains unverified. |
| Impossible equipment states? | The migration chain owns unit status and rejects direct writes; live deployment unverified. |
| Stage bypass? | Migration-chain gates pass; live deployment unverified. |
| Money-blind leakage? | PGlite role checks pass and UI queries short-circuit; production network proof missing. |
| Unauthorized actions? | No bypass confirmed; authenticated live RLS/rate limits untested. |
| Payment inconsistency? | Negative/excess/wrong/void payments are rejected in the harness; live unverified. |
| Discount/VAT correctness? | Database checks and 13% default exist; pricing-day policy/report reconciliation remain incomplete. |
| Incorrect closure? | Migration chain rejects closure without financial, deposit, case and reservation clearance. |
| Concurrency? | Unit/quantity constraints are transactional in PGlite; direct reschedule and live concurrency unproved. |
| Refresh recovery? | Saved rows can rebuild, but unsaved floor/device state is **UNABLE TO VERIFY**. |
| Reports match source? | **UNABLE TO VERIFY** against production data. |
| Recovery? | **UNABLE TO VERIFY**; in-app backup service is not built. |
| All routes complete? | **No.** |
| Critical workflows tested? | Database lifecycle yes; browser/device E2E no. |
| Desktop/iPad/phone/light/dark fully usable? | **UNABLE TO VERIFY** for authenticated screens; only login and theme tokens were runtime-checked. |
| Safe for real production? | **No.** |

Recommended order: deploy/verify migration 0124 and the live schema/RLS; repair scanner truthfulness; remove seed fallbacks; implement evidence storage and recovery; complete critical writers; restore green release gates; then run authenticated multi-device E2E and production-data reconciliation.
