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

# Test Coverage Gaps

## Current evidence

- Vitest: 205 files; 203 pass/2 fail. 3,295 tests; 3,292 pass/3 fail.
- PGlite migration rebuild: 122/122 migrations, 0 failures.
- PGlite lifecycle: 18/18 green, including schedule/reservation synchronization.
- Contrast script: 40/40 tokens in light/dark.
- Browser E2E framework/script: not found.
- Test run emits repeated unwrapped React `act(...)`, deprecated `ReactDOMTestUtils.act`, and jsdom navigation warnings.
- Coverage command is in CI but was not relied upon as proof of behavioral adequacy.

## Coverage matrix

| Area | Unit/component | DB integration | Browser E2E | Adequate? |
| --- | --- | --- | --- | --- |
| Auth/session/reset | Present | Limited role model | None | No |
| RBAC/RLS | Present | Strong PGlite role checks | No production JWT matrix | Partial |
| Availability | Strong query/unit tests | Exact serialized + quantity checks | No date-edit/bundle UI concurrency | Partial |
| Pricing/discount/VAT | Extensive pure tests | Server price/invoice checks | No golden browser-to-ledger reconciliation | Partial |
| Payments | Unit/action tests | Invalid + partial settlement lifecycle | No retry/double-click/network E2E | Partial |
| Operations | Many workspace tests | Stage/session lifecycle | No tablet/phone/camera journey | No |
| Reports | Query/format tests vary | No production raw reconciliation | None | No |
| Storage/evidence | UI unavailable-state tests | No storage integration | None | No |
| Backup/recovery | Presentation behavior | None | No restore drill | No |
| Accessibility | Component semantics + token contrast | N/A | No axe/keyboard/screen-reader run | No |
| Performance/large data | Some pagination/query tests | No plan/volume suite | None | No |

## Critical missing scenarios

1. Run AUD-001 lifecycle L18 through real Supabase/PostgREST and extend it to quantity/bundle concurrent reschedules.
2. Two real authenticated sessions create/reschedule the same unit and quantity product concurrently.
3. Full Scenario A through Supabase/PostgREST and browser, including reload after every save boundary.
4. Bundle required/optional component conflicts, replacement and concurrent demand.
5. Blocked/On Stop client refusal plus authorized, audited override.
6. Money-blind network, in-memory state, DOM, hover/tap detail, print and export non-disclosure.
7. Payment double-click, idempotency, timeout after commit, reversal/refund/credit, concurrent payment and invoice change.
8. Damage/missing evidence upload and authorization; currently impossible because storage is absent.
9. iPad portrait/landscape floor Scenario I with touch, camera, keyboard, rotation and focus.
10. 390 px phone Scenario J and New Rental/search/cart completion.
11. Light/dark page screenshots plus keyboard/focus/axe checks for every required route.
12. 10k clients/rentals, 5k units and 100k payments with query budgets and stable pagination.
13. Real Supabase drift/RLS/grant tests and live-safe invariant queries.
14. Backup/PITR/object restore drill.

## Current failing tests

- `src/lib/__tests__/law17.test.ts`: two assertions find “Customer”/`customer` in `DashboardMovementPanel.tsx`.
- `src/modules/operations/__tests__/operationRoutes.test.tsx`: Tomorrow scope is missing.
- Same Operations suite: tablet filter trigger lacks expected `aria-expanded="true"`.

These are current-snapshot failures, not evidence that the released branch or production has the same state.

## Required test architecture

Keep Vitest for pure/action/component behavior and PGlite for migration invariants. Add Playwright (or equivalent) against a disposable Supabase staging project with seeded identities for all roles. Give every terminal mutation a stable idempotency key and network-failure test. Add a generated RLS/grant matrix, axe checks, device projects, visual baselines for stateful screens, query budgets and quarterly recovery drills. CI must fail on skipped critical scenarios, console errors and unexpected `act` warnings.
